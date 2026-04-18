from fastapi import APIRouter, Depends, HTTPException, Body, Query, status
import logging
import re
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError, ProgrammingError, DatabaseError
from typing import List, Any, Optional, Dict
from datetime import datetime, date, time
import json

from database import get_db
from models import (
    LoyaltyDiscount, PersonalDiscount, AppliedDiscount, Salon, User, Booking, Master,
    Service,
)
from utils.loyalty_discounts import SUPPORTED_CONDITION_TYPES
from utils.loyalty_params import (
    normalize_parameters,
    validate_happy_hours_intervals,
)
from models import master_services as master_services_table
from sqlalchemy import select, and_
from schemas import (
    LoyaltyDiscount as LoyaltyDiscountSchema,
    LoyaltyDiscountCreate,
    LoyaltyDiscountUpdate,
    PersonalDiscount as PersonalDiscountSchema,
    PersonalDiscountCreate,
    PersonalDiscountUpdate,
    AppliedDiscount as AppliedDiscountSchema,
    QuickDiscountTemplate,
    QuickDiscountBulkDeactivateRequest,
    ComplexDiscountCondition,
    LoyaltySystemStatus,
    LoyaltyDiscountType,
    LoyaltyConditionType,
    DiscountEvaluationRequest,
    DiscountEvaluationResponse
)
from auth import require_master, get_current_active_user
from routers.accounting import get_master_id_from_user
from exceptions import SchemaOutdatedError
from utils.loyalty_discounts import evaluate_discount_candidates

router = APIRouter(
    prefix="/loyalty",
    tags=["loyalty"],
)

logger = logging.getLogger(__name__)


def is_dev_mode() -> bool:
    """
    Режим разработки для debug в 409. Совпадает с main.py (ENVIRONMENT).
    Debug в 409 отдаётся только в dev; в production никогда не утекает.
    """
    from settings import get_settings
    return get_settings().is_development


def extract_schema_error_info(error: Exception) -> Dict[str, Optional[str]]:
    """
    Извлекает информацию об ошибке схемы БД для debug информации.
    Возвращает словарь с полями: missing, table, original_error
    """
    error_str = str(error)
    error_type = type(error).__name__
    
    missing = None
    table = None
    original_error = error_str
    
    # Пытаемся извлечь название колонки из ошибки
    # SQLite: "no such column: table_name.column_name"
    # PostgreSQL: "column \"column_name\" does not exist"
    # MySQL: "Unknown column 'column_name' in 'field list'"
    
    # SQLite pattern
    sqlite_match = re.search(r"no such column: (\w+)\.(\w+)", error_str, re.IGNORECASE)
    if sqlite_match:
        table = sqlite_match.group(1)
        missing = sqlite_match.group(2)
    
    # PostgreSQL pattern
    if not missing:
        pg_match = re.search(r'column "(\w+)" does not exist', error_str, re.IGNORECASE)
        if pg_match:
            missing = pg_match.group(1)
        # Пытаемся найти таблицу в контексте
        pg_table_match = re.search(r'relation "(\w+)"', error_str, re.IGNORECASE)
        if pg_table_match:
            table = pg_table_match.group(1)
    
    # MySQL pattern
    if not missing:
        mysql_match = re.search(r"Unknown column '(\w+)'", error_str, re.IGNORECASE)
        if mysql_match:
            missing = mysql_match.group(1)
    
    # Общий паттерн для таблицы (если не нашли выше)
    if not table:
        table_match = re.search(r"table ['\"]?(\w+)['\"]?", error_str, re.IGNORECASE)
        if table_match:
            table = table_match.group(1)
    
    return {
        "missing": missing,
        "table": table,
        "original_error": f"{error_type}: {error_str}"
    }


def get_loyalty_filter(master_id: int, model_class):
    """
    Фильтр для скидок мастера.
    Runtime-логика использует только master_id (без salon_id).
    """
    return model_class.master_id == master_id


def get_legacy_loyalty_filter(master_id: int, db: Session, model_class):
    """
    Legacy-режим для чтения старых правил (master_id IS NULL, salon_id в салонах мастера).
    Используется только в read-only ручке.
    """
    from sqlalchemy import or_
    master = db.query(Master).filter(Master.id == master_id).first()
    salon_ids = [s.id for s in master.salons] if master and master.salons else []
    if not salon_ids:
        return model_class.master_id == master_id
    return or_(
        model_class.master_id == master_id,
        (model_class.master_id.is_(None)) & (model_class.salon_id.in_(salon_ids))
    )


