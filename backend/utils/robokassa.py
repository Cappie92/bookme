"""
Утилиты для работы с платежной системой Robokassa
"""
import hashlib
import logging
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode, urlparse

logger = logging.getLogger(__name__)

# Официальный диапазон Robokassa InvId (int64, положительный).
ROBOKASSA_INVID_MIN = 1
ROBOKASSA_INVID_MAX = 9223372036854775807

# Параметры redirect/callback не передаются в стартовый URL (настраиваются в ЛК Robokassa).
_FORBIDDEN_PAYMENT_URL_KWARGS = frozenset(
    {
        "resulturl",
        "successurl",
        "failurl",
        "resulturl2",
        "successurl2",
        "failurl2",
    }
)


def _filter_payment_url_kwargs(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Исключить redirect-параметры из kwargs; исходный dict не мутировать."""
    return {k: v for k, v in kwargs.items() if k.lower() not in _FORBIDDEN_PAYMENT_URL_KWARGS}


def robokassa_invoice_id_from_payment_id(payment_id: int) -> str:
    """
    Числовой Robokassa InvId на основе уникального Payment.id (строка из цифр).

    Уникальность обеспечивается PK payments.id и unique index на robokassa_invoice_id.
    """
    pid = int(payment_id)
    if pid < ROBOKASSA_INVID_MIN:
        raise ValueError(f"Robokassa InvId must be >= {ROBOKASSA_INVID_MIN}, got payment_id={pid}")
    if pid > ROBOKASSA_INVID_MAX:
        raise ValueError(f"payment_id {pid} exceeds Robokassa InvId maximum {ROBOKASSA_INVID_MAX}")
    return str(pid)


def is_robokassa_numeric_invoice_id(invoice_id: str) -> bool:
    """True, если invoice_id — только цифры в допустимом диапазоне Robokassa."""
    if invoice_id is None:
        return False
    value = str(invoice_id).strip()
    if not value.isdigit():
        return False
    try:
        n = int(value)
    except ValueError:
        return False
    return ROBOKASSA_INVID_MIN <= n <= ROBOKASSA_INVID_MAX


def is_temp_robokassa_invoice_placeholder(invoice_id: str) -> bool:
    """Временный placeholder до flush/commit; не отправляется в Robokassa."""
    return bool(invoice_id) and str(invoice_id).startswith("tmp-")


def generate_invoice_id(user_id: int) -> str:
    """
    Deprecated: Robokassa требует числовой InvId.

    Используйте robokassa_invoice_id_from_payment_id(payment.id) после persist Payment.
    """
    raise RuntimeError(
        "generate_invoice_id(user_id) is removed: assign robokassa_invoice_id from Payment.id "
        "via persist_new_robokassa_payment()"
    )


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


def _is_localhost_host(url: str) -> bool:
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
        return host in ("localhost", "127.0.0.1")
    except Exception:
        low = url.lower()
        return "localhost" in low or "127.0.0.1" in low


def resolve_robokassa_redirect_urls() -> Tuple[str, str]:
    """
    Success/Fail URL для Robokassa и stub-редиректа.

    Приоритет: ROBOKASSA_SUCCESS_URL / FAIL_URL, если не localhost.
    Иначе FRONTEND_URL + /payment/success|fail.
    В development без настроек — localhost:5173 (совместимость с Vite).
    """
    from settings import get_settings

    s = get_settings()
    frontend = (s.FRONTEND_URL or "").strip().rstrip("/")
    explicit_success = (s.ROBOKASSA_SUCCESS_URL or "").strip()
    explicit_fail = (s.ROBOKASSA_FAIL_URL or "").strip()

    def pick(explicit: str, path: str) -> str:
        if explicit and not _is_localhost_host(explicit):
            return explicit
        if frontend and not _is_localhost_host(frontend):
            return f"{frontend}{path}"
        if explicit:
            return explicit
        return ""

    success = pick(explicit_success, "/payment/success")
    fail = pick(explicit_fail, "/payment/fail")

    env = (s.ENVIRONMENT or "").strip().lower()
    if env in ("production", "staging") and (not success or _is_localhost_host(success)):
        if frontend and not _is_localhost_host(frontend):
            success = f"{frontend}/payment/success"
            fail = fail or f"{frontend}/payment/fail"
        elif not success:
            raise ValueError(
                "ROBOKASSA_SUCCESS_URL or FRONTEND_URL must point to a public host in production/staging "
                "(not localhost). Example: ROBOKASSA_SUCCESS_URL=https://dedato.ru/payment/success"
            )

    if not success:
        success = "http://localhost:5173/payment/success"
    if not fail:
        fail = "http://localhost:5173/payment/fail"
    return success, fail


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

    success_url, fail_url = resolve_robokassa_redirect_urls()
    return {
        "merchant_login": (s.ROBOKASSA_MERCHANT_LOGIN or "").strip(),
        "password_1": p1,
        "password_2": p2,
        "is_test": use_test,
        "credential_branch": credential_branch,
        "result_url": (s.ROBOKASSA_RESULT_URL or "").strip(),
        "success_url": success_url,
        "fail_url": fail_url,
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
    Генерация URL для оплаты через Robokassa.

    ResultURL / SuccessURL / FailURL не передаются в query: адреса настраиваются
    статически в личном кабинете Robokassa. Production:

    - Result URL: https://dedato.ru/api/payments/robokassa/result
    - Success URL: https://dedato.ru/payment/success
    - Fail URL: https://dedato.ru/payment/failed

    Для динамических URL нужны ResultUrl2 / SuccessUrl2 / FailUrl2 и расширенная
    подпись — DeDato их не использует.

    Аргументы result_url / success_url / fail_url сохранены для обратной совместимости
    вызовов, но в params не включаются.

    Подпись: MD5(MerchantLogin:OutSum:InvId:Password#1).
    """
    signature = generate_signature(merchant_login, amount, invoice_id, password_1)

    base_url = "https://auth.robokassa.ru/Merchant/Index.aspx"

    params = {
        "MerchantLogin": merchant_login,
        "OutSum": f"{amount:.2f}",
        "InvId": invoice_id,
        "Description": description,
        "SignatureValue": signature,
    }

    if is_test:
        params["IsTest"] = "1"

    params.update(_filter_payment_url_kwargs(kwargs))

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

