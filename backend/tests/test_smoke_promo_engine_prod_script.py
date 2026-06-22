import argparse

import pytest

from models import User, UserRole
from scripts.smoke_promo_engine_prod import (
    EMAIL_REFERRER,
    MARKER,
    PHONE_REFERRER,
    SmokeSafetyError,
    assert_safe_user,
    has_marker,
    is_smoke_user,
    validate_safety_flags,
)


def _args(**overrides):
    data = {
        "local": False,
        "prod_smoke": False,
        "execute": False,
        "cleanup": False,
        "i_understand_this_writes_smoke_data": False,
    }
    data.update(overrides)
    return argparse.Namespace(**data)


def test_validate_safety_flags_dry_run_default():
    assert validate_safety_flags(_args()) == "dry-run"


def test_validate_safety_flags_prod_execute_requires_ack():
    with pytest.raises(SmokeSafetyError):
        validate_safety_flags(_args(prod_smoke=True, execute=True))
    assert (
        validate_safety_flags(
            _args(prod_smoke=True, execute=True, i_understand_this_writes_smoke_data=True)
        )
        == "prod-execute"
    )


def test_validate_safety_flags_cleanup_requires_execute():
    with pytest.raises(SmokeSafetyError):
        validate_safety_flags(_args(local=True, cleanup=True))
    assert validate_safety_flags(_args(local=True, cleanup=True, execute=True)) == "local-cleanup"


def test_marker_and_smoke_user_guards():
    assert has_marker(f"name {MARKER}")
    smoke_user = User(email=EMAIL_REFERRER, phone=PHONE_REFERRER, full_name=f"Smoke {MARKER}", role=UserRole.MASTER)
    assert is_smoke_user(smoke_user)
    assert_safe_user(smoke_user, "test")


def test_admin_and_non_smoke_user_rejected():
    admin = User(email=f"admin-{MARKER}@example.com", phone=PHONE_REFERRER, full_name=f"Admin {MARKER}", role=UserRole.ADMIN)
    with pytest.raises(SmokeSafetyError):
        assert_safe_user(admin, "cleanup")

    real_user = User(email="real@example.com", phone="+79990000000", full_name="Real User", role=UserRole.MASTER)
    with pytest.raises(SmokeSafetyError):
        assert_safe_user(real_user, "cleanup")