BINARY_QUICK_CONDITION_TYPES = frozenset({"first_visit", "birthday"})


def _quick_condition_type(conditions: Any) -> Optional[str]:
    if not conditions or not isinstance(conditions, dict):
        return None
    return conditions.get("condition_type")


def _quick_rules_by_condition_type(db: Session, master_id: int, ct: str) -> List[LoyaltyDiscount]:
    out: List[LoyaltyDiscount] = []
    for d in (
        db.query(LoyaltyDiscount)
        .filter(
            get_loyalty_filter(master_id, LoyaltyDiscount),
            LoyaltyDiscount.discount_type == "quick",
        )
        .all()
    ):
        if _quick_condition_type(d.conditions) == ct:
            out.append(d)
    return out


def _other_active_same_quick_type(
    db: Session, master_id: int, ct: str, exclude_id: Optional[int]
) -> List[LoyaltyDiscount]:
    return [
        d
        for d in _quick_rules_by_condition_type(db, master_id, ct)
        if d.is_active and (exclude_id is None or d.id != exclude_id)
    ]


def _validate_quick_discount_conditions(
    master_id: int,
    conditions: Any,
    db: Session,
    rule_discount_percent: Optional[float] = None,
    *,
    strict_happy_hours_single_slot: bool = False,
) -> Optional[str]:
    """
    Валидация conditions для быстрой скидки.
    Возвращает строку с ошибкой или None.
    """
    if not conditions or not isinstance(conditions, dict):
        return None
    ct = conditions.get("condition_type")
    params = conditions.get("parameters") or {}
    if not isinstance(params, dict):
        params = {}

    norm = normalize_parameters(ct or "", params, rule_discount_percent)

    if ct == "regular_visits":
        vc = norm.get("visits_count")
        pd = norm.get("period_days")
        if vc is None or int(vc) < 1:
            return "Повторные визиты: число визитов должно быть не меньше 1."
        if pd is None or int(pd) < 1:
            return "Повторные визиты: период (дней) должен быть не меньше 1."
        if int(vc) > 1000 or int(pd) > 3650:
            return "Повторные визиты: слишком большие значения периода или числа визитов."

    if ct == "returning_client":
        md = norm.get("min_days_since_last_visit")
        if md is None or int(md) < 0:
            return "Возврат клиента: укажите неотрицательное число дней без визитов."
        if int(md) > 3650:
            return "Возврат клиента: слишком большое значение дней."

    if ct == "happy_hours":
        intervals = norm.get("intervals") or []
        ok, err = validate_happy_hours_intervals(intervals)
        if not ok and err:
            return err
        if strict_happy_hours_single_slot:
            days = norm.get("days") or []
            if len(days) != 1 or len(intervals) != 1:
                return (
                    "Счастливые часы: в одном правиле укажите один день недели и один интервал времени."
                )

    if ct == "service_discount":
        err = _validate_service_discount(master_id, norm, db)
        if err:
            return err
    return None


def _validate_service_discount(
    master_id: int,
    norm: Dict[str, Any],
    db: Session,
) -> Optional[str]:
    """
    Валидация нормализованных parameters для service_discount.
    Проверяет _invalid, принадлежность service_id мастеру (master_services),
    использование category_id хотя бы одной услугой мастера.
    """
    if norm.get("_invalid"):
        return norm.get("_invalid_reason") or "Неверные параметры service_discount."

    if "service_id" in norm:
        sid = norm["service_id"]
        q = select(master_services_table.c.service_id).where(
            and_(
                master_services_table.c.master_id == master_id,
                master_services_table.c.service_id == sid,
            )
        )
        if not db.execute(q).first():
            return (
                f"Услуга с id {sid} не принадлежит мастеру или не найдена. "
                "Укажите услугу из списка услуг мастера."
            )
        return None

    if "category_id" in norm:
        cid = norm["category_id"]
        # Хотя бы одна услуга мастера должна относиться к этой категории
        subq = (
            select(Service.id)
            .join(master_services_table, Service.id == master_services_table.c.service_id)
            .where(
                and_(
                    master_services_table.c.master_id == master_id,
                    Service.category_id == cid,
                )
            )
            .limit(1)
        )
        if not db.execute(subq).first():
            return (
                f"Категория с id {cid} не используется ни одной услугой мастера. "
                "Укажите категорию из категорий услуг мастера."
            )
        return None

    return "service_discount: задайте service_id или category_id."


