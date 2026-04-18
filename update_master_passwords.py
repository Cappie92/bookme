#!/usr/bin/env python3
"""
Скрипт для обновления паролей тестовых мастеров на единый пароль test1234.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from database import SessionLocal
from models import User
from auth import get_password_hash

def main():
    print("\n" + "="*70)
    print("  ОБНОВЛЕНИЕ ПАРОЛЕЙ ТЕСТОВЫХ МАСТЕРОВ")
    print("="*70 + "\n")
    
    db = SessionLocal()
    
    # Номера телефонов мастеров (кроме +79435774916)
    test_phones = ["+79435774911", "+79435774912", "+79435774913"]
    new_password = "test1234"
    hashed_password = get_password_hash(new_password)
    
    updated_count = 0
    
    try:
        for phone in test_phones:
            user = db.query(User).filter(User.phone == phone).first()
            if user:
                user.hashed_password = hashed_password
                db.commit()
                print(f"✓ Обновлен пароль для {phone} ({user.full_name})")
                updated_count += 1
            else:
                print(f"✗ Пользователь с номером {phone} не найден")
        
        print(f"\n✓ Всего обновлено паролей: {updated_count}")
        print(f"✓ Новый пароль для всех тестовых мастеров: {new_password}")
        print(f"  (кроме +79435774916 - его пароль не изменен)")
        
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
    
    print("\n" + "="*70)
    print("  ГОТОВО!")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()

