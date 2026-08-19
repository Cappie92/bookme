import pytest
from pydantic import ValidationError

from settings import Settings


def test_direct_apple_iap_disabled_does_not_require_credentials():
    settings = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        JWT_SECRET_KEY="strong-production-secret-value",
        APPLE_IAP_ENABLED="false",
    )
    assert settings.apple_iap_enabled is False


def test_direct_apple_iap_enabled_fails_closed_when_incomplete():
    with pytest.raises(ValidationError, match="APPLE_IAP_APP_ID"):
        Settings(
            _env_file=None,
            APPLE_IAP_ENABLED="true",
        )


def test_direct_apple_iap_complete_configuration_is_accepted():
    settings = Settings(
        _env_file=None,
        APPLE_IAP_ENABLED="true",
        APPLE_IAP_BUNDLE_ID="com.dedato.app",
        APPLE_IAP_APP_ID="1234567890",
        APPLE_IAP_ISSUER_ID="issuer",
        APPLE_IAP_KEY_ID="key",
        APPLE_IAP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nvalue",
        APPLE_IAP_ROOT_CERTS_PATH="/tmp/apple-roots",
    )
    assert settings.apple_iap_enabled is True
    assert settings.apple_iap_app_id_int == 1234567890
    assert b"\n" in settings.apple_iap_private_key_bytes
