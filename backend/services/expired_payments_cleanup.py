"""
Фоновая задача: брошенные pending Robokassa-платежи подписки -> expired по TTL.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from database import get_db
from models import Payment

logger = logging.getLogger(__name__)

# Политика lifecycle pending subscription Payment
PENDING_SUBSCRIPTION_PAYMENT_TTL = timedelta(minutes=30)
CLEANUP_INTERVAL_SECONDS = 300  # 5 минут


def expire_stale_pending_subscription_payments(
    db: Optional[Session] = None,
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Переводит просроченные pending subscription-платежи Robokassa в status='expired'.

    Критерии:
    - status == 'pending'
    - payment_type == 'subscription' (модель Payment — Robokassa)
    - created_at <= now - PENDING_SUBSCRIPTION_PAYMENT_TTL

    Идемпотентно: повторный запуск не трогает уже expired/paid/failed/cancelled.
    Записи не удаляются.

    Можно вызвать вручную из Python (без admin endpoint)::

        from services.expired_payments_cleanup import expire_stale_pending_subscription_payments
        expire_stale_pending_subscription_payments()
    """
    own_db = db is None
    if own_db:
        db = next(get_db())

    if now is None:
        now = datetime.utcnow()
    cutoff = now - PENDING_SUBSCRIPTION_PAYMENT_TTL

    try:
        stale_payments = (
            db.query(Payment)
            .filter(
                Payment.status == "pending",
                Payment.payment_type == "subscription",
                Payment.created_at <= cutoff,
            )
            .all()
        )

        expired_count = 0
        for payment in stale_payments:
            payment.status = "expired"
            from utils.balance_utils import release_payment_balance_hold

            release_payment_balance_hold(db, payment, do_commit=False)
            expired_count += 1

        if expired_count:
            db.commit()
            logger.info(
                "Expired %s stale pending subscription payment(s) (cutoff=%s)",
                expired_count,
                cutoff.isoformat(),
            )
        else:
            logger.debug(
                "No stale pending subscription payments to expire (cutoff=%s)",
                cutoff.isoformat(),
            )

        return {
            "expired": expired_count,
            "cutoff": cutoff.isoformat(),
            "timestamp": now.isoformat(),
        }

    except Exception as e:
        logger.error("Error expiring stale pending subscription payments: %s", e)
        db.rollback()
        return {
            "error": str(e),
            "expired": 0,
            "timestamp": datetime.utcnow().isoformat(),
        }
    finally:
        if own_db:
            db.close()


async def run_expired_payments_cleanup_task():
    """
    Периодический cleanup брошенных subscription payments.
    Интервал: CLEANUP_INTERVAL_SECONDS (5 минут).
    """
    while True:
        try:
            result = expire_stale_pending_subscription_payments()
            expired = result.get("expired", 0) if isinstance(result, dict) else 0
            if expired:
                logger.info("Expired payments cleanup done: %s", result)
            else:
                logger.debug("Expired payments cleanup (no changes): %s", result)

            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)

        except asyncio.CancelledError:
            logger.info("Expired payments cleanup task stopped")
            break
        except Exception as e:
            logger.error("Error in expired payments cleanup background task: %s", e)
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
