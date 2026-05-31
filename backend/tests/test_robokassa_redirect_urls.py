"""Redirect URL resolution for Robokassa (no localhost in prod when FRONTEND_URL set)."""
import pytest


def test_resolve_redirect_urls_uses_frontend_when_success_is_localhost(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("FRONTEND_URL", "https://dedato.ru")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "http://localhost:5173/payment/success")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "http://localhost:5173/payment/fail")
    from settings import reload_settings

    reload_settings()
    from utils.robokassa import resolve_robokassa_redirect_urls

    success, fail = resolve_robokassa_redirect_urls()
    assert success == "https://dedato.ru/payment/success"
    assert fail == "https://dedato.ru/payment/fail"


def test_resolve_redirect_urls_keeps_explicit_public_url(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("FRONTEND_URL", "https://dedato.ru")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "https://dedato.ru/payment/success")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "https://dedato.ru/payment/fail")
    from settings import reload_settings

    reload_settings()
    from utils.robokassa import resolve_robokassa_redirect_urls

    success, fail = resolve_robokassa_redirect_urls()
    assert success == "https://dedato.ru/payment/success"
    assert fail == "https://dedato.ru/payment/fail"


def test_get_robokassa_config_success_url_not_localhost_in_prod(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "false")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("FRONTEND_URL", "https://dedato.ru")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "")
    from settings import reload_settings

    reload_settings()
    from utils.robokassa import get_robokassa_config

    cfg = get_robokassa_config()
    assert "localhost" not in (cfg.get("success_url") or "").lower()
    assert cfg["success_url"].startswith("https://dedato.ru")
