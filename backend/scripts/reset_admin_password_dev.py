#!/usr/bin/env python3
"""
Dev-only: создать/восстановить админа +79031078685 с паролем test123.

Запуск: ENVIRONMENT=development python3 backend/scripts/reset_admin_password_dev.py

Работает ТОЛЬКО при ENVIRONMENT=development. Не трогает production.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ADMIN_PHONE = "+79031078685"
DEV_PASSWORD = "test123"


def main() -> int:
    if os.getenv("ENVIRONMENT", "").strip().lower() != "development":
        print("ERROR: Run only with ENVIRONMENT=development")
        return 1

    from auth import get_password_hash
    from database import SessionLocal
    from models import User, UserRole

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.phone == ADMIN_PHONE).first()
        if admin:
            admin.hashed_password = get_password_hash(DEV_PASSWORD)
            admin.role = UserRole.ADMIN
            admin.is_active = True
            db.commit()
            print(f"OK: Admin {ADMIN_PHONE} password reset to {DEV_PASSWORD}")
        else:
            admin = User(
                email="admin@dedato.ru",
                phone=ADMIN_PHONE,
                full_name="Администратор",
                hashed_password=get_password_hash(DEV_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print(f"OK: Admin {ADMIN_PHONE} created, password={DEV_PASSWORD}")
        return 0
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
