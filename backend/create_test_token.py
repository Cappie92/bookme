from dotenv import load_dotenv

load_dotenv()

from auth import create_user_access_token
from database import SessionLocal
from models import User, UserRole

def create_test_token():
    """Создает тестовый токен для администратора"""
    
    # Получаем первого пользователя с ролью админа
    db = SessionLocal()
    admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
    
    if not admin_user:
        print("Администратор не найден в базе данных!")
        return None
    
    print(f"Найден администратор: {admin_user.email}")
    
    token = create_user_access_token(admin_user)
    
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
    
    token = create_user_access_token(user)
    
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
