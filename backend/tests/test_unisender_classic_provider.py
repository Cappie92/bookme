"""Smoke-тесты парсера ответов классического Unisender sendEmail (не сеть)."""
from __future__ import annotations

import base64
import logging
from unittest.mock import patch

import pytest

from services.email.unisender_provider import (
    UnisenderTransactionalProvider,
    _urlencoded_body_with_binary_attachments,
    parse_unisender_classic_send_email_response,
)


@pytest.mark.parametrize(
    "payload,expect_ok,expect_mid,expect_err_substr",
    [
        (
            {"result": {"email_id": 14362456134}},
            True,
            "14362456134",
            None,
        ),
        (
            {"result": {"message_id": "mid-1"}},
            True,
            "mid-1",
            None,
        ),
        (
            {"result": [{"email": "q@q.com", "id": "uuid-like-id"}]},
            True,
            "uuid-like-id",
            None,
        ),
        (
            {"error": "invalid_api_key"},
            False,
            None,
            "invalid_api_key",
        ),
        (
            {"result": [{"email": "bad", "errors": [{"code": "invalid_email", "message": "Недопустимый Email"}]}]},
            False,
            None,
            "Недопустимый",
        ),
    ],
)
def test_parse_unisender_classic_response(
    payload: dict,
    expect_ok: bool,
    expect_mid: str | None,
    expect_err_substr: str | None,
) -> None:
    ok, mid, err = parse_unisender_classic_send_email_response(
        payload,
        recipient="client@example.com",
    )
    assert ok is expect_ok
    assert mid == expect_mid
    if expect_err_substr:
        assert err and expect_err_substr in err
    else:
        assert err is None


def test_urlencoded_form_data_includes_attachments_field() -> None:
    body, hdrs = _urlencoded_body_with_binary_attachments(
        {"api_key": "k", "email": "a@b.com"},
        [("attachments[test.ics]", b"BEGIN:VEVENT\nEND:VEVENT")],
    )
    assert hdrs["Content-Type"] == "application/x-www-form-urlencoded"
    assert b"api_key=k" in body
    assert b"attachments%5Btest.ics%5D=" in body


@pytest.mark.asyncio
async def test_send_message_multipart_passes_files_not_content() -> None:
    post_kwargs: dict = {}

    class FakeResp:
        status_code = 200
        text = ""

        def json(self):
            return {"result": {"email_id": "99"}}

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, url, **kwargs):
            post_kwargs.update(kwargs)
            return FakeResp()

    with patch("services.email.unisender_provider.httpx.AsyncClient", FakeClient):
        prov = UnisenderTransactionalProvider(
            api_key="UNI_SUPER_SECRET_999",
            api_base_url="https://api.unisender.com/ru/api",
            from_email="from@example.com",
            from_name="DeDato",
            list_id="1",
            timeout_sec=5.0,
            attachments_mode="multipart",
        )
        res = await prov.send_message(
            to_email="c@d.com",
            subject="Subj",
            html_body="<p>h</p>",
            text_body="h",
            attachments=[
                {
                    "name": "test.ics",
                    "type": "text/calendar",
                    "content": base64.standard_b64encode(b"X-ICS-BYTES").decode("ascii"),
                }
            ],
        )

    assert res.ok and res.message_id == "99"
    assert "files" in post_kwargs and post_kwargs["files"]
    assert "content" not in post_kwargs


@pytest.mark.asyncio
async def test_send_message_form_data_urlencoded_body_no_files() -> None:
    post_kwargs: dict = {}

    class FakeResp:
        status_code = 200
        text = ""

        def json(self):
            return {"result": {"email_id": "100"}}

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, url, **kwargs):
            post_kwargs.update(kwargs)
            return FakeResp()

    with patch("services.email.unisender_provider.httpx.AsyncClient", FakeClient):
        prov = UnisenderTransactionalProvider(
            api_key="k",
            api_base_url="https://api.unisender.com/ru/api",
            from_email="from@example.com",
            from_name="DeDato",
            list_id="1",
            timeout_sec=5.0,
            attachments_mode="form_data",
        )
        res = await prov.send_message(
            to_email="c@d.com",
            subject="Subj",
            html_body="<p>h</p>",
            text_body="h",
            attachments=[
                {
                    "name": "test.ics",
                    "type": "text/calendar",
                    "content": base64.standard_b64encode(b"X-ICS-BYTES").decode("ascii"),
                }
            ],
        )

    assert res.ok and res.message_id == "100"
    assert "files" not in post_kwargs
    assert "content" in post_kwargs
    assert b"attachments%5Btest.ics%5D=" in post_kwargs["content"]
    assert b"X-ICS-BYTES" in post_kwargs["content"]


@pytest.mark.asyncio
async def test_send_message_logs_do_not_include_api_key(caplog) -> None:
    caplog.set_level(logging.INFO, logger="services.email.unisender_provider")
    secret = "UNI_SUPER_SECRET_ABC"

    class FakeResp:
        status_code = 200
        text = ""

        def json(self):
            return {"result": {"email_id": "1"}}

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, url, **kwargs):
            return FakeResp()

    with patch("services.email.unisender_provider.httpx.AsyncClient", FakeClient):
        prov = UnisenderTransactionalProvider(
            api_key=secret,
            api_base_url="https://api.unisender.com/ru/api",
            from_email="from@example.com",
            from_name="DeDato",
            list_id="1",
            timeout_sec=5.0,
            attachments_mode="form_data",
        )
        await prov.send_message(
            to_email="c@d.com",
            subject="Subj",
            html_body="<p>h</p>",
            text_body="h",
            attachments=[
                {
                    "name": "test.ics",
                    "type": "text/calendar",
                    "content": base64.standard_b64encode(b"x").decode("ascii"),
                }
            ],
        )

    msgs = [r.getMessage() for r in caplog.records if r.name == "services.email.unisender_provider"]
    joined = "\n".join(msgs)
    assert secret not in joined
    assert "UNI_SUPER_SECRET" not in joined
