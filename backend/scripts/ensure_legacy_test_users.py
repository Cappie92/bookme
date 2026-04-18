#!/usr/bin/env python3
"""
Создать или обновить тестовых клиентов в локальной БД (без API).
Телефоны: +79990000100, +79990000101, +79990000102. Пароль: test123.
Профиль — каноника TEST_DATA_ACCOUNTS / reseed legacy (как в client_register_body для этих телефонов).

Запуск: ENVIRONMENT=development python3 backend/scripts/ensure_legacy_test_users.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LEGACY_PHONES = ["+79990000100", "+79990000101", "+79990000102"]
PASSWORD = "test123"

_LEGACY = [
    {"email": "client0@79990000100.example.com", "full_name": "Клиент +79990000100"},
    {"email": "client1@79990000101.example.com", "full_name": "Клиент +79990000101"},
    {"email": "client2@79990000102.example.com", "full_name": "Клиент +79990000102"},
]


def main() -> int:
    if os.getenv("ENVIRONMENT", "").strip().lower() != "development":
        print("ERROR: Run only with ENVIRONMENT=development")
        return 1

    from auth import get_password_hash
    from database import SessionLocal
    from models import User, UserRole

    db = SessionLocal()
    try:
        for idx, phone in enumerate(LEGACY_PHONES):
            prof = _LEGACY[idx]
            user = db.query(User).filter(User.phone == phone).first()
            if user:
                user.hashed_password = get_password_hash(PASSWORD)
                user.is_active = True
                user.is_verified = True
                user.is_phone_verified = True
                user.email = prof["email"]
                user.full_name = prof["full_name"]
                user.birth_date = None
                db.commit()
                print(f"OK: {phone} (client) password + profile updated ({prof['full_name']})")
            else:
                user = User(
                    email=prof["email"],
                    phone=phone,
                    full_name=prof["full_name"],
                    birth_date=None,
                    hashed_password=get_password_hash(PASSWORD),
                    role=UserRole.CLIENT,
                    is_active=True,
                    is_verified=True,
                    is_phone_verified=True,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"OK: {phone} (client) created, password={PASSWORD}, name={prof['full_name']}")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
