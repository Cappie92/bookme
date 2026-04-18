"""
Роутер для обработки платежей через Robokassa
"""
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, status, Request, Form, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import (
    User,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionType,
    SubscriptionStatus,
    SubscriptionReservation,
    SubscriptionPriceSnapshot,
    TransactionType,
    UserBalance,
)
from schemas import (
    SubscriptionPaymentInitRequest,
    DepositPaymentInitRequest,
    PaymentInitResponse,
    PaymentOut
)
from auth import get_current_user, get_current_active_user
from constants import duration_months_to_days
from utils.robokassa import (
    generate_invoice_id,
    generate_payment_url,
    generate_result_signature,
    verify_result_notification,
    get_robokassa_config
)
from utils.balance_utils import (
    get_or_create_user_balance,
    reserve_full_subscription_price,
    get_user_available_balance,
    add_balance_transaction_no_commit,
)
router = APIRouter(
    prefix="/payments",
    tags=["payments"],
    responses={401: {"description": "Требуется авторизация"}},
)

import logging
logger = logging.getLogger(__name__)


@router.post(
    "/subscription/init",
    response_model=PaymentInitResponse,
    summary="Инициализация оплаты подписки",
    responses={
        400: {"description": "Только салоны/мастера; неверные параметры или истёк snapshot"},
        404: {"description": "План или snapshot не найден"},
    },
)
async def init_subscription_payment(
    payment_request: SubscriptionPaymentInitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Инициализация платежа для подписки. Создаёт запись Payment и возвращает URL для оплаты (Robokassa) или requires_payment=false при нулевой сумме."""
    # Определяем тип подписки
    subscription_type = None
    if current_user.role.value in ['salon']:
        subscription_type = SubscriptionType.SALON
    elif current_user.role.value in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Только салоны и мастера могут иметь подписки"
        )
    
    # Получаем план подписки
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == payment_request.plan_id,
        SubscriptionPlan.subscription_type == subscription_type,
        SubscriptionPlan.is_active == True
    ).first()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="План подписки не найден"
        )
    
    # Если передан snapshot расчета — используем его итоговую сумму к оплате (final_price)
    total_price = None
    if payment_request.calculation_id:
        snapshot = db.query(SubscriptionPriceSnapshot).filter(
            SubscriptionPriceSnapshot.id == payment_request.calculation_id,
            SubscriptionPriceSnapshot.user_id == current_user.id
        ).first()
        if not snapshot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Snapshot расчета не найден"
            )
        if snapshot.expires_at <= datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Snapshot расчета истек — пересчитайте стоимость"
            )
        # Простая валидация соответствия
        if snapshot.plan_id != plan.id or snapshot.duration_months != payment_request.duration_months:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Snapshot не соответствует выбранному тарифу/периоду — пересчитайте стоимость"
            )
        if snapshot.upgrade_type and snapshot.upgrade_type != payment_request.upgrade_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Snapshot не соответствует типу применения тарифа — пересчитайте стоимость"
            )
        total_price = float(snapshot.final_price)
    else:
        # Фолбэк (на случай старых клиентов без snapshot)
        if payment_request.duration_months == 12:
            monthly_price = plan.price_12months
        elif payment_request.duration_months == 6:
            monthly_price = plan.price_6months
        elif payment_request.duration_months == 3:
            monthly_price = plan.price_3months
        else:
            monthly_price = plan.price_1month
        total_price = float(monthly_price) * float(payment_request.duration_months)

    if total_price is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось определить сумму к оплате"
        )
    if total_price <= 0:
        # UI не должен вызывать init при final_price<=0, но backend устойчив:
        # не создаем Payment/Robokassa invoice, возвращаем requires_payment=false.
        # Применение должно быть явным (отдельный endpoint apply-upgrade-free по snapshot_id).
        return PaymentInitResponse(
            requires_payment=False,
            message="Сумма к оплате равна 0 — оплата не требуется. Для применения используйте /api/subscriptions/apply-upgrade-free с calculation_id (TTL 30 минут).",
        )
    
    # Единый строгий селектор — чтобы /init и /features согласованно понимали "текущую подписку"
    from utils.subscription_features import get_effective_subscription
    current_subscription = get_effective_subscription(db, current_user.id, subscription_type, now_utc=datetime.utcnow())
    
    # Важно: расчет доплаты/кредита должен приходить через calculation_id (snapshot)
    
    # Генерируем InvoiceID
    invoice_id = generate_invoice_id(current_user.id)
    
    # Создаем запись Payment
    payment = Payment(
        user_id=current_user.id,
        amount=total_price,
        status='pending',
        payment_type='subscription',
        robokassa_invoice_id=invoice_id,
        subscription_period=payment_request.payment_period,
        plan_id=plan.id,
        is_recurring=payment_request.enable_auto_renewal,
        subscription_apply_status='pending',
        payment_metadata={
            "calculation_id": payment_request.calculation_id,
            "upgrade_type": payment_request.upgrade_type,
            "selected_duration": payment_request.duration_months,
            "plan_name": plan.name,
            "plan_display_name": plan.display_name
        }
    )
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    # Получаем конфигурацию Robokassa
    from settings import get_settings
    s = get_settings()
    config = get_robokassa_config()
    robokassa_stub = s.robokassa_stub
    
    # Формируем описание платежа
    description = f"Подписка {plan.display_name or plan.name} на {payment_request.duration_months} мес."
    
    # Генерируем URL для оплаты
    success_url_full = f"{config['success_url']}?payment_id={payment.id}"
    fail_url_full = f"{config['fail_url']}?payment_id={payment.id}"
    if robokassa_stub:
        api_base = s.API_BASE_URL.rstrip("/")
        payment_url = f"{api_base}/api/payments/robokassa/stub-complete?invoice_id={invoice_id}"
    else:
        payment_url = generate_payment_url(
        merchant_login=config["merchant_login"],
        amount=total_price,
        invoice_id=invoice_id,
        description=description,
        password_1=config["password_1"],
        is_test=config["is_test"],
        result_url=config["result_url"],
        success_url=success_url_full,
        fail_url=fail_url_full,
    )

    logger.info(
        "payment_subscription_init payment_id=%s invoice_id=%s robokassa_is_test=%s "
        "credential_branch=%s stub=%s",
        payment.id,
        invoice_id,
        bool(config.get("is_test")),
        config.get("credential_branch", ""),
        robokassa_stub,
    )

    def _domain_path(u: str) -> str:
        if not u:
            return ""
        try:
            p = urlparse(u)
            return f"{p.scheme or ''}://{p.netloc or ''}{p.path or ''}"
        except Exception:
            return (u or "")[:80]

    if s.PAYMENT_URL_DEBUG.strip() == "1" or s.is_development:
        _merchant = config["merchant_login"]
        _merchant_log = _merchant[:20] + "..." if len(_merchant) > 20 else _merchant
        logger.info(
            "TAG: payment_url_diag user_id=%s phone=%s env=%s merchant_login=%s is_test=%s "
            "payment_url_domain=%s success_url_domain=%s fail_url_domain=%s result_url_domain=%s",
            current_user.id,
            getattr(current_user, "phone", None) or "",
            s.ENVIRONMENT,
            _merchant_log,
            config.get("is_test", False),
            _domain_path(payment_url),
            _domain_path(config.get("success_url") or ""),
            _domain_path(config.get("fail_url") or ""),
            _domain_path(config.get("result_url") or ""),
        )

    return PaymentInitResponse(
        payment_id=payment.id,
        payment_url=payment_url,
        invoice_id=invoice_id
    )


@router.post("/deposit/init", response_model=PaymentInitResponse)
async def init_deposit_payment(
    payment_request: DepositPaymentInitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """MVP: пополнение отключено. Депозит только через оплату подписки (Продлить/Апгрейд)."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Пополнение только через оплату подписки (Продлить / Апгрейд в разделе «Мой тариф»).",
    )


