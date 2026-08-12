import secrets
import hmac
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from database import get_db
from models import User, EmailVerification, PasswordReset
from services.email_service import get_email_service


PHONE_CHALLENGE_TTL_MINUTES = 5
PHONE_CHALLENGE_MAX_ATTEMPTS = 5
UTC_EPOCH = datetime(1970, 1, 1)


def _utc_timestamp(value: datetime) -> int:
    return int((value - UTC_EPOCH).total_seconds())


class PhoneChallengeError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


class VerificationService:
    """Сервис для работы с верификацией email и сбросом пароля"""

    @staticmethod
    def generate_verification_code(length: int = 4) -> str:
        """Короткий цифровой код (для legacy-flow, напр. удаления аккаунта)."""
        import secrets
        return "".join(str(secrets.randbelow(10)) for _ in range(length))
    
    @staticmethod
    def generate_token() -> str:
        """Генерирует уникальный токен"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def create_email_verification(user: User, db: Session) -> EmailVerification:
        """Создает запись для верификации email (signup)."""
        # Удаляем старые записи верификации для этого пользователя
        db.query(EmailVerification).filter(
            EmailVerification.user_id == user.id
        ).delete()
        
        # Создаем новую запись
        verification = EmailVerification(
            user_id=user.id,
            token=VerificationService.generate_token(),
            purpose="signup",
            email_to_verify=user.email,
            expires_at=datetime.utcnow() + timedelta(hours=24),  # 24 часа
            is_used=False
        )
        
        db.add(verification)
        db.commit()
        db.refresh(verification)
        
        return verification
    
    @staticmethod
    def create_password_reset(
        user: User,
        db: Session,
        *,
        ttl_minutes: int = 60,
        commit: bool = True,
    ) -> PasswordReset:
        """Создает запись для сброса пароля"""
        # Удаляем старые записи сброса пароля для этого пользователя
        db.query(PasswordReset).filter(
            PasswordReset.user_id == user.id
        ).delete()
        
        # Создаем новую запись
        reset = PasswordReset(
            user_id=user.id,
            token=VerificationService.generate_token(),
            expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
            is_used=False
        )
        
        db.add(reset)
        if commit:
            db.commit()
            db.refresh(reset)
        else:
            db.flush()
        
        return reset

    @staticmethod
    def clear_phone_challenge(user: User) -> None:
        user.phone_verification_code = None
        user.phone_verification_call_id = None
        user.phone_verification_expires = None
        user.phone_verification_attempts = 0
        user.phone_verification_target_phone = None
        user.phone_verification_purpose = None

    @staticmethod
    def create_phone_challenge_state(
        *,
        purpose: str,
        target_phone: str,
        call_result: dict,
        ttl_minutes: int = PHONE_CHALLENGE_TTL_MINUTES,
    ) -> dict:
        """Create common serializable challenge state for every phone-proof flow."""
        pin = str(
            call_result.get("pincode")
            or call_result.get("verification_number")
            or ""
        ).strip()
        call_id = str(call_result.get("call_id") or "").strip()
        if not call_result.get("success") or not pin or not call_id:
            raise PhoneChallengeError(
                "provider_incomplete",
                "Сервис звонков вернул неполные данные верификации",
            )
        return {
            "phone_verification_code": pin,
            "phone_verification_call_id": call_id,
            "phone_verification_expires": _utc_timestamp(
                datetime.utcnow() + timedelta(minutes=ttl_minutes)
            ),
            "phone_verification_attempts": 0,
            "phone_verification_target_phone": target_phone,
            "phone_verification_purpose": purpose,
        }

    @staticmethod
    def consume_phone_challenge_state(
        state: dict,
        *,
        purpose: str,
        target_phone: str,
        call_id: str,
        phone_digits: str,
    ) -> None:
        """Validate and consume serializable state, mutating attempts/fields in place."""
        if state.get("phone_verification_purpose") != purpose:
            raise PhoneChallengeError("wrong_purpose", "Неверное назначение верификации")
        if state.get("phone_verification_target_phone") != target_phone:
            raise PhoneChallengeError("wrong_target", "Телефон верификации не совпадает")
        code = str(state.get("phone_verification_code") or "")
        expires = int(state.get("phone_verification_expires") or 0)
        if not code or not expires:
            raise PhoneChallengeError("missing", "Верификация не инициирована")
        if expires <= _utc_timestamp(datetime.utcnow()):
            raise PhoneChallengeError("expired", "Код истёк. Запросите звонок ещё раз.")
        if str(state.get("phone_verification_call_id") or "") != str(call_id):
            raise PhoneChallengeError("wrong_call", "Неверная сессия верификации")
        attempts = int(state.get("phone_verification_attempts") or 0)
        if attempts >= PHONE_CHALLENGE_MAX_ATTEMPTS:
            raise PhoneChallengeError("attempts_exhausted", "Превышено число попыток")
        if not hmac.compare_digest(code, str(phone_digits)):
            state["phone_verification_attempts"] = attempts + 1
            raise PhoneChallengeError("wrong_code", "Неверные цифры номера телефона")
        for key in (
            "phone_verification_code",
            "phone_verification_call_id",
            "phone_verification_expires",
            "phone_verification_target_phone",
            "phone_verification_purpose",
        ):
            state.pop(key, None)
        state["phone_verification_attempts"] = 0

    @staticmethod
    def start_phone_challenge(
        user: User,
        *,
        purpose: str,
        target_phone: str,
        call_result: dict,
        db: Session,
        ttl_minutes: int = PHONE_CHALLENGE_TTL_MINUTES,
    ) -> str:
        """Persist one current challenge. Replacing it invalidates any previous resend."""
        state = VerificationService.create_phone_challenge_state(
            purpose=purpose,
            target_phone=target_phone,
            call_result=call_result,
            ttl_minutes=ttl_minutes,
        )
        user.phone_verification_code = state["phone_verification_code"]
        user.phone_verification_call_id = state["phone_verification_call_id"]
        user.phone_verification_expires = datetime.utcfromtimestamp(
            state["phone_verification_expires"]
        )
        user.phone_verification_attempts = state["phone_verification_attempts"]
        user.phone_verification_target_phone = state["phone_verification_target_phone"]
        user.phone_verification_purpose = state["phone_verification_purpose"]
        db.commit()
        return state["phone_verification_call_id"]

    @staticmethod
    def consume_phone_challenge(
        user: User,
        *,
        purpose: str,
        target_phone: str,
        call_id: str,
        phone_digits: str,
        db: Session,
    ) -> None:
        """Validate and clear a challenge. Caller commits its success-side effect atomically."""
        state = {
            "phone_verification_code": user.phone_verification_code,
            "phone_verification_call_id": user.phone_verification_call_id,
            "phone_verification_expires": (
                _utc_timestamp(user.phone_verification_expires)
                if user.phone_verification_expires
                else None
            ),
            "phone_verification_attempts": user.phone_verification_attempts,
            "phone_verification_target_phone": user.phone_verification_target_phone,
            "phone_verification_purpose": user.phone_verification_purpose,
        }
        try:
            VerificationService.consume_phone_challenge_state(
                state,
                purpose=purpose,
                target_phone=target_phone,
                call_id=call_id,
                phone_digits=phone_digits,
            )
        except PhoneChallengeError:
            user.phone_verification_attempts = int(
                state.get("phone_verification_attempts") or 0
            )
            db.commit()
            raise
        VerificationService.clear_phone_challenge(user)

    @staticmethod
    def create_email_change_verification(user: User, new_email: str, db: Session) -> EmailVerification:
        """Создает запись для подтверждения смены email (email_change)."""
        db.query(EmailVerification).filter(
            EmailVerification.user_id == user.id,
            EmailVerification.purpose == "email_change",
        ).delete()
        verification = EmailVerification(
            user_id=user.id,
            token=VerificationService.generate_token(),
            purpose="email_change",
            email_to_verify=new_email,
            expires_at=datetime.utcnow() + timedelta(hours=24),
            is_used=False,
        )
        db.add(verification)
        db.commit()
        db.refresh(verification)
        return verification
    
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
    async def send_verification_email(user: User, db: Optional[Session] = None) -> bool:
        """Отправляет письмо для верификации email.

        Если передан db из текущего запроса — используем его (одна БД/транзакция с регистрацией).
        Иначе открываем отдельную сессию (legacy-поведение для эндпоинтов без общего db).
        """
        if not (getattr(user, "email", None) or "").strip():
            return True

        own_session = db is None
        if own_session:
            db = next(get_db())

        try:
            verification = VerificationService.create_email_verification(user, db)
            email_service = get_email_service()
            success = await email_service.send_verification_email(user, verification.token)
            return success
        except Exception as e:
            print(f"Ошибка отправки письма верификации: {e}")
            return False
        finally:
            if own_session and db is not None:
                db.close()
    
    @staticmethod
    async def send_password_reset_email(user: User, db: Optional[Session] = None) -> bool:
        """Отправляет письмо для сброса пароля"""
        own_session = db is None
        if own_session:
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
            if own_session and db is not None:
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
