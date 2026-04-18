# ADR-0003: Система статусов бронирований

**Дата:** 2024-10-21

**Статус:** Принято

**Контекст:** Команда разработки DeDato

---

## Контекст и проблема

В системе бронирования необходимо отслеживать жизненный цикл записи от момента создания до завершения или отмены. Требуется решение, которое:

- Четко разделяет этапы жизненного цикла записи
- Автоматизирует переходы между статусами
- Корректно управляет финансовой статистикой
- Правильно освобождает временные слоты при отмене
- Фиксирует причины отмены для аналитики

### Требования

**Функциональные:**
- Отслеживание состояния записи (создана, ожидает подтверждения, завершена, отменена)
- Автоматический переход статусов по времени
- Фиксация причин отмены и инициатора
- Освобождение слотов при отмене
- Расчет ожидаемых и подтвержденных доходов

**Нефункциональные:**
- Финансовая отчетность должна быть точной
- Невозможность изменения завершенных операций
- Аудит всех изменений статусов

## Рассмотренные варианты

### Вариант 1: Простая система (PENDING → CONFIRMED → CANCELLED)

**Статусы:** PENDING, CONFIRMED, CANCELLED

**Плюсы:**
- Простота реализации
- Понятная логика

**Минусы:**
- Нет разделения "ожидает подтверждения" и "подтверждена"
- Невозможно отследить, когда мастер должен подтвердить услугу
- Сложно рассчитывать ожидаемые доходы

### Вариант 2: Расширенная система с автоматическими переходами

**Статусы:** CREATED → AWAITING_CONFIRMATION → COMPLETED / CANCELLED

**Плюсы:**
- Четкое разделение этапов
- Автоматический переход в "На подтверждение"
- Точный расчет финансов
- Возможность аудита подтверждений

**Минусы:**
- Более сложная логика
- Необходимость автоматических переходов

### Вариант 3: Максимально детализированная система

**Статусы:** CREATED → CONFIRMED_BY_MASTER → IN_PROGRESS → COMPLETED / CANCELLED

**Плюсы:**
- Максимальная детализация

**Минусы:**
- Избыточная сложность для текущих требований
- Больше точек отказа

## Принятое решение

**Выбран:** Вариант 2 (Расширенная система с автоматическими переходами)

### Обоснование

Расширенная система обеспечивает:

1. **Четкое разделение этапов:**
   - CREATED: Запись создана, время не наступило
   - AWAITING_CONFIRMATION: Время прошло, ожидает подтверждения мастера
   - COMPLETED: Мастер подтвердил оказание услуги
   - CANCELLED: Запись отменена

2. **Автоматизация:**
   - Автоматический переход CREATED → AWAITING_CONFIRMATION через 1 минуту после start_time
   - Реализация через `get_effective_booking_status()` функцию

3. **Финансовая точность:**
   - Ожидаемые доходы: CREATED + AWAITING_CONFIRMATION
   - Подтвержденные доходы: COMPLETED
   - Отмененные не учитываются

4. **Аудит:**
   - Фиксация причины отмены (`cancellation_reason`)
   - Фиксация инициатора отмены (`cancelled_by_user_id`)

## Последствия

### Положительные

- Точная финансовая отчетность (разделение ожидаемых и подтвержденных доходов)
- Возможность аналитики причин отмены
- Автоматизация рутинных операций
- Аудит всех изменений
- Гибкая логика освобождения слотов

### Отрицательные

- Сложнее логика по сравнению с простой системой
- Необходимость вычисления эффективного статуса в runtime
- Дополнительные поля в БД (`cancelled_by_user_id`, `cancellation_reason`)

### Риски

**Риск:** Автоматический переход может произойти раньше чем нужно

**Митигация:** Переход происходит через 1 минуту после `start_time`, что дает достаточный буфер

**Риск:** Проблемы с timezone при расчете времени перехода

**Митигация:** Все времена хранятся в UTC, конвертация в local timezone только для отображения

## Детали реализации

### Enum статусов

```python
# backend/models.py
class BookingStatus(str, enum.Enum):
    CREATED = "created"                               # Создана
    AWAITING_CONFIRMATION = "awaiting_confirmation"   # На подтверждение
    COMPLETED = "completed"                           # Подтверждена
    CANCELLED = "cancelled"                           # Отменена
    CANCELLED_BY_CLIENT_EARLY = "cancelled_by_client_early"    # Отменена клиентом заранее
    CANCELLED_BY_CLIENT_LATE = "cancelled_by_client_late"      # Отменена клиентом поздно
```

### Модель Booking