def _require_master_onboarding_completed(master_id: int, db: Session) -> None:
    """
    Требует завершённый онбординг (city + timezone выбраны, timezone_confirmed=True).
    Иначе HTTP 400: блокировка создания/обновления скидок loyalty.
    """
    m = db.query(Master).filter(Master.id == master_id).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Мастер не найден",
        )
    tz = getattr(m, "timezone", None)
    if not tz or not str(tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно.",
        )
    confirmed = getattr(m, "timezone_confirmed", False)
    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно.",
        )


# Дефолты (совпадают с utils.loyalty_params)
DEFAULT_RETURNING_MIN_DAYS = 30
DEFAULT_BIRTHDAY_DAYS_BEFORE = 7
DEFAULT_BIRTHDAY_DAYS_AFTER = 7
DEFAULT_REGULAR_VISITS_COUNT = 2
DEFAULT_REGULAR_VISITS_PERIOD_DAYS = 60

# Шаблоны быстрых скидок (единый формат parameters)
QUICK_DISCOUNT_TEMPLATES = [
    {
        "id": "first_visit",
        "name": "Новый клиент",
        "description": "Скидка за первую запись",
        "icon": "🎁",
        "conditions": {
            "condition_type": "first_visit",
            "parameters": {}
        },
        "default_discount": 10.0
    },
    {
        "id": "regular_visits",
        "name": "Регулярные визиты",
        "description": "Скидка за регулярные посещения",
        "icon": "⭐",
        "conditions": {
            "condition_type": "regular_visits",
            "parameters": {
                "visits_count": DEFAULT_REGULAR_VISITS_COUNT,
                "period_days": DEFAULT_REGULAR_VISITS_PERIOD_DAYS
            }
        },
        "default_discount": 15.0
    },
    {
        "id": "returning_client",
        "name": "Возвращение клиента",
        "description": "Скидка для клиентов, которые давно не были",
        "icon": "🔄",
        "conditions": {
            "condition_type": "returning_client",
            "parameters": {
                "min_days_since_last_visit": DEFAULT_RETURNING_MIN_DAYS,
                "max_days_since_last_visit": None
            }
        },
        "default_discount": 20.0
    },
    {
        "id": "birthday",
        "name": "День рождения",
        "description": "Скидка в день рождения клиента",
        "icon": "🎂",
        "conditions": {
            "condition_type": "birthday",
            "parameters": {
                "days_before": DEFAULT_BIRTHDAY_DAYS_BEFORE,
                "days_after": DEFAULT_BIRTHDAY_DAYS_AFTER
            }
        },
        "default_discount": 25.0
    },
    {
        "id": "happy_hours",
        "name": "Счастливые часы",
        "description": "Скидка в определенные часы",
        "icon": "⏰",
        "conditions": {
            "condition_type": "happy_hours",
            "parameters": {
                "days": [1, 2, 3, 4, 5],
                "intervals": [{"start": "09:00", "end": "12:00"}]
            }
        },
        "default_discount": 15.0
    },
    {
        "id": "service_discount",
        "name": "Скидка на услуги",
        "description": "Скидка на определенные услуги",
        "icon": "✂️",
        "conditions": {
            "condition_type": "service_discount",
            "parameters": {
                "items": [],
                "category_ids": []
            }
        },
        "default_discount": 10.0
    }
]


@router.get("/templates", response_model=List[QuickDiscountTemplate])
async def get_quick_discount_templates():
    """Получить шаблоны быстрых скидок"""
    return QUICK_DISCOUNT_TEMPLATES


