"""Local DB-only Build 7 matrix. Free-20 capacity is deliberately out of scope."""
from datetime import datetime, timedelta, time

import pytest

from models import BookingStatus, MasterSchedule, SubscriptionPlan, SubscriptionType
from routers.auth import _issue_tokens_for_user
from test_confirm_booking_created import (
    _attach_master_subscription_with_features,
    _create_master_with_booking,
)


@pytest.fixture(params=["Free", "Paid", "AlwaysFree"])
def operational_account(request, db):
    user, master, booking = _create_master_with_booking(
        db, booking_status=BookingStatus.CREATED, start_offset_hours=2
    )
    master.auto_confirm_bookings = False
    if request.param == "Paid":
        _attach_master_subscription_with_features(db, user.id, [1, 2, 3, 4, 5, 6, 7])
    elif request.param == "AlwaysFree":
        user.is_always_free = True
        db.add(SubscriptionPlan(
            name="AlwaysFree", display_name="AlwaysFree", subscription_type=SubscriptionType.MASTER,
            price_1month=0, price_3months=0, price_6months=0, price_12months=0,
            features={"service_functions": [1, 2, 3, 4, 5, 6, 7]},
            limits={"max_future_bookings": None}, is_active=True,
        ))
    db.commit()
    return request.param, user, master, booking


@pytest.mark.parametrize("origin", [None, "ios_app"])
@pytest.mark.parametrize("action", ["view", "pre_confirm", "post_confirm", "cancel", "reschedule"])
def test_same_operational_permissions(client, db, operational_account, origin, action):
    _, user, master, booking = operational_account
    tokens = _issue_tokens_for_user(user, web_session_origin=origin)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    booking_id = booking.id
    if action == "view":
        result = client.get("/api/master/past-appointments", headers=headers)
    elif action == "post_confirm":
        result = client.post(f"/api/master/accounting/confirm-booking/{booking_id}", headers=headers)
    elif action == "cancel":
        result = client.post(
            f"/api/master/accounting/cancel-booking/{booking_id}?cancellation_reason=mutual_agreement",
            headers=headers,
        )
    elif action == "pre_confirm":
        booking.start_time = datetime.utcnow() + timedelta(days=2)
        booking.end_time = booking.start_time + timedelta(hours=1)
        db.commit()
        result = client.post(
            f"/api/master/accounting/update-booking-status/{booking_id}?new_status=confirmed",
            headers=headers,
        )
    else:
        day = (datetime.utcnow() + timedelta(days=2)).date()
        master.timezone = "UTC"
        db.add(MasterSchedule(
            master_id=master.id, date=day, start_time=time(0, 0),
            end_time=time(23, 59), is_available=True,
        ))
        booking.start_time = datetime.combine(day, time(9, 0))
        booking.end_time = datetime.combine(day, time(10, 0))
        db.commit()
        result = client.put(
            f"/api/master/bookings/{booking_id}/time", headers=headers,
            json={"start_time": datetime.combine(day, time(11, 0)).isoformat(),
                  "end_time": datetime.combine(day, time(12, 0)).isoformat()},
        )
    assert result.status_code == 200


def test_paid_accounting_gate_is_not_opened_to_free(client, operational_account):
    kind, user, _, booking = operational_account
    tokens = _issue_tokens_for_user(user, web_session_origin="ios_app")
    result = client.post(
        f"/api/master/accounting/update-booking-status/{booking.id}?new_status=completed",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert result.status_code == (403 if kind == "Free" else 200)
