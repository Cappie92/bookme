import asyncio
import logging
import os
from datetime import datetime, date, timedelta
from typing import List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, cast, String

from database import get_db
from models import Subscription, DailySubscriptionCharge, DailyChargeStatus, SubscriptionStatus
from utils.balance_utils import process_daily_charge

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prod SQLite может хранить status как имя enum ('ACTIVE') или value ('active').
_STATUS_ACTIVE_SQL: Tuple[str, ...] = ("active", "ACTIVE")
_STATUS_PENDING_SQL: Tuple[str, ...] = ("pending", "PENDING")


def _status_in_sql(column, allowed: Sequence[str]):
    """Сравнение status в SQL без гидратации enum (совместимость active/ACTIVE)."""
    return cast(column, String).in_(tuple(allowed))


def get_active_subscription_ids_for_date(db: Session, charge_date: date) -> List[int]:
    """ID активных подписок на дату — без загрузки Subscription.status (enum-safe).

    Границы по календарным дням, как в process_daily_charge (balance_utils).
    """
    charge_start = datetime.combine(charge_date, datetime.min.time())
    next_day_start = charge_start + timedelta(days=1)
    rows = (
        db.query(Subscription.id)
        .filter(
            and_(
                Subscription.is_active == True,
                Subscription.start_date < next_day_start,
                Subscription.end_date > charge_start,
            )
        )
        .all()
    )
    return [int(r[0]) for r in rows]


def _active_subscription_id_rows(db: Session) -> List[Tuple[int, datetime, datetime]]:
    """(id, start_date, end_date) для is_active — без колонки status."""
    rows = (
        db.query(Subscription.id, Subscription.start_date, Subscription.end_date)
        .filter(Subscription.is_active == True)
        .all()
    )
    return [(int(r[0]), r[1], r[2]) for r in rows if r[1] is not None and r[2] is not None]


def catch_up_missed_daily_charges(
    up_to_date: date = None,
    db: Optional[Session] = None,
) -> dict:
    """
    Доначислить пропущенные daily charges: от последнего SUCCESS (или start_date)
    до up_to_date включительно. Идемпотентно — уже списанные даты пропускаются.
    """
    if up_to_date is None:
        up_to_date = date.today()

    own_db = db is None
    if own_db:
        db = next(get_db())

    results = {
        "up_to_date": up_to_date.isoformat(),
        "subscriptions_processed": 0,
        "charges_applied": 0,
        "charges_skipped": 0,
        "errors": [],
    }

    try:
        subscription_rows = _active_subscription_id_rows(db)
        results["subscriptions_processed"] = len(subscription_rows)

        for subscription_id, start_dt, end_dt in subscription_rows:
            start_d = start_dt.date()
            end_exclusive = end_dt.date()

            last_success = (
                db.query(DailySubscriptionCharge)
                .filter(
                    DailySubscriptionCharge.subscription_id == subscription_id,
                    DailySubscriptionCharge.status == DailyChargeStatus.SUCCESS,
                )
                .order_by(DailySubscriptionCharge.charge_date.desc())
                .first()
            )

            cur = (last_success.charge_date + timedelta(days=1)) if last_success else start_d

            while cur <= up_to_date:
                if cur < start_d:
                    cur += timedelta(days=1)
                    continue
                if cur >= end_exclusive:
                    break

                try:
                    result = process_daily_charge(db, subscription_id, cur)
                except Exception as e:
                    results["errors"].append(
                        {
                            "subscription_id": subscription_id,
                            "charge_date": cur.isoformat(),
                            "error": str(e),
                        }
                    )
                    break

                if result.get("success"):
                    if result.get("skipped"):
                        results["charges_skipped"] += 1
                    else:
                        results["charges_applied"] += 1
                else:
                    err = result.get("error") or "unknown"
                    if err == "Списание за эту дату уже произведено":
                        results["charges_skipped"] += 1
                    else:
                        results["errors"].append(
                            {
                                "subscription_id": subscription_id,
                                "charge_date": cur.isoformat(),
                                "error": err,
                            }
                        )
                        break

                cur += timedelta(days=1)

        return results
    finally:
        if own_db:
            db.close()


