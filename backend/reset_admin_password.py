import asyncio
from database import engine
from models import User
from sqlalchemy.orm import sessionmaker
from auth import get_password_hash

async def reset_admin_password():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Находим администратора по телефону
        admin = db.query(User).filter(User.phone == "+79031078685").first()
        
        if admin:
            # Устанавливаем новый пароль
            new_password = "1JaK999ddd9"
            admin.hashed_password = get_password_hash(new_password)
            
            db.commit()
            print(f"Пароль для администратора {admin.phone} успешно сброшен на: {new_password}")
        else:
            print("Администратор с телефоном +79031078685 не найден")
            
    except Exception as e:
        print(f"Ошибка при сбросе пароля: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(reset_admin_password()) 