from auth import get_password_hash
from database import SessionLocal
from models import User, UserRole

def create_admin():
    db = SessionLocal()
    try:
        # Проверяем, есть ли уже admin
        existing_admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if existing_admin:
            print(f"Администратор уже существует: {existing_admin.email}")
            return existing_admin
        
        # Создаем нового администратора
        admin = User(
            email="admin@example.com",
            phone="+79001234567",
            full_name="Администратор",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        
        print(f"Администратор создан:")
        print(f"Email: {admin.email}")
        print(f"Phone: {admin.phone}")
        print(f"Password: admin123")
        print(f"Role: {admin.role}")
        
        return admin
        
    except Exception as e:
        print(f"Ошибка при создании администратора: {e}")
        db.rollback()
        return None
    finally:
        db.close()

if __name__ == "__main__":
    create_admin() 