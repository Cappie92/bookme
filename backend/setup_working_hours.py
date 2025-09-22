#!/usr/bin/env python3
"""
Скрипт для установки рабочего времени для всех тестовых аккаунтов.
Устанавливает рабочее время с 10:00 до 20:00 с понедельника по пятницу.
"""

import sys
import os
from datetime import time
from sqlalchemy.orm import Session

# Добавляем путь к корневой директории проекта
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db, engine
from models import User, Salon, Master, IndieMaster, AvailabilitySlot, OwnerType
from auth import get_password_hash

def setup_working_hours():
    """Устанавливает рабочее время для всех тестовых аккаунтов"""
    
    print("🔧 Настройка рабочего времени для тестовых аккаунтов...")
    
    # Создаем сессию базы данных
    db = next(get_db())
    
    try:
        # Рабочее время: с 10:00 до 20:00
        work_start = time(10, 0)  # 10:00
        work_end = time(20, 0)    # 20:00
        
        # Дни недели: понедельник (1) - пятница (5)
        work_days = [1, 2, 3, 4, 5]  # Пн, Вт, Ср, Чт, Пт (1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт)
        
        print(f"📅 Устанавливаем рабочее время: {work_start.strftime('%H:%M')} - {work_end.strftime('%H:%M')}")
        print(f"📅 Рабочие дни: Понедельник - Пятница")
        
        # 1. Устанавливаем рабочее время для салонов
        print("\n🏢 Настройка салонов...")
        salons = db.query(Salon).all()
        
        for salon in salons:
            print(f"  - Салон: {salon.name} (ID: {salon.id})")
            
            # Удаляем существующие слоты
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.SALON,
                AvailabilitySlot.owner_id == salon.id
            ).delete()
            
            # Создаем новые слоты для каждого рабочего дня
            for day in work_days:
                slot = AvailabilitySlot(
                    owner_type=OwnerType.SALON,
                    owner_id=salon.id,
                    day_of_week=day,
                    start_time=work_start,
                    end_time=work_end
                )
                db.add(slot)
                print(f"    ✅ День {day}: {work_start.strftime('%H:%M')} - {work_end.strftime('%H:%M')}")
        
        # 2. Устанавливаем рабочее время для мастеров в салонах (исключая гибридных)
        print("\n👨‍💼 Настройка мастеров в салонах...")
        # Исключаем гибридных мастеров (ID 5, 6, 7) из обычных мастеров
        regular_masters = db.query(Master).filter(~Master.id.in_([5, 6, 7])).all()
        
        for master in regular_masters:
            print(f"  - Мастер: {master.user.full_name if master.user else 'Неизвестно'} (ID: {master.id})")
            
            # Удаляем существующие слоты
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.MASTER,
                AvailabilitySlot.owner_id == master.id
            ).delete()
            
            # Создаем новые слоты для каждого рабочего дня
            for day in work_days:
                slot = AvailabilitySlot(
                    owner_type=OwnerType.MASTER,
                    owner_id=master.id,
                    day_of_week=day,
                    start_time=work_start,
                    end_time=work_end
                )
                db.add(slot)
                print(f"    ✅ День {day}: {work_start.strftime('%H:%M')} - {work_end.strftime('%H:%M')}")
        

        
        # 4. Устанавливаем рабочее время для гибридных мастеров (только как независимые)
        print("\n🔄 Настройка гибридных мастеров...")
        hybrid_master_ids = [5, 6, 7]  # ID гибридных мастеров
        
        for master_id in hybrid_master_ids:
            # Проверяем, что мастер существует
            master = db.query(Master).filter(Master.id == master_id).first()
            if master:
                print(f"  - Гибридный мастер: {master.user.full_name if master.user else 'Неизвестно'} (ID: {master.id})")
                
                # Удаляем существующие слоты для этого мастера
                db.query(AvailabilitySlot).filter(
                    AvailabilitySlot.owner_type == OwnerType.MASTER,
                    AvailabilitySlot.owner_id == master_id
                ).delete()
                
                # Создаем новые слоты для каждого рабочего дня
                for day in work_days:
                    slot = AvailabilitySlot(
                        owner_type=OwnerType.MASTER,
                        owner_id=master_id,
                        day_of_week=day,
                        start_time=work_start,
                        end_time=work_end
                    )
                    db.add(slot)
                    print(f"    ✅ День {day}: {work_start.strftime('%H:%M')} - {work_end.strftime('%H:%M')}")
        
        # 5. Устанавливаем рабочее время для независимых мастеров (исключая гибридных)
        print("\n🆓 Настройка независимых мастеров...")
        # Исключаем гибридных мастеров (ID 5, 6, 7) из независимых мастеров
        regular_indie_masters = db.query(IndieMaster).filter(~IndieMaster.id.in_([5, 6, 7])).all()
        
        for indie_master in regular_indie_masters:
            print(f"  - Независимый мастер: {indie_master.user.full_name if indie_master.user else 'Неизвестно'} (ID: {indie_master.id})")
            
            # Удаляем существующие слоты
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.MASTER,
                AvailabilitySlot.owner_id == indie_master.id
            ).delete()
            
            # Создаем новые слоты для каждого рабочего дня
            for day in work_days:
                slot = AvailabilitySlot(
                    owner_type=OwnerType.MASTER,
                    owner_id=indie_master.id,
                    day_of_week=day,
                    start_time=work_start,
                    end_time=work_end
                )
                db.add(slot)
                print(f"    ✅ День {day}: {work_start.strftime('%H:%M')} - {work_end.strftime('%H:%M')}")
        
        # Сохраняем изменения
        db.commit()
        
        print(f"\n✅ Рабочее время успешно установлено!")
        print(f"📊 Статистика:")
        print(f"   - Салоны: {len(salons)}")
        print(f"   - Мастера в салонах: {len(regular_masters)}")
        print(f"   - Независимые мастера: {len(regular_indie_masters)}")
        print(f"   - Гибридные мастера: {len(hybrid_master_ids)}")
        print(f"   - Всего слотов доступности: {(len(salons) + len(regular_masters) + len(regular_indie_masters) + len(hybrid_master_ids)) * len(work_days)}")
        
        # Проверяем, что слоты созданы
        total_slots = db.query(AvailabilitySlot).count()
        print(f"   - Всего слотов в базе: {total_slots}")
        
    except Exception as e:
        print(f"❌ Ошибка при настройке рабочего времени: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def verify_working_hours():
    """Проверяет, что рабочее время установлено корректно"""
    
    print("\n🔍 Проверка установленного рабочего времени...")
    
    db = next(get_db())
    
    try:
        # Проверяем слоты для салонов
        salon_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.SALON
        ).all()
        
        print(f"🏢 Слоты салонов: {len(salon_slots)}")
        for slot in salon_slots[:3]:  # Показываем первые 3
            print(f"  - Салон {slot.owner_id}, день {slot.day_of_week}: {slot.start_time} - {slot.end_time}")
        
        # Проверяем слоты для мастеров
        master_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER
        ).all()
        
        print(f"👨‍💼 Слоты мастеров: {len(master_slots)}")
        for slot in master_slots[:3]:  # Показываем первые 3
            print(f"  - Мастер {slot.owner_id}, день {slot.day_of_week}: {slot.start_time} - {slot.end_time}")
        
        # Проверяем общее количество
        total_slots = db.query(AvailabilitySlot).count()
        print(f"📊 Общее количество слотов: {total_slots}")
        
        if total_slots > 0:
            print("✅ Рабочее время установлено корректно!")
        else:
            print("❌ Рабочее время не установлено!")
            
    except Exception as e:
        print(f"❌ Ошибка при проверке: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 Запуск настройки рабочего времени...")
    
    try:
        setup_working_hours()
        verify_working_hours()
        print("\n🎉 Настройка завершена успешно!")
        
    except Exception as e:
        print(f"\n💥 Критическая ошибка: {e}")
        sys.exit(1)
