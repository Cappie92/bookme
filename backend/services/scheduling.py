from datetime import datetime, timedelta, time
from typing import List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from models import AvailabilitySlot, Booking, OwnerType


def _to_naive(dt: datetime) -> datetime:
    """
    Приводит datetime к naive (без таймзоны)
    """
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _check_time_overlap(
    start1: datetime, end1: datetime, start2: datetime, end2: datetime
) -> bool:
    """
    Проверяет пересечение двух временных интервалов
    """
    # Приводим все даты к naive datetime для корректного сравнения
    start1 = _to_naive(start1)
    end1 = _to_naive(end1)
    start2 = _to_naive(start2)
    end2 = _to_naive(end2)
    
    return (
        (start1 < end2 and end1 > start2) or
        (start2 < end1 and end2 > start1)
    )


def _get_slots_for_duration(start_time: time, end_time: time, service_duration_minutes: int) -> List[time]:
    """
    Генерирует список начальных времен слотов для услуги заданной длительности
    Слоты начинаются в 00 и 30 минут каждого часа
    """
    slots = []
    current_time = start_time
    
    # Конвертируем в минуты для удобства вычислений
    start_minutes = start_time.hour * 60 + start_time.minute
    end_minutes = end_time.hour * 60 + end_time.minute
    
    # Генерируем слоты с шагом 30 минут
    current_minutes = start_minutes
    while current_minutes + service_duration_minutes <= end_minutes:
        # Проверяем, что слот начинается в 00 или 30 минут
        if current_minutes % 30 == 0:
            slot_hour = current_minutes // 60
            slot_minute = current_minutes % 60
            slots.append(time(hour=slot_hour, minute=slot_minute))
        
        current_minutes += 30
    
    return slots


def _is_slot_available(slot_start: time, service_duration_minutes: int, existing_bookings: List[Booking], target_date) -> bool:
    """
    Проверяет, доступен ли слот для бронирования
    """
    # Создаем datetime для начала и конца слота
    slot_start_dt = datetime.combine(target_date, slot_start)
    slot_end_dt = slot_start_dt + timedelta(minutes=service_duration_minutes)
    
    # Проверяем пересечение с существующими бронированиями
    for booking in existing_bookings:
        if _check_time_overlap(slot_start_dt, slot_end_dt, booking.start_time, booking.end_time):
            return False
    
    return True


def check_booking_conflicts(
    db: Session,
    start_time: datetime,
    end_time: datetime,
    owner_type: OwnerType,
    owner_id: int,
    exclude_booking_id: Optional[int] = None,
) -> bool:
    """
    Проверяет наличие конфликтов для нового бронирования
    """
    # Получаем ВСЕ активные бронирования для данного владельца
    query = db.query(Booking).filter(
        Booking.status != "cancelled",
        Booking.status != "rejected"
    )

    if owner_type == OwnerType.MASTER:
        query = query.filter(Booking.master_id == owner_id)
    elif owner_type == OwnerType.INDIE_MASTER:
        query = query.filter(Booking.indie_master_id == owner_id)
    else:
        # Для салона учитываем как бронирования самого салона, так и всех его мастеров
        from models import Master, salon_masters
        master_ids = db.query(salon_masters.c.master_id).filter(salon_masters.c.salon_id == owner_id).all()
        master_id_list = [m[0] for m in master_ids]
        
        if master_id_list:
            query = query.filter(
                or_(
                    Booking.salon_id == owner_id,
                    Booking.master_id.in_(master_id_list)
                )
            )
        else:
            query = query.filter(Booking.salon_id == owner_id)

    if exclude_booking_id:
        query = query.filter(Booking.id != exclude_booking_id)

    existing_bookings = query.all()
    
    # Отладочная информация
    print(f"DEBUG: Проверка конфликтов для {start_time} - {end_time}")
    print(f"DEBUG: Владелец: {owner_type}, ID: {owner_id}")
    print(f"DEBUG: Найдено существующих бронирований: {len(existing_bookings)}")
    for booking in existing_bookings:
        print(f"DEBUG: Бронирование {booking.id}: {booking.start_time} - {booking.end_time}, статус: {booking.status}")

    # Проверяем пересечение с каждым существующим бронированием
    for booking in existing_bookings:
        if _check_time_overlap(start_time, end_time, booking.start_time, booking.end_time):
            print(f"DEBUG: КОНФЛИКТ! Новое бронирование {start_time} - {end_time} пересекается с {booking.start_time} - {booking.end_time}")
            return True

    print(f"DEBUG: Конфликтов не найдено")
    return False


