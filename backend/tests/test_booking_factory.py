"""Tests for booking_factory: normalize_booking_fields and invariants."""
import pytest
from utils.booking_factory import (
    normalize_booking_fields,
    validate_booking_invariants,
    BookingOwnerError,
)


def _service(salon_id=None, indie_master_id=None):
    """Minimal service-like object."""
    class S:
        pass
    s = S()
    s.salon_id = salon_id
    s.indie_master_id = indie_master_id
    return s


def test_normalize_indie(monkeypatch):
    """LEGACY_INDIE_MODE=1: owner_type=indie => indie_master_id."""
    monkeypatch.setattr("utils.booking_factory.LEGACY_INDIE_MODE", True)
    base = {"client_id": 1, "service_id": 2}
    svc = _service(salon_id=None, indie_master_id=10)
    out = normalize_booking_fields(base, svc, "indie", 10, db=None)
    assert out["indie_master_id"] == 10
    assert out["master_id"] is None
    assert out["salon_id"] is None
    assert out["branch_id"] is None


def test_normalize_salon_requires_salon_id():
    base = {"client_id": 1, "service_id": 2}
    svc = _service(salon_id=None, indie_master_id=5)
    with pytest.raises(BookingOwnerError, match="service.salon_id"):
        normalize_booking_fields(base, svc, "salon", 1, db=None)


def test_normalize_salon_sets_salon_id():
    base = {"client_id": 1, "service_id": 2}
    svc = _service(salon_id=100, indie_master_id=None)
    out = normalize_booking_fields(base, svc, "salon", 1, db=None)
    assert out["master_id"] == 1
    assert out["indie_master_id"] is None
    assert out["salon_id"] == 100


def test_validate_one_owner():
    with pytest.raises(BookingOwnerError, match="Exactly one"):
        validate_booking_invariants({"master_id": 1, "indie_master_id": 2})
    with pytest.raises(BookingOwnerError, match="Exactly one"):
        validate_booking_invariants({"master_id": None, "indie_master_id": None})


def test_validate_indie_no_salon():
    with pytest.raises(BookingOwnerError, match="salon_id=NULL"):
        validate_booking_invariants({
            "master_id": None,
            "indie_master_id": 1,
            "salon_id": 5,
        })


def test_validate_master_solo_allowed():
    """Solo master: master_id без salon_id допустим."""
    validate_booking_invariants({
        "master_id": 1,
        "indie_master_id": None,
        "salon_id": None,
        "branch_id": None,
    })


def test_normalize_master_solo():
    """owner_type='master' => master_id, indie_master_id=None, salon_id=None."""
    base = {"client_id": 1, "service_id": 2}
    svc = _service(salon_id=None, indie_master_id=None)
    out = normalize_booking_fields(base, svc, "master", 5, db=None)
    assert out["master_id"] == 5
    assert out["indie_master_id"] is None
    assert out["salon_id"] is None
    assert out["branch_id"] is None


def test_normalize_indie_rejected_in_master_only(monkeypatch):
    """LEGACY_INDIE_MODE=0: owner_type=indie => BookingOwnerError."""
    monkeypatch.setattr("utils.booking_factory.LEGACY_INDIE_MODE", False)
    base = {"client_id": 1, "service_id": 2}
    svc = _service(salon_id=None, indie_master_id=10)
    with pytest.raises(BookingOwnerError, match="Indie bookings disabled"):
        normalize_booking_fields(base, svc, "indie", 10, db=None)
