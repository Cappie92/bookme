from datetime import date, datetime, timedelta, time
from zoneinfo import ZoneInfo

from auth import get_password_hash
from models import AvailabilitySlot, Master, MasterSchedule, OwnerType, Salon, User, UserRole
from services.scheduling import check_booking_conflicts, check_master_working_hours, get_available_slots


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
    # Создаем слот доступности (сервис использует day_of_week 1-7: 1=Пн, 7=Вс)
    day_of_week = datetime.now().weekday() + 1
    slot = AvailabilitySlot(
        owner_type=OwnerType.MASTER,
        owner_id=test_master.id,
        day_of_week=day_of_week,
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


def test_get_available_slots_master_schedule_date_vs_datetime(db):
    """
    Регрессионный тест: баг сравнения Date vs datetime в get_available_slots.
    MasterSchedule.date — Column(Date), в БД хранится как 'YYYY-MM-DD'.
    При передаче datetime(2026,1,29) без приведения к date SQLite может не найти
    записи из-за сравнения '2026-01-29' с '2026-01-29 00:00:00'.
    Правка _date = date.date() при isinstance(date, datetime) устраняет баг.
    """
    # User + Master + Salon (MasterSchedule требует salon_id по FK)
    user_m = User(
        email="mdate@example.com",
        hashed_password=get_password_hash("x"),
        phone="+79991112233",
        full_name="Master Date",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user_m)
    db.commit()
    db.refresh(user_m)
    master = Master(user_id=user_m.id, bio="", experience_years=0)
    db.add(master)
    db.commit()
    db.refresh(master)

    user_s = User(
        email="sdate@example.com",
        hashed_password=get_password_hash("x"),
        phone="+79991112234",
        full_name="Salon Date",
        role=UserRole.SALON,
        is_active=True,
        is_verified=True,
    )
    db.add(user_s)
    db.commit()
    db.refresh(user_s)
    salon = Salon(
        user_id=user_s.id,
        name="Test Salon",
        domain="test-salon-date",
        phone="+79991112234",
        email="sdate@example.com",
    )
    db.add(salon)
    db.commit()
    db.refresh(salon)

    # MasterSchedule с date типа Date (в БД — '2026-01-29')
    # Два последовательных слота по 30 мин для услуги 60 мин
    target_date = date(2026, 1, 29)  # четверг
    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=salon.id,
            date=target_date,
            start_time=time(10, 0),
            end_time=time(10, 30),
            is_available=True,
        )
    )
    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=salon.id,
            date=target_date,
            start_time=time(10, 30),
            end_time=time(11, 0),
            is_available=True,
        )
    )
    db.commit()

    # Вызов с datetime (как в available-slots-repeat: parsed_date = datetime(year, month, day))
    # Без правки date.date() слоты не найдутся; с правкой — найдутся
    parsed_as_datetime = datetime(2026, 1, 29)
    slots = get_available_slots(
        db, OwnerType.MASTER, master.id, parsed_as_datetime, service_duration=60
    )
    assert len(slots) > 0, (
        "get_available_slots должен находить слоты при передаче datetime, "
        "если MasterSchedule.date — Date. Нужна правка: _date = date.date() при isinstance(date, datetime)"
    )
    assert all("start_time" in s and "end_time" in s for s in slots)


def test_check_master_working_hours_offset_aware_matches_naive(db):
    """
    Регрессия: публичная запись шлёт ISO с offset (aware); границы расписания — naive local.
    Не должно быть TypeError при сравнении в check_master_working_hours.
    """
    user_m = User(
        email="awarewh@example.com",
        hashed_password=get_password_hash("x"),
        phone="+79997776655",
        full_name="Aware WH",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user_m)
    db.commit()
    db.refresh(user_m)
    master = Master(
        user_id=user_m.id,
        bio="",
        experience_years=0,
        timezone="Europe/Moscow",
        domain="aware-wh-test",
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    work_d = date(2026, 4, 15)
    db.add_all(
        [
            MasterSchedule(
                master_id=master.id,
                salon_id=None,
                date=work_d,
                start_time=time(10, 0),
                end_time=time(10, 30),
                is_available=True,
            ),
            MasterSchedule(
                master_id=master.id,
                salon_id=None,
                date=work_d,
                start_time=time(10, 30),
                end_time=time(11, 0),
                is_available=True,
            ),
        ]
    )
    db.commit()

    tz = ZoneInfo("Europe/Moscow")
    st_aw = datetime.combine(work_d, time(10, 0)).replace(tzinfo=tz)
    et_aw = st_aw + timedelta(hours=1)
    assert check_master_working_hours(db, master.id, st_aw, et_aw, False, None) is True

    st_naive = datetime.combine(work_d, time(10, 0))
    et_naive = st_naive + timedelta(hours=1)
    assert check_master_working_hours(db, master.id, st_naive, et_naive, False, None) is True


def test_get_available_slots_with_bookings(db, test_master):
    # Создаем слот доступности (сервис использует day_of_week 1-7)
    day_of_week = datetime.now().weekday() + 1
    slot = AvailabilitySlot(
        owner_type=OwnerType.MASTER,
        owner_id=test_master.id,
        day_of_week=day_of_week,
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
    # Слоты — стартовые окна длины service_duration; старты с шагом 30 мин могут пересекаться по времени (9:00 и 9:30 для 60 мин).
    for s in slots:
        assert s["end_time"] - s["start_time"] == timedelta(minutes=service_duration)