def get_active_subscriptions_for_date(db: Session, charge_date: date) -> List[Subscription]:
    """Deprecated: используйте get_active_subscription_ids_for_date (enum-safe)."""
    ids = get_active_subscription_ids_for_date(db, charge_date)
    if not ids:
        return []
    return db.query(Subscription).filter(Subscription.id.in_(ids)).all()


def _mark_expired_subscriptions(db: Session, now_utc: datetime) -> int:
    """Пометить истёкшие подписки EXPIRED без загрузки status enum."""
    expired_ids = [
        int(r[0])
        for r in db.query(Subscription.id)
        .filter(
            Subscription.is_active == True,
            Subscription.end_date <= now_utc,
            _status_in_sql(Subscription.status, _STATUS_ACTIVE_SQL),
        )
        .all()
    ]
    if not expired_ids:
        return 0
    db.query(Subscription).filter(Subscription.id.in_(expired_ids)).update(
        {
            Subscription.status: SubscriptionStatus.EXPIRED,
            Subscription.is_active: False,
        },
        synchronize_session=False,
    )
    db.commit()
    return len(expired_ids)


def _activate_due_pending_subscriptions(db: Session, charge_date: date) -> int:
    """Активировать PENDING подписки к старту — без загрузки полных ORM-объектов."""
    charge_start = datetime.combine(charge_date, datetime.min.time())
    next_day_start = charge_start + timedelta(days=1)
    due_ids = [
        int(r[0])
        for r in db.query(Subscription.id)
        .filter(
            Subscription.is_active == False,
            _status_in_sql(Subscription.status, _STATUS_PENDING_SQL),
            Subscription.start_date < next_day_start,
            Subscription.end_date > charge_start,
        )
        .all()
    ]
    if not due_ids:
        return 0
    db.query(Subscription).filter(Subscription.id.in_(due_ids)).update(
        {
            Subscription.status: SubscriptionStatus.ACTIVE,
            Subscription.is_active: True,
        },
        synchronize_session=False,
    )
    db.commit()
    return len(due_ids)


def process_all_daily_charges(charge_date: date = None, db: Optional[Session] = None) -> dict:
    """Обработать ежедневные списания для всех активных подписок.
    MVP: списание идёт из UserBalance.balance (остаток депозита подписки), не «общий кошелёк».
    Если передан db (напр. из run_daily_charges endpoint) — используем его, иначе создаём свою сессию.
    """
    if charge_date is None:
        charge_date = date.today()

    own_db = db is None
    if own_db:
        db = next(get_db())

    logger.info(f"Начинаем обработку ежедневных списаний за {charge_date}")

    # Автопродление картой (Recurring Robokassa) сейчас не реализовано.
    renewal_results = check_subscription_renewals(charge_date)

    try:
        try:
            now_utc = datetime.utcnow()
            marked = _mark_expired_subscriptions(db, now_utc)
            if marked:
                logger.warning("Помечено EXPIRED подписок по end_date<=now_utc: %s", marked)
        except Exception as e:
            logger.warning("Не удалось пометить истекшие подписки как EXPIRED: %s", e)

        try:
            activated = _activate_due_pending_subscriptions(db, charge_date)
            if activated:
                logger.info("Активировано подписок к старту: %s", activated)
        except Exception as e:
            logger.warning("Не удалось активировать подписки к старту: %s", e)

        active_subscription_ids = get_active_subscription_ids_for_date(db, charge_date)

        logger.info("Найдено %s активных подписок", len(active_subscription_ids))

        results = {
            "date": charge_date.isoformat(),
            "total_subscriptions": len(active_subscription_ids),
            "successful_charges": 0,
            "failed_charges": 0,
            "deactivated_subscriptions": 0,
            "renewals": renewal_results,
            "errors": [],
            "affected_user_ids": [],
        }
        affected_users: List[int] = []

        for subscription_id in active_subscription_ids:
            uid = (
                db.query(Subscription.user_id)
                .filter(Subscription.id == subscription_id)
                .scalar()
            )
            if uid is not None:
                affected_users.append(int(uid))
            try:
                result = process_daily_charge(db, subscription_id, charge_date)

                if result.get("success"):
                    results["successful_charges"] += 1
                    logger.info(
                        "Успешное списание для подписки %s: %s руб.",
                        subscription_id,
                        result.get("daily_rate"),
                    )
                else:
                    results["failed_charges"] += 1
                    logger.warning(
                        "Неуспешное списание для подписки %s: %s",
                        subscription_id,
                        result.get("error"),
                    )

                    if result.get("subscription_deactivated"):
                        results["deactivated_subscriptions"] += 1
                        logger.warning(
                            "Подписка %s деактивирована из-за недостатка средств",
                            subscription_id,
                        )

            except Exception as e:
                results["failed_charges"] += 1
                error_msg = f"Ошибка при обработке подписки {subscription_id}: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)

        results["affected_user_ids"] = list(dict.fromkeys(affected_users))
        logger.info(
            "Обработка завершена. Успешно: %s, Неуспешно: %s, Деактивировано: %s",
            results["successful_charges"],
            results["failed_charges"],
            results["deactivated_subscriptions"],
        )

        return results

    except Exception as e:
        error_msg = f"Критическая ошибка при обработке ежедневных списаний: {str(e)}"
        logger.error(error_msg)
        return {
            "date": charge_date.isoformat(),
            "error": error_msg,
            "total_subscriptions": 0,
            "successful_charges": 0,
            "failed_charges": 0,
            "deactivated_subscriptions": 0,
            "errors": [error_msg],
            "affected_user_ids": [],
        }
    finally:
        if own_db:
            db.close()


