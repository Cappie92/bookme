from datetime import date, time, datetime, timedelta
from typing import List, Dict, Tuple, Any
from sqlalchemy.orm import Session
from models import MasterSchedule, Master, MasterScheduleSettings
import json
from functools import lru_cache


def check_schedule_conflicts(
    db: Session,
    master_id: int,
    start_date: date,
    end_date: date
) -> Dict[str, List[Dict]]:
    """
    Проверяет конфликты между личным расписанием мастера и работой в салоне.
    
    Возвращает словарь с конфликтами:
    {
        'personal_conflicts': [...],  # Личное расписание конфликтует с салоном
        'salon_conflicts': [...]      # Работа в салоне конфликтует с личным расписанием
    }
    """
    
    # Получаем все записи расписания мастера в указанном диапазоне дат
    schedule_records = db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master_id,
        MasterSchedule.date >= start_date,
        MasterSchedule.date <= end_date,
        MasterSchedule.is_available == True
    ).all()
    
    # Разделяем на личное расписание и работу в салоне
    personal_schedule = []
    salon_schedule = []
    
    for record in schedule_records:
        if record.salon_id is not None:
            # Работа в салоне
            salon_schedule.append(record)
        else:
            # Личное расписание
            personal_schedule.append(record)
    
    conflicts = {
        'personal_conflicts': [],
        'salon_conflicts': []
    }
    
    # Проверяем конфликты: личное расписание vs работа в салоне
    for personal in personal_schedule:
        for salon in salon_schedule:
            if personal.date == salon.date:
                # Проверяем пересечение времени
                if _time_ranges_overlap(
                    personal.start_time, personal.end_time,
                    salon.start_time, salon.end_time
                ):
                    conflicts['personal_conflicts'].append({
                        'date': personal.date,
                        'personal_start': personal.start_time,
                        'personal_end': personal.end_time,
                        'salon_start': salon.start_time,
                        'salon_end': salon.end_time,
                        'salon_id': salon.salon_id,
                        'branch_id': salon.branch_id,
                        'place_id': salon.place_id
                    })
    
    # Проверяем конфликты: работа в салоне vs личное расписание
    for salon in salon_schedule:
        for personal in personal_schedule:
            if salon.date == personal.date:
                # Проверяем пересечение времени
                if _time_ranges_overlap(
                    salon.start_time, salon.end_time,
                    personal.start_time, personal.end_time
                ):
                    conflicts['salon_conflicts'].append({
                        'date': salon.date,
                        'salon_start': salon.start_time,
                        'salon_end': salon.end_time,
                        'personal_start': personal.start_time,
                        'personal_end': personal.end_time,
                        'salon_id': salon.salon_id,
                        'branch_id': salon.branch_id,
                        'place_id': salon.place_id
                    })
    
    return conflicts


@lru_cache(maxsize=1000)
def _time_ranges_overlap(
    start1: time, end1: time,
    start2: time, end2: time
) -> bool:
    """
    Проверяет, пересекаются ли два временных интервала.
    Кэшируется для оптимизации производительности.
    """
    # Преобразуем время в минуты для удобства сравнения
    start1_minutes = start1.hour * 60 + start1.minute
    end1_minutes = end1.hour * 60 + end1.minute
    start2_minutes = start2.hour * 60 + start2.minute
    end2_minutes = end2.hour * 60 + end2.minute
    
    # Интервалы пересекаются, если:
    # start1 < end2 И start2 < end1
    return start1_minutes < end2_minutes and start2_minutes < end1_minutes


