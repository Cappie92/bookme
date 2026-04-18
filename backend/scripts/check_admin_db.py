#!/usr/bin/env python3
"""Диагностика админа +79031078685 в БД."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models import User, UserRole

ADMIN_PHONE = "+79031078685"

def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == ADMIN_PHONE).first()
        if not user:
            print(f"USER: NOT FOUND (phone={ADMIN_PHONE})")
            return
        print(f"USER: EXISTS id={user.id}")
        print(f"  role: {user.role} (is ADMIN: {user.role == UserRole.ADMIN})")
        print(f"  is_active: {user.is_active}")
        print(f"  hashed_password: {'SET' if user.hashed_password else 'NULL/EMPTY'}")
        print(f"  email: {user.email!r}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
