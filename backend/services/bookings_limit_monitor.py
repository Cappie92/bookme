"""
Фоновая задача для мониторинга лимитов активных записей.
Запускается ежедневно в 00:00 для логирования информации о лимитах.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from models import Master, Booking, BookingStatus, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_masters_bookings_limits() -> dict:
    """
    Проверить лимиты активных записей для всех мастеров с планом Free.
    Логирует информацию о мастерах, у которых достигнут или превышен лимит.
    """
    db = SessionLocal()
    
    try:
        # Получаем текущую дату с 00:00
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Находим всех мастеров с планом Free
        free_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "Free",
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if not free_plan:
            logger.warning("План Free не найден")
            return {
                "date": today_start.isoformat(),
                "error": "План Free не найден",
                "masters_checked": 0
            }
        
        # Получаем все активные подписки на план Free
        free_subscriptions = db.query(Subscription).filter(
            Subscription.plan_id == free_plan.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.end_date > datetime.utcnow()
        ).all()
        
        logger.info(f"Проверяем лимиты для {len(free_subscriptions)} мастеров с планом Free")
        
        results = {
            "date": today_start.isoformat(),
            "masters_checked": len(free_subscriptions),
            "masters_at_limit": 0,
            "masters_over_limit": 0,
            "masters_under_limit": 0,
            "details": []
        }
        
        for subscription in free_subscriptions:
            try:
                # Находим мастера
                master = db.query(Master).filter(Master.user_id == subscription.user_id).first()
                if not master:
                    continue
                
                # Подсчитываем активные записи
                from utils.master_future_bookings_query import active_future_bookings_sql_filter

                active_bookings_count = (
                    db.query(func.count(Booking.id))
                    .filter(active_future_bookings_sql_filter(master, datetime.utcnow()))
                    .scalar() or 0
                )
                
                limits = free_plan.limits or {}
                max_future_bookings = limits.get("max_future_bookings", 30)
                
                is_at_limit = active_bookings_count >= max_future_bookings
                is_over_limit = active_bookings_count > max_future_bookings
                
                if is_over_limit:
                    results["masters_over_limit"] += 1
                    logger.warning(
                        f"Мастер {master.id} (user_id: {subscription.user_id}): "
                        f"превышен лимит - {active_bookings_count}/{max_future_bookings}"
                    )
                elif is_at_limit:
                    results["masters_at_limit"] += 1
                    logger.info(
                        f"Мастер {master.id} (user_id: {subscription.user_id}): "
                        f"достигнут лимит - {active_bookings_count}/{max_future_bookings}"
                    )
                else:
                    results["masters_under_limit"] += 1
                
                results["details"].append({
                    "master_id": master.id,
                    "user_id": subscription.user_id,
                    "active_bookings": active_bookings_count,
                    "limit": max_future_bookings,
                    "status": "over" if is_over_limit else ("at_limit" if is_at_limit else "under")
                })
                
            except Exception as e:
                logger.error(f"Ошибка при проверке мастера {subscription.user_id}: {str(e)}")
        
        logger.info(
            f"Проверка лимитов завершена. "
            f"На лимите: {results['masters_at_limit']}, "
            f"Превысили: {results['masters_over_limit']}, "
            f"Под лимитом: {results['masters_under_limit']}"
        )
        
        return results
        
    except Exception as e:
        error_msg = f"Критическая ошибка при проверке лимитов: {str(e)}"
        logger.error(error_msg)
        return {
            "date": today_start.isoformat(),
            "error": error_msg,
            "masters_checked": 0
        }
    finally:
        db.close()


async def run_bookings_limit_monitor_task():
    """
    Фоновая задача для ежедневного мониторинга лимитов активных записей.
    Запускается в 00:00 каждый день.
    """
    while True:
        try:
            # Ждем до следующего дня в 00:00
            now = datetime.now()
            next_run = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
            
            wait_seconds = (next_run - now).total_seconds()
            logger.info(f"Следующая проверка лимитов активных записей в {next_run}")
            
            await asyncio.sleep(wait_seconds)
            
            # Выполняем проверку
            result = check_masters_bookings_limits()
            logger.info(f"Проверка лимитов выполнена: {result}")
            
        except asyncio.CancelledError:
            logger.info("Задача мониторинга лимитов отменена")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче мониторинга лимитов: {str(e)}")
            await asyncio.sleep(3600)  # Ждем час перед повторной попыткой


if __name__ == "__main__":
    # Для тестирования
    result = check_masters_bookings_limits()
    print(f"Результат: {result}")


