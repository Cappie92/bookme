#!/usr/bin/env python3
"""
Скрипт для поиска мастера по номеру телефона
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon

def find_master_by_phone():
    db = SessionLocal()
    try:
        phone = "+79435774916"
        print(f"🔍 Поиск мастера с номером телефона: {phone}")
        
        # Ищем пользователя с этим номером телефона
        user = db.query(User).filter(User.phone == phone).first()
        if not user:
            print(f"❌ Пользователь с номером {phone} не найден")
            return
        
        print(f"✅ Найден пользователь:")
        print(f"   - Email: {user.email}")
        print(f"   - Имя: {user.full_name}")
        print(f"   - Роль: {user.role}")
        print(f"   - ID: {user.id}")
        
        # Проверяем, есть ли профиль мастера
        master = db.query(Master).filter(Master.user_id == user.id).first()
        if not master:
            print(f"❌ Профиль мастера не найден для пользователя {user.email}")
            return
        
        print(f"✅ Профиль мастера найден:")
        print(f"   - ID мастера: {master.id}")
        print(f"   - Может работать самостоятельно: {master.can_work_independently}")
        print(f"   - Может работать в салоне: {master.can_work_in_salon}")
        
        return user, master
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return None, None
    finally:
        db.close()

if __name__ == "__main__":
    find_master_by_phone()
