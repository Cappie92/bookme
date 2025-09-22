import os
from database import SessionLocal
from models import User
from auth import get_password_hash

def reset_user_password(phone: str, new_password: str):
    """Сбрасывает пароль пользователя"""
    
    db = SessionLocal()
    user = db.query(User).filter(User.phone == phone).first()
    
    if not user:
        print(f"Пользователь с телефоном {phone} не найден!")
        return False
    
    # Хешируем новый пароль
    hashed_password = get_password_hash(new_password)
    
    # Обновляем пароль
    user.hashed_password = hashed_password
    db.commit()
    
    print(f"Пароль для пользователя {user.email} (телефон: {user.phone}) успешно изменен!")
    print(f"Новый пароль: {new_password}")
    
    return True

if __name__ == "__main__":
    # Сбрасываем пароль для пользователя с телефоном +73333333333
    reset_user_password("+73333333333", "test123") 