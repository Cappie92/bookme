from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
import requests
from appstoreserverlibrary.models.Environment import Environment

from models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from services.apple_store_status import AppleStoreStatusError, AppleStoreStatusService
from services.apple_store_verification import (
    AppleStoreVerificationError,
    VerifiedAppleTransaction,
)
from settings import Settings

PRODUCT_ID = "ru.dedato.subscription.basic.monthly"


class FakeClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.requested = []

    def get_all_subscription_statuses(self, original_transaction_id):
        self.requested.append(original_transaction_id)
        if self.error is not None:
            raise self.error
        return self.response


class FakeVerificationService:
    def __init__(self, transaction=None, error=None):
        self.transaction = transaction
        self.error = error

    def verify_signed_transaction(self, _signed):
        if self.error is not None:
            raise self.error
        return self.transaction

    def verify_signed_renewal_info(self, _signed, *, environment):
        if self.error is not None:
            raise self.error
        return SimpleNamespace(
            originalTransactionId=self.transaction.original_transaction_id,
            appAccountToken=self.transaction.app_account_token,
            environment=environment,
        )


class SequenceVerificationService:
    def __init__(self, transactions):
        self.transactions = iter(transactions)
        self.current = None

    def verify_signed_transaction(self, _signed):
        self.current = next(self.transactions)
        return self.current

    def verify_signed_renewal_info(self, _signed, *, environment):
        return SimpleNamespace(
            originalTransactionId=self.current.original_transaction_id,
            appAccountToken=self.current.app_account_token,
            environment=environment,
        )


def _settings():
    return Settings(
        _env_file=None,
        APPLE_IAP_ENABLED="true",
        APPLE_IAP_BUNDLE_ID="com.dedato.app",
        APPLE_IAP_APP_ID="1234567890",
        APPLE_IAP_ISSUER_ID="issuer",
        APPLE_IAP_KEY_ID="key",
        APPLE_IAP_PRIVATE_KEY="private-key",
        APPLE_IAP_ROOT_CERTS_PATH="/tmp/apple-roots",
    )


def _seed(db):
    token = str(uuid4())
    user = User(
        email="status-master@example.com",
        phone="+79991239999",
        full_name="Status Master",
        hashed_password="x",
        role=UserRole.MASTER,
        is_active=True,
        revenuecat_app_user_id=token,
    )
    plan = SubscriptionPlan(
        name="Basic",
        display_name="Базовый",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=425,
        price_12months=400,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=2,
    )
    db.add_all([user, plan])
    db.commit()
    now = datetime.utcnow()
    subscription = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(days=20),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="apple",
        apple_original_transaction_id="orig-status",
        apple_transaction_id="tx-old",
        apple_product_id=PRODUCT_ID,
        apple_environment="production",
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return user, subscription, token


def _transaction(token, *, transaction_id="tx-new", expires_date=None):
    now = datetime.utcnow()
    return VerifiedAppleTransaction(
        transaction_id=transaction_id,
        original_transaction_id="orig-status",
        product_id=PRODUCT_ID,
        internal_plan_name="Basic",
        external_tier="Basic",
        duration_months=1,
        app_account_token=token,
        purchase_date=now,
        expires_date=expires_date or (now + timedelta(days=40)),
        revocation_date=None,
        revocation_reason=None,
        environment="production",
    )


def _response(*, app_id=1234567890):
    item = SimpleNamespace(
        originalTransactionId="orig-status",
        signedTransactionInfo="signed-transaction",
        signedRenewalInfo="signed-renewal",
    )
    return SimpleNamespace(
        environment=Environment.PRODUCTION,
        bundleId="com.dedato.app",
        appAppleId=app_id,
        data=[SimpleNamespace(lastTransactions=[item])],
    )


def test_valid_status_refresh_updates_existing_subscription(db):
    user, subscription, token = _seed(db)
    client = FakeClient(response=_response())
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(_transaction(token)),
        client_factory=lambda _environment: client,
    )
    result = service.refresh_user_subscriptions(db, user)
    db.commit()

    assert result["refreshed"] == 1
    assert client.requested == ["orig-status"]
    db.refresh(subscription)
    assert subscription.apple_transaction_id == "tx-new"
    assert subscription.is_active is True


