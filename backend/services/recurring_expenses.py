"""
Сервис для автоматического создания циклических расходов
"""
import logging
from datetime import datetime, timedelta
import asyncio

from sqlalchemy.orm import Session
from database import SessionLocal
from models import MasterExpense, Booking, MasterSchedule, BookingStatus

logger = logging.getLogger(__name__)


def create_recurring_expenses():
    """Создание записей циклических расходов"""
    db = SessionLocal()
    try:
        today = datetime.now().date()
        
        # Получаем активные шаблоны циклических расходов
        recurring_templates = db.query(MasterExpense).filter(
            MasterExpense.expense_type == "recurring",
            MasterExpense.is_active == True
        ).all()
        
        logger.info(f"Найдено {len(recurring_templates)} шаблонов циклических расходов")
        
        for template in recurring_templates:
            should_create = False
            
            # Проверяем, нужно ли создать расход сегодня
            if template.recurrence_type == "daily":
                should_create = True
            
            elif template.recurrence_type == "weekly":
                # Проверяем, был ли создан расход на этой неделе
                week_start = today - timedelta(days=today.weekday())
                existing = db.query(MasterExpense).filter(
                    MasterExpense.master_id == template.master_id,
                    MasterExpense.name == template.name,
                    MasterExpense.expense_type == "one_time",
                    MasterExpense.expense_date >= datetime.combine(week_start, datetime.min.time()),
                    MasterExpense.expense_date <= datetime.combine(today, datetime.max.time())
                ).first()
                
                if not existing:
                    should_create = True
            
            elif template.recurrence_type == "monthly":
                # Проверяем, был ли создан расход в этом месяце
                month_start = today.replace(day=1)
                existing = db.query(MasterExpense).filter(
                    MasterExpense.master_id == template.master_id,
                    MasterExpense.name == template.name,
                    MasterExpense.expense_type == "one_time",
                    MasterExpense.expense_date >= datetime.combine(month_start, datetime.min.time()),
                    MasterExpense.expense_date <= datetime.combine(today, datetime.max.time())
                ).first()
                
                if not existing:
                    should_create = True
            
            elif template.recurrence_type == "conditional":
                if template.condition_type == "has_bookings":
                    # Проверяем, есть ли запись на сегодня
                    bookings = db.query(Booking).filter(
                        Booking.master_id == template.master_id,
                        Booking.date == today
                    ).first()
                    
                    if bookings:
                        # Проверяем, был ли уже создан расход на сегодня
                        existing = db.query(MasterExpense).filter(
                            MasterExpense.master_id == template.master_id,
                            MasterExpense.name == template.name,
                            MasterExpense.expense_type == "one_time",
                            MasterExpense.expense_date >= datetime.combine(today, datetime.min.time()),
                            MasterExpense.expense_date <= datetime.combine(today, datetime.max.time())
                        ).first()
                        
                        if not existing:
                            should_create = True
                
                elif template.condition_type == "schedule_open":
                    # Проверяем, открыто ли расписание на сегодня (есть ли запись в расписании)
                    weekday = today.weekday()
                    schedule = db.query(MasterSchedule).filter(
                        MasterSchedule.master_id == template.master_id,
                        MasterSchedule.day_of_week == weekday
                    ).first()
                    
                    if schedule and schedule.start_time:  # Если расписание есть и не None
                        # Проверяем, был ли уже создан расход на сегодня
                        existing = db.query(MasterExpense).filter(
                            MasterExpense.master_id == template.master_id,
                            MasterExpense.name == template.name,
                            MasterExpense.expense_type == "one_time",
                            MasterExpense.expense_date >= datetime.combine(today, datetime.min.time()),
                            MasterExpense.expense_date <= datetime.combine(today, datetime.max.time())
                        ).first()
                        
                        if not existing:
                            should_create = True
            
            # Создаем разовый расход на основе шаблона
            if should_create:
                expense = MasterExpense(
                    master_id=template.master_id,
                    name=template.name,
                    expense_type="one_time",
                    amount=template.amount,
                    expense_date=datetime.combine(today, datetime.now().time())
                )
                db.add(expense)
                logger.info(f"Создан циклический расход '{template.name}' для мастера {template.master_id}")
        
        db.commit()
        logger.info("Обработка циклических расходов завершена")
        
    except Exception as e:
        logger.error(f"Ошибка при создании циклических расходов: {e}")
        db.rollback()
    finally:
        db.close()


async def run_recurring_expenses_task():
    """Фоновая задача для ежедневного запуска создания циклических расходов"""
    while True:
        try:
            # Вычисляем время следующего запуска (в 00:05 следующего дня)
            now = datetime.now()
            tomorrow = now + timedelta(days=1)
            next_run = tomorrow.replace(hour=0, minute=5, second=0, microsecond=0)
            
            wait_seconds = (next_run - now).total_seconds()
            logger.info(f"Следующий запуск создания циклических расходов в {next_run}")
            
            await asyncio.sleep(wait_seconds)
            
            # Запускаем создание расходов
            create_recurring_expenses()
            
        except asyncio.CancelledError:
            logger.info("Задача создания циклических расходов остановлена")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой задаче циклических расходов: {e}")
            # Ждем 1 час перед повторной попыткой в случае ошибки
            await asyncio.sleep(3600)

