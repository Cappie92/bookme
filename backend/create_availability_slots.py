import asyncio
from datetime import time
from database import engine
from models import AvailabilitySlot, OwnerType
from sqlalchemy.orm import sessionmaker

async def create_availability_slots():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Удаляем существующие слоты
        db.query(AvailabilitySlot).delete()
        
        # Создаем слоты для салона (ID = 1)
        salon_slots = []
        for day in range(5):  # Понедельник - Пятница
            salon_slots.append(AvailabilitySlot(
                owner_type=OwnerType.SALON,
                owner_id=1,
                day_of_week=day,
                start_time=time(9, 0),  # 09:00
                end_time=time(18, 0)    # 18:00
            ))
        
        # Создаем слоты для мастеров (ID = 1, 2, 3)
        master_slots = []
        for master_id in [1, 2, 3]:
            for day in range(5):  # Понедельник - Пятница
                master_slots.append(AvailabilitySlot(
                    owner_type=OwnerType.MASTER,
                    owner_id=master_id,
                    day_of_week=day,
                    start_time=time(9, 0),  # 09:00
                    end_time=time(18, 0)    # 18:00
                ))
        
        # Добавляем все слоты в базу
        db.add_all(salon_slots + master_slots)
        db.commit()
        
        print(f"Создано {len(salon_slots)} слотов для салона")
        print(f"Создано {len(master_slots)} слотов для мастеров")
        print("Тестовые слоты доступности успешно созданы!")
        
    except Exception as e:
        print(f"Ошибка при создании слотов: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(create_availability_slots()) 