def test_authoritative_status_refresh_reconciles_equal_expiration(db):
    user, subscription, token = _seed(db)
    expires = subscription.end_date
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(
            _transaction(token, transaction_id="tx-equal-status", expires_date=expires)
        ),
        client_factory=lambda _environment: FakeClient(response=_response()),
    )
    result = service.refresh_user_subscriptions(db, user)
    db.commit()

    assert result["refreshed"] == 1
    db.refresh(subscription)
    assert subscription.apple_transaction_id == "tx-equal-status"
    assert subscription.end_date == expires


def test_apple_status_api_outage_does_not_change_last_verified_state(db):
    user, subscription, token = _seed(db)
    before = (
        subscription.apple_transaction_id,
        subscription.end_date,
        subscription.status,
    )
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(_transaction(token)),
        client_factory=lambda _environment: FakeClient(
            error=requests.RequestException("offline")
        ),
    )
    with pytest.raises(AppleStoreStatusError, match="apple_status_api_unavailable"):
        service.refresh_user_subscriptions(db, user)
    db.rollback()
    db.refresh(subscription)
    assert (
        subscription.apple_transaction_id,
        subscription.end_date,
        subscription.status,
    ) == before


def test_invalid_returned_signed_payload_does_not_modify_subscription(db):
    user, subscription, _token = _seed(db)
    before = (subscription.apple_transaction_id, subscription.end_date)
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(
            error=AppleStoreVerificationError("invalid_signed_transaction")
        ),
        client_factory=lambda _environment: FakeClient(response=_response()),
    )
    with pytest.raises(
        AppleStoreStatusError, match="apple_status_invalid_signed_transaction"
    ):
        service.refresh_user_subscriptions(db, user)
    db.rollback()
    db.refresh(subscription)
    assert (subscription.apple_transaction_id, subscription.end_date) == before


def test_wrong_production_app_id_fails_before_upsert(db):
    user, subscription, token = _seed(db)
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(_transaction(token)),
        client_factory=lambda _environment: FakeClient(response=_response(app_id=999)),
    )
    with pytest.raises(AppleStoreStatusError, match="apple_status_app_id_mismatch"):
        service.refresh_user_subscriptions(db, user)
    db.rollback()
    db.refresh(subscription)
    assert subscription.apple_transaction_id == "tx-old"


def test_missing_signed_renewal_info_fails_before_upsert(db):
    user, subscription, token = _seed(db)
    response = _response()
    response.data[0].lastTransactions[0].signedRenewalInfo = None
    service = AppleStoreStatusService(
        _settings(),
        verification_service=FakeVerificationService(_transaction(token)),
        client_factory=lambda _environment: FakeClient(response=response),
    )
    with pytest.raises(
        AppleStoreStatusError, match="apple_status_signed_renewal_info_missing"
    ):
        service.refresh_user_subscriptions(db, user)
    db.rollback()
    db.refresh(subscription)
    assert subscription.apple_transaction_id == "tx-old"


def test_ambiguous_equal_expiration_status_does_not_sort_transaction_ids(db):
    user, subscription, token = _seed(db)
    expires = subscription.end_date + timedelta(days=10)
    first = _transaction(token, transaction_id="tx-a", expires_date=expires)
    second = _transaction(token, transaction_id="tx-z", expires_date=expires)
    response = _response()
    response.data[0].lastTransactions = [
        SimpleNamespace(
            originalTransactionId="orig-status",
            signedTransactionInfo="signed-a",
            signedRenewalInfo="renewal-a",
        ),
        SimpleNamespace(
            originalTransactionId="orig-status",
            signedTransactionInfo="signed-z",
            signedRenewalInfo="renewal-z",
        ),
    ]
    service = AppleStoreStatusService(
        _settings(),
        verification_service=SequenceVerificationService([first, second]),
        client_factory=lambda _environment: FakeClient(response=response),
    )
    before = (subscription.apple_transaction_id, subscription.end_date)

    with pytest.raises(
        AppleStoreStatusError, match="apple_status_ambiguous_transaction_state"
    ):
        service.refresh_user_subscriptions(db, user)
    db.rollback()
    db.refresh(subscription)
    assert (subscription.apple_transaction_id, subscription.end_date) == before
