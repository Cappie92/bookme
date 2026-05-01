from abc import ABC, abstractmethod
import re
from typing import Optional
from urllib.parse import urljoin

from models import User


class EmailService(ABC):
    """Абстрактный класс для email сервиса"""
    
    def __init__(self):
        from settings import get_settings
        self.base_url = get_settings().FRONTEND_URL
    
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

    async def send_ics_to_email(
        self,
        to_email: str,
        subject: str,
        ics_content: str,
        filename: str = "booking.ics",
        extra_body_html: Optional[str] = None,
    ) -> bool:
        """Отправить ICS-файл на email. По умолчанию заглушка. extra_body_html — блок перед телом (например ссылка на карты)."""
        ics_block = f"<pre>{ics_content[:500]}...</pre>" if len(ics_content) > 500 else f"<pre>{ics_content}</pre>"
        prefix = extra_body_html or ""
        return await self.send_email(to_email, subject, prefix + ics_block)


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

    async def send_ics_to_email(
        self,
        to_email: str,
        subject: str,
        ics_content: str,
        filename: str = "booking.ics",
        extra_body_html: Optional[str] = None,
    ) -> bool:
        """Мок: логируем и возвращаем OK."""
        print(f"\n{'='*60}")
        print(f"📅 МОК SEND ICS TO EMAIL")
        print(f"Кому: {to_email}")
        print(f"Тема: {subject}")
        print(f"Файл: {filename}")
        if extra_body_html:
            print(f"Доп. HTML: {extra_body_html[:200]}...")
        print(f"ICS (первые 300 символов): {ics_content[:300]}...")
        print(f"{'='*60}\n")
        return True


class ConfiguredEmailService(EmailService):
    """
    Реальная отправка через transactional provider (Unisender / stub по ENV).
    Верификация и сброс пароля используют тот же канал.
    """

    async def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        from services.email.factory import get_transactional_provider

        plain = re.sub(r"<[^>]+>", " ", html_content or "")
        plain = " ".join(plain.split())
        if len(plain) > 9000:
            plain = plain[:9000] + "…"
        r = await get_transactional_provider().send_message(
            to_email=to_email,
            subject=subject,
            html_body=html_content or "",
            text_body=plain,
            attachments=None,
        )
        return r.ok

    async def send_verification_email(self, user: User, verification_token: str) -> bool:
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


# Глобальный экземпляр: провайдер выбирается по EMAIL_ENABLED / UNISENDER_* (см. services.email.factory).
email_service = ConfiguredEmailService()


def get_email_service() -> EmailService:
    """Получить экземпляр email сервиса"""
    return email_service


def set_email_service(service: EmailService):
    """Установить email сервис (для тестирования)"""
    global email_service
    email_service = service 