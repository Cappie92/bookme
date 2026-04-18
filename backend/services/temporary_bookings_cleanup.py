"""
Фоновая задача для очистки просроченных временных броней.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from database import get_db
from models import TemporaryBooking

logger = logging.getLogger(__name__)


def cleanup_expired_temporary_bookings():
    """
    Удаляет просроченные временные брони (expires_at < now).
    Обновляет статус просроченных броней на 'expired'.
    """
    db = next(get_db())
    
    try:
        now = datetime.utcnow()
        
        # Находим все просроченные временные брони со статусом 'pending'
        expired_bookings = db.query(TemporaryBooking).filter(
            TemporaryBooking.status == 'pending',
            TemporaryBooking.expires_at < now
        ).all()
        
        if expired_bookings:
            # Обновляем статус на 'expired'
            for booking in expired_bookings:
                booking.status = 'expired'
            
            db.commit()
            logger.info(f"Очищено {len(expired_bookings)} просроченных временных броней")
        
        return {
            "cleaned": len(expired_bookings),
            "timestamp": now.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Ошибка при очистке просроченных временных броней: {e}")
        db.rollback()
        return {
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
    finally:
        db.close()


async def run_temporary_bookings_cleanup_task():
    """
    Фоновая задача для периодической очистки просроченных временных броней.
    Запускается каждые 5 минут.
    """
    while True:
        try:
            # Выполняем очистку
            result = cleanup_expired_temporary_bookings()
            cleaned = result.get("cleaned", 0) if isinstance(result, dict) else 0
            if cleaned:
                logger.info("Задача очистки временных броней выполнена: %s", result)
            else:
                logger.debug("Задача очистки временных броней (изменений нет): %s", result)
            
            # Ждем 5 минут до следующей очистки
            await asyncio.sleep(300)
            
        except asyncio.CancelledError:
            logger.info("Задача очистки временных броней остановлена")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче очистки временных броней: {e}")
            # Ждем 5 минут перед повторной попыткой в случае ошибки
            await asyncio.sleep(300)