def get_available_slots(
    db: Session,
    owner_type: OwnerType,
    owner_id: int,
    date: datetime,
    service_duration: int,  # в минутах
    branch_id: Optional[int] = None,
) -> List[dict]:
    """
    Получает доступные слоты для бронирования на указанную дату
    Новая логика: слоты по 30 минут, услуга может занимать несколько слотов
    """
    print(f"DEBUG: Получение слотов для {owner_type} ID {owner_id} на {date}")
    
    # Получаем слоты доступности
    availability_slots = []
    
    if owner_type == OwnerType.MASTER:
        # Для мастера используем индивидуальное расписание
        # Python weekday(): 0=Понедельник, 1=Вторник, 2=Среда, 3=Четверг, 4=Пятница, 5=Суббота, 6=Воскресенье
        # Наша схема: 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота, 7=Воскресенье
        day_of_week = date.weekday() + 1
        
        # Сначала проверяем базовые слоты доступности
        base_slots = (
            db.query(AvailabilitySlot)
            .filter(
                AvailabilitySlot.owner_type == owner_type,
                AvailabilitySlot.owner_id == owner_id,
                AvailabilitySlot.day_of_week == day_of_week,
            )
            .all()
        )
        
        # Затем проверяем индивидуальное расписание мастера
        from models import MasterSchedule
        master_schedule = (
            db.query(MasterSchedule)
            .filter(
                MasterSchedule.master_id == owner_id,
                MasterSchedule.date == date,
                MasterSchedule.is_available == True
            )
            .order_by(MasterSchedule.start_time)
            .all()
        )
        
        if master_schedule:
            # Используем индивидуальное расписание мастера
            print(f"DEBUG: Найдено {len(master_schedule)} слотов индивидуального расписания")
            
            # Вычисляем количество необходимых 30-минутных слотов
            required_slots = service_duration // 30
            if service_duration % 30 != 0:
                required_slots += 1
            
            print(f"DEBUG: Требуется {required_slots} последовательных 30-минутных слотов")
            
            # Проверяем каждую возможную начальную позицию
            for i in range(len(master_schedule) - required_slots + 1):
                # Проверяем, есть ли достаточно последовательных слотов
                consecutive_slots = master_schedule[i:i + required_slots]
                
                # Проверяем, что слоты идут последовательно
                is_consecutive = True
                for j in range(len(consecutive_slots) - 1):
                    current_end = consecutive_slots[j].end_time
                    next_start = consecutive_slots[j + 1].start_time
                    if current_end != next_start:
                        is_consecutive = False
                        break
                
                if is_consecutive:
                    # Создаем слот доступности
                    start_time = consecutive_slots[0].start_time
                    end_time = consecutive_slots[-1].end_time
                    availability_slots.append({
                        'start_time': start_time,
                        'end_time': end_time
                    })
                    print(f"DEBUG: Найден доступный слот: {start_time} - {end_time}")
            
        elif base_slots:
            # Используем базовые слоты доступности
            print(f"DEBUG: Используем базовые слоты доступности")
            availability_slots = base_slots
        else:
            print(f"DEBUG: Нет слотов доступности для мастера {owner_id} в день {day_of_week}")
            return []
    elif owner_type == OwnerType.INDIE_MASTER:
        # Для индивидуального мастера используем его расписание
        # Python weekday(): 0=Понедельник, 1=Вторник, 2=Среда, 3=Четверг, 4=Пятница, 5=Суббота, 6=Воскресенье
        # Наша схема: 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота, 7=Воскресенье
        day_of_week = date.weekday() + 1
        
        # Проверяем слоты доступности для индивидуального мастера
        base_slots = (
            db.query(AvailabilitySlot)
            .filter(
                AvailabilitySlot.owner_type == 'master',  # Индивидуальные мастера используют тот же тип
                AvailabilitySlot.owner_id == owner_id,
                AvailabilitySlot.day_of_week == day_of_week,
            )
            .all()
        )
        
        # Проверяем индивидуальное расписание мастера
        from models import IndieMasterSchedule
        indie_master_schedule = (
            db.query(IndieMasterSchedule)
            .filter(
                IndieMasterSchedule.indie_master_id == owner_id,
                IndieMasterSchedule.day_of_week == day_of_week,  # Используем нашу схему 1-7
                IndieMasterSchedule.is_available == True
            )
            .order_by(IndieMasterSchedule.start_time)
            .all()
        )
        
        if indie_master_schedule:
            # Используем индивидуальное расписание мастера
            print(f"DEBUG: Найдено {len(indie_master_schedule)} слотов индивидуального расписания")
            
            # Вычисляем количество необходимых 30-минутных слотов
            required_slots = service_duration // 30
            if service_duration % 30 != 0:
                required_slots += 1
            
            print(f"DEBUG: Требуется {required_slots} последовательных 30-минутных слотов")
            
            # Для каждого расписания создаем слоты длиной в service_duration минут
            for schedule in indie_master_schedule:
                start_time = schedule.start_time
                end_time = schedule.end_time
                
                print(f"DEBUG: Обрабатываем расписание: {start_time} - {end_time}")
                
                # Создаем слоты длиной в service_duration минут
                current_time = start_time
                while current_time + timedelta(minutes=service_duration) <= end_time:
                    slot_start = current_time
                    slot_end = current_time + timedelta(minutes=service_duration)
                    
                    print(f"DEBUG: Проверяем слот: {slot_start} - {slot_end}")
                    
                    # Создаем слот доступности
                    availability_slots.append({
                        'start_time': slot_start,
                        'end_time': slot_end
                    })
                    print(f"DEBUG: Создан слот: {slot_start} - {slot_end}")
                    
                    # Переходим к следующему слоту с шагом 30 минут
                    current_time += timedelta(minutes=30)
                
                print(f"DEBUG: После обработки расписания доступно слотов: {len(availability_slots)}")
            
        elif base_slots:
            # Используем базовые слоты доступности
            print(f"DEBUG: Используем базовые слоты доступности")
            availability_slots = base_slots
        else:
            print(f"DEBUG: Нет слотов доступности для индивидуального мастера {owner_id} в день {day_of_week}")
            return []
    else:
        # Для салона используем базовые слоты доступности
        # Python weekday(): 0=Понедельник, 1=Вторник, 2=Среда, 3=Четверг, 4=Пятница, 5=Суббота, 6=Воскресенье
        # Наша схема: 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота, 7=Воскресенье
        day_of_week = date.weekday() + 1
        availability_slots = (
            db.query(AvailabilitySlot)
            .filter(
                AvailabilitySlot.owner_type == owner_type,
                AvailabilitySlot.owner_id == owner_id,
                AvailabilitySlot.day_of_week == day_of_week,
            )
            .all()
        )
        
        if not availability_slots:
            print(f"DEBUG: Нет слотов доступности для {owner_type} ID {owner_id} в день {day_of_week}")
            return []

    # Получаем ВСЕ активные бронирования для данного владельца
    existing_bookings_query = db.query(Booking).filter(
        Booking.status != "cancelled",
        Booking.status != "rejected"
    )

    # Фильтруем по владельцу и филиалу
    if owner_type == OwnerType.MASTER:
        existing_bookings_query = existing_bookings_query.filter(Booking.master_id == owner_id)
        # Если указан филиал, фильтруем по нему
        if branch_id:
            existing_bookings_query = existing_bookings_query.filter(Booking.branch_id == branch_id)
    elif owner_type == OwnerType.INDIE_MASTER:
        existing_bookings_query = existing_bookings_query.filter(Booking.indie_master_id == owner_id)
    else:
        # Для салона учитываем как бронирования самого салона, так и всех его мастеров
        from models import Master, salon_masters
        master_ids = db.query(salon_masters.c.master_id).filter(salon_masters.c.salon_id == owner_id).all()
        master_id_list = [m[0] for m in master_ids]
        
        if master_id_list:
            existing_bookings_query = existing_bookings_query.filter(
                or_(
                    Booking.salon_id == owner_id,
                    Booking.master_id.in_(master_id_list)
                )
            )
        else:
            existing_bookings_query = existing_bookings_query.filter(Booking.salon_id == owner_id)
        
        # Если указан филиал, фильтруем по нему
        if branch_id:
            existing_bookings_query = existing_bookings_query.filter(Booking.branch_id == branch_id)

    existing_bookings = existing_bookings_query.all()
    
    # Отладочная информация
    print(f"DEBUG: Дата: {date}")
    print(f"DEBUG: Владелец: {owner_type}, ID: {owner_id}")
    print(f"DEBUG: Длительность услуги: {service_duration} минут")
    print(f"DEBUG: Найдено существующих бронирований: {len(existing_bookings)}")
    for booking in existing_bookings:
        print(f"DEBUG: Бронирование {booking.id}: {booking.start_time} - {booking.end_time}, статус: {booking.status}")

    # Формируем список доступных слотов
    available_slots = []
    seen_slots = set()  # Для отслеживания уже добавленных слотов
    
    for availability_slot in availability_slots:
        start_time = availability_slot.start_time if hasattr(availability_slot, 'start_time') else availability_slot['start_time']
        end_time = availability_slot.end_time if hasattr(availability_slot, 'end_time') else availability_slot['end_time']
        
        print(f"DEBUG: Проверяем слот доступности: {start_time} - {end_time}")
        
        # Генерируем 30-минутные слоты внутри доступного времени
        time_slots = _get_slots_for_duration(start_time, end_time, 30)
        
        for slot_start in time_slots:
            # Проверяем доступность слота
            if _is_slot_available(slot_start, service_duration, existing_bookings, date):
                # Создаем datetime для начала и конца слота
                slot_start_dt = datetime.combine(date, slot_start)
                slot_end_dt = slot_start_dt + timedelta(minutes=service_duration)
                
                # Создаем уникальный ключ для слота
                slot_key = slot_start_dt.isoformat()
                
                # Проверяем, не добавляли ли мы уже этот слот
                if slot_key not in seen_slots:
                    available_slots.append({
                        "start_time": slot_start_dt,
                        "end_time": slot_end_dt
                    })
                    seen_slots.add(slot_key)
                    print(f"DEBUG: ✅ Слот {slot_start} доступен")
                else:
                    print(f"DEBUG: 🔄 Слот {slot_start} уже добавлен, пропускаем")
            else:
                print(f"DEBUG: ❌ Слот {slot_start} занят")

    print(f"DEBUG: Итого доступных слотов: {len(available_slots)}")
    return available_slots