@router.get("/status", response_model=LoyaltySystemStatus)
async def get_loyalty_system_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Получить статус системы лояльности мастера"""
    
    try:
        # Диагностическое логирование
        logger.debug(
            f"GET /api/loyalty/status: user_id={current_user.id}, role={current_user.role}"
        )
        
        # Получаем master_id (может выбросить HTTPException 404, если мастер не найден)
        # Это нормально - FastAPI обработает 404
        try:
            master_id = get_master_id_from_user(current_user.id, db)
        except HTTPException as e:
            # Если мастер не найден, возвращаем 404 (это ожидаемое поведение)
            logger.warning(
                f"GET /api/loyalty/status: Master profile not found for user_id={current_user.id}",
                exc_info=True
            )
            raise
        
        logger.debug(f"GET /api/loyalty/status: master_id={master_id}")
        
        # Получаем скидки мастера с поддержкой обратной совместимости
        # Обрабатываем SQL ошибки (например, если миграция не применена и колонка master_id отсутствует)
        try:
            quick_discounts = db.query(LoyaltyDiscount).filter(
                get_loyalty_filter(master_id, LoyaltyDiscount),
                LoyaltyDiscount.discount_type == "quick"
            ).all()
            
            complex_discounts = db.query(LoyaltyDiscount).filter(
                get_loyalty_filter(master_id, LoyaltyDiscount),
                LoyaltyDiscount.discount_type == "complex"
            ).all()
            
            personal_discounts = db.query(PersonalDiscount).filter(
                get_loyalty_filter(master_id, PersonalDiscount)
            ).all()
        except (OperationalError, ProgrammingError, DatabaseError) as sql_error:
            # SQL ошибка (например, колонка master_id не существует - миграция не применена)
            logger.exception(
                f"GET /api/loyalty/status: SQL error when querying discounts (schema outdated, migration not applied): {sql_error}"
            )
            
            # Извлекаем информацию об ошибке для debug
            error_info = extract_schema_error_info(sql_error)
            debug = error_info if is_dev_mode() else None
            
            # 409 через HTTPException-путь: raise → exception_handler в main.py
            # Плоский JSON (detail, code, hint, debug) + X-Error-Code: SCHEMA_OUTDATED
            raise SchemaOutdatedError(
                detail="Loyalty schema outdated, apply migrations",
                hint="Run alembic upgrade head",
                debug=debug,
            )
        except AttributeError as attr_error:
            # Ошибка доступа к атрибуту (например, model_class.master_id не существует)
            logger.exception(
                f"GET /api/loyalty/status: Attribute error when querying discounts (schema outdated, migration not applied): {attr_error}"
            )
            
            # Извлекаем информацию об ошибке для debug
            error_info = extract_schema_error_info(attr_error)
            debug = error_info if is_dev_mode() else None
            
            # 409 через HTTPException-путь: raise → exception_handler в main.py
            # Плоский JSON (detail, code, hint, debug) + X-Error-Code: SCHEMA_OUTDATED
            raise SchemaOutdatedError(
                detail="Loyalty schema outdated, apply migrations",
                hint="Run alembic upgrade head",
                debug=debug,
            )
        
        total_discounts = len(quick_discounts) + len(complex_discounts) + len(personal_discounts)
        active_discounts = len([d for d in quick_discounts + complex_discounts + personal_discounts if d.is_active])
        
        # Диагностическое логирование результатов
        logger.debug(
            f"GET /api/loyalty/status: master_id={master_id}, "
            f"quick={len(quick_discounts)}, complex={len(complex_discounts)}, "
            f"personal={len(personal_discounts)}, total={total_discounts}, active={active_discounts}"
        )
        
        return LoyaltySystemStatus(
            quick_discounts=quick_discounts,
            complex_discounts=complex_discounts,
            personal_discounts=personal_discounts,
            total_discounts=total_discounts,
            active_discounts=active_discounts
        )
    
    except HTTPException:
        raise
    except SchemaOutdatedError:
        # 409 SCHEMA_OUTDATED → exception_handler в main.py (плоский JSON + X-Error-Code)
        raise
    except Exception as e:
        # Непредвиденная ошибка - логируем и пробрасываем как 500
        logger.exception(
            f"GET /api/loyalty/status: Unexpected error for user_id={current_user.id}: {e}"
        )
        # Возвращаем 500 вместо маскировки ошибки пустыми массивами
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/rules", response_model=LoyaltySystemStatus)
async def get_loyalty_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Агрегированный список правил скидок мастера (без salon_id в runtime)."""
    master_id = get_master_id_from_user(current_user.id, db)

    quick_discounts = db.query(LoyaltyDiscount).filter(
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "quick"
    ).all()

    complex_discounts = db.query(LoyaltyDiscount).filter(
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "complex"
    ).all()

    personal_discounts = db.query(PersonalDiscount).filter(
        get_loyalty_filter(master_id, PersonalDiscount)
    ).all()

    total_discounts = len(quick_discounts) + len(complex_discounts) + len(personal_discounts)
    active_discounts = len([d for d in quick_discounts + complex_discounts + personal_discounts if d.is_active])

    return LoyaltySystemStatus(
        quick_discounts=quick_discounts,
        complex_discounts=complex_discounts,
        personal_discounts=personal_discounts,
        total_discounts=total_discounts,
        active_discounts=active_discounts
    )