def generate_slots_from_settings(
    db: Session,
    master_id: int,
    start_date: date,
    end_date: date
) -> List[Dict]:
    """
    Генерирует слоты расписания из настроек мастера.
    """
    # Получаем настройки расписания мастера
    settings = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master_id
    ).first()
    
    if not settings or not settings.fixed_schedule:
        return []
    
    # fixed_schedule может быть уже словарем или строкой JSON
    if isinstance(settings.fixed_schedule, dict):
        schedule_data = settings.fixed_schedule
    else:
        try:
            schedule_data = json.loads(settings.fixed_schedule)
        except (json.JSONDecodeError, TypeError):
            return []
    
    slots = []
    current_date = start_date
    
    while current_date <= end_date:
        # Получаем день недели (1 = понедельник, 7 = воскресенье)
        weekday = current_date.weekday() + 1
        
        # Проверяем, есть ли настройки для этого дня недели
        if schedule_data.get('schedule_type') == 'weekdays':
            weekdays = schedule_data.get('weekdays', {})
            day_config = weekdays.get(str(weekday))
            
            if day_config and day_config.get('enabled', False):
                start_time_str = day_config.get('open', '09:00')
                end_time_str = day_config.get('close', '18:00')
                
                # Парсим время
                start_hour, start_minute = map(int, start_time_str.split(':'))
                end_hour, end_minute = map(int, end_time_str.split(':'))
                
                # Генерируем слоты по 30 минут
                current_hour = start_hour
                current_minute = start_minute
                
                while (current_hour < end_hour) or (current_hour == end_hour and current_minute < end_minute):
                    slots.append({
                        'schedule_date': current_date,
                        'hour': current_hour,
                        'minute': current_minute,
                        'is_working': True,
                        'work_type': 'personal',
                        'has_conflict': False,
                        'conflict_type': None
                    })
                    
                    # Переходим к следующему слоту
                    current_minute += 30
                    if current_minute >= 60:
                        current_hour += 1
                        current_minute = 0
        
        current_date += timedelta(days=1)
    
    return slots


def create_schedule_from_settings(
    db: Session,
    master_id: int,
    start_date: date,
    end_date: date,
    salon_id: int = None,
    branch_id: int = None,
    place_id: int = None
) -> Dict[str, Any]:
    """
    Создает записи расписания в базе данных на основе настроек мастера.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера
        start_date: Начальная дата
        end_date: Конечная дата
        salon_id: ID салона (для работы в салоне)
        branch_id: ID филиала
        place_id: ID места
    
    Returns:
        Словарь с результатами создания
    """
    # Получаем настройки расписания мастера
    settings = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master_id
    ).first()
    
    if not settings or not settings.fixed_schedule:
        return {
            'success': False,
            'message': 'Настройки расписания не найдены',
            'created_records': 0
        }
    
    # Парсим настройки
    if isinstance(settings.fixed_schedule, dict):
        schedule_data = settings.fixed_schedule
    else:
        try:
            schedule_data = json.loads(settings.fixed_schedule)
        except (json.JSONDecodeError, TypeError):
            return {
                'success': False,
                'message': 'Ошибка парсинга настроек расписания',
                'created_records': 0
            }
    
    created_records = 0
    current_date = start_date
    
    while current_date <= end_date:
        # Получаем день недели (1 = понедельник, 7 = воскресенье)
        weekday = current_date.weekday() + 1
        
        # Проверяем, есть ли настройки для этого дня недели
        if schedule_data.get('schedule_type') == 'weekdays':
            weekdays = schedule_data.get('weekdays', {})
            day_config = weekdays.get(str(weekday))
            
            if day_config and day_config.get('enabled', False):
                start_time_str = day_config.get('open', '09:00')
                end_time_str = day_config.get('close', '18:00')
                
                # Парсим время
                start_hour, start_minute = map(int, start_time_str.split(':'))
                end_hour, end_minute = map(int, end_time_str.split(':'))
                
                # Создаем запись расписания
                schedule_record = MasterSchedule(
                    master_id=master_id,
                    salon_id=salon_id,
                    branch_id=branch_id,
                    place_id=place_id,
                    date=current_date,
                    start_time=time(start_hour, start_minute),
                    end_time=time(end_hour, end_minute),
                    is_available=True
                )
                
                db.add(schedule_record)
                created_records += 1
        
        current_date += timedelta(days=1)
    
    try:
        db.commit()
        return {
            'success': True,
            'message': f'Создано записей расписания: {created_records}',
            'created_records': created_records
        }
    except Exception as e:
        db.rollback()
        return {
            'success': False,
            'message': f'Ошибка при создании расписания: {str(e)}',
            'created_records': 0
        }