def get_available_slots_any_master_logic(
    db: Session,
    salon_id: int,
    service_id: int,
    date: datetime,
    service_duration: int,
    branch_id: Optional[int] = None,
) -> List[dict]:
    """
    Получает доступные слоты для "Любого мастера" в салоне
    """
    print(f"DEBUG: Получение слотов 'Любой мастер' для салона {salon_id}, услуги {service_id} на {date}")
    
    # Получаем всех мастеров салона, которые оказывают данную услугу
    from models import Master, salon_masters, Service
    from sqlalchemy import and_
    
    # Получаем информацию об услуге
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        print(f"DEBUG: Услуга {service_id} не найдена")
        return []
    
    # Получаем мастеров салона, которые оказывают данную услугу
    masters_query = db.query(Master).join(
        salon_masters, Master.id == salon_masters.c.master_id
    ).filter(
        and_(
            salon_masters.c.salon_id == salon_id,
            Master.services.any(Service.id == service_id)
        )
    )
    
    if branch_id:
        masters_query = masters_query.filter(Master.branch_id == branch_id)
    
    masters = masters_query.all()
    print(f"DEBUG: Найдено {len(masters)} мастеров для услуги {service_id} в салоне {salon_id}")
    
    if not masters:
        print(f"DEBUG: Нет мастеров для услуги {service_id} в салоне {salon_id}")
        return []
    
    # Получаем день недели
    day_of_week = date.weekday() + 1  # 1=Понедельник, 2=Вторник, etc.
    
    # Собираем все доступные слоты от всех мастеров
    all_available_slots = []
    master_slot_counts = {}  # Количество занятых слотов у каждого мастера в день
    
    for master in masters:
        print(f"DEBUG: Проверяем мастера {master.id} ({master.user.full_name if master.user else 'Без имени'})")
        
        # Получаем слоты доступности мастера
        availability_slots = (
            db.query(AvailabilitySlot)
            .filter(
                and_(
                    AvailabilitySlot.owner_type == OwnerType.MASTER,
                    AvailabilitySlot.owner_id == master.id,
                    AvailabilitySlot.day_of_week == day_of_week
                )
            )
            .all()
        )
        
        if not availability_slots:
            print(f"DEBUG: Мастер {master.id} не работает в день {day_of_week}")
            continue
        
        # Получаем существующие бронирования мастера на эту дату
        existing_bookings = (
            db.query(Booking)
            .filter(
                and_(
                    Booking.master_id == master.id,
                    Booking.start_time >= date.replace(hour=0, minute=0, second=0, microsecond=0),
                    Booking.start_time < date.replace(hour=23, minute=59, second=59, microsecond=999999),
                    Booking.status != "cancelled",
                    Booking.status != "rejected"
                )
            )
            .all()
        )
        
        # Подсчитываем количество занятых слотов у мастера в день
        occupied_slots_count = len(existing_bookings)
        master_slot_counts[master.id] = occupied_slots_count
        
        print(f"DEBUG: Мастер {master.id} имеет {occupied_slots_count} занятых слотов в день")
        
        # Генерируем доступные слоты для мастера
        for availability_slot in availability_slots:
            start_time = availability_slot.start_time
            end_time = availability_slot.end_time
            
            # Генерируем 30-минутные слоты внутри доступного времени
            time_slots = _get_slots_for_duration(start_time, end_time, 30)
            
            for slot_start in time_slots:
                # Проверяем доступность слота
                if _is_slot_available(slot_start, service_duration, existing_bookings, date):
                    # Создаем datetime для начала и конца слота
                    slot_start_dt = datetime.combine(date, slot_start)
                    slot_end_dt = slot_start_dt + timedelta(minutes=service_duration)
                    
                    all_available_slots.append({
                        "start_time": slot_start_dt,
                        "end_time": slot_end_dt,
                        "master_id": master.id,
                        "master_name": master.user.full_name if master.user else f"Мастер {master.id}",
                        "occupied_slots": occupied_slots_count
                    })
    
    if not all_available_slots:
        print(f"DEBUG: Нет доступных слотов у мастеров")
        return []
    
    # Убираем дубли слотов и выбираем лучшего мастера для каждого слота
    unique_slots = {}
    
    for slot in all_available_slots:
        slot_key = slot["start_time"].isoformat()
        
        if slot_key not in unique_slots:
            # Первый слот с таким временем
            unique_slots[slot_key] = slot
        else:
            # Выбираем мастера с меньшим количеством занятых слотов
            current_slot = unique_slots[slot_key]
            if slot["occupied_slots"] < current_slot["occupied_slots"]:
                unique_slots[slot_key] = slot
            elif slot["occupied_slots"] == current_slot["occupied_slots"]:
                # Если количество занятых слотов одинаковое, выбираем мастера с более старым последним бронированием
                # (это упрощенная логика, можно доработать)
                unique_slots[slot_key] = slot
    
    # Формируем финальный список слотов (без информации о мастере для клиента)
    final_slots = []
    for slot in unique_slots.values():
        final_slots.append({
            "start_time": slot["start_time"],
            "end_time": slot["end_time"]
        })
    
    # Сортируем по времени
    final_slots.sort(key=lambda x: x["start_time"])
    
    print(f"DEBUG: Итого уникальных слотов: {len(final_slots)}")
    return final_slots


