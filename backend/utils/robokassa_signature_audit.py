"""
Безопасная диагностика формирования Robokassa SignatureValue (MD5).

ВАЖНО:
- НИКОГДА не логировать полный пароль.
- Не менять бизнес-логику подписи: диагностика должна воспроизводить текущий код.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _to_utf8_hex(s: str) -> str:
    return (s or "").encode("utf-8").hex()


def _sha256_hex(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _mask_public_id(pid: Optional[str]) -> str:
    if not pid:
        return ""
    v = str(pid)
    if len(v) <= 8:
        return v
    return f"{v[:4]}…{v[-4:]}"


def build_signature_base(merchant_login: str, out_sum_str: str, inv_id: str, password_1: str) -> str:
    # Строго по текущей логике generate_signature(): MerchantLogin:OutSum:InvId:Password#1
    return f"{merchant_login}:{out_sum_str}:{inv_id}:{password_1}"


def compute_md5_hex(s: str) -> str:
    return hashlib.md5((s or "").encode("utf-8")).hexdigest()


def compute_current_md5(merchant_login: str, amount: float, inv_id: str, password_1: str) -> Tuple[str, str]:
    """
    Возвращает (out_sum_str, md5) ровно так, как это делает backend в generate_signature().
    """
    out_sum_str = f"{float(amount):.2f}"
    base = build_signature_base(merchant_login, out_sum_str, inv_id, password_1)
    return out_sum_str, compute_md5_hex(base)


@dataclass(frozen=True)
class SafeSignatureDiag:
    merchant_login_repr: str
    merchant_login_utf8_hex: str
    out_sum_repr: str
    out_sum_utf8_hex: str
    inv_id_repr: str
    inv_id_utf8_hex: str
    password_len: int
    password_suffix5: str
    password_sha256_fp12: str
    signature_base_masked_repr: str
    signature_base_masked_utf8_hex: str
    md5: str


def build_safe_diag(
    *,
    merchant_login: str,
    out_sum_str: str,
    inv_id: str,
    password_1: str,
) -> SafeSignatureDiag:
    pwd = password_1 or ""
    pwd_sha = _sha256_hex(pwd)
    suffix5 = pwd[-5:] if len(pwd) >= 5 else pwd
    masked_base = build_signature_base(merchant_login, out_sum_str, inv_id, "<PASSWORD_1>")
    # md5 считаем по реальной базе (с реальным паролем), но сам пароль в диагностике не выводим
    real_base = build_signature_base(merchant_login, out_sum_str, inv_id, pwd)
    md5 = compute_md5_hex(real_base)
    return SafeSignatureDiag(
        merchant_login_repr=repr(merchant_login),
        merchant_login_utf8_hex=_to_utf8_hex(merchant_login),
        out_sum_repr=repr(out_sum_str),
        out_sum_utf8_hex=_to_utf8_hex(out_sum_str),
        inv_id_repr=repr(inv_id),
        inv_id_utf8_hex=_to_utf8_hex(inv_id),
        password_len=len(pwd),
        password_suffix5=suffix5,
        password_sha256_fp12=pwd_sha[:12],
        signature_base_masked_repr=repr(masked_base),
        signature_base_masked_utf8_hex=_to_utf8_hex(masked_base),
        md5=md5,
    )


def build_variant_passwords(raw: str) -> List[Tuple[str, str]]:
    """
    Строит диагностические варианты пароля (без логирования значения).
    Возвращает список (label, variant_password).
    """
    v = "" if raw is None else str(raw)
    return [
        ("raw_env", v),
        ("strip()", v.strip()),
        ("raw+\\n", v + "\n"),
        ("raw+\\r", v + "\r"),
        ("raw+\\r\\n", v + "\r\n"),
        ("strip()+\\n", v.strip() + "\n"),
        ("strip()+\\r", v.strip() + "\r"),
        ("strip()+\\r\\n", v.strip() + "\r\n"),
    ]


def build_variant_strings(label_prefix: str, values: Iterable[str]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for v in values:
        out.append((f"{label_prefix}={repr(v)}", v))
    return out


def matrix_signatures(
    *,
    merchant_login: str,
    amount: float,
    inv_id: str,
    password_variants: List[Tuple[str, str]],
    merchant_variants: Optional[List[Tuple[str, str]]] = None,
    out_sum_variants: Optional[List[Tuple[str, str]]] = None,
    inv_id_variants: Optional[List[Tuple[str, str]]] = None,
    target_md5: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Возвращает список строк (без секретов): label -> md5 -> match.
    """
    base_out_sum = f"{float(amount):.2f}"
    merchant_vars = merchant_variants or [
        ("merchant=stripped", merchant_login.strip()),
        ("merchant=raw", merchant_login),
        ("merchant=lower", merchant_login.lower()),
        ("merchant=upper", merchant_login.upper()),
    ]
    out_sum_vars = out_sum_variants or [
        ("out=1160", "1160"),
        ("out=1160.0", "1160.0"),
        ("out=1160.00", "1160.00"),
        ("out=comma", base_out_sum.replace(".", ",")),
        ("out=current_fmt", base_out_sum),
    ]
    inv_vars = inv_id_variants or [
        ("inv=raw", inv_id),
        ("inv=stripped", inv_id.strip()),
        ("inv=raw+space", f" {inv_id} "),
    ]

    tgt = (target_md5 or "").strip().lower() or None
    rows: List[Dict[str, Any]] = []
    for m_label, m in merchant_vars:
        for o_label, o in out_sum_vars:
            for i_label, i in inv_vars:
                for p_label, p in password_variants:
                    base_masked = build_signature_base(m, o, i, "<PASSWORD_1>")
                    md5 = compute_md5_hex(build_signature_base(m, o, i, p))
                    rows.append(
                        {
                            "variant": f"{m_label} | {o_label} | {i_label} | pwd={p_label}",
                            "signature_base_masked": base_masked,
                            "md5": md5,
                            "match_target": bool(tgt and md5 == tgt),
                        }
                    )
    return rows


def safe_log_payload_for_init(
    *,
    payment_id: int,
    payment_public_id: Optional[str],
    merchant_login: str,
    amount: float,
    inv_id: str,
    is_test: bool,
    credential_branch: str,
    password_1: str,
    result_url: str,
    success_url: str,
    fail_url: str,
) -> Dict[str, Any]:
    out_sum_str, md5 = compute_current_md5(merchant_login, amount, inv_id, password_1)
    diag = build_safe_diag(
        merchant_login=merchant_login,
        out_sum_str=out_sum_str,
        inv_id=inv_id,
        password_1=password_1,
    )
    return {
        "payment_id": payment_id,
        "payment_public_id_masked": _mask_public_id(payment_public_id),
        "MerchantLogin": diag.merchant_login_repr,
        "OutSum": diag.out_sum_repr,
        "InvId": diag.inv_id_repr,
        "IsTest": bool(is_test),
        "credential_branch": credential_branch or "",
        "password_len": diag.password_len,
        "password_suffix5": (password_1 or "")[-5:],
        "password_sha256_fp12": diag.password_sha256_fp12,
        "signature_base_masked": build_signature_base(merchant_login, out_sum_str, inv_id, "<PASSWORD_1>"),
        "SignatureValue": md5,
        "result_url": result_url,
        "success_url": success_url,
        "fail_url": fail_url,
    }

