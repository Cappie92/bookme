#!/usr/bin/env python3
"""
Одноразовый smoke: отправка письма с ICS-вложением через UnisenderTransactionalProvider.

Без БД, без booking. Только сеть к Unisender и env как у приложения (settings / .env).

Запуск (из каталога backend):
  EMAIL_ENABLED=true EMAIL_PROVIDER=unisender python3 scripts/smoke_send_unisender_ics_attachment.py --to you@example.com
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import logging
import sys
from pathlib import Path

# Репозиторий: backend/ — корень импортов
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from services.email.factory import build_transactional_provider
from services.email.stub_provider import FailingTransactionalProvider, StubTransactionalProvider
from services.email.unisender_provider import UnisenderTransactionalProvider

ICS_SMOKE = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DeDato//ICS Smoke//RU
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:dedato-smoke-ics@example.com
DTSTAMP:20260505T000000Z
DTSTART:20260506T090000Z
DTEND:20260506T093000Z
SUMMARY:DeDato ICS smoke test
END:VEVENT
END:VCALENDAR
"""


def _main_sync() -> int:
    parser = argparse.ArgumentParser(description="Smoke: Unisender + ICS attachment (no DB).")
    parser.add_argument(
        "--to",
        required=True,
        dest="to_email",
        help="Email получателя",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s %(message)s",
    )

    to_email = str(args.to_email).strip()
    if not to_email:
        print("ERROR: empty --to", file=sys.stderr)
        return 1

    ics_bytes = ICS_SMOKE.encode("utf-8")
    b64 = base64.standard_b64encode(ics_bytes).decode("ascii")

    provider = build_transactional_provider()
    print("provider_class:", type(provider).__name__)
    print("to:", to_email)
    print("attachment_name: test.ics")
    print("ics_raw_bytes_length:", len(ics_bytes))
    print("attachment_base64_length:", len(b64))

    if isinstance(provider, (StubTransactionalProvider, FailingTransactionalProvider)):
        print(
            "ERROR: провайдер не Unisender (stub/misconfigured). "
            "Нужны EMAIL_ENABLED=true, EMAIL_PROVIDER=unisender, UNISENDER_API_KEY, "
            "EMAIL_FROM_ADDRESS (или MAIL_FROM_ADDRESS), UNISENDER_LIST_ID.",
            file=sys.stderr,
        )
        if isinstance(provider, FailingTransactionalProvider):
            print("detail:", getattr(provider, "_error_message", ""), file=sys.stderr)
        return 1

    if not isinstance(provider, UnisenderTransactionalProvider):
        print("ERROR: unexpected provider type", type(provider), file=sys.stderr)
        return 1

    subject = "DeDato ICS attachment smoke"
    html_body = "<p>Проверка ICS-вложения</p>"
    text_body = "Проверка ICS-вложения"

    result = asyncio.run(
        provider.send_message(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            attachments=[
                {
                    "type": "text/calendar",
                    "name": "test.ics",
                    "content": b64,
                }
            ],
        )
    )

    print("send_message.ok:", result.ok)
    print("send_message.provider:", result.provider)
    print("send_message.message_id:", result.message_id)
    print("send_message.error:", result.error)

    return 0 if result.ok else 2


if __name__ == "__main__":
    raise SystemExit(_main_sync())
