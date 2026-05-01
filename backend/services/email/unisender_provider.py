"""Транзакционная отправка через Unisender Go API (email/send.json)."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from services.email.base import EmailSendResult

logger = logging.getLogger(__name__)


class UnisenderTransactionalProvider:
    name = "unisender"

    def __init__(
        self,
        *,
        api_key: str,
        api_base_url: str,
        from_email: str,
        from_name: str,
        timeout_sec: float = 25.0,
    ) -> None:
        self._api_key = api_key
        base = (api_base_url or "").strip().rstrip("/")
        self._send_url = f"{base}/email/send.json"
        self._from_email = from_email.strip()
        self._from_name = (from_name or "DeDato").strip() or "DeDato"
        self._timeout = timeout_sec

    async def send_message(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> EmailSendResult:
        recipient = str(to_email).strip()
        payload: dict[str, Any] = {
            "message": {
                "recipients": [{"email": recipient}],
                "body": {
                    "html": html_body,
                    "plaintext": text_body or "",
                },
                "subject": subject,
                "from_email": self._from_email,
                "from_name": self._from_name,
                "track_links": 0,
                "track_read": 0,
            }
        }
        if attachments:
            payload["message"]["attachments"] = attachments

        logger.info(
            "unisender send attempt: url=%s to=%s subject=%s",
            self._send_url,
            recipient,
            subject[:100],
        )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    self._send_url,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "X-API-KEY": self._api_key,
                    },
                    json=payload,
                )
        except httpx.TimeoutException:
            err = "Превышено время ожидания ответа от почтового провайдера"
            logger.error("unisender timeout to=%s", recipient)
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err,
            )
        except httpx.RequestError as e:
            err = "Ошибка сети при обращении к почтовому провайдеру"
            logger.error("unisender request error to=%s: %s", recipient, e)
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err,
            )

        try:
            data = response.json()
        except json.JSONDecodeError:
            logger.error(
                "unisender non-json response status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error="Некорректный ответ почтового провайдера",
            )

        if response.status_code != 200:
            err = self._extract_error_message(data) or f"HTTP {response.status_code}"
            logger.error(
                "unisender http error status=%s to=%s detail=%s",
                response.status_code,
                recipient,
                err,
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err,
            )

        status = (data.get("status") or "").strip().lower()
        if status == "success":
            job_id = data.get("job_id")
            jid = str(job_id) if job_id is not None else None
            failed = data.get("failed_emails") or {}
            if isinstance(failed, dict) and recipient in failed:
                reason = str(failed.get(recipient, "unknown"))
                logger.error(
                    "unisender failed_emails to=%s reason=%s",
                    recipient,
                    reason,
                )
                return EmailSendResult(
                    ok=False,
                    provider=self.name,
                    recipient=recipient,
                    message_id=None,
                    error=f"Адрес недоступен: {reason}",
                )
            logger.info(
                "unisender send ok to=%s job_id=%s",
                recipient,
                jid,
            )
            return EmailSendResult(
                ok=True,
                provider=self.name,
                recipient=recipient,
                message_id=jid,
                error=None,
            )

        err = self._extract_error_message(data) or "Ответ провайдера без статуса success"
        logger.error("unisender logical error to=%s data=%s", recipient, str(data)[:500])
        return EmailSendResult(
            ok=False,
            provider=self.name,
            recipient=recipient,
            message_id=None,
            error=err,
        )

    @staticmethod
    def _extract_error_message(data: dict[str, Any]) -> Optional[str]:
        if not isinstance(data, dict):
            return None
        for key in ("message", "error", "detail", "code"):
            v = data.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None