@router.get("/robokassa/stub-complete")
async def robokassa_stub_complete(
    invoice_id: str = Query(..., alias="invoice_id"),
    db: Session = Depends(get_db),
):
    """
    Stub-режим: симуляция успешной оплаты. Только при ROBOKASSA_MODE=stub.
    Редирект на success_url после применения подписки.
    """
    from settings import get_settings
    if not get_settings().robokassa_stub:
        raise HTTPException(status_code=404, detail="Not available")
    payment = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    config = get_robokassa_config()
    signature = generate_result_signature(float(payment.amount), invoice_id, config["password_2"])
    # POST к себе с теми же данными, что Robokassa
    import httpx
    api_base = get_settings().API_BASE_URL.rstrip("/")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{api_base}/api/payments/robokassa/result",
            data={
                "OutSum": f"{payment.amount:.2f}",
                "InvId": invoice_id,
                "SignatureValue": signature,
            },
            timeout=30,
        )
    success_url = config.get("success_url") or "http://localhost:5173/payment/success"
    return RedirectResponse(url=f"{success_url}?payment_id={payment.id}", status_code=302)


@router.post("/robokassa/result")
async def robokassa_result(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Обработка уведомлений от Robokassa (ResultURL)
    
    Этот эндпоинт вызывается Robokassa после успешной оплаты
    """
    # Получаем данные из POST запроса
    form_data = await request.form()
    
    # Извлекаем параметры
    amount = float(form_data.get("OutSum", 0))
    invoice_id = form_data.get("InvId", "")
    signature = form_data.get("SignatureValue", "")
    
    if not invoice_id:
        return "ERROR: Missing InvId"
    
    # Получаем конфигурацию
    config = get_robokassa_config()
    
    # Проверяем подпись (в тестовом режиме Robokassa — тестовый пароль #2)
    if not verify_result_notification(amount, invoice_id, signature, config["password_2"]):
        logger.warning(
            "robokassa_result invalid_signature invoice_id=%s credential_branch=%s",
            invoice_id,
            config.get("credential_branch", ""),
        )
        return "ERROR: Invalid signature"

    is_test_param = (form_data.get("IsTest") or "").strip().lower() in ("1", "true", "yes")
    logger.info(
        "robokassa_result signature_ok invoice_id=%s robokassa_is_test=%s "
        "credential_branch=%s is_test_param=%s",
        invoice_id,
        bool(config.get("is_test")),
        config.get("credential_branch", ""),
        is_test_param,
    )

    # Находим платеж
    payment = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).first()
    
    if not payment:
        return f"ERROR: Payment not found for invoice {invoice_id}"
    
    # Проверяем сумму
    if abs(payment.amount - amount) > 0.01:  # Допускаем небольшую погрешность
        payment.status = 'failed'
        payment.error_message = f"Несоответствие суммы: ожидалось {payment.amount}, получено {amount}"
        db.commit()
        return f"ERROR: Amount mismatch for invoice {invoice_id}"

    now = datetime.utcnow()

    # ------------------------
    # Фаза 1: фиксируем факт оплаты (НЕ откатывается из-за apply)
    # ------------------------
    try:
        with db.begin():
            payment_locked = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).with_for_update().first()
            if not payment_locked:
                return f"ERROR: Payment not found for invoice {invoice_id}"

            if payment_locked.status != 'paid':
                payment_locked.status = 'paid'
                payment_locked.paid_at = now
                payment_locked.robokassa_payment_id = form_data.get("PaymentId", "") or payment_locked.robokassa_payment_id

            # Идемпотентно применяем "внутренний депозит" (зачисление средств на баланс) для subscription платежей.
            # ВАЖНО: это часть "paid"-факта: деньги должны быть учтены даже если apply подписки упадет.
            if payment_locked.payment_type == 'subscription':
                if not payment_locked.subscription_apply_status:
                    payment_locked.subscription_apply_status = 'pending'
                meta = payment_locked.payment_metadata or {}
                if meta.get("subscription_deposit_applied") is not True:
                    user_balance = db.query(UserBalance).filter(UserBalance.user_id == payment_locked.user_id).with_for_update().first()
                    if not user_balance:
                        user_balance = UserBalance(user_id=payment_locked.user_id, balance=0, currency="RUB")
                        db.add(user_balance)
                        db.flush()
                    add_balance_transaction_no_commit(
                        db=db,
                        user_id=payment_locked.user_id,
                        amount=payment_locked.amount,
                        transaction_type=TransactionType.DEPOSIT,
                        description=f"Оплата подписки через Robokassa (платеж {payment_locked.id})",
                    )
                    meta["subscription_deposit_applied"] = True
                    payment_locked.payment_metadata = meta

    except Exception as e:
        logger.exception("robokassa_result phase1 mark-paid failed invoice_id=%s", invoice_id)
        return f"ERROR: Failed to mark payment as paid: {e}"

    # перечитываем после phase1 commit
    payment = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).first()
    if not payment:
        return f"ERROR: Payment not found for invoice {invoice_id}"

    # Для deposit — фиксируем paid и применяем депозит идемпотентно
    if payment.payment_type == 'deposit':
        try:
            with db.begin():
                p = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).with_for_update().first()
                if not p:
                    return f"ERROR: Payment not found for invoice {invoice_id}"
                meta = p.payment_metadata or {}
                if meta.get("deposit_applied") is True:
                    return f"OK{invoice_id}"
                # Лочим баланс пользователя
                user_balance = db.query(UserBalance).filter(UserBalance.user_id == p.user_id).with_for_update().first()
                if not user_balance:
                    user_balance = UserBalance(user_id=p.user_id, balance=0, currency="RUB")
                    db.add(user_balance)
                    db.flush()
                add_balance_transaction_no_commit(
                    db=db,
                    user_id=p.user_id,
                    amount=p.amount,
                    transaction_type=TransactionType.DEPOSIT,
                    description=f"Пополнение баланса через Robokassa (платеж {p.id})",
                )
                meta["deposit_applied"] = True
                p.payment_metadata = meta
                p.error_message = None
        except Exception as e:
            logger.exception("robokassa_result deposit apply failed invoice_id=%s", invoice_id)
            # депозит можно безопасно ретраить (Robokassa повторит callback)
            return f"ERROR: Deposit apply failed: {e}"
        return f"OK{invoice_id}"

    if payment.payment_type != 'subscription':
        return f"OK{invoice_id}"

    # Идемпотентность: если apply уже успешно сделан — ничего не делаем
    if payment.subscription_apply_status == 'applied' and payment.subscription_id:
        return f"OK{invoice_id}"

    # ------------------------
    # Фаза 2: apply подписки (атомарно, можно ретраить)
    # ------------------------
    try:
        with db.begin():
            payment = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).with_for_update().first()
            if not payment:
                raise RuntimeError("Payment not found")

            if payment.subscription_apply_status == 'applied' and payment.subscription_id:
                return f"OK{invoice_id}"

            payment.subscription_apply_status = 'pending'
            payment.error_message = None

            meta = payment.payment_metadata or {}
            calculation_id = meta.get("calculation_id")
            if not calculation_id:
                raise RuntimeError("Missing calculation_id in payment metadata")

            snapshot = db.query(SubscriptionPriceSnapshot).filter(
                SubscriptionPriceSnapshot.id == calculation_id,
                SubscriptionPriceSnapshot.user_id == payment.user_id
            ).first()
            if not snapshot:
                raise RuntimeError("Snapshot not found")
            if snapshot.expires_at <= now:
                raise RuntimeError("Snapshot expired")
            if abs(float(snapshot.final_price) - float(payment.amount)) > 0.01:
                raise RuntimeError("Amount mismatch vs snapshot.final_price")

            user = db.query(User).filter(User.id == payment.user_id).first()
            if not user:
                raise RuntimeError("User not found")

            # Лочим баланс пользователя (минимизация гонок available/reserve)
            user_balance = db.query(UserBalance).filter(UserBalance.user_id == payment.user_id).with_for_update().first()
            if not user_balance:
                user_balance = UserBalance(user_id=payment.user_id, balance=0, currency="RUB")
                db.add(user_balance)
                db.flush()

            # Определяем тип подписки
            subscription_type = None
            if user.role.value in ['salon']:
                subscription_type = SubscriptionType.SALON
            elif user.role.value in ['master', 'indie']:
                subscription_type = SubscriptionType.MASTER
            else:
                raise RuntimeError("Invalid role for subscription")

            # Единый строгий селектор (и автопочинка "ACTIVE но уже expired")
            from utils.subscription_features import get_effective_subscription
            current_subscription = get_effective_subscription(db, payment.user_id, subscription_type, now_utc=now)

            # Enforce downgrade rule (не доверяем клиенту). Сравнение по цене выбранного периода.
            requested_upgrade_type = snapshot.upgrade_type or meta.get("upgrade_type") or "immediate"
            effective_upgrade_type = requested_upgrade_type
            current_price_period = None
            new_price_period = None
            computed_is_downgrade = False
            if current_subscription and current_subscription.plan_id:
                current_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == current_subscription.plan_id).first()
                new_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == snapshot.plan_id).first()
                try:
                    if current_plan and new_plan:
                        months = int(getattr(snapshot, "duration_months", 1) or 1)
                        def _p(p, m):
                            if m == 1:
                                return float(getattr(p, "price_1month", 0.0) or 0.0)
                            if m == 3:
                                return float(getattr(p, "price_3months", 0.0) or 0.0)
                            if m == 6:
                                return float(getattr(p, "price_6months", 0.0) or 0.0)
                            return float(getattr(p, "price_12months", 0.0) or 0.0)
                        current_price_period = _p(current_plan, months)
                        new_price_period = _p(new_plan, months)
                        if new_price_period > 0 and current_price_period > 0 and new_price_period < current_price_period:
                            computed_is_downgrade = True
                            effective_upgrade_type = "after_expiry"
                except Exception:
                    # best-effort: если не смогли сравнить, не форсим
                    pass

            # Start date
            if effective_upgrade_type == "after_expiry" and current_subscription:
                start_date = current_subscription.end_date
            else:
                start_date = now

            _dm = int(getattr(snapshot, "duration_months", 1) or 1)
            _duration_days = max(1, duration_months_to_days(_dm))
            end_date = start_date + timedelta(days=_duration_days)
            will_start_now = start_date <= now
            new_status = SubscriptionStatus.ACTIVE if will_start_now else SubscriptionStatus.PENDING
            new_is_active = True if will_start_now else False

            import math
            total_price_full = float(snapshot.total_price)
            daily_rate = int(math.ceil(total_price_full / _duration_days)) if _duration_days else 0

            new_subscription = Subscription(
                user_id=payment.user_id,
                subscription_type=subscription_type,
                status=new_status,
                start_date=start_date,
                end_date=end_date,
                price=total_price_full,
                daily_rate=daily_rate,
                payment_period=payment.subscription_period,
                is_active=new_is_active,
                auto_renewal=payment.is_recurring,
                plan_id=snapshot.plan_id,
            )
            db.add(new_subscription)
            db.flush()

            # MVP: резерв не используем. Остаток = UserBalance.balance. Таблицу оставляем, запись с 0.
            new_res = SubscriptionReservation(
                user_id=payment.user_id,
                subscription_id=new_subscription.id,
                reserved_amount=0.0
            )
            db.add(new_res)
            db.flush()

            # Деактивируем старую подписку при immediate upgrade
            if effective_upgrade_type == "immediate" and current_subscription:
                current_subscription.status = SubscriptionStatus.EXPIRED
                current_subscription.is_active = False

            payment.subscription_id = new_subscription.id
            payment.subscription_apply_status = 'applied'
            payment.subscription_applied_at = now
            payment.error_message = None

            from settings import get_settings
            if get_settings().SUBSCRIPTION_PAYMENT_DEBUG.strip() == "1":
                logger.info(
                    "subscription/apply_downgrade invoice_id=%s payment_id=%s user_id=%s calculation_id=%s current_plan_id=%s current_price_1m=%s "
                    "new_plan_id=%s new_price_1m=%s requested_upgrade_type=%s effective_upgrade_type=%s is_downgrade=%s snapshot_final=%s snapshot_total=%s",
                    invoice_id,
                    payment.id,
                    payment.user_id,
                    meta.get("calculation_id"),
                    getattr(current_subscription, "plan_id", None),
                    current_price_period,
                    snapshot.plan_id,
                    new_price_period,
                    requested_upgrade_type,
                    effective_upgrade_type,
                    computed_is_downgrade,
                    float(getattr(snapshot, "final_price", 0.0) or 0.0),
                    float(getattr(snapshot, "total_price", 0.0) or 0.0),
                )
                logger.info(
                    "subscription/apply_success payment_id=%s user_id=%s snapshot_id=%s paid_amount=%s "
                    "plan_id=%s requested_upgrade_type=%s effective_upgrade_type=%s start_date=%s end_date=%s old_reserved=%s reserved=%s needed=%s",
                    payment.id,
                    payment.user_id,
                    snapshot.id,
                    payment.amount,
                    snapshot.plan_id,
                    requested_upgrade_type,
                    effective_upgrade_type,
                    start_date,
                    end_date,
                    old_reserved,
                    float(new_res.reserved_amount or 0.0),
                    needed,
                )

    except Exception as e:
        # apply упал: paid остаётся, но помечаем apply_status=failed (и возвращаем OK, чтобы Robokassa не ретраила бесконечно)
        logger.exception("robokassa_result phase2 apply failed invoice_id=%s", invoice_id)
        try:
            meta = (payment.payment_metadata or {}) if payment else {}
            logger.error(
                "subscription/apply_failed invoice_id=%s payment_id=%s user_id=%s calculation_id=%s",
                invoice_id,
                getattr(payment, "id", None),
                getattr(payment, "user_id", None),
                meta.get("calculation_id"),
            )
        except Exception:
            pass
        try:
            with db.begin():
                p2 = db.query(Payment).filter(Payment.robokassa_invoice_id == invoice_id).with_for_update().first()
                if p2:
                    p2.subscription_apply_status = 'failed'
                    p2.error_message = str(e)
        except Exception:
            logger.exception("robokassa_result phase2 mark failed failed invoice_id=%s", invoice_id)
        return f"OK{invoice_id}"

    return f"OK{invoice_id}"


@router.get("/status", response_model=List[PaymentOut])
async def get_payments_status(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    payment_id: Optional[int] = None,
    status_filter: Optional[str] = None
):
    """
    Получить статусы платежей
    
    Админ видит все платежи, пользователь - только свои
    """
    # Проверяем права доступа
    if current_user.role.value not in ['admin', 'moderator']:
        # Обычный пользователь видит только свои платежи
        query = db.query(Payment).filter(Payment.user_id == current_user.id)
    else:
        # Админ видит все платежи
        query = db.query(Payment)
    
    # Фильтры
    if payment_id:
        query = query.filter(Payment.id == payment_id)
    
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    
    payments = query.order_by(Payment.created_at.desc()).all()
    
    return [PaymentOut.from_orm(p) for p in payments]


@router.post("/{payment_id}/activate-subscription")
async def activate_subscription_after_payment(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Активировать подписку после оплаты
    
    Пользователь должен нажать кнопку активации после успешной оплаты
    """
    # Находим платеж
    payment = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.user_id == current_user.id
    ).first()
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Платеж не найден"
        )
    
    if payment.status != 'paid':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Платеж еще не оплачен"
        )
    
    if payment.payment_type != 'subscription':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот платеж не для подписки"
        )
    
    if not payment.subscription_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подписка не найдена для этого платежа"
        )
    
    # Находим подписку
    subscription = db.query(Subscription).filter(
        Subscription.id == payment.subscription_id,
        Subscription.user_id == current_user.id
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подписка не найдена"
        )
    
    # Активируем подписку
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.is_active = True
    db.commit()
    
    return {
        "message": "Подписка активирована",
        "subscription_id": subscription.id
    }

