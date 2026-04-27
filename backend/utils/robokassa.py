"""
Утилиты для работы с платежной системой Robokassa
"""
import hashlib
import logging
import time
from typing import Any, Dict, Optional
from urllib.parse import urlencode

logger = logging.getLogger(__name__)


def generate_invoice_id(user_id: int) -> str:
    """
    Генерация уникального InvoiceID в формате INV-{timestamp}-{user_id}
    
    Args:
        user_id: ID пользователя
        
    Returns:
        Строка с InvoiceID
    """
    timestamp = int(time.time())
    return f"INV-{timestamp}-{user_id}"


def generate_signature(merchant_login: str, amount: float, invoice_id: str, password: str) -> str:
    """
    Генерация MD5 подписи для запроса к Robokassa
    
    Формат: MerchantLogin:OutSum:InvId:Password#1
    
    Args:
        merchant_login: Логин магазина
        amount: Сумма платежа
        invoice_id: Номер счета
        password: Пароль #1
        
    Returns:
        MD5 хэш подписи
    """
    # Robokassa требует сумму в формате с точкой (не запятой)
    amount_str = f"{amount:.2f}"
    signature_string = f"{merchant_login}:{amount_str}:{invoice_id}:{password}"
    return hashlib.md5(signature_string.encode('utf-8')).hexdigest()


def verify_signature(amount: float, invoice_id: str, signature: str, password: str) -> bool:
    """
    Проверка подписи от Robokassa
    
    Формат для ResultURL: OutSum:InvId:Password#2
    Формат для SuccessURL/FailURL: OutSum:InvId:Password#1
    
    Args:
        amount: Сумма платежа
        invoice_id: Номер счета
        signature: Подпись от Robokassa
        password: Пароль #2 (для ResultURL) или #1 (для SuccessURL/FailURL)
        
    Returns:
        True если подпись верна, False иначе
    """
    amount_str = f"{amount:.2f}"
    signature_string = f"{amount_str}:{invoice_id}:{password}"
    expected_signature = hashlib.md5(signature_string.encode('utf-8')).hexdigest()
    return signature.lower() == expected_signature.lower()


def get_robokassa_config() -> Dict[str, Any]:
    """
    Конфигурация Robokassa из env.

    При ROBOKASSA_IS_TEST=true: подпись init — ROBOKASSA_TEST_PASSWORD_1,
    ResultURL — ROBOKASSA_TEST_PASSWORD_2; в generate_payment_url передаётся IsTest=1.

    В stub-режиме при пустых тестовых паролях **по умолчанию** конфиг не поднимается
    (не смешиваем IsTest с боевыми паролями). Исключение — явный
    ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST=true (только для осознанного local stub).
    """
    from settings import get_settings

    s = get_settings()
    use_test = s.robokassa_is_test
    stub = s.robokassa_stub

    if use_test:
        p1 = (s.ROBOKASSA_TEST_PASSWORD_1 or "").strip()
        p2 = (s.ROBOKASSA_TEST_PASSWORD_2 or "").strip()
        credential_branch = "test_passwords"
        if not p1 or not p2:
            if stub:
                if s.robokassa_allow_insecure_prod_passwords_in_test:
                    p1 = (s.ROBOKASSA_PASSWORD_1 or "").strip()
                    p2 = (s.ROBOKASSA_PASSWORD_2 or "").strip()
                    credential_branch = "stub_insecure_production_passwords"
                    if not p1 or not p2:
                        raise ValueError(
                            "ROBOKASSA_IS_TEST=true, ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST=true: "
                            "нужны ROBOKASSA_PASSWORD_1 и ROBOKASSA_PASSWORD_2 для локальной подписи stub."
                        )
                    logger.critical(
                        "Robokassa: INSECURE config — ROBOKASSA_IS_TEST=true, тестовые пароли пусты, "
                        "используются боевые пароли (ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST). "
                        "Только для локального stub; в общем случае задайте ROBOKASSA_TEST_PASSWORD_1/2."
                    )
                else:
                    raise ValueError(
                        "ROBOKASSA_IS_TEST=true, но ROBOKASSA_TEST_PASSWORD_1/2 не заданы. "
                        "Укажите тестовые пароли Robokassa; либо для чисто локального stub без test-режима кассы "
                        "выставьте ROBOKASSA_IS_TEST=false; либо явно (опасно) "
                        "ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST=true и задайте ROBOKASSA_PASSWORD_1/2."
                    )
            else:
                raise ValueError(
                    "ROBOKASSA_IS_TEST=true: задайте ROBOKASSA_TEST_PASSWORD_1 и ROBOKASSA_TEST_PASSWORD_2 "
                    "(тестовые пароли из личного кабинета Robokassa)."
                )
    else:
        p1 = (s.ROBOKASSA_PASSWORD_1 or "").strip()
        p2 = (s.ROBOKASSA_PASSWORD_2 or "").strip()
        credential_branch = "production_passwords"

    return {
        "merchant_login": (s.ROBOKASSA_MERCHANT_LOGIN or "").strip(),
        "password_1": p1,
        "password_2": p2,
        "is_test": use_test,
        "credential_branch": credential_branch,
        "result_url": (s.ROBOKASSA_RESULT_URL or "").strip(),
        "success_url": (s.ROBOKASSA_SUCCESS_URL or "").strip(),
        "fail_url": (s.ROBOKASSA_FAIL_URL or "").strip(),
    }


