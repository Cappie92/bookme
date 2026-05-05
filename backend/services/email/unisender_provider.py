"""Транзакционная отправка через классический Unisender API (sendEmail), не Unisender Go."""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

import httpx

from services.email.base import EmailSendResult

logger = logging.getLogger(__name__)


def _extract_top_level_error(data: dict[str, Any]) -> Optional[str]:
    err = data.get("error")
    if err is None:
        return None
    if isinstance(err, str) and err.strip():
        return err.strip()
    if isinstance(err, dict):
        msg = err.get("message") or err.get("error")
        if msg is not None and str(msg).strip():
            return str(msg).strip()
        code = err.get("code")
        if code is not None:
            return str(code).strip()
    return str(err)


def _format_validation_errors(errors: Any) -> Optional[str]:
    if not errors:
        return None
    if isinstance(errors, list) and errors:
        parts = []
        for e in errors:
            if isinstance(e, dict):
                m = e.get("message") or e.get("code")
                if m:
                    parts.append(str(m))
            else:
                parts.append(str(e))
        return "; ".join(parts) if parts else None
    return str(errors)


def parse_unisender_classic_send_email_response(
    data: Any,
    *,
    recipient: str,
    provider_name: str = "unisender",
) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Разбирает JSON ответа классического API sendEmail (format=json).
    Возвращает (ok, message_id, error_message).
    Успех: нет верхнеуровневого error и есть result без блокирующих errors в элементе.
    """
    if not isinstance(data, dict):
        return False, None, "Некорректный ответ почтового провайдера"

    top_err = _extract_top_level_error(data)
    if top_err:
        return False, None, top_err

    if "result" not in data:
        return False, None, "Ответ провайдера без поля result"

    result = data["result"]

    # Новый формат (error_checking=1): result — массив объектов по получателям
    if isinstance(result, list):
        if not result:
            return False, None, "Пустой result от провайдера"
        first = result[0]
        if not isinstance(first, dict):
            return False, None, "Некорректная структура result"
        errs = first.get("errors")
        formatted = _format_validation_errors(errs)
        if formatted:
            return False, None, formatted
        mid = first.get("id") or first.get("email_id") or first.get("message_id")
        if mid is not None:
            return True, str(mid), None
        return False, None, "Ответ провайдера без идентификатора письма"

    # Старый формат: result — объект с email_id / message_id
    if isinstance(result, dict):
        errs = result.get("errors")
        formatted = _format_validation_errors(errs)
        if formatted:
            return False, None, formatted
        mid = (
            result.get("message_id")
            or result.get("email_id")
            or result.get("id")
        )
        if mid is not None:
            return True, str(mid), None
        return False, None, "Ответ провайдера без идентификатора письма"

    return False, None, "Некорректная структура result"


class UnisenderTransactionalProvider:
    name = "unisender"

    def __init__(
        self,
        *,
        api_key: str,
        api_base_url: str,
        from_email: str,
        from_name: str,
        list_id: str,
        timeout_sec: float = 25.0,
    ) -> None:
        self._api_key = api_key
        base = (api_base_url or "").strip().rstrip("/")
        self._send_url = f"{base}/sendEmail?format=json"
        self._from_email = from_email.strip()
        self._from_name = (from_name or "DeDato").strip() or "DeDato"
        self._list_id = str(list_id).strip()
        self._timeout = timeout_sec

    def _build_form_data(
        self,
        *,
        recipient: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> dict[str, str]:
        # Классический sendEmail: одно поле body (HTML). Plaintext остаётся для совместимости
        # вызова — при необходимости можно расширить через MIME headers; сейчас отдаём HTML.
        body = html_body if (html_body or "").strip() else (text_body or "")
        return {
            "api_key": self._api_key,
            "email": recipient,
            "sender_name": self._from_name,
            "sender_email": self._from_email,
            "subject": subject,
            "body": body,
            "list_id": self._list_id,
            "lang": "ru",
            "track_read": "0",
            "track_links": "0",
            "error_checking": "1",
        }

    def _attachment_file_tuples(
        self, attachments: Optional[list[dict[str, Any]]]
    ) -> list[tuple[str, tuple[Optional[str], bytes, Optional[str]]]]:
        """Вложения для multipart: имя поля attachments[filename], бинарное содержимое (не base64)."""
        out: list[tuple[str, tuple[Optional[str], bytes, Optional[str]]]] = []
        if not attachments:
            return out
        for att in attachments:
            if not isinstance(att, dict):
                continue
            fn = (att.get("name") or "attachment.bin").strip() or "attachment.bin"
            b64 = att.get("content")
            if not b64:
                continue
            try:
                raw = base64.standard_b64decode(str(b64))
            except (ValueError, TypeError):
                logger.warning("unisender classic: skip attachment with invalid base64 name=%s", fn)
                continue
            ctype = att.get("type")
            ct = str(ctype).strip() if ctype else "application/octet-stream"
            field_name = f"attachments[{fn}]"
            out.append((field_name, (fn, raw, ct)))
        if attachments:
            if not out:
                logger.warning(
                    "unisender classic: attachments requested count=%s but prepared 0 "
                    "(invalid base64 or empty content?)",
                    len(attachments),
                )
            else:
                prepared = [(t[1][0], len(t[1][1])) for t in out]
                logger.info(
                    "unisender classic: prepared %s attachment(s) name_and_bytes=%s",
                    len(out),
                    prepared,
                )
        return out

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
        form = self._build_form_data(
            recipient=recipient,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )

        file_tuples = self._attachment_file_tuples(attachments)
        logger.info(
            "unisender classic sendEmail: endpoint=%s to=%s subject=%s attachments=%s",
            self._send_url.split("?")[0],
            recipient,
            subject[:100],
            len(file_tuples),
        )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                if file_tuples:
                    response = await client.post(
                        self._send_url,
                        data=form,
                        files=file_tuples,
                    )
                else:
                    response = await client.post(
                        self._send_url,
                        data=form,
                    )
        except httpx.TimeoutException:
            err = "Превышено время ожидания ответа от почтового провайдера"
            logger.error(
                "unisender classic api: timeout endpoint=%s to=%s",
                self._send_url.split("?")[0],
                recipient,
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err,
            )
        except httpx.RequestError as e:
            err = "Ошибка сети при обращении к почтовому провайдеру"
            logger.error(
                "unisender classic api: request error endpoint=%s to=%s detail=%s",
                self._send_url.split("?")[0],
                recipient,
                e,
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err,
            )

        try:
            payload = response.json()
        except json.JSONDecodeError:
            logger.error(
                "unisender classic api: non-json status=%s endpoint=%s to=%s body_snip=%s",
                response.status_code,
                self._send_url.split("?")[0],
                recipient,
                response.text[:500],
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error="Некорректный ответ почтового провайдера",
            )

        ok_parsed, mid, err_parsed = parse_unisender_classic_send_email_response(
            payload,
            recipient=recipient,
            provider_name=self.name,
        )

        if response.status_code != 200:
            msg = err_parsed
            if not msg and isinstance(payload, dict):
                msg = _extract_top_level_error(payload)
            msg = msg or f"HTTP {response.status_code}"
            logger.error(
                "unisender classic api: http_error status=%s endpoint=%s to=%s subject_snip=%s error=%s",
                response.status_code,
                self._send_url.split("?")[0],
                recipient,
                subject[:80],
                msg,
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=msg,
            )

        if not ok_parsed:
            logger.error(
                "unisender classic api: logical_error endpoint=%s to=%s subject_snip=%s error=%s",
                self._send_url.split("?")[0],
                recipient,
                subject[:80],
                err_parsed or "unknown",
            )
            return EmailSendResult(
                ok=False,
                provider=self.name,
                recipient=recipient,
                message_id=None,
                error=err_parsed or "Ошибка отправки через Unisender",
            )

        logger.info(
            "unisender classic api: ok endpoint=%s to=%s message_id=%s",
            self._send_url.split("?")[0],
            recipient,
            mid,
        )
        return EmailSendResult(
            ok=True,
            provider=self.name,
            recipient=recipient,
            message_id=mid,
            error=None,
        )
