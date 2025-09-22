import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urljoin

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, EmailVerification, PasswordReset
from auth import create_access_token, get_password_hash, verify_password


class EmailService(ABC):
    """Абстрактный класс для email сервиса"""
    
    def __init__(self):
        self.base_url = os.getenv("FRONTEND_URL", "http://localhost:5175")
    
    @abstractmethod
    async def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Отправить email"""
        pass
    
    @abstractmethod
    async def send_verification_email(self, user: User, verification_token: str) -> bool:
        """Отправить письмо для подтверждения email"""
        pass
    
    @abstractmethod
    async def send_password_reset_email(self, user: User, reset_token: str) -> bool:
        """Отправить письмо для сброса пароля"""
        pass


class MockEmailService(EmailService):
    """Мок сервис для тестирования без реальной отправки писем"""
    
    async def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Мок отправки email - просто логируем"""
        print(f"\n{'='*60}")
        print(f"📧 МОК EMAIL")
        print(f"Кому: {to_email}")
        print(f"Тема: {subject}")
        print(f"Содержимое: {html_content}")
        print(f"{'='*60}\n")
        return True
    
    async def send_verification_email(self, user: User, verification_token: str) -> bool:
        """Отправить письмо для подтверждения email"""
        verification_url = urljoin(self.base_url, f"/verify-email?token={verification_token}")
        
        subject = "Подтвердите ваш email"
        html_content = f"""
        <html>
        <body>
            <h2>Добро пожаловать в DeDato!</h2>
            <p>Здравствуйте, {user.full_name or user.email}!</p>
            <p>Для завершения регистрации подтвердите ваш email, перейдя по ссылке:</p>
            <p><a href="{verification_url}">Подтвердить email</a></p>
            <p>Если ссылка не работает, скопируйте её в браузер:</p>
            <p>{verification_url}</p>
            <p>Ссылка действительна в течение 24 часов.</p>
            <br>
            <p>С уважением,<br>Команда DeDato</p>
        </body>
        </html>
        """
        
        return await self.send_email(user.email, subject, html_content)
    
    async def send_password_reset_email(self, user: User, reset_token: str) -> bool:
        """Отправить письмо для сброса пароля"""
        reset_url = urljoin(self.base_url, f"/reset-password?token={reset_token}")
        
        subject = "Сброс пароля"
        html_content = f"""
        <html>
        <body>
            <h2>Сброс пароля</h2>
            <p>Здравствуйте, {user.full_name or user.email}!</p>
            <p>Вы запросили сброс пароля. Для создания нового пароля перейдите по ссылке:</p>
            <p><a href="{reset_url}">Создать новый пароль</a></p>
            <p>Если ссылка не работает, скопируйте её в браузер:</p>
            <p>{reset_url}</p>
            <p>Ссылка действительна в течение 1 часа.</p>
            <p>Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
            <br>
            <p>С уважением,<br>Команда DeDato</p>
        </body>
        </html>
        """
        
        return await self.send_email(user.email, subject, html_content)


# Глобальный экземпляр email сервиса
email_service = MockEmailService()


def get_email_service() -> EmailService:
    """Получить экземпляр email сервиса"""
    return email_service


def set_email_service(service: EmailService):
    """Установить email сервис (для тестирования)"""
    global email_service
    email_service = service 