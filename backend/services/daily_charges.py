import asyncio
import logging
from datetime import datetime, date, timedelta
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import Subscription, DailySubscriptionCharge, DailyChargeStatus
from utils.balance_utils import process_daily_charge, ensure_reserve_for_remaining_days, auto_renew_subscription

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_active_subscriptions_for_date(db: Session, charge_date: date) -> List[Subscription]:
    """Получить все активные подписки для указанной даты"""
    
    return db.query(Subscription).filter(
        and_(
            Subscription.is_active == True,
            Subscription.start_date <= charge_date,
            Subscription.end_date > charge_date
        )
    ).all()


def process_all_daily_charges(charge_date: date = None) -> dict:
    """Обработать ежедневные списания для всех активных подписок"""
    
    if charge_date is None:
        charge_date = date.today()
    
    logger.info(f"Начинаем обработку ежедневных списаний за {charge_date}")
    
    # Сначала проверяем автопродления
    renewal_results = check_subscription_renewals(charge_date)
    
    db = next(get_db())
    
    try:
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
            "errors": []
        }
        
        for subscription in active_subscriptions:
            try:
                result = process_daily_charge(db, subscription.id, charge_date)
                
                if result["success"]:
                    results["successful_charges"] += 1
                    logger.info(f"Успешное списание для подписки {subscription.id}: {result['daily_rate']} руб.")
                    # После успешного списания поддерживаем резерв под весь остаток
                    try:
                        ensure_reserve_for_remaining_days(db, subscription, max_days=None)
                    except Exception as e:
                        logger.warning(f"Не удалось синхронизировать резерв для подписки {subscription.id}: {e}")
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
            "errors": [error_msg]
        }
    finally:
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
            
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче ежедневных списаний: {str(e)}")
            await asyncio.sleep(3600)  # Ждем час перед повторной попыткой


# Функция для ручного запуска
def run_daily_charges_manual():
    """Ручной запуск ежедневных списаний"""
    return process_all_daily_charges()


def check_subscription_renewals(charge_date: date = None) -> dict:
    """Проверить и обработать автопродление подписок"""
    
    if charge_date is None:
        charge_date = date.today()
    
    logger.info(f"Проверяем подписки на автопродление за {charge_date}")
    
    db = next(get_db())
    
    try:
        # Находим подписки, которые заканчиваются сегодня
        expiring_subscriptions = db.query(Subscription).filter(
            and_(
                Subscription.is_active == True,
                Subscription.end_date.between(
                    datetime.combine(charge_date, datetime.min.time()),
                    datetime.combine(charge_date, datetime.max.time())
                ),
                Subscription.auto_renewal == True,
                Subscription.payment_period.isnot(None)
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
                result = auto_renew_subscription(db, subscription)
                
                if result["success"]:
                    results["successful_renewals"] += 1
                    logger.info(f"Успешное автопродление подписки {subscription.id} до {result['new_end_date']}")
                else:
                    results["failed_renewals"] += 1
                    results["errors"].append({
                        "subscription_id": subscription.id,
                        "error": result.get("message", "Unknown error")
                    })
                    logger.error(f"Ошибка автопродления подписки {subscription.id}: {result.get('message', 'Unknown error')}")
                    
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