def get_charge_statistics(start_date: date, end_date: date) -> dict:
    """Получить статистику списаний за период"""

    db = next(get_db())

    try:
        charges = db.query(DailySubscriptionCharge).filter(
            and_(
                DailySubscriptionCharge.charge_date >= start_date,
                DailySubscriptionCharge.charge_date <= end_date
            )
        ).all()

        total_charges = len(charges)
        successful_charges = len([c for c in charges if c.status == DailyChargeStatus.SUCCESS])
        failed_charges = len([c for c in charges if c.status == DailyChargeStatus.FAILED])
        total_amount = sum(c.amount for c in charges if c.status == DailyChargeStatus.SUCCESS)

        return {
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            "total_charges": total_charges,
            "successful_charges": successful_charges,
            "failed_charges": failed_charges,
            "success_rate": (successful_charges / total_charges * 100) if total_charges > 0 else 0,
            "total_amount": total_amount / 100,  # Конвертируем копейки в рубли
            "average_daily_amount": (total_amount / (end_date - start_date).days / 100) if (end_date - start_date).days > 0 else 0
        }

    except Exception as e:
        logger.error(f"Ошибка при получении статистики: {str(e)}")
        return {"error": str(e)}
    finally:
        db.close()


def retry_failed_charges(charge_date: date = None) -> dict:
    """Повторить попытку списания для неуспешных операций"""

    if charge_date is None:
        charge_date = date.today()

    logger.info(f"Повторяем попытку списания за {charge_date}")

    db = next(get_db())

    try:
        failed_charges = db.query(DailySubscriptionCharge).filter(
            and_(
                DailySubscriptionCharge.charge_date == charge_date,
                DailySubscriptionCharge.status == DailyChargeStatus.FAILED
            )
        ).all()

        logger.info(f"Найдено {len(failed_charges)} неуспешных списаний для повторной попытки")

        results = {
            "date": charge_date.isoformat(),
            "total_retries": len(failed_charges),
            "successful_retries": 0,
            "failed_retries": 0,
            "errors": []
        }

        for charge in failed_charges:
            try:
                db.delete(charge)
                db.commit()

                result = process_daily_charge(db, charge.subscription_id, charge_date)

                if result["success"]:
                    results["successful_retries"] += 1
                    logger.info(f"Успешный повтор для подписки {charge.subscription_id}")
                else:
                    results["failed_retries"] += 1
                    logger.warning(f"Неуспешный повтор для подписки {charge.subscription_id}: {result['error']}")

            except Exception as e:
                results["failed_retries"] += 1
                error_msg = f"Ошибка при повторной попытке для подписки {charge.subscription_id}: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)

        logger.info(f"Повторные попытки завершены. Успешно: {results['successful_retries']}, "
                   f"Неуспешно: {results['failed_retries']}")

        return results

    except Exception as e:
        error_msg = f"Критическая ошибка при повторных попытках: {str(e)}"
        logger.error(error_msg)
        return {
            "date": charge_date.isoformat(),
            "error": error_msg,
            "total_retries": 0,
            "successful_retries": 0,
            "failed_retries": 0,
            "errors": [error_msg]
        }
    finally:
        db.close()


