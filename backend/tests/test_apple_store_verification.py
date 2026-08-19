from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.signed_data_verifier import (
    VerificationException,
    VerificationStatus,
)

from services.apple_store_verification import (
    AppleStoreVerificationError,
    AppleStoreVerificationService,
    load_apple_root_certificates,
)
from settings import Settings

PRODUCT_ID = "ru.dedato.subscription.standard.monthly"


class FakeVerifier:
    def __init__(self, *, transaction=None, error=None, renewal=None):
        self.transaction = transaction
        self.error = error
        self.renewal = renewal

    def verify_and_decode_signed_transaction(self, _signed):
        if self.error is not None:
            raise self.error
        return self.transaction

    def verify_and_decode_renewal_info(self, _signed):
        if self.error is not None:
            raise self.error
        return self.renewal


def _payload(*, environment=Environment.PRODUCTION, **overrides):
    now = datetime.utcnow()
    values = {
        "transactionId": "tx-1",
        "originalTransactionId": "orig-1",
        "bundleId": "com.dedato.app",
        "productId": PRODUCT_ID,
        "appAccountToken": str(uuid4()),
        "purchaseDate": int(now.timestamp() * 1000),
        "expiresDate": int((now + timedelta(days=30)).timestamp() * 1000),
        "revocationDate": None,
        "rawRevocationReason": None,
        "environment": environment,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _service(production, sandbox=None):
    invalid_environment = VerificationException(VerificationStatus.INVALID_ENVIRONMENT)
    return AppleStoreVerificationService(
        Settings(_env_file=None),
        verifiers={
            "production": production,
            "sandbox": sandbox or FakeVerifier(error=invalid_environment),
        },
    )


def test_valid_mocked_production_jws_standard_maps_to_pro():
    transaction = _service(
        FakeVerifier(transaction=_payload())
    ).verify_signed_transaction("signed-production")
    assert transaction.environment == "production"
    assert transaction.product_id == PRODUCT_ID
    assert transaction.internal_plan_name == "Pro"
    assert transaction.external_tier == "Standard"


def test_valid_mocked_sandbox_jws():
    service = _service(
        FakeVerifier(
            error=VerificationException(VerificationStatus.INVALID_ENVIRONMENT)
        ),
        FakeVerifier(transaction=_payload(environment=Environment.SANDBOX)),
    )
    transaction = service.verify_signed_transaction("signed-sandbox")
    assert transaction.environment == "sandbox"


def test_invalid_signature_fails_closed():
    invalid = FakeVerifier(
        error=VerificationException(VerificationStatus.VERIFICATION_FAILURE)
    )
    with pytest.raises(AppleStoreVerificationError, match="invalid_signed_transaction"):
        _service(invalid, invalid).verify_signed_transaction("bad-signature")


def test_official_app_identifier_failure_is_not_accepted():
    wrong_app = FakeVerifier(
        error=VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER)
    )
    with pytest.raises(AppleStoreVerificationError, match="invalid_signed_transaction"):
        _service(wrong_app, wrong_app).verify_signed_transaction("wrong-app-id")


def test_wrong_bundle_is_rejected():
    with pytest.raises(AppleStoreVerificationError, match="wrong_bundle_id"):
        _service(
            FakeVerifier(transaction=_payload(bundleId="com.example.wrong"))
        ).verify_signed_transaction("wrong-bundle")


def test_unknown_product_is_rejected():
    with pytest.raises(AppleStoreVerificationError, match="unknown_product_id"):
        _service(
            FakeVerifier(transaction=_payload(productId="unknown.product"))
        ).verify_signed_transaction("unknown-product")


@pytest.mark.parametrize(
    "field,error_code",
    [
        ("transactionId", "missing_transaction_id"),
        ("originalTransactionId", "missing_original_transaction_id"),
        ("expiresDate", "missing_expiration"),
        ("purchaseDate", "missing_purchase_date"),
        ("appAccountToken", "missing_app_account_token"),
    ],
)
def test_required_verified_fields_have_no_fallback(field, error_code):
    with pytest.raises(AppleStoreVerificationError, match=error_code):
        _service(
            FakeVerifier(transaction=_payload(**{field: None}))
        ).verify_signed_transaction("missing-field")


def test_root_certificate_loader_uses_only_configured_der_files(tmp_path):
    configured = tmp_path / "apple-root.cer"
    configured.write_bytes(b"configured-der-bytes")
    (tmp_path / "ignored.pem").write_text("not loaded")

    assert load_apple_root_certificates(str(tmp_path)) == [b"configured-der-bytes"]


@pytest.mark.parametrize("setup", ["missing", "empty", "unsupported"])
def test_root_certificate_loader_fails_without_supported_configured_roots(
    tmp_path, setup
):
    root_path = tmp_path / "roots"
    if setup != "missing":
        root_path.mkdir()
    if setup == "unsupported":
        (root_path / "root.pem").write_text("not a supported configured root")

    with pytest.raises(
        AppleStoreVerificationError,
        match="apple_root_certificates_not_found",
    ):
        load_apple_root_certificates(str(root_path))


def test_malformed_configured_root_has_no_system_trust_fallback(tmp_path):
    malformed = tmp_path / "malformed.cer"
    malformed.write_bytes(b"not-a-certificate")
    settings = Settings(
        _env_file=None,
        APPLE_IAP_ENABLED="true",
        APPLE_IAP_BUNDLE_ID="com.dedato.app",
        APPLE_IAP_APP_ID="1234567890",
        APPLE_IAP_ISSUER_ID="issuer",
        APPLE_IAP_KEY_ID="key",
        APPLE_IAP_PRIVATE_KEY="private-key",
        APPLE_IAP_ROOT_CERTS_PATH=str(malformed),
    )

    with pytest.raises(AppleStoreVerificationError, match="invalid_signed_transaction"):
        AppleStoreVerificationService(settings).verify_signed_transaction("not-a-jws")
