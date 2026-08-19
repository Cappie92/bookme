"""App Store Server API status refresh for already recorded Apple subscriptions."""

from __future__ import annotations

from typing import Callable, Dict, List, Optional

import requests
from appstoreserverlibrary.api_client import APIException, AppStoreServerAPIClient
from appstoreserverlibrary.models.Environment import Environment
from sqlalchemy.orm import Session

from models import Subscription, User
from services.apple_store_verification import (
    AppleStoreVerificationError,
    AppleStoreVerificationService,
    VerifiedAppleTransaction,
)
from services.apple_subscription_sync import upsert_verified_apple_subscription
from settings import Settings, get_settings


class AppleStoreStatusError(Exception):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def _sdk_environment(environment: str) -> Environment:
    if environment == "production":
        return Environment.PRODUCTION
    if environment == "sandbox":
        return Environment.SANDBOX
    raise AppleStoreStatusError("unsupported_stored_apple_environment")


def _response_environment(value: object) -> str:
    if value == Environment.PRODUCTION:
        return "production"
    if value == Environment.SANDBOX:
        return "sandbox"
    raise AppleStoreStatusError("invalid_apple_status_environment")


class AppleStoreStatusService:
    def __init__(
        self,
        settings: Optional[Settings] = None,
        *,
        verification_service: Optional[AppleStoreVerificationService] = None,
        client_factory: Optional[Callable[[str], object]] = None,
    ):
        self.settings = settings or get_settings()
        self.verification_service = (
            verification_service or AppleStoreVerificationService(self.settings)
        )
        self.client_factory = client_factory or self._build_client

    def _build_client(self, environment: str) -> AppStoreServerAPIClient:
        if not self.settings.apple_iap_enabled:
            raise AppleStoreStatusError("apple_iap_disabled")
        return AppStoreServerAPIClient(
            self.settings.apple_iap_private_key_bytes,
            self.settings.APPLE_IAP_KEY_ID.strip(),
            self.settings.APPLE_IAP_ISSUER_ID.strip(),
            self.settings.APPLE_IAP_BUNDLE_ID.strip(),
            _sdk_environment(environment),
        )

    def _fetch_status(self, original_transaction_id: str, environment: str) -> object:
        try:
            return self.client_factory(environment).get_all_subscription_statuses(
                original_transaction_id
            )
        except (APIException, requests.RequestException, OSError) as exc:
            raise AppleStoreStatusError(
                "apple_status_api_unavailable", retryable=True
            ) from exc
        except AppleStoreStatusError:
            raise
        except Exception as exc:
            raise AppleStoreStatusError(
                "apple_status_api_failure", retryable=True
            ) from exc

    def _validate_response_identity(self, response: object, environment: str) -> None:
        response_environment = _response_environment(
            getattr(response, "environment", None)
        )
        if response_environment != environment:
            raise AppleStoreStatusError("apple_status_environment_mismatch")
        if (
            str(getattr(response, "bundleId", "") or "").strip()
            != self.settings.APPLE_IAP_BUNDLE_ID.strip()
        ):
            raise AppleStoreStatusError("apple_status_bundle_mismatch")
        if environment == "production":
            try:
                response_app_id = int(getattr(response, "appAppleId", None))
            except (TypeError, ValueError) as exc:
                raise AppleStoreStatusError("apple_status_app_id_missing") from exc
            if response_app_id != self.settings.apple_iap_app_id_int:
                raise AppleStoreStatusError("apple_status_app_id_mismatch")

    def _verified_latest_transaction(
        self,
        response: object,
        *,
        original_transaction_id: str,
        environment: str,
    ) -> VerifiedAppleTransaction:
        self._validate_response_identity(response, environment)
        candidates: List[VerifiedAppleTransaction] = []
        for group in getattr(response, "data", None) or []:
            for item in getattr(group, "lastTransactions", None) or []:
                item_original = str(
                    getattr(item, "originalTransactionId", "") or ""
                ).strip()
                if item_original != original_transaction_id:
                    continue
                signed_transaction = str(
                    getattr(item, "signedTransactionInfo", "") or ""
                ).strip()
                if not signed_transaction:
                    raise AppleStoreStatusError(
                        "apple_status_signed_transaction_missing"
                    )
                try:
                    transaction = self.verification_service.verify_signed_transaction(
                        signed_transaction
                    )
                except AppleStoreVerificationError as exc:
                    raise AppleStoreStatusError(
                        "apple_status_invalid_signed_transaction",
                        retryable=exc.retryable,
                    ) from exc
                if transaction.environment != environment:
                    raise AppleStoreStatusError(
                        "apple_status_verified_environment_mismatch"
                    )
                if transaction.original_transaction_id != original_transaction_id:
                    raise AppleStoreStatusError(
                        "apple_status_original_transaction_mismatch"
                    )

                signed_renewal = str(
                    getattr(item, "signedRenewalInfo", "") or ""
                ).strip()
                if not signed_renewal:
                    raise AppleStoreStatusError(
                        "apple_status_signed_renewal_info_missing"
                    )
                try:
                    renewal = self.verification_service.verify_signed_renewal_info(
                        signed_renewal, environment=environment
                    )
                except AppleStoreVerificationError as exc:
                    raise AppleStoreStatusError(
                        "apple_status_invalid_signed_renewal_info",
                        retryable=exc.retryable,
                    ) from exc
                renewal_original = str(
                    getattr(renewal, "originalTransactionId", "") or ""
                ).strip()
                if renewal_original != original_transaction_id:
                    raise AppleStoreStatusError(
                        "apple_status_renewal_original_transaction_mismatch"
                    )
                renewal_token = str(
                    getattr(renewal, "appAccountToken", "") or ""
                ).strip()
                if renewal_token != transaction.app_account_token:
                    raise AppleStoreStatusError(
                        "apple_status_renewal_account_token_mismatch"
                    )
                candidates.append(transaction)

        if not candidates:
            raise AppleStoreStatusError("apple_status_transaction_not_found")

        unique_by_transaction_id: Dict[str, VerifiedAppleTransaction] = {}
        for transaction in candidates:
            previous = unique_by_transaction_id.get(transaction.transaction_id)
            if previous is not None and previous != transaction:
                raise AppleStoreStatusError("apple_status_ambiguous_transaction_state")
            unique_by_transaction_id[transaction.transaction_id] = transaction

        unique_candidates = list(unique_by_transaction_id.values())
        latest_expiration = max(
            transaction.expires_date for transaction in unique_candidates
        )
        latest = [
            transaction
            for transaction in unique_candidates
            if transaction.expires_date == latest_expiration
        ]
        if len(latest) != 1:
            raise AppleStoreStatusError("apple_status_ambiguous_transaction_state")
        return latest[0]

    def refresh_user_subscriptions(self, db: Session, user: User) -> Dict[str, object]:
        subscriptions = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == user.id,
                Subscription.billing_provider == "apple",
                Subscription.apple_original_transaction_id.isnot(None),
            )
            .order_by(Subscription.id.asc())
            .all()
        )
        if not subscriptions:
            return {"refreshed": 0, "subscriptions": []}

        verified: List[VerifiedAppleTransaction] = []
        seen = set()
        for subscription in subscriptions:
            original_id = str(subscription.apple_original_transaction_id or "").strip()
            if not original_id or original_id in seen:
                continue
            seen.add(original_id)
            environment = str(subscription.apple_environment or "").strip().lower()
            response = self._fetch_status(original_id, environment)
            verified.append(
                self._verified_latest_transaction(
                    response,
                    original_transaction_id=original_id,
                    environment=environment,
                )
            )

        results = [
            upsert_verified_apple_subscription(
                db,
                user,
                transaction,
                authoritative_status_refresh=True,
            )
            for transaction in verified
        ]
        return {"refreshed": len(results), "subscriptions": results}


def refresh_apple_subscriptions_for_user(db: Session, user: User) -> Dict[str, object]:
    return AppleStoreStatusService().refresh_user_subscriptions(db, user)