@router.get("/legacy-rules", response_model=LoyaltySystemStatus)
async def get_legacy_loyalty_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Read-only режим для legacy правил (master_id IS NULL, salon_id в салонах мастера)."""
    master_id = get_master_id_from_user(current_user.id, db)

    quick_discounts = db.query(LoyaltyDiscount).filter(
        get_legacy_loyalty_filter(master_id, db, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "quick"
    ).all()

    complex_discounts = db.query(LoyaltyDiscount).filter(
        get_legacy_loyalty_filter(master_id, db, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "complex"
    ).all()

    personal_discounts = db.query(PersonalDiscount).filter(
        get_legacy_loyalty_filter(master_id, db, PersonalDiscount)
    ).all()

    total_discounts = len(quick_discounts) + len(complex_discounts) + len(personal_discounts)
    active_discounts = len([d for d in quick_discounts + complex_discounts + personal_discounts if d.is_active])

    return LoyaltySystemStatus(
        quick_discounts=quick_discounts,
        complex_discounts=complex_discounts,
        personal_discounts=personal_discounts,
        total_discounts=total_discounts,
        active_discounts=active_discounts
    )


@router.get("/applicable-discounts")
async def get_applicable_discounts(
    client_phone: str = Query(..., description="Телефон клиента"),
    client_id: Optional[int] = Query(None, description="ID клиента (если есть)"),
    service_id: Optional[int] = Query(None, description="ID услуги для точного расчёта"),
    start_time: Optional[datetime] = Query(None, description="Время бронирования для точного расчёта (ISO)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """
    Применимые скидки для клиента.
    Если service_id и start_time заданы — точный расчёт (как evaluate).
    Иначе — дефолт: первая услуга мастера + текущее время.
    """
    from datetime import datetime as dt
    master_id = get_master_id_from_user(current_user.id, db)
    now = dt.utcnow()
    if not start_time:
        start_time = now
    if not service_id:
        master = db.query(Master).filter(Master.id == master_id).first()
        if master and master.services:
            service_id = master.services[0].id
        else:
            row = db.execute(select(master_services_table.c.service_id).where(master_services_table.c.master_id == master_id).limit(1)).first()
            service_id = row[0] if row else None
    booking_payload = {"start_time": start_time, "service_id": service_id, "category_id": None}
    candidates, best = evaluate_discount_candidates(
        master_id=master_id,
        client_id=client_id,
        client_phone=client_phone,
        booking_payload=booking_payload,
        db=db,
        now=now,
    )
    applicable = [c for c in candidates if c.get("match")]
    if not applicable and best and best.get("match"):
        applicable = [best]
    has_context = service_id is not None and start_time is not None
    return {
        "applicable": [
            {
                "rule_id": c["rule_id"],
                "rule_type": c["rule_type"],
                "name": c["name"],
                "condition_type": c.get("condition_type"),
                "discount_percent": c["discount_percent"],
                "max_discount_amount": c.get("max_discount_amount"),
                "requires_context": c.get("condition_type") in ("service_discount", "happy_hours") and not has_context,
            }
            for c in applicable
        ],
        "best_candidate": best if best and best.get("match") else None,
    }


@router.post("/evaluate", response_model=DiscountEvaluationResponse)
async def evaluate_loyalty_discounts(
    payload: DiscountEvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Оценка применимости скидок для конкретного клиента/бронирования (master-only)."""
    master_id = get_master_id_from_user(current_user.id, db)
    booking_payload = payload.booking.dict()

    candidates, best_candidate = evaluate_discount_candidates(
        master_id=master_id,
        client_id=payload.client_id,
        client_phone=payload.client_phone,
        booking_payload=booking_payload,
        db=db
    )

    return {
        "candidates": candidates,
        "best_candidate": best_candidate
    }

