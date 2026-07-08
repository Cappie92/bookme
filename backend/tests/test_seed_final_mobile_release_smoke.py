# -*- coding: utf-8 -*-
"""Unit tests for seed_final_mobile_release_smoke (production-safe guards)."""
import argparse
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from models import BalanceTransaction, TransactionType, User, UserBalance, UserRole
from scripts import seed_final_mobile_release_smoke as smoke


def _args(**overrides):
    data = {
        "local": False,
        "prod_smoke": False,
        "execute": False,
        "cleanup": False,
        "i_understand_this_writes_smoke_data": False,
        "base_url": None,
    }
    data.update(overrides)
    return argparse.Namespace(**data)


def test_validate_safety_flags_dry_run_default():
    assert smoke.validate_safety_flags(_args()) == "dry-run"


def test_validate_safety_flags_writes_require_mode():
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.validate_safety_flags(_args(execute=True, i_understand_this_writes_smoke_data=True))


def test_validate_safety_flags_execute_requires_ack():
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.validate_safety_flags(_args(local=True, execute=True))
    assert (
        smoke.validate_safety_flags(
            _args(local=True, execute=True, i_understand_this_writes_smoke_data=True)
        )
        == "local-execute"
    )


def test_validate_safety_flags_prod_execute_requires_ack():
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.validate_safety_flags(_args(prod_smoke=True, execute=True))
    assert (
        smoke.validate_safety_flags(
            _args(
                prod_smoke=True,
                execute=True,
                i_understand_this_writes_smoke_data=True,
            )
        )
        == "prod-execute"
    )


def test_validate_safety_flags_cleanup_requires_execute():
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.validate_safety_flags(_args(local=True, cleanup=True))
    assert (
        smoke.validate_safety_flags(
            _args(
                local=True,
                cleanup=True,
                execute=True,
                i_understand_this_writes_smoke_data=True,
            )
        )
        == "local-cleanup"
    )


def test_marker_and_smoke_user_guards():
    assert smoke.has_marker(f"bio {smoke.MARKER}")
    user = User(
        email=smoke.EMAIL_MASTER_A,
        phone=smoke.PHONE_MASTER_A,
        full_name=f"Master {smoke.MARKER}",
        role=UserRole.MASTER,
    )
    assert smoke.is_smoke_user(user)
    smoke.assert_safe_user(user, "test")


def test_admin_role_rejected():
    admin = User(
        email=f"admin-{smoke.MARKER}@example.com",
        phone="+79991701999",
        full_name=f"Admin {smoke.MARKER}",
        role=UserRole.ADMIN,
    )
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.assert_safe_user(admin, "cleanup")


def test_protected_admin_phone_rejected_even_if_not_admin_role():
    """Phone +79031078685 must never be touched even if role is wrong."""
    masquerade = User(
        email="not-admin@example.com",
        phone=smoke.PROTECTED_ADMIN_PHONE,
        full_name="Masquerade",
        role=UserRole.MASTER,
    )
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.assert_safe_user(masquerade, "cleanup")


def test_non_smoke_user_rejected():
    real = User(
        email="real@example.com",
        phone="+79990000000",
        full_name="Real User",
        role=UserRole.MASTER,
    )
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.assert_safe_user(real, "cleanup")