def generate_payment_url(
    merchant_login: str,
    amount: float,
    invoice_id: str,
    description: str,
    password_1: str,
    is_test: bool = False,
    result_url: Optional[str] = None,
    success_url: Optional[str] = None,
    fail_url: Optional[str] = None,
    **kwargs
) -> str:
    """
    Генерация URL для оплаты через Robokassa
    
    Args:
        merchant_login: Логин магазина
        amount: Сумма платежа
        invoice_id: Номер счета
        description: Описание платежа
        password_1: Пароль #1
        is_test: Тестовый режим
        result_url: URL для уведомлений (ResultURL)
        success_url: URL для успешной оплаты (SuccessURL)
        fail_url: URL для неуспешной оплаты (FailURL)
        **kwargs: Дополнительные параметры (Culture, Encoding, etc.)
        
    Returns:
        URL для перехода к оплате
    """
    # Генерируем подпись
    signature = generate_signature(merchant_login, amount, invoice_id, password_1)
    
    # Базовый URL
    if is_test:
        base_url = "https://auth.robokassa.ru/Merchant/Index.aspx"
    else:
        base_url = "https://auth.robokassa.ru/Merchant/Index.aspx"
    
    # Параметры запроса
    params = {
        "MerchantLogin": merchant_login,
        "OutSum": f"{amount:.2f}",
        "InvId": invoice_id,
        "Description": description,
        "SignatureValue": signature,
    }
    
    # Добавляем опциональные параметры
    if is_test:
        params["IsTest"] = "1"
    
    if result_url:
        params["ResultURL"] = result_url
    
    if success_url:
        params["SuccessURL"] = success_url
    
    if fail_url:
        params["FailURL"] = fail_url
    
    # Добавляем дополнительные параметры
    params.update(kwargs)
    
    # Формируем URL
    query_string = urlencode(params)
    return f"{base_url}?{query_string}"


def generate_result_signature(amount: float, invoice_id: str, password_2: str) -> str:
    """Генерация подписи для ResultURL (для stub-режима)."""
    amount_str = f"{amount:.2f}"
    signature_string = f"{amount_str}:{invoice_id}:{password_2}"
    return hashlib.md5(signature_string.encode("utf-8")).hexdigest()


def verify_result_notification(
    amount: float,
    invoice_id: str,
    signature: str,
    password_2: str
) -> bool:
    """
    Проверка подписи уведомления от Robokassa на ResultURL
    
    Формат: OutSum:InvId:Password#2
    
    Args:
        amount: Сумма платежа
        invoice_id: Номер счета
        signature: Подпись от Robokassa
        password_2: Пароль #2
        
    Returns:
        True если подпись верна, False иначе
    """
    return verify_signature(amount, invoice_id, signature, password_2)


def verify_success_notification(
    amount: float,
    invoice_id: str,
    signature: str,
    password_1: str
) -> bool:
    """
    Проверка подписи уведомления от Robokassa на SuccessURL
    
    Формат: OutSum:InvId:Password#1
    
    Args:
        amount: Сумма платежа
        invoice_id: Номер счет
        signature: Подпись от Robokassa
        password_1: Пароль #1
        
    Returns:
        True если подпись верна, False иначе
    """
    return verify_signature(amount, invoice_id, signature, password_1)

