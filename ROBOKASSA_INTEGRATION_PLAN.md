# План интеграции Robokassa

## Обзор

Интеграция платежной системы Robokassa для:
1. **Пополнения баланса** - разовые платежи с пополнением внутреннего баланса
2. **Оплаты подписок** - разовые платежи при покупке подписки
3. **Автопродление подписок** - рекуррентные платежи (безакцептное списание)

---

## Этап 1: Подготовка инфраструктуры

### 1.1. Создание модели Payment

**Файл:** `backend/models.py`

```python
class Payment(Base):
    __tablename__ = "payments"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True, index=True)
    
    # Сумма в рублях
    amount = Column(Float, nullable=False)
    
    # Статус: 'pending', 'paid', 'failed', 'cancelled', 'expired'
    status = Column(String, nullable=False, default='pending', index=True)
    
    # Тип: 'subscription' или 'deposit'
    payment_type = Column(String, nullable=False, index=True)
    
    # Данные Robokassa
    robokassa_invoice_id = Column(String, unique=True, nullable=False, index=True)
    robokassa_payment_id = Column(String, nullable=True, index=True)
    is_recurring = Column(Boolean, default=False, index=True)
    robokassa_recurring_id = Column(String, nullable=True, index=True)
    
    # Данные подписки (если payment_type = 'subscription')
    subscription_period = Column(String, nullable=True)  # 'month' или 'year'
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=True)
    
    # Метаданные для восстановления состояния модального окна
    metadata = Column(JSON, nullable=True)  # calculation_id, upgrade_type, selected_duration, etc.
    
    # Причина ошибки (если status = 'failed')
    error_message = Column(String, nullable=True)
    
    # Временные метки
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    
    # Связи
    user = relationship("User", back_populates="payments")
    subscription = relationship("Subscription")
    plan = relationship("SubscriptionPlan")
    
    __table_args__ = (
        Index('idx_payment_user_status', 'user_id', 'status'),
        Index('idx_payment_robokassa_invoice', 'robokassa_invoice_id'),
    )
```

**Добавить в модель User:**
```python
payments = relationship("Payment", back_populates="user")
```

### 1.2. Миграция балансов с копеек на рубли

**Файл:** `backend/alembic/versions/YYYYMMDD_convert_balance_to_rubles.py`

**Изменения:**
1. `UserBalance.balance`: `Integer` (копейки) → `Float` (рубли)
2. `BalanceTransaction.amount`: `Integer` (копейки) → `Float` (рубли)
3. `BalanceTransaction.balance_before`: `Integer` → `Float`
4. `BalanceTransaction.balance_after`: `Integer` → `Float`
5. `SubscriptionReservation.reserved_kopecks`: `Integer` → `Float` (переименовать в `reserved_amount`)

**Логика миграции:**
- Конвертировать все существующие значения: `рубли = копейки / 100.0`
- Обновить все функции в `utils/balance_utils.py` для работы с рублями

### 1.3. Обновление утилит баланса

**Файл:** `backend/utils/balance_utils.py`

**Изменения:**
- Удалить функции `rubles_to_kopecks()` и `kopecks_to_rubles()`
- Все функции теперь работают напрямую с рублями (Float)
- Обновить все вызовы этих функций в коде

---

## Этап 2: Утилиты для работы с Robokassa

### 2.1. Создание модуля Robokassa

**Файл:** `backend/utils/robokassa.py`

**Функции:**
1. `generate_invoice_id(user_id: int) -> str` - генерация InvoiceID в формате `INV-{timestamp}-{user_id}`
2. `generate_signature(merchant_login: str, amount: float, invoice_id: str, password: str) -> str` - генерация MD5 подписи
3. `verify_signature(amount: float, invoice_id: str, signature: str, password: str) -> bool` - проверка подписи
4. `generate_payment_url(merchant_login: str, amount: float, invoice_id: str, description: str, password_1: str, is_test: bool = False, **kwargs) -> str` - генерация URL для оплаты
5. `get_robokassa_config() -> dict` - получение конфигурации из переменных окружения

**Переменные окружения (.env):**
```
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login
ROBOKASSA_PASSWORD_1=your_password_1
ROBOKASSA_PASSWORD_2=your_password_2
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=https://api.dedato.com/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=https://app.dedato.com/payment/success
ROBOKASSA_FAIL_URL=https://app.dedato.com/payment/failed
```

---

## Этап 3: Backend эндпоинты

### 3.1. Инициализация платежа для подписки

**Файл:** `backend/routers/payments.py` (новый файл)

**Эндпоинт:** `POST /api/payments/subscription/init`

**Логика:**
1. Получить расчет стоимости подписки (использовать существующий расчет)
2. Создать запись Payment со статусом 'pending'
3. Сгенерировать InvoiceID
4. Сформировать URL для оплаты через Robokassa
5. Вернуть URL и payment_id

**Схема запроса:**
```python
class SubscriptionPaymentInitRequest(BaseModel):
    plan_id: int
    duration_months: int  # 1, 3, 6, 12
    payment_period: str  # 'month' или 'year'
    upgrade_type: Optional[str] = 'immediate'  # 'immediate' или 'after_expiry'
    calculation_id: Optional[int] = None
    enable_auto_renewal: bool = False
```

**Схема ответа:**
```python
class PaymentInitResponse(BaseModel):
    payment_id: int
    payment_url: str
    invoice_id: str
```

### 3.2. Инициализация платежа для пополнения баланса

**Эндпоинт:** `POST /api/payments/deposit/init`

**Логика:**
1. Создать запись Payment (payment_type='deposit')
2. Сгенерировать InvoiceID
3. Сформировать URL для оплаты
4. Вернуть URL

