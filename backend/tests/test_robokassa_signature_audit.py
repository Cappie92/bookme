import hashlib
from urllib.parse import parse_qs, urlparse

from utils.robokassa import generate_payment_url, generate_signature
from utils.robokassa_signature_audit import build_safe_diag, compute_current_md5


def test_signature_fixed_vector_md5_utf8():
    merchant = "dedato"
    amount = 1160.0
    inv_id = "8"
    password = "q8A2v"
    out_sum_str, md5 = compute_current_md5(merchant, amount, inv_id, password)
    assert out_sum_str == "1160.00"
    # сверка с "прямой" формулой (MD5 базы)
    expected = hashlib.md5(f"{merchant}:{out_sum_str}:{inv_id}:{password}".encode("utf-8")).hexdigest()
    assert md5 == expected
    # и с текущей реализацией generate_signature()
    assert md5 == generate_signature(merchant, amount, inv_id, password)


def test_generate_payment_url_outsum_two_decimals_and_numeric_invid():
    url = generate_payment_url(
        merchant_login="dedato",
        amount=1160,
        invoice_id="8",
        description="X",
        password_1="q8A2v",
        is_test=True,
        result_url="https://example.com/result",
        success_url="https://example.com/s",
        fail_url="https://example.com/f",
    )
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    assert qs["OutSum"][0] == "1160.00"
    assert qs["InvId"][0] == "8"
    assert qs["MerchantLogin"][0] == "dedato"
    assert "SignatureValue" in qs


def test_signature_does_not_depend_on_description_or_istest():
    merchant = "dedato"
    amount = 1160.0
    inv_id = "8"
    password = "q8A2v"
    s1 = generate_signature(merchant, amount, inv_id, password)
    # description / IsTest не участвуют в базе подписи (проверяем косвенно через URL)
    u1 = generate_payment_url(
        merchant_login=merchant,
        amount=amount,
        invoice_id=inv_id,
        description="DESC1",
        password_1=password,
        is_test=False,
    )
    u2 = generate_payment_url(
        merchant_login=merchant,
        amount=amount,
        invoice_id=inv_id,
        description="DESC2",
        password_1=password,
        is_test=True,
    )
    q1 = parse_qs(urlparse(u1).query)
    q2 = parse_qs(urlparse(u2).query)
    assert q1["SignatureValue"][0] == s1
    assert q2["SignatureValue"][0] == s1


def test_safe_diag_does_not_expose_password_or_full_base():
    password = "SECRET_PASSWORD_12345"
    diag = build_safe_diag(
        merchant_login="dedato",
        out_sum_str="1160.00",
        inv_id="8",
        password_1=password,
    )
    blob = str(diag.__dict__)
    assert password not in blob
    # masked base должен содержать маркер, а не пароль
    assert "<PASSWORD_1>" in blob
    # первые 2 символа пароля не должны утечь отдельным полем/значением
    assert password[:2] not in blob
    # полного SHA-256 быть не должно
    assert "password_sha256':" not in blob
    assert "password_sha256_fp12" in blob
    # есть только fingerprint длиной 12
    assert hasattr(diag, "password_sha256_fp12")
    assert len(diag.password_sha256_fp12) == 12
    # suffix5 и len корректны
    assert diag.password_suffix5 == password[-5:]
    assert diag.password_len == len(password)