def get_schedule_with_conflicts(
    db: Session,
    master_id: int,
    start_date: date,
    end_date: date
) -> List[Dict]:
    """
    Получает расписание мастера с информацией о конфликтах и типах работы.
    Использует ТОЛЬКО данные из MasterSchedule (база данных).
    Оптимизированная версия с одним запросом к БД.
    
    Возвращает список слотов с дополнительной информацией:
    - work_type: 'personal' или 'salon'
    - has_conflict: True/False
    - conflict_type: 'salon_conflict' или 'personal_conflict'
    """
    
    # Один оптимизированный запрос с использованием индексов
    schedule_records = db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master_id,
        MasterSchedule.date >= start_date,
        MasterSchedule.date <= end_date,
        MasterSchedule.is_available == True
    ).order_by(MasterSchedule.date, MasterSchedule.start_time).all()
    
    # Если нет записей, возвращаем пустой список
    if not schedule_records:
        return []
    
    # Разделяем записи на личное расписание и работу в салоне
    personal_records = []
    salon_records = []
    
    for record in schedule_records:
        if record.salon_id is not None:
            salon_records.append(record)
        else:
            personal_records.append(record)
    
    # Создаем словарь конфликтов для быстрого поиска
    conflict_dict = {}
    
    # Находим конфликты между личным расписанием и работой в салоне
    for personal in personal_records:
        for salon in salon_records:
            if personal.date == salon.date:
                # Проверяем пересечение времени
                if _time_ranges_overlap(
                    personal.start_time, personal.end_time,
                    salon.start_time, salon.end_time
                ):
                    date_key = personal.date
                    if date_key not in conflict_dict:
                        conflict_dict[date_key] = []
                    
                    # Добавляем конфликт для личного расписания
                    conflict_dict[date_key].append({
                        'type': 'personal_conflict',  # Личное расписание конфликтует с салоном
                        'start': personal.start_time,
                        'end': personal.end_time
                    })
                    
                    # Добавляем конфликт для работы в салоне
                    conflict_dict[date_key].append({
                        'type': 'salon_conflict',  # Работа в салоне конфликтует с личным расписанием
                        'start': salon.start_time,
                        'end': salon.end_time
                    })
    
    # Создаем слоты только из существующих записей в базе данных
    slots = []
    
    for record in schedule_records:
        # Определяем тип работы
        work_type = 'salon' if record.salon_id is not None else 'personal'
        
        # Проверяем конфликты для этого времени
        has_conflict = False
        conflict_type = None
        
        if record.date in conflict_dict:
            for conflict in conflict_dict[record.date]:
                if _time_ranges_overlap(
                    record.start_time, record.end_time,
                    conflict['start'], conflict['end']
                ):
                    has_conflict = True
                    conflict_type = conflict['type']
                    break
        
        # Создаем слоты по 30 минут (оптимизированная версия)
        start_minutes = record.start_time.hour * 60 + record.start_time.minute
        end_minutes = record.end_time.hour * 60 + record.end_time.minute
        
        # Предварительно создаем базовый слот
        base_slot = {
            'schedule_date': record.date,
            'is_working': True,
            'work_type': work_type,
            'has_conflict': has_conflict,
            'conflict_type': conflict_type,
            'salon_id': record.salon_id,
            'branch_id': record.branch_id,
            'place_id': record.place_id
        }
        
        # Генерируем слоты по 30 минут
        for slot_minutes in range(start_minutes, end_minutes, 30):
            slot_hour = slot_minutes // 60
            slot_minute = slot_minutes % 60
            
            # Создаем копию базового слота с конкретным временем
            slot = base_slot.copy()
            slot['hour'] = slot_hour
            slot['minute'] = slot_minute
            slots.append(slot)
    
    return slots