### 3.3. Обработка уведомлений от Robokassa (ResultURL)

**Эндпоинт:** `POST /api/payments/robokassa/result`

**Логика:**
1. Получить данные из POST запроса
2. Проверить подпись (password_2)
3. Найти Payment по robokassa_invoice_id
4. Обновить статус на 'paid'
5. Если payment_type='subscription' - пополнить баланс и создать подписку (но не активировать)
6. Если payment_type='deposit' - пополнить баланс
7. Если is_recurring=True и это первая оплата - зарегистрировать рекуррентный платеж
8. Вернуть `OK{invoice_id}`

**Важно:** 
- Эндпоинт должен быть доступен без аутентификации (только проверка подписи)
- Логировать все запросы
- Обрабатывать дубликаты (идемпотентность)

### 3.4. Просмотр статусов платежей

**Эндпоинт:** `GET /api/payments/status`

**Логика:**
- Админ видит все платежи
- Мастер видит только свои платежи
- Фильтрация по статусу, типу, дате

### 3.5. Активация подписки после оплаты

**Эндпоинт:** `POST /api/subscriptions/{subscription_id}/activate`

**Логика:**
1. Проверить, что платеж оплачен
2. Активировать подписку
3. Создать резерв для ежедневных списаний

---

## Этап 4: Frontend интеграция

### 4.1. Страница успеха оплаты

**Файл:** `frontend/src/pages/PaymentSuccess.jsx`

**Содержимое:**
- Логотип
- Текст "Оплата прошла успешно, сейчас вы будете перенаправлены"
- Кнопка "Личный кабинет"
- Автоматический редирект через 10 секунд в `/master/tariff`

**Роут:** `/payment/success?payment_id={id}`

### 4.2. Страница ошибки оплаты

**Файл:** `frontend/src/pages/PaymentFailed.jsx`

**Содержимое:**
- Аналог страницы 404
- Текст "Что-то пошло не так во время оплаты, повторите попытку"
- GIF с логотипом (как на 404)
- Кнопка "Личный кабинет"
- Автоматический редирект через 10 секунд
- При редиректе открывать модальное окно подписки с сохраненным состоянием

**Роут:** `/payment/failed?payment_id={id}`

**Логика восстановления состояния:**
1. При инициализации платежа сохранять в localStorage: `payment_state_{payment_id}`
2. При открытии страницы ошибки читать из localStorage
3. При редиректе в ЛК восстанавливать состояние модального окна

### 4.3. Обновление SubscriptionModal

**Файл:** `frontend/src/components/SubscriptionModal.jsx`

**Изменения:**
1. Заменить заглушку на реальный вызов API `/api/payments/subscription/init`
2. При получении payment_url - открыть в новом окне или редирект
3. Сохранить состояние в localStorage перед переходом к оплате
4. Добавить индикацию тестового режима (если `ROBOKASSA_IS_TEST=true`)

### 4.4. Индикация тестового режима

**Места:**
1. В шапке сайта (если тестовый режим)
2. В модальном окне оплаты

**Стиль:** Красный текст "ТЕСТОВЫЙ РЕЖИМ"

---

## Этап 5: Рекуррентные платежи

### 5.1. Регистрация рекуррентного платежа

**Логика:**
1. После успешной первой оплаты подписки с `enable_auto_renewal=True`
2. Зарегистрировать рекуррентный платеж через API Robokassa
3. Сохранить `robokassa_recurring_id` в Payment
4. Создать запись в отдельной таблице `RecurringPayment` (опционально) или использовать поле в Payment

### 5.2. Обработка рекуррентных платежей

**Логика:**
1. Robokassa автоматически списывает средства
2. Отправляет уведомление на ResultURL
3. Обрабатываем как обычный платеж, но с флагом `is_recurring=True`
4. Автоматически продлеваем подписку

---

## Этап 6: Обновление существующей логики

### 6.1. Обновление `/api/subscriptions/upgrade`

**Изменения:**
- Убрать прямую оплату через баланс
- Вместо этого создавать Payment и возвращать URL для оплаты
- Подписка создается только после успешной оплаты

### 6.2. Обновление `/api/balance/deposit`

**Изменения:**
- Добавить возможность пополнения через Robokassa
- Создавать Payment и возвращать URL

---

## Этап 7: Тестирование

### 7.1. Тестовый режим Robokassa

**Настройки:**
- Использовать тестовые данные Robokassa
- Тестовые суммы и карты
- Проверка всех сценариев

### 7.2. Проверка сценариев

1. Успешная оплата подписки
2. Успешное пополнение баланса
3. Отмена оплаты
4. Ошибка оплаты
5. Рекуррентный платеж
6. Дубликаты уведомлений
7. Активация подписки после оплаты

---

## Порядок реализации

1. ✅ Создать модель Payment
2. ✅ Создать миграцию балансов
3. ✅ Создать утилиты Robokassa
4. ✅ Создать эндпоинты для инициализации платежей
5. ✅ Создать ResultURL эндпоинт
6. ✅ Создать страницы успеха/ошибки
7. ✅ Интегрировать в SubscriptionModal
8. ✅ Реализовать рекуррентные платежи
9. ✅ Добавить индикацию тестового режима
10. ✅ Обновить существующую логику
11. ✅ Тестирование

---

## Вопросы для уточнения

1. Нужна ли отдельная таблица для рекуррентных платежей или достаточно поля в Payment?
2. Как обрабатывать случай, когда пользователь оплатил, но не активировал подписку (истек срок)?
3. Нужна ли страница со списком всех платежей пользователя в ЛК?

