"""
Ручной idempotent reseed demo master.

Usage:
  cd backend
  python3 scripts/reseed_demo_master.py
"""
from database import SessionLocal
from services.demo_master_seed import reseed_demo_master


def main() -> None:
    db = SessionLocal()
    try:
        result = reseed_demo_master(db)
        print("Demo master reseeded:", result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
