"""Smoke-тесты парсера ответов классического Unisender sendEmail (не сеть)."""
from __future__ import annotations

import pytest

from services.email.unisender_provider import parse_unisender_classic_send_email_response


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
