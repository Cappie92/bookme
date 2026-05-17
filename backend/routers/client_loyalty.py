"""
Роутер для работы с программой лояльности в кабинете клиента
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from datetime import datetime

from auth import get_current_active_user, require_client
from database import get_db
from models import User, LoyaltyTransaction, Booking, Master
from schemas import ClientLoyaltyPointsOut, ClientLoyaltyPointsSummaryOut, LoyaltyTransactionOut
from utils.loyalty import calculate_client_balance
from utils.public_booking_loyalty import (
    effective_available_points,
    sum_active_loyalty_reserved_points,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/client/loyalty",
    tags=["client_loyalty"],
    dependencies=[Depends(require_client)]
)


def _loyalty_transaction_service_name(t: LoyaltyTransaction) -> Optional[str]:
    """Имя услуги: с транзакции или с записи (для spent до появления service_id)."""
    try:
        if t.service and getattr(t.service, "name", None):
            return t.service.name
    except Exception:
        pass
    try:
        if t.booking and t.booking.service and getattr(t.booking.service, "name", None):
            return t.booking.service.name
    except Exception:
        pass
    return None


def _loyalty_transaction_to_out(t: LoyaltyTransaction) -> LoyaltyTransactionOut:
    return LoyaltyTransactionOut(
        id=t.id,
        master_id=t.master_id,
        client_id=t.client_id,
        booking_id=t.booking_id,
        service_id=t.service_id,
        transaction_type=t.transaction_type,
        points=t.points,
        earned_at=t.earned_at,
        expires_at=t.expires_at,
        created_at=t.created_at or t.earned_at,
        client_name=None,
        service_name=_loyalty_transaction_service_name(t),
    )


@router.get("/points", response_model=ClientLoyaltyPointsSummaryOut)
def get_client_points(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Получить все баллы клиента по всем мастерам.
    Возвращает объект с общим балансом и списком баллов по каждому мастеру.
    Включает мастеров с нулевым доступным балансом, если есть история транзакций (например spent).
    """
    from sqlalchemy.exc import OperationalError, ProgrammingError

    try:
        client_id = current_user.id
        now = datetime.utcnow()

        earned_transactions = db.query(LoyaltyTransaction).options(
            joinedload(LoyaltyTransaction.master).joinedload(Master.user),
            joinedload(LoyaltyTransaction.service),
            joinedload(LoyaltyTransaction.booking).joinedload(Booking.service),
        ).filter(
            LoyaltyTransaction.client_id == client_id,
            LoyaltyTransaction.transaction_type == 'earned',
            or_(
                LoyaltyTransaction.expires_at.is_(None),
                LoyaltyTransaction.expires_at > now
            )
        ).all()

        spent_transactions = db.query(LoyaltyTransaction).options(
            joinedload(LoyaltyTransaction.master).joinedload(Master.user),
            joinedload(LoyaltyTransaction.service),
            joinedload(LoyaltyTransaction.booking).joinedload(Booking.service),
        ).filter(
            LoyaltyTransaction.client_id == client_id,
            LoyaltyTransaction.transaction_type == 'spent'
        ).all()

    except (OperationalError, ProgrammingError) as e:
        logger.warning(f"Таблица loyalty_transactions недоступна для клиента {current_user.id}: {e}")
        return ClientLoyaltyPointsSummaryOut(masters=[], total_balance=0, total_reserved=0)

    master_balances = {}

    for trans in earned_transactions:
        master_id = trans.master_id
        if master_id not in master_balances:
            master_name = f'Мастер #{master_id}'
            try:
                if trans.master and hasattr(trans.master, 'user') and trans.master.user:
                    master_name = trans.master.user.full_name or master_name
            except Exception:
                pass

            master_domain = None
            try:
                if trans.master and hasattr(trans.master, 'domain'):
                    master_domain = trans.master.domain
            except Exception:
                pass

            master_balances[master_id] = {
                'master_id': master_id,
                'master_name': master_name,
                'master_domain': master_domain,
                'earned_points': 0,
                'spent_points': 0,
                'transactions': []
            }
        master_balances[master_id]['earned_points'] += trans.points
        master_balances[master_id]['transactions'].append(trans)

    for trans in spent_transactions:
        master_id = trans.master_id
        if master_id not in master_balances:
            master_name = f'Мастер #{master_id}'
            try:
                if trans.master and hasattr(trans.master, 'user') and trans.master.user:
                    master_name = trans.master.user.full_name or master_name
            except Exception:
                pass

            master_domain = None
            try:
                if trans.master and hasattr(trans.master, 'domain'):
                    master_domain = trans.master.domain
            except Exception:
                pass

            master_balances[master_id] = {
                'master_id': master_id,
                'master_name': master_name,
                'master_domain': master_domain,
                'earned_points': 0,
                'spent_points': 0,
                'transactions': []
            }
        master_balances[master_id]['spent_points'] += trans.points
        master_balances[master_id]['transactions'].append(trans)

    masters_list = []
    total_balance = 0
    total_reserved = 0

    for master_id, data in master_balances.items():
        try:
            ledger_balance = int(calculate_client_balance(db, master_id, client_id))
        except Exception as e:
            logger.warning(
                "Ошибка расчёта ledger для мастера %s, клиента %s: %s",
                master_id,
                client_id,
                e,
            )
            ledger_balance = int(data["earned_points"] - data["spent_points"])

        try:
            reserved_points = sum_active_loyalty_reserved_points(
                db, master_id=master_id, client_id=client_id
            )
            available_points = effective_available_points(
                db, master_id=master_id, client_id=client_id
            )
        except Exception as e:
            logger.warning(
                "Ошибка расчёта effective/reserved для мастера %s, клиента %s: %s",
                master_id,
                client_id,
                e,
            )
            reserved_points = 0
            available_points = max(0, ledger_balance)

        active_transactions = [
            t for t in data['transactions']
            if t.transaction_type == 'earned' and (
                t.expires_at is None or t.expires_at > now
            )
        ] + [
            t for t in data['transactions']
            if t.transaction_type == 'spent'
        ]

        active_transactions.sort(key=lambda x: x.earned_at, reverse=True)

        transaction_list = [
            _loyalty_transaction_to_out(t) for t in active_transactions[:50]
        ]

        include_master = (
            available_points > 0
            or reserved_points > 0
            or len(transaction_list) > 0
        )
        if include_master:
            masters_list.append(ClientLoyaltyPointsOut(
                master_id=master_id,
                master_name=data['master_name'],
                master_domain=data.get('master_domain'),
                balance=available_points,
                reserved_points=reserved_points,
                ledger_balance=ledger_balance,
                transactions=transaction_list
            ))
            total_balance += available_points
            total_reserved += reserved_points

    masters_list.sort(key=lambda x: x.balance, reverse=True)

    return ClientLoyaltyPointsSummaryOut(
        masters=masters_list,
        total_balance=total_balance,
        total_reserved=total_reserved,
    )


