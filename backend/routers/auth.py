from datetime import datetime, timedelta
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    get_current_active_user,
    get_password_hash,
    verify_password,
)
from database import get_db
from models import User, Master, Booking
from schemas import LoginRequest, Token, ChangePasswordRequest, SetPasswordRequest
from schemas import User as UserSchema
from schemas import UserCreate, VerifyRequest
from services.verification_service import VerificationService
from services.zvonok_service import zvonok_service
from schemas import (
    EmailVerificationRequest, EmailVerificationResponse,
    PasswordResetRequest, PasswordResetResponse,
    VerifyEmailRequest, VerifyEmailResponse,
    ResetPasswordRequest, ResetPasswordResponse,
    ResendVerificationRequest, ResendVerificationResponse,
    PhoneVerificationRequest, PhoneVerificationResponse,
    VerifyPhoneRequest, VerifyPhoneResponse
)


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    responses={401: {"description": "Unauthorized"}},
)


@router.post(
    "/register", response_model=Token, summary="Регистрация нового пользователя"
)
async def register(user_in: UserCreate, db: Session = Depends(get_db)) -> Any:
    """
    Регистрация нового пользователя.

    - **email**: Email пользователя
    - **phone**: Номер телефона
    - **password**: Пароль
    - **role**: Роль пользователя (client, master, salon, admin)
    """
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Проверяем, не занят ли телефон
    phone_user = db.query(User).filter(User.phone == user_in.phone).first()
    if phone_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    # Создаем пользователя с неподтвержденным email и телефоном
    user = User(
        email=user_in.email,
        phone=user_in.phone,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,  # Пользователь активен
        is_verified=False,  # Email не подтвержден
        is_phone_verified=False,  # Телефон не подтвержден
        full_name=user_in.full_name,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Если пользователь регистрируется как мастер, создаем профиль мастера
    if user_in.role == "master":
        master = Master(
            user_id=user.id,
            bio="",
            experience_years=0,
            can_work_independently=False,
            can_work_in_salon=True,
            website=None,
            created_at=datetime.utcnow()
        )
        db.add(master)
        db.commit()

    # Отправляем письмо верификации email
    try:
        await VerificationService.send_verification_email(user)
    except Exception as e:
        print(f"Ошибка отправки письма верификации: {e}")
        # Не прерываем регистрацию, если письмо не отправилось

    # Отправляем звонок для верификации телефона
    try:
        call_result = zvonok_service.send_verification_call(user_in.phone)
        if not call_result["success"]:
            print(f"Ошибка отправки звонка верификации: {call_result['message']}")
    except Exception as e:
        print(f"Ошибка отправки звонка верификации: {e}")

    # Генерируем токены для входа
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "is_verified": user.is_verified,
            "is_phone_verified": user.is_phone_verified,
        }
    }