def test_assert_admin_unchanged(db):
    admin = (
        db.query(User)
        .filter(User.phone == smoke.PROTECTED_ADMIN_PHONE)
        .first()
    )
    if admin is None:
        admin = User(
            email="seed-final-admin-guard@example.com",
            phone=smoke.PROTECTED_ADMIN_PHONE,
            full_name="Protected Admin",
            hashed_password=get_password_hash("x"),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    before = smoke.snapshot_protected_admin(db)
    smoke.assert_admin_unchanged(db, before)

    admin.full_name = "CHANGED BY BUG"
    db.commit()
    with pytest.raises(smoke.SmokeSafetyError):
        smoke.assert_admin_unchanged(db, before)

    # restore for other tests sharing db
    admin.full_name = before.full_name
    db.commit()


def test_collect_cleanup_plan_empty_without_smoke(db):
    plan = smoke.collect_cleanup_plan(db)
    assert plan["users"] == []
    assert plan["masters"] == []
    assert "subscription_plans" not in plan


def test_phones_and_password_constants():
    assert smoke.PASSWORD == "test123"
    assert smoke.PHONE_MASTER_A == "+79991701001"
    assert smoke.PHONE_MASTER_B == "+79991701002"
    assert smoke.PHONE_CLIENT_A == "+79991701011"
    assert smoke.PHONE_CLIENT_B == "+79991701012"
    assert smoke.PROTECTED_ADMIN_PHONE not in smoke.SMOKE_PHONES


def test_script_does_not_import_destructive_reseed():
    source = open(smoke.__file__, encoding="utf-8").read()
    assert "import reseed_local_test_data" not in source
    assert "from scripts.reseed_local_test_data" not in source
    assert "reset_non_admin_users(" not in source
    assert "set_subscription" not in source
    assert "set_balance" not in source


def test_main_dry_run_exits_zero(capsys):
    code = smoke.main([])
    assert code == 0
    out = capsys.readouterr().out
    assert "Dry-run" in out or "dry-run" in out.lower() or "FINAL_MOBILE_SMOKE_2026" in out


def test_post_seed_clean_state_allows_empty_user_balance(db):
    user = User(
        email="empty-balance-smoke@example.com",
        phone="+79991701901",
        full_name=f"Empty balance {smoke.MARKER}",
        hashed_password=get_password_hash(smoke.PASSWORD),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    db.add(UserBalance(user_id=user.id, balance=0.0, currency="RUB"))
    db.commit()

    smoke._assert_post_seed_clean_state(db, [user.id])


def test_post_seed_clean_state_rejects_non_empty_user_balance(db):
    user = User(
        email="nonempty-balance-smoke@example.com",
        phone="+79991701902",
        full_name=f"Non-empty balance {smoke.MARKER}",
        hashed_password=get_password_hash(smoke.PASSWORD),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    db.add(UserBalance(user_id=user.id, balance=100.0, currency="RUB"))
    db.commit()

    with pytest.raises(smoke.SmokeSafetyError, match="non_empty_balances=1"):
        smoke._assert_post_seed_clean_state(db, [user.id])


def test_cleanup_deletes_balance_transactions_for_smoke_user(db):
    user = User(
        email=smoke.EMAIL_MASTER_A,
        phone=smoke.PHONE_MASTER_A,
        full_name=f"Balance tx cleanup {smoke.MARKER}",
        hashed_password=get_password_hash(smoke.PASSWORD),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    db.add(UserBalance(user_id=user.id, balance=3210.0, currency="RUB"))
    db.add(
        BalanceTransaction(
            user_id=user.id,
            amount=3210.0,
            transaction_type=TransactionType.DEPOSIT,
            description="orphan deposit from prior payment test",
            balance_before=0.0,
            balance_after=3210.0,
        )
    )
    db.add(
        BalanceTransaction(
            user_id=user.id,
            amount=-36.0,
            transaction_type=TransactionType.SUB_DAILY_FEE,
            description="orphan daily fee",
            balance_before=3210.0,
            balance_after=3174.0,
        )
    )
    db.commit()
    user_id = user.id

    assert db.query(BalanceTransaction).filter(BalanceTransaction.user_id == user_id).count() == 2

    report = smoke.SeedReport(mode="test", base_url="http://127.0.0.1:8000")
    smoke.run_cleanup(db, report)

    assert db.query(BalanceTransaction).filter(BalanceTransaction.user_id == user_id).count() == 0
    assert db.query(User).filter(User.id == user_id).count() == 0
