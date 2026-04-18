import asyncio
import logging
import os
from datetime import datetime, date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from database import get_db
from models import Subscription, DailySubscriptionCharge, DailyChargeStatus, SubscriptionStatus
from utils.balance_utils import process_daily_charge

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_active_subscriptions_for_date(db: Session, charge_date: date) -> List[Subscription]:
    """Получить все активные подписки для указанной даты"""
    # В БД даты подписок хранятся как DateTime (UTC). Приводим charge_date к UTC boundary.
    charge_dt = datetime.combine(charge_date, datetime.min.time())
    return (
        db.query(Subscription)
        .filter(
            and_(
                Subscription.is_active == True,
                Subscription.start_date <= charge_dt,
                Subscription.end_date > charge_dt,
            )
        )
        .all()
    )


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
        # Защита данных: ACTIVE/is_active=True, но подписка уже истекла по end_date -> EXPIRED/is_active=False
        try:
            now_utc = datetime.utcnow()
            expired = db.query(Subscription).filter(
                and_(
                    or_(Subscription.status == SubscriptionStatus.ACTIVE, Subscription.is_active == True),
                    Subscription.end_date <= now_utc,
                )
            ).all()
            if expired:
                for s in expired:
                    s.status = SubscriptionStatus.EXPIRED
                    s.is_active = False
                db.commit()
                logger.warning(f"Помечено EXPIRED подписок по end_date<=now_utc: {len(expired)}")
        except Exception as e:
            logger.warning(f"Не удалось пометить истекшие подписки как EXPIRED: {e}")

        # Активируем подписки, которые должны стартовать сегодня (после оплаты/after_expiry)
        try:
            due = db.query(Subscription).filter(
                and_(
                    Subscription.is_active == False,
                    Subscription.status == SubscriptionStatus.PENDING,
                    Subscription.start_date <= datetime.combine(charge_date, datetime.min.time()),
                    Subscription.end_date > datetime.combine(charge_date, datetime.min.time()),
                )
            ).all()
            for sub in due:
                sub.status = SubscriptionStatus.ACTIVE
                sub.is_active = True
            if due:
                db.commit()
                logger.info(f"Активировано подписок к старту: {len(due)}")
        except Exception as e:
            logger.warning(f"Не удалось активировать подписки к старту: {e}")

        # Получаем все активные подписки
        active_subscriptions = get_active_subscriptions_for_date(db, charge_date)
        
        logger.info(f"Найдено {len(active_subscriptions)} активных подписок")
        
        results = {
            "date": charge_date.isoformat(),
            "total_subscriptions": len(active_subscriptions),
            "successful_charges": 0,
            "failed_charges": 0,
            "deactivated_subscriptions": 0,
            "renewals": renewal_results,
            "errors": [],
            "affected_user_ids": [],
        }
        affected_users: List[int] = []

        for subscription in active_subscriptions:
            affected_users.append(subscription.user_id)
            try:
                result = process_daily_charge(db, subscription.id, charge_date)
                
                if result["success"]:
                    results["successful_charges"] += 1
                    logger.info(f"Успешное списание для подписки {subscription.id}: {result['daily_rate']} руб.")
                else:
                    results["failed_charges"] += 1
                    logger.warning(f"Неуспешное списание для подписки {subscription.id}: {result['error']}")
                    
                    if result.get("subscription_deactivated"):
                        results["deactivated_subscriptions"] += 1
                        logger.warning(f"Подписка {subscription.id} деактивирована из-за недостатка средств")
                
            except Exception as e:
                results["failed_charges"] += 1
                error_msg = f"Ошибка при обработке подписки {subscription.id}: {str(e)}"
                results["errors"].append(error_msg)
                logger.error(error_msg)
        
        results["affected_user_ids"] = list(dict.fromkeys(affected_users))
        logger.info(f"Обработка завершена. Успешно: {results['successful_charges']}, "
                   f"Неуспешно: {results['failed_charges']}, "
                   f"Деактивировано: {results['deactivated_subscriptions']}")
        
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
        # Получаем неуспешные списания за указанную дату
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
                # Удаляем неуспешную запись
                db.delete(charge)
                db.commit()
                
                # Повторяем попытку списания
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


