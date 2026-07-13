#!/usr/bin/env python3
"""
CLI: аудит формирования Robokassa SignatureValue для init (SignatureValue в URL).

Цели:
- воспроизвести "runtime" конфиг (Settings/get_robokassa_config)
- вывести безопасную диагностику байтов и базы подписи (без полного пароля)
- посчитать матрицу вариантов и найти совпадение с target-signature (если задан)

Пример:
  cd backend
  python3 scripts/audit_robokassa_signature.py --payment-id 8 --target-signature 05d0...
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional
from urllib.parse import parse_qs, urlparse

from database import SessionLocal
from models import Payment
from utils.robokassa import generate_payment_url, get_robokassa_config
from utils.robokassa_signature_audit import (
    build_safe_diag,
    build_variant_passwords,
    compute_current_md5,
    matrix_signatures,
)


def _load_payment(payment_id: int) -> Payment:
    db = SessionLocal()
    try:
        p = db.query(Payment).filter(Payment.id == int(payment_id)).first()
        if not p:
            raise SystemExit(f"Payment not found: id={payment_id}")
        # Отвяжем данные, чтобы ниже случайно не тянуть lazy поля на закрытой сессии
        db.expunge(p)
        return p
    finally:
        db.close()


def _json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--payment-id", type=int, required=True)
    ap.add_argument("--target-signature", type=str, default="")
    ap.add_argument("--show-url", action="store_true", default=False)
    args = ap.parse_args(argv)

    payment = _load_payment(args.payment_id)
    cfg = get_robokassa_config()

    merchant = cfg.get("merchant_login") or ""
    inv_id = str(payment.robokassa_invoice_id or "")
    amount = float(payment.amount or 0)
    password_1_runtime = cfg.get("password_1") or ""

    # 1) Точная диагностика "как сейчас"
    out_sum_str, md5_runtime = compute_current_md5(merchant, amount, inv_id, password_1_runtime)
    diag = build_safe_diag(
        merchant_login=merchant,
        out_sum_str=out_sum_str,
        inv_id=inv_id,
        password_1=password_1_runtime,
    )
    print("== Runtime config ==")
    print(_json({"is_test": bool(cfg.get("is_test")), "credential_branch": cfg.get("credential_branch", "")}))
    print("")
    print("== Signature bytes diag (safe) ==")
    print(_json(diag.__dict__))
    print("")
    print("== Runtime MD5 ==")
    print(_json({"md5": md5_runtime, "target": (args.target_signature or "").strip().lower()}))

    # 2) Проверка urlencode/parse_qs на реальном generate_payment_url
    url = generate_payment_url(
        merchant_login=merchant,
        amount=amount,
        invoice_id=inv_id,
        description="DIAG ONLY",
        password_1=password_1_runtime,
        is_test=bool(cfg.get("is_test")),
        result_url=cfg.get("result_url") or None,
        success_url=cfg.get("success_url") or None,
        fail_url=cfg.get("fail_url") or None,
    )
    parsed = urlparse(url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    print("")
    print("== URL params after urlencode ==")
    # показываем только не секретные параметры
    safe_qs = {k: v for k, v in qs.items() if k not in ("SignatureValue",)}
    print(_json({"host": parsed.netloc, "path": parsed.path, "keys": sorted(list(qs.keys())), "params": safe_qs}))
    # SignatureValue отдельно
    sig_from_url = (qs.get("SignatureValue") or [""])[0]
    print(_json({"SignatureValue_from_url": sig_from_url}))
    if args.show_url:
        print(_json({"url": url}))

    # 3) Матрица вариантов
    print("")
    print("== Signature matrix ==")
    # Важно: достанем "сырые" env (если есть), чтобы проверить \r/\n/strip сценарии
    raw_test_p1 = os.environ.get("ROBOKASSA_TEST_PASSWORD_1", "")
    raw_prod_p1 = os.environ.get("ROBOKASSA_PASSWORD_1", "")
    # Ветка пароля #2 — только диагностически (перепутанные поля)
    raw_test_p2 = os.environ.get("ROBOKASSA_TEST_PASSWORD_2", "")
    raw_prod_p2 = os.environ.get("ROBOKASSA_PASSWORD_2", "")

    pwd_variants = []
    # runtime (уже после get_robokassa_config) — как минимум один вариант
    pwd_variants.append(("runtime_password_1", password_1_runtime))
    # env raw + варианты
    pwd_variants.extend([(f"env_test_p1:{lbl}", v) for lbl, v in build_variant_passwords(raw_test_p1)])
    pwd_variants.extend([(f"env_prod_p1:{lbl}", v) for lbl, v in build_variant_passwords(raw_prod_p1)])
    # исключаем перепутанное поле (#2)
    pwd_variants.extend([(f"env_test_p2:{lbl}", v) for lbl, v in build_variant_passwords(raw_test_p2)])
    pwd_variants.extend([(f"env_prod_p2:{lbl}", v) for lbl, v in build_variant_passwords(raw_prod_p2)])

    rows = matrix_signatures(
        merchant_login=merchant,
        amount=amount,
        inv_id=inv_id,
        password_variants=pwd_variants,
        target_md5=(args.target_signature or "").strip().lower() or None,
    )
    # печатаем только top-N и все совпадения
    matches = [r for r in rows if r.get("match_target")]
    if matches:
        print(_json({"matches": matches[:50], "matches_total": len(matches)}))
    else:
        print(_json({"matches_total": 0}))

    # exit code: если задан target и runtime не совпал — 2
    if (args.target_signature or "").strip():
        if md5_runtime != args.target_signature.strip().lower():
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