@router.post("/verify", response_model=Token, summary="Подтверждение регистрации")
def verify(verify_data: VerifyRequest, db: Session = Depends(get_db)) -> Any:
    """
    Подтверждение регистрации по SMS-коду.

    - **email**: Email пользователя
    - **code**: Код подтверждения из SMS
    """
    if not verify_sms_code(verify_data.email, verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user = db.query(User).filter(User.email == verify_data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Активируем пользователя
    user.is_active = True
    user.is_verified = True
    db.commit()

    # Генерируем токены
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/login", response_model=Token, summary="Вход в систему")
def login(login_data: LoginRequest, db: Session = Depends(get_db)) -> Any:
    """
    Аутентификация пользователя.

    - **phone**: Телефон пользователя
    - **password**: Пароль
    """
    user = db.query(User).filter(User.phone == login_data.phone).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный номер телефона или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token, summary="Обновление токена")
def refresh_token(refresh_data: dict, db: Session = Depends(get_db)) -> Any:
    """
    Обновление access token с помощью refresh token.

    - **refresh_token**: Refresh token для обновления
    """
    try:
        payload = jwt.decode(
            refresh_data["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM]
        )
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_refresh_token = create_refresh_token(
        data={"sub": user.email, "role": user.role.value.upper()}
    )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.get("/users/me", response_model=UserSchema, summary="Текущий пользователь")
def get_me(
    current_user=Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """
    Получить данные текущего пользователя.
    """
    return current_user


@router.post("/change-password", summary="Изменение пароля")
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Изменение пароля пользователя.
    
    - **old_password**: Текущий пароль
    - **new_password**: Новый пароль (минимум 6 символов)
    """
    # Проверяем текущий пароль
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль"
        )
    
    # Хешируем новый пароль
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(current_user)
    
    return {"message": "Пароль успешно изменен"}


@router.post("/set-password", summary="Установка пароля для нового клиента")
def set_password(
    password_data: SetPasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Установка пароля для нового клиента (после создания бронирования).
    
    - **password**: Новый пароль
    """
    if current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль уже установлен"
        )
    
    if len(password_data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать минимум 6 символов"
        )
    
    current_user.hashed_password = get_password_hash(password_data.password)
    current_user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Пароль успешно установлен"}


@router.post("/verify-password", summary="Проверка пароля существующего пользователя")
def verify_user_password(
    password_data: SetPasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Проверка пароля существующего пользователя (после создания бронирования).
    
    - **password**: Пароль для проверки
    """
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль не установлен"
        )
    
    if not verify_password(password_data.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль"
        )
    
    return {"message": "Пароль подтвержден"}


@router.delete("/delete-account", summary="Удаление аккаунта пользователя")
async def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Удаление аккаунта пользователя и всех связанных данных.
    Используется для отмены регистрации нового клиента.
    """
    try:
        # Отправляем звонок для подтверждения удаления
        verification_code = VerificationService.generate_verification_code()
        current_user.phone_verification_code = verification_code
        current_user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
        
        call_result = zvonok_service.send_verification_call(current_user.phone, verification_code)
        if call_result["success"]:
            return {
                "message": "Звонок с кодом подтверждения удаления отправлен",
                "success": True,
                "call_id": call_result.get("call_id")
            }
        else:
            return {
                "message": f"Ошибка отправки звонка: {call_result['message']}",
                "success": False
            }
        
    except Exception as e:
        print(f"Ошибка при отправке звонка подтверждения: {e}")
        return {
            "message": "Внутренняя ошибка сервера",
            "success": False
        }


@router.post("/confirm-delete-account", summary="Подтверждение удаления аккаунта")
async def confirm_delete_account(
    code: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Подтверждение удаления аккаунта по коду из звонка.
    """
    try:
        # Проверяем код верификации
        if (current_user.phone_verification_code == code and 
            current_user.phone_verification_expires and 
            current_user.phone_verification_expires > datetime.utcnow()):
            
            # Удаляем все бронирования пользователя
            bookings = db.query(Booking).filter(Booking.client_id == current_user.id).all()
            for booking in bookings:
                db.delete(booking)
            
            # Удаляем профиль мастера, если есть
            if current_user.master_profile:
                db.delete(current_user.master_profile)
            
            # Удаляем профиль салона, если есть
            if current_user.salon_profile:
                db.delete(current_user.salon_profile)
            
            # Удаляем профиль независимого мастера, если есть
            if current_user.indie_profile:
                db.delete(current_user.indie_profile)
            
            # Очищаем код верификации
            current_user.phone_verification_code = None
            current_user.phone_verification_expires = None
            
            # Удаляем самого пользователя
            db.delete(current_user)
            db.commit()
            
            return {"message": "Аккаунт успешно удален"}
        else:
            return {
                "message": "Неверный код или код истек",
                "success": False
            }
            
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении аккаунта: {str(e)}"
        )


@router.post("/request-email-verification", response_model=EmailVerificationResponse)
async def request_email_verification(request: EmailVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на отправку письма для верификации email"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return EmailVerificationResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Проверяем, не верифицирован ли уже email
        if user.is_verified:
            return EmailVerificationResponse(
                message="Email уже верифицирован",
                success=False
            )
        
        # Отправляем письмо верификации
        success = await VerificationService.send_verification_email(user)
        
        if success:
            return EmailVerificationResponse(
                message="Письмо для верификации email отправлено",
                success=True
            )
        else:
            return EmailVerificationResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса верификации email: {e}")
        return EmailVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Подтверждение email по токену"""
    try:
        # Проверяем токен
        user = VerificationService.verify_email_token(request.token, db)
        
        if not user:
            return VerifyEmailResponse(
                message="Недействительный или истекший токен",
                success=False
            )
        
        # Помечаем email как верифицированный
        user.is_verified = True
        db.commit()
        
        return VerifyEmailResponse(
            message="Email успешно подтвержден",
            success=True,
            user_id=user.id
        )
        
    except Exception as e:
        print(f"Ошибка верификации email: {e}")
        return VerifyEmailResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/request-password-reset", response_model=PasswordResetResponse)
async def request_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Запрос на сброс пароля"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return PasswordResetResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Отправляем письмо сброса пароля
        success = await VerificationService.send_password_reset_email(user)
        
        if success:
            return PasswordResetResponse(
                message="Письмо для сброса пароля отправлено",
                success=True
            )
        else:
            return PasswordResetResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса сброса пароля: {e}")
        return PasswordResetResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Сброс пароля по токену"""
    try:
        # Проверяем токен
        user = VerificationService.verify_password_reset_token(request.token, db)
        
        if not user:
            return ResetPasswordResponse(
                message="Недействительный или истекший токен",
                success=False
            )
        
        # Хешируем новый пароль
        hashed_password = get_password_hash(request.new_password)
        user.hashed_password = hashed_password
        db.commit()
        
        return ResetPasswordResponse(
            message="Пароль успешно изменен",
            success=True,
            user_id=user.id
        )
        
    except Exception as e:
        print(f"Ошибка сброса пароля: {e}")
        return ResetPasswordResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(request: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Повторная отправка письма верификации"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return ResendVerificationResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Проверяем, не верифицирован ли уже email
        if user.is_verified:
            return ResendVerificationResponse(
                message="Email уже верифицирован",
                success=False
            )
        
        # Отправляем письмо верификации
        success = await VerificationService.send_verification_email(user)
        
        if success:
            return ResendVerificationResponse(
                message="Письмо для верификации email отправлено повторно",
                success=True
            )
        else:
            return ResendVerificationResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка повторной отправки верификации: {e}")
        return ResendVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/request-phone-verification", response_model=PhoneVerificationResponse)
async def request_phone_verification(request: PhoneVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на верификацию телефона через звонок"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return PhoneVerificationResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )
        
        # Инициируем звонок через Zvonok (без генерации кода)
        print(f"🔔 Инициируем верификацию телефона для пользователя {user.id}: {request.phone}")
        call_result = zvonok_service.send_verification_call(request.phone)
        print(f"📞 Результат отправки звонка: {call_result}")
        
        if call_result["success"]:
            print(f"✅ Звонок успешно отправлен: call_id={call_result.get('call_id')}")
            return PhoneVerificationResponse(
                message="Звонок для верификации инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
                success=True,
                call_id=call_result.get("call_id")
            )
        else:
            print(f"❌ Ошибка отправки звонка: {call_result['message']}")
            return PhoneVerificationResponse(
                message=f"Ошибка инициации звонка: {call_result['message']}",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса верификации телефона: {e}")
        return PhoneVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/verify-phone", response_model=VerifyPhoneResponse)
async def verify_phone(request: VerifyPhoneRequest, db: Session = Depends(get_db)):
    """Верификация телефона по коду"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return VerifyPhoneResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )
        
        # Проверяем введенные цифры через Zvonok
        print(f"🔍 Проверяем цифры для пользователя {user.id}: call_id={request.call_id}, digits={request.phone_digits}")
        verification_result = zvonok_service.verify_phone_digits(request.call_id, request.phone_digits)
        print(f"📋 Результат проверки цифр: {verification_result}")
        
        if verification_result["success"] and verification_result["verified"]:
            # Отмечаем телефон как верифицированный
            print(f"✅ Телефон {request.phone} успешно верифицирован для пользователя {user.id}")
            user.is_phone_verified = True
            user.phone_verification_code = None
            user.phone_verification_expires = None
            db.commit()
            
            return VerifyPhoneResponse(
                message="Телефон успешно верифицирован",
                success=True,
                user_id=user.id
            )
        else:
            print(f"❌ Ошибка верификации: {verification_result.get('message', 'Неверные цифры номера телефона')}")
            return VerifyPhoneResponse(
                message=verification_result.get("message", "Неверные цифры номера телефона"),
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка верификации телефона: {e}")
        return VerifyPhoneResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(request: dict, db: Session = Depends(get_db)):
    """Универсальный endpoint для восстановления пароля (email или телефон)"""
    try:
        phone = request.get("phone")
        email = request.get("email")
        
        if not phone and not email:
            return PasswordResetResponse(
                message="Необходимо указать телефон или email",
                success=False
            )
        
        # Ищем пользователя
        user = None
        if phone:
            user = db.query(User).filter(User.phone == phone).first()
        elif email:
            user = db.query(User).filter(User.email == email).first()
        
        if not user:
            return PasswordResetResponse(
                message="Пользователь не найден",
                success=False
            )
        
        # Если указан телефон, используем звонок
        if phone:
            # Генерируем код для сброса пароля
            reset_code = VerificationService.generate_verification_code()
            user.password_reset_code = reset_code
            user.password_reset_expires = datetime.utcnow() + timedelta(minutes=10)
            db.commit()
            
            # Инициируем звонок
            call_result = zvonok_service.send_verification_call(phone, reset_code)
            
            if call_result["success"]:
                return PasswordResetResponse(
                    message="Звонок с кодом для сброса пароля инициирован",
                    success=True,
                    call_id=call_result.get("call_id")
                )
            else:
                return PasswordResetResponse(
                    message=f"Ошибка инициации звонка: {call_result['message']}",
                    success=False
                )
        
        # Если указан email, используем email
        elif email:
            success = await VerificationService.send_password_reset_email(user)
            
            if success:
                return PasswordResetResponse(
                    message="Письмо для сброса пароля отправлено",
                    success=True
                )
            else:
                return PasswordResetResponse(
                    message="Ошибка отправки письма",
                    success=False
                )
            
    except Exception as e:
        print(f"Ошибка восстановления пароля: {e}")
        return PasswordResetResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.get("/zvonok/balance")
async def get_zvonok_balance():
    """Получение информации об аккаунте Zvonok"""
    try:
        # Пока возвращаем базовую информацию
        return {
            "success": True,
            "service": "Zvonok",
            "api_key": "f90ffd1506b18fc927188bbf66fa92ed",
            "message": "Сервис Zvonok активен"
        }
    except Exception as e:
        print(f"Ошибка получения информации об аккаунте Zvonok: {e}")
        return {
            "success": False,
            "message": "Внутренняя ошибка сервера"
        }


@router.post("/request-reverse-phone-verification", response_model=PhoneVerificationResponse)
async def request_reverse_phone_verification(request: PhoneVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на верификацию телефона через обратный FlashCall (для мобильных устройств)"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return PhoneVerificationResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )
        
        # Генерируем код верификации
        verification_code = VerificationService.generate_verification_code()
        
        # Сохраняем код в базе данных
        user.phone_verification_code = verification_code
        user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
        
        # Инициируем обычный звонок через Zvonok (reverse flashcall не поддерживается)
        call_result = zvonok_service.send_verification_call(request.phone, verification_code)
        
        if call_result["success"]:
            return PhoneVerificationResponse(
                message="Звонок для верификации инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
                success=True,
                call_id=call_result.get("call_id")
            )
        else:
            return PhoneVerificationResponse(
                message=f"Ошибка инициации обратного FlashCall: {call_result['message']}",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса обратной верификации телефона: {e}")
        return PhoneVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/check-reverse-phone-verification", response_model=VerifyPhoneResponse)
async def check_reverse_phone_verification(request: dict, db: Session = Depends(get_db)):
    """Проверка статуса обратного FlashCall верификации"""
    try:
        call_id = request.get("call_id")
        phone = request.get("phone")
        
        if not call_id or not phone:
            return VerifyPhoneResponse(
                message="Необходимо указать call_id и phone",
                success=False
            )
        
        # Проверяем статус звонка через Zvonok
        status_result = zvonok_service.check_call_status(call_id)
        
        if status_result["success"] and status_result.get("verified"):
            # Ищем пользователя по телефону
            user = db.query(User).filter(User.phone == phone).first()
            if not user:
                return VerifyPhoneResponse(
                    message="Пользователь с таким номером телефона не найден",
                    success=False
                )
            
            # Отмечаем телефон как верифицированный
            user.is_phone_verified = True
            user.phone_verification_code = None
            user.phone_verification_expires = None
            db.commit()
            
            return VerifyPhoneResponse(
                message="Телефон успешно верифицирован через обратный FlashCall",
                success=True,
                user_id=user.id
            )
        else:
            return VerifyPhoneResponse(
                message="Верификация еще не завершена или произошла ошибка",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка проверки обратной верификации телефона: {e}")
        return VerifyPhoneResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.get("/users/search", response_model=List[UserSchema])
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Поиск пользователей по номеру телефона"""
    if not q or len(q) < 7:
        raise HTTPException(status_code=400, detail="Query must be at least 7 characters long")
    
    # Ищем пользователей только по номеру телефона
    users = db.query(User).filter(
        User.is_active == True,
        User.id != current_user.id,  # Исключаем текущего пользователя
        User.phone.ilike(f"%{q}%")
    ).limit(10).all()
    
    return users