def get_best_master_for_slot(
    db: Session,
    salon_id: int,
    service_id: int,
    start_time: datetime,
    end_time: datetime,
    branch_id: Optional[int] = None,
) -> Optional[dict]:
    """
    Выбирает лучшего мастера для конкретного времени
    """
    print(f"DEBUG: Выбор лучшего мастера для салона {salon_id}, услуги {service_id}")
    print(f"DEBUG: Время: {start_time} - {end_time}")
    
    # Получаем всех мастеров салона, которые оказывают данную услугу
    from models import Master, salon_masters, Service
    from sqlalchemy import and_
    
    # Получаем информацию об услуге
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        print(f"DEBUG: Услуга {service_id} не найдена")
        return None
    
    # Получаем мастеров салона, которые оказывают данную услугу
    masters_query = db.query(Master).join(
        salon_masters, Master.id == salon_masters.c.master_id
    ).filter(
        and_(
            salon_masters.c.salon_id == salon_id,
            Master.services.any(Service.id == service_id)
        )
    )
    
    if branch_id:
        masters_query = masters_query.filter(Master.branch_id == branch_id)
    
    masters = masters_query.all()
    print(f"DEBUG: Найдено {len(masters)} мастеров для услуги {service_id} в салоне {salon_id}")
    
    if not masters:
        print(f"DEBUG: Нет мастеров для услуги {service_id} в салоне {salon_id}")
        return None
    
    # Получаем день недели
    day_of_week = start_time.weekday() + 1  # 1=Понедельник, 2=Вторник, etc.
    
    # Проверяем каждого мастера
    available_masters = []
    
    for master in masters:
        print(f"DEBUG: Проверяем мастера {master.id} ({master.user.full_name if master.user else 'Без имени'})")
        
        # Получаем слоты доступности мастера
        availability_slots = (
            db.query(AvailabilitySlot)
            .filter(
                and_(
                    AvailabilitySlot.owner_type == OwnerType.MASTER,
                    AvailabilitySlot.owner_id == master.id,
                    AvailabilitySlot.day_of_week == day_of_week
                )
            )
            .all()
        )
        
        if not availability_slots:
            print(f"DEBUG: Мастер {master.id} не работает в день {day_of_week}")
            continue
        
        # Проверяем, доступен ли мастер в указанное время
        is_available = False
        for availability_slot in availability_slots:
            slot_start = availability_slot.start_time
            slot_end = availability_slot.end_time
            
            # Проверяем, покрывает ли слот доступности запрашиваемое время
            slot_start_dt = datetime.combine(start_time.date(), slot_start)
            slot_end_dt = datetime.combine(start_time.date(), slot_end)
            
            if start_time >= slot_start_dt and end_time <= slot_end_dt:
                is_available = True
                break
        
        if not is_available:
            print(f"DEBUG: Мастер {master.id} недоступен в указанное время")
            continue
        
        # Получаем существующие бронирования мастера на эту дату
        existing_bookings = (
            db.query(Booking)
            .filter(
                and_(
                    Booking.master_id == master.id,
                    Booking.start_time >= start_time.replace(hour=0, minute=0, second=0, microsecond=0),
                    Booking.start_time < start_time.replace(hour=23, minute=59, second=59, microsecond=999999),
                    Booking.status != "cancelled",
                    Booking.status != "rejected"
                )
            )
            .all()
        )
        
        # Подсчитываем количество занятых слотов у мастера в день
        occupied_slots_count = len(existing_bookings)
        
        print(f"DEBUG: Мастер {master.id} имеет {occupied_slots_count} занятых слотов в день")
        
        available_masters.append({
            "id": master.id,
            "name": master.user.full_name if master.user else f"Мастер {master.id}",
            "occupied_slots": occupied_slots_count,
            "last_booking_time": None  # Можно доработать для более точного выбора
        })
    
    if not available_masters:
        print(f"DEBUG: Нет доступных мастеров для указанного времени")
        return None
    
    # Выбираем лучшего мастера по количеству занятых слотов
    best_master = min(available_masters, key=lambda x: x["occupied_slots"])
    
    print(f"DEBUG: Выбран лучший мастер: {best_master['id']} ({best_master['name']})")
    print(f"DEBUG: Количество занятых слотов: {best_master['occupied_slots']}")
    
    return best_master


