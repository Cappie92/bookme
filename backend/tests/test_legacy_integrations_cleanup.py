"""Адрес работает без legacy внешних интеграций; удалённые API не доступны."""
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import os
import subprocess
import sys

import httpx
import pytest
import requests

from main import app
from models import Master
from settings import Settings
from utils.yandex_maps_url import build_yandex_maps_url


@pytest.fixture
def forbid_provider_requests(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Unexpected outbound provider request")

    monkeypatch.setattr(requests.sessions.Session, "request", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "request", forbidden)


def test_address_round_trip_without_geocoder(
    client, db, test_master, test_master_token, forbid_provider_requests
):
    master = Master(
        user_id=test_master.id,
        domain="address-cleanup",
        city="Москва",
        timezone="Europe/Moscow",
        can_work_independently=True,
    )
    db.add(master)
    db.commit()
    headers = {"Authorization": f"Bearer {test_master_token['access_token']}"}
    address = "ул. Тверская, 10 & корпус 2"
    detail = "Этаж 3, домофон"
    response = client.put(
        "/api/master/profile",
        headers=headers,
        data={"address": address, "address_detail": detail},
    )
    assert response.status_code == 200
    db.expire_all()
    saved = db.query(Master).filter_by(id=master.id).one()
    assert saved.address == address
    assert saved.address_detail == detail

    public = client.get("/api/public/masters/address-cleanup")
    assert public.status_code == 200
    profile = public.json()
    assert profile["address"] == address
    assert profile["address_detail"] == detail
    link = urlsplit(profile["yandex_maps_url"])
    assert (link.scheme, link.netloc, link.path) == ("https", "yandex.ru", "/maps/")
    assert parse_qs(link.query) == {"text": [f"Москва, {address}"]}
    assert detail not in profile["yandex_maps_url"]

    response = client.put(
        "/api/master/profile", headers=headers,
        data={"address": "ул. Новая, 7", "address_detail": "Вход со двора"},
    )
    assert response.status_code == 200
    assert client.get("/api/public/masters/address-cleanup").json()["address"] == "ул. Новая, 7"


@pytest.mark.parametrize(
    "city,address,expected",
    [(None, None, None), ("Москва", None, "Москва"),
     (None, "Улица, 1", "Улица, 1"), (" Москва ", " Улица, 1 ", "Москва, Улица, 1")],
)
def test_maps_link_needs_only_address(city, address, expected):
    result = build_yandex_maps_url(city=city, address=address)
    if expected is None:
        assert result is None
    else:
        assert parse_qs(urlsplit(result).query) == {"text": [expected]}


@pytest.mark.parametrize(
    "path",
    ["/api/geocoder", "/api/geocoder/api-status", "/api/geocoder/geocode",
     "/api/geocoder/reverse-geocode", "/api/geocoder/extract-address-from-url",
     "/api/extract-address", "/api/auth/plusofon/balance"],
)
def test_retired_routes_are_404(client, path, forbid_provider_requests):
    assert client.get(path).status_code == 404
    assert not any(
        getattr(route, "path", "").startswith(("/api/geocoder", "/api/extract-address"))
        for route in app.routes
    )


def test_startup_and_settings_without_retired_provider_config(client, monkeypatch):
    for name in list(os.environ):
        if name.startswith(("PLUSOFON_", "YANDEX_GEOCODER_", "YANDEX_SUGGEST_")) or name == "YANDEX_API_KEY":
            monkeypatch.delenv(name)
    settings = Settings(_env_file=None, ENVIRONMENT="development", DATABASE_URL="sqlite://")
    assert not any(name.startswith("PLUSOFON_") for name in Settings.model_fields)
    assert not hasattr(settings, "plusofon_stub")
    assert client.get("/health").status_code == 200

    # Остаточные server env vars допустимы на переходе: их больше никто не читает.
    monkeypatch.setenv("PLUSOFON_MODE", "live")
    Settings(_env_file=None, ENVIRONMENT="development", DATABASE_URL="sqlite://")


def test_fresh_application_startup_without_retired_env(tmp_path):
    env = {
        name: value for name, value in os.environ.items()
        if not name.startswith(("PLUSOFON_", "YANDEX_GEOCODER_", "YANDEX_SUGGEST_"))
        and name != "YANDEX_API_KEY"
    }
    env.update(
        ENVIRONMENT="development", DATABASE_URL=f"sqlite:///{tmp_path / 'startup.db'}",
        ZVONOK_MODE="stub", ROBOKASSA_MODE="stub", EMAIL_ENABLED="false",
        APPLE_IAP_ENABLED="false", YANDEX_AUTH_ENABLED="false",
    )
    result = subprocess.run(
        [sys.executable, "-c",
         "from main import app; from fastapi.testclient import TestClient; "
         "\nwith TestClient(app) as client:\n assert client.get('/health').status_code == 200"],
        cwd=Path(__file__).resolve().parents[1], env=env,
        capture_output=True, timeout=30,
    )
    assert result.returncode == 0, "Fresh startup failed (provider output suppressed)"


def test_no_retired_runtime_module_or_import():
    root = Path(__file__).resolve().parents[1]
    for relative in ("routers/yandex_geocoder.py", "routers/address_extraction.py",
                     "services/plusofon_service.py"):
        assert not (root / relative).exists()
    for folder in ("routers", "services"):
        for path in (root / folder).rglob("*.py"):
            assert "plusofon" not in path.read_text().lower(), str(path.relative_to(root))