async def run_daily_charges_task():
    """Фоновая задача для ежедневного списания"""

    while True:
        try:
            catch_result = catch_up_missed_daily_charges()
            logger.info("Catch-up ежедневных списаний: %s", catch_result)

            result = process_all_daily_charges()
            logger.info("Ежедневные списания выполнены: %s", result)

            now = datetime.now()
            next_run = now.replace(hour=0, minute=1, second=0, microsecond=0) + timedelta(days=1)
            wait_seconds = max(1.0, (next_run - now).total_seconds())
            logger.info("Следующий запуск ежедневных списаний в %s", next_run)

            await asyncio.sleep(wait_seconds)

        except asyncio.CancelledError:
            logger.info("Задача ежедневных списаний остановлена")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче ежедневных списаний: {str(e)}")
            await asyncio.sleep(3600)


def run_daily_charges_manual():
    """Ручной запуск ежедневных списаний"""
    return process_all_daily_charges()


def check_subscription_renewals(charge_date: date = None) -> dict:
    """
    Проверить автопродление подписок.

    В текущем контракте (Variant A) recurring платежи не выполняются автоматически.
    Auto_renewal считается UX-флагом и может работать только через заранее оплаченный PENDING-renewal.
    Здесь мы логируем решение (renew/skip) и причину.
    """

    if charge_date is None:
        charge_date = date.today()

    logger.info(f"Проверяем подписки на автопродление за {charge_date}")

    db = next(get_db())

    try:
        renew_window_days = 3
        window_start = datetime.combine(charge_date - timedelta(days=renew_window_days), datetime.min.time())
        window_end = datetime.combine(charge_date, datetime.max.time())
        expiring_rows = (
            db.query(
                Subscription.id,
                Subscription.user_id,
                Subscription.end_date,
                Subscription.auto_renewal,
                Subscription.payment_period,
                Subscription.subscription_type,
            )
            .filter(
                and_(
                    Subscription.end_date.between(window_start, window_end),
                    Subscription.auto_renewal == True,
                    Subscription.payment_period.isnot(None),
                )
            )
            .all()
        )

        logger.info(f"Найдено {len(expiring_rows)} подписок для автопродления")

        results = {
            "date": charge_date.isoformat(),
            "total_renewals": len(expiring_rows),
            "successful_renewals": 0,
            "failed_renewals": 0,
            "errors": []
        }

        for row in expiring_rows:
            subscription_id, user_id, end_date, auto_renewal, payment_period, subscription_type = row
            try:
                pending_next_id = (
                    db.query(Subscription.id)
                    .filter(
                        Subscription.user_id == user_id,
                        Subscription.subscription_type == subscription_type,
                        _status_in_sql(Subscription.status, _STATUS_PENDING_SQL),
                        Subscription.start_date == end_date,
                        Subscription.plan_id.isnot(None),
                    )
                    .order_by(Subscription.id.desc())
                    .limit(1)
                    .scalar()
                )

                decision = "skip"
                reason = "recurring_not_implemented"
                if pending_next_id:
                    reason = "prepaid_pending_exists"

                logger.info(
                    "subscription/renewal_decision user_id=%s sub_id=%s end_date=%s auto_renewal=%s payment_period=%s decision=%s reason=%s pending_next_id=%s",
                    user_id,
                    subscription_id,
                    end_date,
                    bool(auto_renewal),
                    payment_period,
                    decision,
                    reason,
                    pending_next_id,
                )

                results["failed_renewals"] += 1
                results["errors"].append(
                    {
                        "subscription_id": subscription_id,
                        "error": reason,
                        "pending_next_id": pending_next_id,
                    }
                )

            except Exception as e:
                results["failed_renewals"] += 1
                error_msg = f"Исключение при автопродлении подписки {subscription_id}: {str(e)}"
                results["errors"].append({
                    "subscription_id": subscription_id,
                    "error": error_msg
                })
                logger.error(error_msg)

        logger.info(f"Автопродление завершено. Успешно: {results['successful_renewals']}, Ошибок: {results['failed_renewals']}")

        return results

    finally:
        db.close()


if __name__ == "__main__":
    result = run_daily_charges_manual()
    print(f"Результат: {result}")