# Функция для запуска в качестве фоновой задачи
async def run_daily_charges_task():
    """Фоновая задача для ежедневного списания"""
    
    while True:
        try:
            # Ждем до следующего дня в 00:01
            now = datetime.now()
            next_run = now.replace(hour=0, minute=1, second=0, microsecond=0) + timedelta(days=1)
            
            wait_seconds = (next_run - now).total_seconds()
            logger.info(f"Следующий запуск ежедневных списаний в {next_run}")
            
            await asyncio.sleep(wait_seconds)
            
            # Выполняем списания
            result = process_all_daily_charges()
            logger.info(f"Ежедневные списания выполнены: {result}")
            
        except asyncio.CancelledError:
            logger.info("Задача ежедневных списаний остановлена")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче ежедневных списаний: {str(e)}")
            await asyncio.sleep(3600)  # Ждем час перед повторной попыткой


# Функция для ручного запуска
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
        # Окно проверки: 1–3 дня до/после, чтобы видеть решение в логах даже при пропуске daily job.
        renew_window_days = 3
        window_start = datetime.combine(charge_date - timedelta(days=renew_window_days), datetime.min.time())
        window_end = datetime.combine(charge_date, datetime.max.time())
        expiring_subscriptions = db.query(Subscription).filter(
            and_(
                Subscription.end_date.between(window_start, window_end),
                Subscription.auto_renewal == True,
                Subscription.payment_period.isnot(None),
            )
        ).all()
        
        logger.info(f"Найдено {len(expiring_subscriptions)} подписок для автопродления")
        
        results = {
            "date": charge_date.isoformat(),
            "total_renewals": len(expiring_subscriptions),
            "successful_renewals": 0,
            "failed_renewals": 0,
            "errors": []
        }
        
        for subscription in expiring_subscriptions:
            try:
                # Есть ли заранее оплаченная PENDING подписка, которая стартует после окончания текущей?
                pending_next = db.query(Subscription).filter(
                    and_(
                        Subscription.user_id == subscription.user_id,
                        Subscription.subscription_type == subscription.subscription_type,
                        Subscription.status == SubscriptionStatus.PENDING,
                        Subscription.start_date == subscription.end_date,
                        Subscription.plan_id.isnot(None),
                    )
                ).order_by(Subscription.id.desc()).first()

                decision = "skip"
                reason = "recurring_not_implemented"
                if pending_next:
                    reason = "prepaid_pending_exists"

                logger.info(
                    "subscription/renewal_decision user_id=%s sub_id=%s end_date=%s auto_renewal=%s payment_period=%s decision=%s reason=%s pending_next_id=%s",
                    subscription.user_id,
                    subscription.id,
                    subscription.end_date,
                    bool(subscription.auto_renewal),
                    subscription.payment_period,
                    decision,
                    reason,
                    getattr(pending_next, "id", None),
                )

                results["failed_renewals"] += 1
                results["errors"].append(
                    {
                        "subscription_id": subscription.id,
                        "error": reason,
                        "pending_next_id": getattr(pending_next, "id", None),
                    }
                )
                    
            except Exception as e:
                results["failed_renewals"] += 1
                error_msg = f"Исключение при автопродлении подписки {subscription.id}: {str(e)}"
                results["errors"].append({
                    "subscription_id": subscription.id,
                    "error": error_msg
                })
                logger.error(error_msg)
                
        logger.info(f"Автопродление завершено. Успешно: {results['successful_renewals']}, Ошибок: {results['failed_renewals']}")
        
        return results
        
    finally:
        db.close()


if __name__ == "__main__":
    # Для тестирования
    result = run_daily_charges_manual()
    print(f"Результат: {result}") 