```python
class Booking(Base):
    __tablename__ = "bookings"
    
    id = Column(Integer, primary_key=True)
    status = Column(String(16), default=BookingStatus.CREATED.value)
    
    # Информация об отмене
    cancelled_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancellation_reason = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Автоматический переход статусов

```python
# backend/utils/booking_status.py
def get_effective_booking_status(booking: Booking, db: Session) -> BookingStatus:
    """
    Вычисляет актуальный статус записи с учетом времени.
    """
    current_time = datetime.utcnow()
    
    # Если статус CREATED и прошло >1 минуты после start_time
    if booking.status == BookingStatus.CREATED:
        transition_time = booking.start_time + timedelta(minutes=1)
        if current_time >= transition_time:
            booking.status = BookingStatus.AWAITING_CONFIRMATION
            return BookingStatus.AWAITING_CONFIRMATION
    
    return booking.status
```

### Причины отмены

```python
# Допустимые причины отмены
CANCELLATION_REASONS = {
    "client_requested_early": "Клиент попросил отменить заранее",
    "client_requested_late": "Поздняя отмена клиентом",
    "client_no_show": "Клиент не пришел на запись",
    "mutual_agreement": "Обоюдное согласие",
    "master_unavailable": "Мастер не может оказать услугу"
}
```

### Логика освобождения слотов

```python
def free_booking_slots(booking: Booking) -> List[datetime]:
    """
    Освобождает временные слоты при отмене записи.
    
    - Если отмена ДО start_time: освобождаются ВСЕ слоты
    - Если отмена ПОСЛЕ start_time: освобождаются только будущие 10-мин слоты
    """
    current_time = datetime.utcnow()
    
    if current_time < booking.start_time:
        # Отмена до начала - освобождаем все слоты
        return generate_all_slots(booking.start_time, booking.end_time)
    else:
        # Отмена после начала - только будущие слоты
        next_slot = round_up_to_10_minutes(current_time)
        return generate_slots_from(next_slot, booking.end_time)
```

### Финансовая статистика

```python
# Ожидаемые доходы
expected_income = db.query(func.sum(Booking.payment_amount)).filter(
    Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
).scalar()

# Подтвержденные доходы
confirmed_income = db.query(func.sum(Income.total_amount)).join(
    Booking
).filter(
    Booking.status == BookingStatus.COMPLETED
).scalar()
```

### API Endpoints

```python
# Подтверждение записи
@router.post("/confirm-booking/{booking_id}")
async def confirm_booking(booking_id: int):
    # Проверка статуса
    if booking.status != BookingStatus.AWAITING_CONFIRMATION:
        raise HTTPException(400, "Можно подтвердить только записи на подтверждение")
    
    # Установка статуса
    booking.status = BookingStatus.COMPLETED
    
    # Создание подтверждения и дохода
    confirmation = BookingConfirmation(...)
    income = Income(...)
    
    db.commit()

# Отмена записи
@router.post("/cancel-booking/{booking_id}")
async def cancel_booking(
    booking_id: int,
    cancellation_reason: str = Query(..., regex="^(client_requested|client_no_show|...)$")
):
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_by_user_id = current_user.id
    booking.cancellation_reason = cancellation_reason
    
    # Освобождение слотов
    free_booking_slots(booking)
    
    db.commit()
```

### Frontend отображение

```javascript
// Цветовая схема
const statusColors = {
  'created': 'bg-blue-500',                      // Синий
  'awaiting_confirmation': 'bg-orange-500',      // Оранжевый
  'completed': 'bg-green-500',                   // Зеленый
  'cancelled': 'bg-red-500',                     // Красный
  'cancelled_by_client_early': 'bg-purple-500',  // Фиолетовый
  'cancelled_by_client_late': 'bg-pink-500'      // Розовый
};

// Текстовые названия
const statusNames = {
  'created': 'Создана',
  'awaiting_confirmation': 'На подтверждение',
  'completed': 'Подтверждена',
  'cancelled': 'Отменена мастером',
  'cancelled_by_client_early': 'Отменена клиентом заранее',
  'cancelled_by_client_late': 'Отменена клиентом менее чем за 12 часов'
};
```

## Связанные решения

- ADR-0005: Управление временными слотами
- Документация: `docs/BOOKING_STATUSES.md` (детальное описание логики)

## Примечания

**Миграция данных:**
- PENDING → CREATED
- CONFIRMED → COMPLETED
- CANCELLED остается без изменений

**Тестирование:**
- Unit-тесты для `get_effective_booking_status()`
- Integration-тесты для переходов статусов
- E2E тесты для пользовательских сценариев

**Мониторинг:**
- Количество записей по статусам
- Процент отмен по причинам
- Среднее время подтверждения
- Финансовые метрики (ожидаемые vs подтвержденные доходы)

**Обновления:**
- 2024-10-21: Первоначальное решение
- 2024-10-21: Добавлены статусы отмены клиентом (early/late)



