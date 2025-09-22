import os
from datetime import datetime, timedelta
from jose import jwt
from database import SessionLocal
from models import User, UserRole

# Загружаем переменные окружения
from dotenv import load_dotenv
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"

def create_test_token():
    """Создает тестовый токен для администратора"""
    
    # Получаем первого пользователя с ролью админа
    db = SessionLocal()
    admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
    
    if not admin_user:
        print("Администратор не найден в базе данных!")
        return None
    
    print(f"Найден администратор: {admin_user.email}")
    
    # Создаем токен
    to_encode = {
        "sub": admin_user.email,
        "role": admin_user.role.value,
        "exp": datetime.utcnow() + timedelta(hours=24)  # Токен на 24 часа
    }
    
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    print(f"Тестовый токен создан:")
    print(f"Bearer {token}")
    
    return token

def create_token_for_phone(phone):
    """Создает токен для пользователя с конкретным телефоном"""
    
    db = SessionLocal()
    user = db.query(User).filter(User.phone == phone).first()
    
    if not user:
        print(f"Пользователь с телефоном {phone} не найден в базе данных!")
        return None
    
    print(f"Найден пользователь: {user.email} (телефон: {user.phone})")
    
    # Создаем токен
    to_encode = {
        "sub": user.email,
        "role": user.role.value,
        "exp": datetime.utcnow() + timedelta(hours=24)  # Токен на 24 часа
    }
    
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    print(f"Тестовый токен создан:")
    print(f"Bearer {token}")
    
    return token

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 2:
        role = sys.argv[1]
        phone = sys.argv[2]
        
        if role == "client":
            token = create_token_for_phone(phone)
            if token:
                print("\nИспользуйте этот токен для тестирования API:")
                print(f"Authorization: Bearer {token}")
        else:
            print("Поддерживаемые роли: client")
    else:
        print("Использование: python3 create_test_token.py client <номер_телефона>")
        print("Пример: python3 create_test_token.py client +79735906386") 