@router.get("/history/{master_id}", response_model=List[LoyaltyTransactionOut])
def get_client_loyalty_history_for_master(
    master_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=200),
):
    """История earned + spent у конкретного мастера (для mobile/web)."""
    client_id = current_user.id
    now = datetime.utcnow()

    earned = (
        db.query(LoyaltyTransaction)
        .options(
            joinedload(LoyaltyTransaction.service),
            joinedload(LoyaltyTransaction.booking).joinedload(Booking.service),
        )
        .filter(
            LoyaltyTransaction.client_id == client_id,
            LoyaltyTransaction.master_id == master_id,
            LoyaltyTransaction.transaction_type == "earned",
            or_(LoyaltyTransaction.expires_at.is_(None), LoyaltyTransaction.expires_at > now),
        )
        .all()
    )
    spent = (
        db.query(LoyaltyTransaction)
        .options(
            joinedload(LoyaltyTransaction.service),
            joinedload(LoyaltyTransaction.booking).joinedload(Booking.service),
        )
        .filter(
            LoyaltyTransaction.client_id == client_id,
            LoyaltyTransaction.master_id == master_id,
            LoyaltyTransaction.transaction_type == "spent",
        )
        .all()
    )
    merged = earned + spent
    merged.sort(key=lambda x: x.earned_at, reverse=True)
    return [_loyalty_transaction_to_out(t) for t in merged[:limit]]


@router.get("/points/summary", response_model=List[ClientLoyaltyPointsSummaryOut])
def get_client_points_summary(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Получить краткую информацию о баллах клиента по мастерам.
    Используется для отображения в списке избранных мастеров.
    """
    client_id = current_user.id

    master_ids = db.query(LoyaltyTransaction.master_id).filter(
        LoyaltyTransaction.client_id == client_id
    ).distinct().all()

    result = []
    for (master_id,) in master_ids:
        balance = calculate_client_balance(db, master_id, client_id)
        if balance > 0:
            first_trans = db.query(LoyaltyTransaction).filter(
                LoyaltyTransaction.client_id == client_id,
                LoyaltyTransaction.master_id == master_id
            ).first()

            master_name = f'Мастер #{master_id}'
            if first_trans and first_trans.master and first_trans.master.user:
                master_name = first_trans.master.user.full_name

            result.append(ClientLoyaltyPointsSummaryOut(
                master_id=master_id,
                master_name=master_name,
                total_points=balance
            ))

    return result


@router.get("/points/{master_id}/available")
def get_available_points_for_master(
    master_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Получить доступные баллы клиента у конкретного мастера.
    Используется при создании бронирования.
    """
    client_id = current_user.id

    from utils.loyalty import get_loyalty_settings, get_available_points
    from schemas import AvailableLoyaltyPointsOut

    loyalty_settings = get_loyalty_settings(db, master_id)

    if not loyalty_settings or not loyalty_settings.is_enabled:
        return AvailableLoyaltyPointsOut(
            master_id=master_id,
            available_points=0,
            max_payment_percent=None,
            is_loyalty_enabled=False
        )

    available_points = get_available_points(db, master_id, client_id)

    return AvailableLoyaltyPointsOut(
        master_id=master_id,
        available_points=available_points,
        max_payment_percent=loyalty_settings.max_payment_percent,
        is_loyalty_enabled=True
    )


@router.get("/master/{master_id}/loyalty-settings")
def get_master_loyalty_settings_public(
    master_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить публичные настройки программы лояльности мастера (read-only для клиентов).
    Используется для отображения информации о лояльности в клиентском UI.
    """
    from utils.loyalty import get_loyalty_settings

    loyalty_settings = get_loyalty_settings(db, master_id)

    if not loyalty_settings:
        return {
            "master_id": master_id,
            "is_enabled": False,
            "accrual_percent": None,
            "max_payment_percent": None,
            "points_lifetime_days": None
        }

    return {
        "master_id": master_id,
        "is_enabled": loyalty_settings.is_enabled,
        "accrual_percent": loyalty_settings.accrual_percent,
        "max_payment_percent": loyalty_settings.max_payment_percent,
        "points_lifetime_days": loyalty_settings.points_lifetime_days
    }
