import asyncio
from datetime import time, date, datetime, timedelta
from database import engine
from models import MasterSchedule, Master
from sqlalchemy.orm import sessionmaker

async def setup_master_schedule():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Находим мастера wdwedewq
        master = db.query(Master).join(Master.user).filter(Master.user.has(phone="+74444444444")).first()
        
        if not master:
            print("❌ Мастер wdwedewq не найден")
            return
        
        print(f"✅ Найден мастер: {master.user.full_name} (ID: {master.id})")
        
        # Удаляем существующее расписание
        db.query(MasterSchedule).filter(MasterSchedule.master_id == master.id).delete()
        
        # Создаем расписание на 4 недели вперед
        today = date.today()
        current_day = today.weekday()  # 0 = понедельник, 6 = воскресенье
        
        # Находим понедельник текущей недели
        monday = today - timedelta(days=current_day)
        
        schedule_entries = []
        
        # Расписание на неделю
        schedule_config = {
            0: [time(9, 0), time(18, 0)],  # Понедельник: 9:00-18:00
            1: None,  # Вторник: выходной
            2: [time(9, 0), time(18, 0)],  # Среда: 9:00-18:00
            3: [time(12, 0), time(18, 0)],  # Четверг: 12:00-18:00
            4: [time(9, 0), time(18, 0)],  # Пятница: 9:00-18:00
            5: None,  # Суббота: выходной
            6: None,  # Воскресенье: выходной
        }
        
        # Создаем расписание на 4 недели (28 дней)
        for week in range(4):
            for i in range(7):
                current_date = monday + timedelta(days=week * 7 + i)
                day_of_week = current_date.weekday()
                
                if schedule_config[day_of_week]:
                    start_time, end_time = schedule_config[day_of_week]
                    
                    # Создаем слоты по 30 минут
                    current_time = start_time
                    while current_time < end_time:
                        # Вычисляем время окончания слота (30 минут)
                        end_minute = current_time.minute + 30
                        end_hour = current_time.hour
                        if end_minute >= 60:
                            end_hour += 1
                            end_minute -= 60
                        
                        slot_end_time = time(end_hour, end_minute)
                        
                        # Создаем запись расписания
                        schedule_entry = MasterSchedule(
                            master_id=master.id,
                            date=current_date,
                            start_time=current_time,
                            end_time=slot_end_time,
                            is_available=True
                        )
                        schedule_entries.append(schedule_entry)
                        
                        # Переходим к следующему слоту
                        current_time = slot_end_time
                    
                    print(f"✅ {current_date.strftime('%A')} ({current_date}): {start_time}-{end_time}")
                else:
                    print(f"❌ {current_date.strftime('%A')} ({current_date}): выходной")
        
        # Добавляем все записи в базу
        db.add_all(schedule_entries)
        db.commit()
        
        print(f"✅ Создано {len(schedule_entries)} слотов расписания для мастера {master.user.full_name}")
        print(f"✅ Период: с {monday} по {monday + timedelta(days=27)}")
        
    except Exception as e:
        print(f"❌ Ошибка при создании расписания: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(setup_master_schedule()) 