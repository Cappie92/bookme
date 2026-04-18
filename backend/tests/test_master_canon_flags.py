"""Тесты разрешения флагов LEGACY_INDIE_MODE и MASTER_CANON_MODE."""
import pytest
from utils.master_canon import resolve_legacy_indie_mode_from_env


def test_legacy_unset_default_master_only():
    """LEGACY_INDIE_MODE не задан => master-only (False)."""
    env = {}
    assert resolve_legacy_indie_mode_from_env(env) is False


def test_legacy_1_enabled():
    """LEGACY_INDIE_MODE=1 => legacy (True)."""
    assert resolve_legacy_indie_mode_from_env({"LEGACY_INDIE_MODE": "1"}) is True


def test_legacy_true_enabled():
    """LEGACY_INDIE_MODE=true => legacy (True)."""
    assert resolve_legacy_indie_mode_from_env({"LEGACY_INDIE_MODE": "true"}) is True


def test_legacy_yes_enabled():
    """LEGACY_INDIE_MODE=yes => legacy (True)."""
    assert resolve_legacy_indie_mode_from_env({"LEGACY_INDIE_MODE": "yes"}) is True


def test_legacy_0_disabled():
    """LEGACY_INDIE_MODE=0 => master-only (False)."""
    assert resolve_legacy_indie_mode_from_env({"LEGACY_INDIE_MODE": "0"}) is False


def test_master_canon_1_legacy_disabled():
    """MASTER_CANON_MODE=1 (LEGACY не задан) => master-only (False)."""
    env = {"MASTER_CANON_MODE": "1"}
    assert resolve_legacy_indie_mode_from_env(env) is False


def test_master_canon_true_legacy_disabled():
    """MASTER_CANON_MODE=true => master-only (False)."""
    env = {"MASTER_CANON_MODE": "true"}
    assert resolve_legacy_indie_mode_from_env(env) is False


def test_master_canon_0_legacy_enabled():
    """MASTER_CANON_MODE=0 (LEGACY не задан) => legacy (True)."""
    env = {"MASTER_CANON_MODE": "0"}
    assert resolve_legacy_indie_mode_from_env(env) is True


def test_master_canon_false_legacy_enabled():
    """MASTER_CANON_MODE=false => legacy (True)."""
    env = {"MASTER_CANON_MODE": "false"}
    assert resolve_legacy_indie_mode_from_env(env) is True


def test_conflict_legacy_wins():
    """Оба заданы => LEGACY_INDIE_MODE побеждает."""
    # LEGACY=1, MASTER_CANON=0 (противоречат: legacy vs legacy)
    assert resolve_legacy_indie_mode_from_env({
        "LEGACY_INDIE_MODE": "1",
        "MASTER_CANON_MODE": "0",
    }) is True
    # LEGACY=0, MASTER_CANON=1 (оба master-only)
    assert resolve_legacy_indie_mode_from_env({
        "LEGACY_INDIE_MODE": "0",
        "MASTER_CANON_MODE": "1",
    }) is False
    # LEGACY=1, MASTER_CANON=1 (конфликт: legacy vs master-only)
    assert resolve_legacy_indie_mode_from_env({
        "LEGACY_INDIE_MODE": "1",
        "MASTER_CANON_MODE": "1",
    }) is True
