#!/usr/bin/env python3
"""
Скрипт для обновления домена салона
"""

from sqlalchemy.orm import Session
from database import SessionLocal
from models import Salon

def update_salon_domain(salon_id: int, domain: str):
    db = SessionLocal()
    
    try:
        # Находим салон
        salon = db.query(Salon).filter(Salon.id == salon_id).first()
        if not salon:
            print(f"❌ Салон с ID {salon_id} не найден")
            return
        
        # Проверяем, не занят ли домен другим салоном
        existing_salon = db.query(Salon).filter(Salon.domain == domain).first()
        if existing_salon and existing_salon.id != salon_id:
            print(f"❌ Домен '{domain}' уже занят салоном '{existing_salon.name}' (ID: {existing_salon.id})")
            return
        
        # Обновляем домен
        old_domain = salon.domain
        salon.domain = domain
        db.commit()
        
        print(f"✅ Домен салона '{salon.name}' (ID: {salon.id}) обновлен:")
        print(f"   Старый домен: '{old_domain or 'пустой'}'")
        print(f"   Новый домен: '{domain}'")
        print(f"   URL: http://localhost:5173/domain/{domain}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при обновлении домена: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Обновляем домен для салона с ID 1
    update_salon_domain(1, "sitename") 