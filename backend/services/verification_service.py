import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from database import get_db
from models import User, EmailVerification, PasswordReset
from services.email_service import get_email_service


class VerificationService:
    """Сервис для работы с верификацией email и сбросом пароля"""
    
    @staticmethod
    def generate_token() -> str:
        """Генерирует уникальный токен"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def create_email_verification(user: User, db: Session) -> EmailVerification:
        """Создает запись для верификации email"""
        # Удаляем старые записи верификации для этого пользователя
        db.query(EmailVerification).filter(
            EmailVerification.user_id == user.id
        ).delete()
        
        # Создаем новую запись
        verification = EmailVerification(
            user_id=user.id,
            token=VerificationService.generate_token(),
            expires_at=datetime.utcnow() + timedelta(hours=24),  # 24 часа
            is_used=False
        )
        
        db.add(verification)
        db.commit()
        db.refresh(verification)
        
        return verification
    
    @staticmethod
    def create_password_reset(user: User, db: Session) -> PasswordReset:
        """Создает запись для сброса пароля"""
        # Удаляем старые записи сброса пароля для этого пользователя
        db.query(PasswordReset).filter(
            PasswordReset.user_id == user.id
        ).delete()
        
        # Создаем новую запись
        reset = PasswordReset(
            user_id=user.id,
            token=VerificationService.generate_token(),
            expires_at=datetime.utcnow() + timedelta(hours=1),  # 1 час
            is_used=False
        )
        
        db.add(reset)
        db.commit()
        db.refresh(reset)
        
        return reset
    
    @staticmethod
    def verify_email_token(token: str, db: Session) -> Optional[User]:
        """Проверяет токен верификации email"""
        verification = db.query(EmailVerification).filter(
            EmailVerification.token == token,
            EmailVerification.is_used == False,
            EmailVerification.expires_at > datetime.utcnow()
        ).first()
        
        if not verification:
            return None
        
        # Получаем пользователя
        user = db.query(User).filter(User.id == verification.user_id).first()
        if not user:
            return None
        
        # Помечаем токен как использованный
        verification.is_used = True
        db.commit()
        
        return user
    
    @staticmethod
    def verify_password_reset_token(token: str, db: Session) -> Optional[User]:
        """Проверяет токен сброса пароля"""
        reset = db.query(PasswordReset).filter(
            PasswordReset.token == token,
            PasswordReset.is_used == False,
            PasswordReset.expires_at > datetime.utcnow()
        ).first()
        
        if not reset:
            return None
        
        # Получаем пользователя
        user = db.query(User).filter(User.id == reset.user_id).first()
        if not user:
            return None
        
        # Помечаем токен как использованный
        reset.is_used = True
        db.commit()
        
        return user
    
    @staticmethod
    async def send_verification_email(user: User) -> bool:
        """Отправляет письмо для верификации email"""
        db = next(get_db())
        
        try:
            # Создаем запись верификации
            verification = VerificationService.create_email_verification(user, db)
            
            # Отправляем письмо
            email_service = get_email_service()
            success = await email_service.send_verification_email(user, verification.token)
            
            return success
        except Exception as e:
            print(f"Ошибка отправки письма верификации: {e}")
            return False
        finally:
            db.close()
    
    @staticmethod
    async def send_password_reset_email(user: User) -> bool:
        """Отправляет письмо для сброса пароля"""
        db = next(get_db())
        
        try:
            # Создаем запись сброса пароля
            reset = VerificationService.create_password_reset(user, db)
            
            # Отправляем письмо
            email_service = get_email_service()
            success = await email_service.send_password_reset_email(user, reset.token)
            
            return success
        except Exception as e:
            print(f"Ошибка отправки письма сброса пароля: {e}")
            return False
        finally:
            db.close()
    
    @staticmethod
    def cleanup_expired_tokens(db: Session):
        """Очищает истекшие токены"""
        now = datetime.utcnow()
        
        # Удаляем истекшие токены верификации email
        db.query(EmailVerification).filter(
            EmailVerification.expires_at < now
        ).delete()
        
        # Удаляем истекшие токены сброса пароля
        db.query(PasswordReset).filter(
            PasswordReset.expires_at < now
        ).delete()
        
        db.commit() 