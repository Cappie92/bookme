#!/usr/bin/env python3
"""
Скрипт для исправления продолжительностей тестовых услуг.
Приводит все продолжительности к кратности 30 минутам.
"""

import sys
import os
from sqlalchemy.orm import Session

# Добавляем путь к корневой директории проекта
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db
from models import Service, MasterService

def round_to_nearest_30(minutes):
    """Округляет минуты до ближайшего значения, кратного 30"""
    if minutes <= 30:
        return 30
    elif minutes <= 60:
        return 60
    elif minutes <= 90:
        return 90
    elif minutes <= 120:
        return 120
    elif minutes <= 150:
        return 150
    elif minutes <= 180:
        return 180
    elif minutes <= 210:
        return 210
    elif minutes <= 240:
        return 240
    else:
        return 270  # Максимум для тестовых данных

def fix_service_durations():
    """Исправляет продолжительности всех услуг"""
    
    print("🔧 Исправление продолжительностей тестовых услуг...")
    
    # Создаем сессию базы данных
    db = next(get_db())
    
    try:
        # 1. Исправляем салонные услуги
        print("\n🏢 Исправление салонных услуг...")
        salon_services = db.query(Service).all()
        
        salon_fixed = 0
        for service in salon_services:
            old_duration = service.duration
            new_duration = round_to_nearest_30(old_duration)
            
            if old_duration != new_duration:
                print(f"  - {service.name}: {old_duration} мин → {new_duration} мин")
                service.duration = new_duration
                salon_fixed += 1
            else:
                print(f"  - {service.name}: {old_duration} мин ✓ (уже корректно)")
        
        # 2. Исправляем мастерские услуги
        print("\n👨‍💼 Исправление мастерских услуг...")
        master_services = db.query(MasterService).all()
        
        master_fixed = 0
        for service in master_services:
            old_duration = service.duration
            new_duration = round_to_nearest_30(old_duration)
            
            if old_duration != new_duration:
                print(f"  - {service.name}: {old_duration} мин → {new_duration} мин")
                service.duration = new_duration
                master_fixed += 1
            else:
                print(f"  - {service.name}: {old_duration} мин ✓ (уже корректно)")
        
        # Сохраняем изменения
        db.commit()
        
        print(f"\n✅ Продолжительности успешно исправлены!")
        print(f"📊 Статистика:")
        print(f"   - Салонные услуги исправлено: {salon_fixed}")
        print(f"   - Мастерские услуги исправлено: {master_fixed}")
        print(f"   - Всего исправлено: {salon_fixed + master_fixed}")
        
        # Проверяем результат
        verify_durations()
        
    except Exception as e:
        print(f"❌ Ошибка при исправлении продолжительностей: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def verify_durations():
    """Проверяет, что все продолжительности исправлены корректно"""
    
    print("\n🔍 Проверка исправленных продолжительностей...")
    
    db = next(get_db())
    
    try:
        # Проверяем салонные услуги
        salon_services = db.query(Service).all()
        print(f"\n🏢 Салонные услуги:")
        
        for service in salon_services:
            status = "✅" if service.duration % 30 == 0 else "❌"
            print(f"  {status} {service.name}: {service.duration} мин")
        
        # Проверяем мастерские услуги
        master_services = db.query(MasterService).all()
        print(f"\n👨‍💼 Мастерские услуги:")
        
        for service in master_services:
            status = "✅" if service.duration % 30 == 0 else "❌"
            print(f"  {status} {service.name}: {service.duration} мин")
        
        # Общая статистика
        all_services = salon_services + master_services
        correct_durations = sum(1 for s in all_services if s.duration % 30 == 0)
        total_services = len(all_services)
        
        print(f"\n📊 Итоговая проверка:")
        print(f"   - Всего услуг: {total_services}")
        print(f"   - Корректных продолжительностей: {correct_durations}")
        print(f"   - Некорректных продолжительностей: {total_services - correct_durations}")
        
        if correct_durations == total_services:
            print("🎉 Все продолжительности исправлены корректно!")
        else:
            print("⚠️  Некоторые продолжительности все еще некорректны!")
            
    except Exception as e:
        print(f"❌ Ошибка при проверке: {e}")
    finally:
        db.close()

def show_duration_distribution():
    """Показывает распределение продолжительностей по 30-минутным интервалам"""
    
    print("\n📊 Распределение продолжительностей по интервалам:")
    
    db = next(get_db())
    
    try:
        # Собираем все продолжительности
        salon_durations = [s.duration for s in db.query(Service).all()]
        master_durations = [s.duration for s in db.query(MasterService).all()]
        all_durations = salon_durations + master_durations
        
        # Группируем по интервалам
        intervals = {
            "30 мин": 0,
            "60 мин": 0,
            "90 мин": 0,
            "120 мин": 0,
            "150 мин": 0,
            "180 мин": 0,
            "210 мин": 0,
            "240 мин": 0,
            "270 мин": 0,
            "Другое": 0
        }
        
        for duration in all_durations:
            if duration == 30:
                intervals["30 мин"] += 1
            elif duration == 60:
                intervals["60 мин"] += 1
            elif duration == 90:
                intervals["90 мин"] += 1
            elif duration == 120:
                intervals["120 мин"] += 1
            elif duration == 150:
                intervals["150 мин"] += 1
            elif duration == 180:
                intervals["180 мин"] += 1
            elif duration == 210:
                intervals["210 мин"] += 1
            elif duration == 240:
                intervals["240 мин"] += 1
            elif duration == 270:
                intervals["270 мин"] += 1
            else:
                intervals["Другое"] += 1
        
        for interval, count in intervals.items():
            if count > 0:
                print(f"  {interval}: {count} услуг")
                
    except Exception as e:
        print(f"❌ Ошибка при анализе распределения: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 Запуск исправления продолжительностей услуг...")
    
    try:
        # Показываем текущее распределение
        show_duration_distribution()
        
        # Исправляем продолжительности
        fix_service_durations()
        
        # Показываем новое распределение
        show_duration_distribution()
        
        print("\n🎉 Исправление завершено успешно!")
        
    except Exception as e:
        print(f"\n💥 Критическая ошибка: {e}")
        sys.exit(1) 