def check_master_working_hours(
    db: Session,
    master_id: int,
    start_time: datetime,
    end_time: datetime,
    is_salon_work: bool = False,
    salon_id: Optional[int] = None
) -> bool:
    """
    Проверяет, работает ли мастер в указанное время
    """
    print(f"DEBUG: Проверка рабочего времени мастера {master_id} для {start_time} - {end_time}")
    print(f"DEBUG: Работа в салоне: {is_salon_work}, salon_id: {salon_id}")
    
    # Получаем день недели
    day_of_week = start_time.weekday() + 1  # 1=Понедельник, 2=Вторник, etc.
    
    if is_salon_work and salon_id:
        # Проверяем расписание работы в салоне
        from models import MasterSchedule
        salon_schedule = (
            db.query(MasterSchedule)
            .filter(
                MasterSchedule.master_id == master_id,
                MasterSchedule.salon_id == salon_id,
                MasterSchedule.date == start_time.date(),
                MasterSchedule.is_available == True
            )
            .all()
        )
        
        if salon_schedule:
            print(f"DEBUG: Найдено {len(salon_schedule)} слотов работы в салоне")
            for schedule in salon_schedule:
                schedule_start = datetime.combine(start_time.date(), schedule.start_time)
                schedule_end = datetime.combine(start_time.date(), schedule.end_time)
                
                print(f"DEBUG: Проверяем слот салона: {schedule_start} - {schedule_end}")
                
                # Проверяем, покрывает ли слот работы в салоне запрашиваемое время
                if start_time >= schedule_start and end_time <= schedule_end:
                    print(f"DEBUG: ✅ Мастер работает в салоне в указанное время")
                    return True
            print(f"DEBUG: ❌ Мастер не работает в салоне в указанное время")
            return False
        else:
            print(f"DEBUG: ❌ Нет расписания работы в салоне для мастера {master_id} в салоне {salon_id}")
            return False
    else:
        # Проверяем личное расписание мастера
        from models import MasterSchedule
        personal_schedule = (
            db.query(MasterSchedule)
            .filter(
                MasterSchedule.master_id == master_id,
                MasterSchedule.salon_id.is_(None),  # Личное расписание
                MasterSchedule.date == start_time.date(),
                MasterSchedule.is_available == True
            )
            .all()
        )
        
        if personal_schedule:
            print(f"DEBUG: Найдено {len(personal_schedule)} слотов личного расписания")
            
            # Проверяем, покрывается ли запрашиваемое время последовательными слотами
            # Сортируем слоты по времени начала
            personal_schedule.sort(key=lambda x: x.start_time)
            
            # Ищем последовательные слоты, которые покрывают запрашиваемое время
            for i in range(len(personal_schedule)):
                current_slot = personal_schedule[i]
                slot_start = datetime.combine(start_time.date(), current_slot.start_time)
                slot_end = datetime.combine(start_time.date(), current_slot.end_time)
                
                print(f"DEBUG: Проверяем слот личного расписания: {slot_start} - {slot_end}")
                
                # Если запрашиваемое время начинается в этом слоте
                if start_time >= slot_start and start_time < slot_end:
                    # Проверяем, покрывается ли все запрашиваемое время последовательными слотами
                    current_time = start_time
                    slot_index = i
                    
                    while current_time < end_time and slot_index < len(personal_schedule):
                        current_slot = personal_schedule[slot_index]
                        slot_start = datetime.combine(start_time.date(), current_slot.start_time)
                        slot_end = datetime.combine(start_time.date(), current_slot.end_time)
                        
                        # Проверяем, что слоты идут последовательно
                        if slot_index > i:
                            prev_slot = personal_schedule[slot_index - 1]
                            prev_slot_end = datetime.combine(start_time.date(), prev_slot.end_time)
                            if slot_start != prev_slot_end:
                                print(f"DEBUG: Слоты не идут последовательно: {prev_slot_end} != {slot_start}")
                                break
                        
                        # Проверяем, что текущее время покрывается этим слотом
                        if current_time >= slot_start and current_time < slot_end:
                            current_time = slot_end
                            slot_index += 1
                        else:
                            print(f"DEBUG: Время {current_time} не покрывается слотом {slot_start} - {slot_end}")
                            break
                    
                    if current_time >= end_time:
                        print(f"DEBUG: ✅ Мастер работает по личному расписанию в указанное время")
                        return True
                    else:
                        print(f"DEBUG: ❌ Недостаточно последовательных слотов для покрытия времени")
            
            print(f"DEBUG: ❌ Мастер не работает по личному расписанию в указанное время")
            return False
        else:
            print(f"DEBUG: ❌ Нет личного расписания для мастера {master_id}")
            return False
