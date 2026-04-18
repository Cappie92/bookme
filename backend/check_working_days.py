#!/usr/bin/env python3
"""
Скрипт для проверки рабочих дней салонов и мастеров.
"""

import sys
import os
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db
from models import AvailabilitySlot, OwnerType

def check_working_days():
    """Проверяет рабочие дни для всех салонов и мастеров"""
    
    print("🔍 Проверка рабочих дней...")
    
    db = next(get_db())
    
    try:
        # Проверяем салоны
        print("\n🏢 РАБОЧИЕ ДНИ САЛОНОВ:")
        salon_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.SALON
        ).all()
        
        salon_ids = set(slot.owner_id for slot in salon_slots)
        
        for salon_id in sorted(salon_ids):
            print(f"\nСалон ID {salon_id}:")
            salon_days = [slot for slot in salon_slots if slot.owner_id == salon_id]
            
            for slot in sorted(salon_days, key=lambda x: x.day_of_week):
                day_names = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
                day_name = day_names[slot.day_of_week] if 1 <= slot.day_of_week <= 7 else f"День {slot.day_of_week}"
                print(f"  {day_name} (день {slot.day_of_week}): {slot.start_time}-{slot.end_time}")
        
        # Проверяем мастеров
        print("\n👨‍💼 РАБОЧИЕ ДНИ МАСТЕРОВ:")
        master_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER
        ).all()
        
        master_ids = set(slot.owner_id for slot in master_slots)
        
        for master_id in sorted(master_ids):
            print(f"\nМастер ID {master_id}:")
            master_days = [slot for slot in master_slots if slot.owner_id == master_id]
            
            for slot in sorted(master_days, key=lambda x: x.day_of_week):
                day_names = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
                day_name = day_names[slot.day_of_week] if 1 <= slot.day_of_week <= 7 else f"День {slot.day_of_week}"
                print(f"  {day_name} (день {slot.day_of_week}): {slot.start_time}-{slot.end_time}")
        
        # Проверяем индивидуальных мастеров
        print("\n🎨 РАБОЧИЕ ДНИ ИНДИВИДУАЛЬНЫХ МАСТЕРОВ:")
        indie_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id.in_([im.id for im in indie_masters])
        ).all()
        
        indie_ids = set(slot.owner_id for slot in indie_slots)
        
        for indie_id in sorted(indie_ids):
            print(f"\nИндивидуальный мастер ID {indie_id}:")
            indie_days = [slot for slot in indie_slots if slot.owner_id == indie_id]
            
            for slot in sorted(indie_days, key=lambda x: x.day_of_week):
                day_names = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
                day_name = day_names[slot.day_of_week] if 1 <= slot.day_of_week <= 7 else f"День {slot.day_of_week}"
                print(f"  {day_name} (день {slot.day_of_week}): {slot.start_time}-{slot.end_time}")
        
        print(f"\n📊 СТАТИСТИКА:")
        print(f"  Салонов: {len(salon_ids)}")
        print(f"  Мастеров: {len(master_ids)}")
        print(f"  Индивидуальных мастеров: {len(indie_ids)}")
        
    except Exception as e:
        print(f"❌ Ошибка при проверке: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_working_days()
