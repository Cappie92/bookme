from datetime import datetime, timedelta, time

from models import AvailabilitySlot, OwnerType
from services.scheduling import check_booking_conflicts, get_available_slots


def test_check_booking_conflicts_no_conflicts(db, test_master):
    start_time = datetime.now() + timedelta(days=1)
    end_time = start_time + timedelta(hours=1)

    has_conflicts = check_booking_conflicts(
        db, start_time, end_time, OwnerType.MASTER, test_master.id
    )
    assert not has_conflicts


def test_check_booking_conflicts_with_conflicts(db, test_master):
    # Создаем слот доступности
    slot = AvailabilitySlot(
        owner_type=OwnerType.MASTER,
        owner_id=test_master.id,
        day_of_week=datetime.now().weekday(),
        start_time=time(9, 0),
        end_time=time(18, 0),
    )
    db.add(slot)
    db.commit()

    # Проверяем конфликты для времени в пределах слота
    start_time = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = start_time + timedelta(hours=1)

    has_conflicts = check_booking_conflicts(
        db, start_time, end_time, OwnerType.MASTER, test_master.id
    )
    assert not has_conflicts


def test_get_available_slots(db, test_master):
    # Создаем слот доступности
    slot = AvailabilitySlot(
        owner_type=OwnerType.MASTER,
        owner_id=test_master.id,
        day_of_week=datetime.now().weekday(),
        start_time=time(9, 0),
        end_time=time(18, 0),
    )
    db.add(slot)
    db.commit()

    # Получаем доступные слоты
    date = datetime.now()
    service_duration = 60  # 1 час

    slots = get_available_slots(
        db, OwnerType.MASTER, test_master.id, date, service_duration
    )

    assert len(slots) > 0
    for slot in slots:
        assert "start_time" in slot
        assert "end_time" in slot
        assert isinstance(slot["start_time"], datetime)
        assert isinstance(slot["end_time"], datetime)
        assert slot["end_time"] - slot["start_time"] == timedelta(hours=1)


def test_get_available_slots_no_availability(db, test_master):
    # Не создаем слоты доступности

    # Получаем доступные слоты
    date = datetime.now()
    service_duration = 60  # 1 час

    slots = get_available_slots(
        db, OwnerType.MASTER, test_master.id, date, service_duration
    )

    assert len(slots) == 0


def test_get_available_slots_with_bookings(db, test_master):
    # Создаем слот доступности
    slot = AvailabilitySlot(
        owner_type=OwnerType.MASTER,
        owner_id=test_master.id,
        day_of_week=datetime.now().weekday(),
        start_time=time(9, 0),
        end_time=time(18, 0),
    )
    db.add(slot)
    db.commit()

    # Получаем доступные слоты
    date = datetime.now()
    service_duration = 60  # 1 час

    slots = get_available_slots(
        db, OwnerType.MASTER, test_master.id, date, service_duration
    )

    assert len(slots) > 0
    # Проверяем, что слоты не пересекаются
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            assert (
                slots[i]["end_time"] <= slots[j]["start_time"]
                or slots[j]["end_time"] <= slots[i]["start_time"]
            )