@router.post("/quick-discounts", response_model=LoyaltyDiscountSchema)
async def create_quick_discount(
    discount: LoyaltyDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Создать быструю скидку"""
    import logging

    logger = logging.getLogger(__name__)
    logger.debug(
        f"POST /api/loyalty/quick-discounts: user_id={current_user.id}, "
        f"role={current_user.role}, discount={discount.dict()}"
    )

    master_id = get_master_id_from_user(current_user.id, db)
    logger.debug(f"POST /api/loyalty/quick-discounts: master_id={master_id}")

    _require_master_onboarding_completed(master_id, db)

    cond = discount.conditions or {}
    ct = _quick_condition_type(cond) if isinstance(cond, dict) else None
    if isinstance(cond, dict):
        strict_hh = ct == "happy_hours"
        err = _validate_quick_discount_conditions(
            master_id,
            cond,
            db,
            getattr(discount, "discount_percent", None),
            strict_happy_hours_single_slot=strict_hh,
        )
        if err:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err)

    if ct and ct in BINARY_QUICK_CONDITION_TYPES:
        existing = _quick_rules_by_condition_type(db, master_id, ct)
        if len(existing) >= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Для этого типа правила может существовать только одна запись. "
                    "Измените или удалите существующее правило в карточке типа."
                ),
            )

    db_discount = LoyaltyDiscount(
        master_id=master_id,
        salon_id=None,  # Не заполняем, так как это мастерский функционал
        discount_type=discount.discount_type,
        name=discount.name,
        description=discount.description,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        conditions=discount.conditions,
        is_active=discount.is_active,
        priority=discount.priority
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.get("/quick-discounts", response_model=List[LoyaltyDiscountSchema])
async def get_quick_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Получить все быстрые скидки мастера"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    discounts = db.query(LoyaltyDiscount).filter(
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "quick"
    ).all()
    
    return discounts


@router.post("/quick-discounts/bulk-deactivate")
async def bulk_deactivate_quick_discounts_by_type(
    body: QuickDiscountBulkDeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    """
    Деактивировать все активные quick-скидки с указанным condition_type (одна транзакция).
    """
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    ct = (body.condition_type or "").strip()
    if not ct:
        raise HTTPException(status_code=422, detail="condition_type обязателен.")

    rules = _quick_rules_by_condition_type(db, master_id, ct)
    deactivated_ids: List[int] = []
    for d in rules:
        if d.is_active:
            d.is_active = False
            deactivated_ids.append(d.id)
    db.commit()
    return {
        "condition_type": ct,
        "deactivated": len(deactivated_ids),
        "ids": deactivated_ids,
    }


@router.put("/quick-discounts/{discount_id}", response_model=LoyaltyDiscountSchema)
async def update_quick_discount(
    discount_id: int,
    discount: LoyaltyDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Обновить быструю скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "quick"
    ).first()

    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")

    update_data = discount.dict(exclude_unset=True)
    if "conditions" in update_data:
        cond = update_data["conditions"]
        if isinstance(cond, dict):
            pct = update_data.get("discount_percent") or (db_discount.discount_percent if db_discount else None)
            err = _validate_quick_discount_conditions(
                master_id, cond, db, pct, strict_happy_hours_single_slot=False
            )
            if err:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err)

    merged_active = update_data.get("is_active") if "is_active" in update_data else db_discount.is_active
    merged_conditions = update_data.get("conditions") if "conditions" in update_data else db_discount.conditions
    merged_ct = _quick_condition_type(merged_conditions)
    if merged_active and merged_ct in BINARY_QUICK_CONDITION_TYPES:
        conflicts = _other_active_same_quick_type(db, master_id, merged_ct, db_discount.id)
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Уже есть другое активное правило этого типа. Отключите его перед включением этого.",
            )

    for field, value in update_data.items():
        setattr(db_discount, field, value)

    db.commit()
    db.refresh(db_discount)

    return db_discount


@router.delete("/quick-discounts/{discount_id}")
async def delete_quick_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Удалить быструю скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "quick"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.post("/complex-discounts", response_model=LoyaltyDiscountSchema)
async def create_complex_discount(
    discount: LoyaltyDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Создать сложную скидку"""
    import logging
    logger = logging.getLogger(__name__)
    
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    # Валидация: проверяем, что condition_type поддерживается
    conditions = discount.conditions or {}
    condition_type = conditions.get("condition_type") if isinstance(conditions, dict) else None
    
    # Логирование condition_type для отладки
    logger.info(
        f"POST /api/loyalty/complex-discounts: user_id={current_user.id}, "
        f"master_id={master_id}, condition_type={condition_type}, "
        f"discount_name={discount.name}"
    )
    
    if condition_type and condition_type not in SUPPORTED_CONDITION_TYPES:
        logger.warning(
            f"POST /api/loyalty/complex-discounts: Unsupported condition_type={condition_type} "
            f"for user_id={current_user.id}, master_id={master_id}. "
            f"Supported types: {SUPPORTED_CONDITION_TYPES}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Неподдерживаемый тип условия: {condition_type}. "
                   f"Поддерживаемые типы: {', '.join(SUPPORTED_CONDITION_TYPES)}"
        )
    
    db_discount = LoyaltyDiscount(
        master_id=master_id,
        salon_id=None,  # Не заполняем, так как это мастерский функционал
        discount_type=discount.discount_type,
        name=discount.name,
        description=discount.description,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        conditions=discount.conditions,
        is_active=discount.is_active,
        priority=discount.priority
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    logger.debug(
        f"POST /api/loyalty/complex-discounts: Created discount_id={db_discount.id}, "
        f"condition_type={condition_type}"
    )
    
    return db_discount


@router.get("/complex-discounts", response_model=List[LoyaltyDiscountSchema])
async def get_complex_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Получить все сложные скидки мастера"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    discounts = db.query(LoyaltyDiscount).filter(
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "complex"
    ).all()
    
    return discounts


@router.put("/complex-discounts/{discount_id}", response_model=LoyaltyDiscountSchema)
async def update_complex_discount(
    discount_id: int,
    discount: LoyaltyDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Обновить сложную скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "complex"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    update_data = discount.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_discount, field, value)
    
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.delete("/complex-discounts/{discount_id}")
async def delete_complex_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Удалить сложную скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        get_loyalty_filter(master_id, LoyaltyDiscount),
        LoyaltyDiscount.discount_type == "complex"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.post("/personal-discounts", response_model=PersonalDiscountSchema)
async def create_personal_discount(
    discount: PersonalDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Создать персональную скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    # Проверяем, существует ли пользователь с таким номером телефона
    user = db.query(User).filter(User.phone == discount.client_phone).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким номером телефона не найден")
    
    # Проверяем, не существует ли уже персональная скидка для этого клиента
    existing_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.master_id == master_id,
        PersonalDiscount.client_phone == discount.client_phone
    ).first()
    
    if existing_discount:
        raise HTTPException(status_code=400, detail="Персональная скидка для этого клиента уже существует")
    
    db_discount = PersonalDiscount(
        master_id=master_id,
        salon_id=None,  # Не заполняем, так как это мастерский функционал
        client_phone=discount.client_phone,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        description=discount.description,
        is_active=discount.is_active
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.get("/personal-discounts", response_model=List[PersonalDiscountSchema])
async def get_personal_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Получить все персональные скидки мастера"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    discounts = db.query(PersonalDiscount).filter(
        get_loyalty_filter(master_id, PersonalDiscount)
    ).all()
    
    return discounts


@router.put("/personal-discounts/{discount_id}", response_model=PersonalDiscountSchema)
async def update_personal_discount(
    discount_id: int,
    discount: PersonalDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Обновить персональную скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    _require_master_onboarding_completed(master_id, db)

    db_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.id == discount_id,
        get_loyalty_filter(master_id, PersonalDiscount)
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    update_data = discount.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_discount, field, value)
    
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.delete("/personal-discounts/{discount_id}")
async def delete_personal_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Удалить персональную скидку"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    db_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.id == discount_id,
        get_loyalty_filter(master_id, PersonalDiscount)
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.get("/check-discount/{client_phone}")
async def check_client_discount(
    client_phone: str,
    service_id: Optional[int] = None,
    booking_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master)
):
    """Проверить доступные скидки для клиента"""
    master_id = get_master_id_from_user(current_user.id, db)
    
    # Проверяем персональную скидку
    personal_discount = db.query(PersonalDiscount).filter(
        get_loyalty_filter(master_id, PersonalDiscount),
        PersonalDiscount.client_phone == client_phone,
        PersonalDiscount.is_active == True
    ).first()
    
    # Здесь будет логика проверки других типов скидок
    # Пока возвращаем только персональную скидку
    
    if personal_discount:
        return {
            "has_discount": True,
            "discount_type": "personal",
            "discount_percent": personal_discount.discount_percent,
            "max_discount_amount": personal_discount.max_discount_amount,
            "description": personal_discount.description
        }
    
    return {
        "has_discount": False,
        "discount_type": None,
        "discount_percent": 0,
        "max_discount_amount": None,
        "description": None
    } 