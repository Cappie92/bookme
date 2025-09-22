#!/usr/bin/env python3
"""
Скрипт для проверки пользователей в базе данных
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon

def check_users():
    db = SessionLocal()
    try:
        print("👥 Пользователи в системе:")
        
        # Все пользователи
        users = db.query(User).all()
        for user in users:
            print(f"   - {user.email} ({user.role}) - {user.full_name}")
        
        print("\n👨‍💼 Мастера:")
        masters = db.query(Master).all()
        for master in masters:
            user = db.query(User).filter(User.id == master.user_id).first()
            print(f"   - {user.email if user else 'Unknown'} (ID: {master.id})")
        
        print("\n🏢 Салоны:")
        salons = db.query(Salon).all()
        for salon in salons:
            user = db.query(User).filter(User.id == salon.user_id).first()
            print(f"   - {salon.name} ({user.email if user else 'Unknown'}) (ID: {salon.id})")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_users()
