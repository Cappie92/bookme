"""Verification of App Store signed transaction data using Apple's official SDK."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional
from uuid import UUID

from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.signed_data_verifier import (
    SignedDataVerifier,
    VerificationException,
    VerificationStatus,
)

from settings import Settings, get_settings
from utils.apple_iap_products import resolve_apple_product_details


class AppleStoreVerificationError(Exception):
    """Safe, classified verification error. Never contains signed payload data."""

    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class VerifiedAppleTransaction:
    transaction_id: str
    original_transaction_id: str
    product_id: str
    internal_plan_name: str
    external_tier: str
    duration_months: int
    app_account_token: str
    purchase_date: datetime
    expires_date: datetime
    revocation_date: Optional[datetime]
    revocation_reason: Optional[int]
    environment: str

    @property
    def is_revoked(self) -> bool:
        return self.revocation_date is not None

    def is_expired_at(self, now: datetime) -> bool:
        return self.expires_date <= now


def _timestamp_ms_to_utc(value: object, field: str) -> datetime:
    if value is None:
        raise AppleStoreVerificationError(f"missing_{field}")
    try:
        timestamp_ms = int(value)
    except (TypeError, ValueError) as exc:
        raise AppleStoreVerificationError(f"invalid_{field}") from exc
    if timestamp_ms <= 0:
        raise AppleStoreVerificationError(f"invalid_{field}")
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).replace(
        tzinfo=None
    )


def _required_string(value: object, field: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise AppleStoreVerificationError(f"missing_{field}")
    return normalized


def _normalize_uuid(value: object) -> str:
    raw = _required_string(value, "app_account_token")
    try:
        return str(UUID(raw))
    except (TypeError, ValueError, AttributeError) as exc:
        raise AppleStoreVerificationError("invalid_app_account_token") from exc


def _environment_name(value: object) -> str:
    if value == Environment.PRODUCTION:
        return "production"
    if value == Environment.SANDBOX:
        return "sandbox"
    raise AppleStoreVerificationError("unsupported_environment")


def _root_certificate_files(path: Path) -> Iterable[Path]:
    if path.is_file():
        return (path,)
    if path.is_dir():
        return tuple(
            sorted(
                child
                for child in path.iterdir()
                if child.is_file() and child.suffix.lower() in (".cer", ".der")
            )
        )
    return ()


def load_apple_root_certificates(path_value: str) -> list[bytes]:
    path = Path(path_value).expanduser()
    files = tuple(_root_certificate_files(path))
    if not files:
        raise AppleStoreVerificationError("apple_root_certificates_not_found")
    certificates = [path.read_bytes() for path in files]
    if any(not certificate for certificate in certificates):
        raise AppleStoreVerificationError("apple_root_certificate_empty")
    return certificates


class AppleStoreVerificationService:
    def __init__(
        self,
        settings: Optional[Settings] = None,
        *,
        verifiers: Optional[Dict[str, object]] = None,
    ):
        self.settings = settings or get_settings()
        self._verifiers = verifiers

    def _configured_verifiers(self) -> Dict[str, object]:
        if self._verifiers is not None:
            return self._verifiers
        if not self.settings.apple_iap_enabled:
            raise AppleStoreVerificationError("apple_iap_disabled")
        roots = load_apple_root_certificates(self.settings.APPLE_IAP_ROOT_CERTS_PATH)
        bundle_id = self.settings.APPLE_IAP_BUNDLE_ID.strip()
        app_id = self.settings.apple_iap_app_id_int
        self._verifiers = {
            "production": SignedDataVerifier(
                roots,
                True,
                Environment.PRODUCTION,
                bundle_id,
                app_id,
            ),
            "sandbox": SignedDataVerifier(
                roots,
                True,
                Environment.SANDBOX,
                bundle_id,
                None,
            ),
        }
        return self._verifiers

    def verify_signed_transaction(
        self, signed_transaction: str
    ) -> VerifiedAppleTransaction:
        signed_transaction = _required_string(signed_transaction, "signed_transaction")
        verifiers = self._configured_verifiers()
        decoded = None
        retryable = False
        for environment in ("production", "sandbox"):
            verifier = verifiers[environment]
            try:
                decoded = verifier.verify_and_decode_signed_transaction(
                    signed_transaction
                )
                break
            except VerificationException as exc:
                retryable = retryable or (
                    exc.status == VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
                )
            except Exception as exc:
                raise AppleStoreVerificationError(
                    "apple_verifier_failure", retryable=True
                ) from exc
        if decoded is None:
            raise AppleStoreVerificationError(
                "invalid_signed_transaction", retryable=retryable
            )

        bundle_id = _required_string(getattr(decoded, "bundleId", None), "bundle_id")
        if bundle_id != self.settings.APPLE_IAP_BUNDLE_ID.strip():
            raise AppleStoreVerificationError("wrong_bundle_id")

        product_id = _required_string(getattr(decoded, "productId", None), "product_id")
        product = resolve_apple_product_details(product_id)
        if product is None:
            raise AppleStoreVerificationError("unknown_product_id")

        revocation_date_raw = getattr(decoded, "revocationDate", None)
        revocation_date = (
            _timestamp_ms_to_utc(revocation_date_raw, "revocation_date")
            if revocation_date_raw is not None
            else None
        )
        revocation_reason = getattr(decoded, "rawRevocationReason", None)
        if revocation_reason is not None:
            try:
                revocation_reason = int(revocation_reason)
            except (TypeError, ValueError) as exc:
                raise AppleStoreVerificationError("invalid_revocation_reason") from exc

        return VerifiedAppleTransaction(
            transaction_id=_required_string(
                getattr(decoded, "transactionId", None), "transaction_id"
            ),
            original_transaction_id=_required_string(
                getattr(decoded, "originalTransactionId", None),
                "original_transaction_id",
            ),
            product_id=product.product_id,
            internal_plan_name=product.internal_plan_name,
            external_tier=product.external_tier,
            duration_months=product.duration_months,
            app_account_token=_normalize_uuid(
                getattr(decoded, "appAccountToken", None)
            ),
            purchase_date=_timestamp_ms_to_utc(
                getattr(decoded, "purchaseDate", None), "purchase_date"
            ),
            expires_date=_timestamp_ms_to_utc(
                getattr(decoded, "expiresDate", None), "expiration"
            ),
            revocation_date=revocation_date,
            revocation_reason=revocation_reason,
            environment=_environment_name(getattr(decoded, "environment", None)),
        )

    def verify_signed_renewal_info(
        self, signed_renewal_info: str, *, environment: str
    ) -> object:
        signed_renewal_info = _required_string(
            signed_renewal_info, "signed_renewal_info"
        )
        verifier = self._configured_verifiers().get(environment)
        if verifier is None:
            raise AppleStoreVerificationError("unsupported_environment")
        try:
            return verifier.verify_and_decode_renewal_info(signed_renewal_info)
        except VerificationException as exc:
            raise AppleStoreVerificationError(
                "invalid_signed_renewal_info",
                retryable=(
                    exc.status == VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
                ),
            ) from exc
        except Exception as exc:
            raise AppleStoreVerificationError(
                "apple_verifier_failure", retryable=True
            ) from exc


def verify_apple_signed_transaction(
    signed_transaction: str,
) -> VerifiedAppleTransaction:
    return AppleStoreVerificationService().verify_signed_transaction(signed_transaction)
