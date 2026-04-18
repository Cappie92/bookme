# План доработок: Объединение функций плана и платных услуг

## 📋 Анализ текущей ситуации

### 1. Уведомления по SMS
**Текущее состояние:**
- В БД есть service_function "Уведомления по SMS" (ID: 2)
- В коде (`backend/sms.py`) есть только функция для отправки SMS-кода верификации при регистрации
- **НЕТ** функционала для отправки SMS-уведомлений о записях клиентам и мастерам
- Это базовая функция верификации, а не платная услуга

**Вывод:** Функция не реализована как платная услуга, должна быть удалена из service_functions типа SUBSCRIPTION.

---

### 2. Интеграция с календарем
**Текущее состояние:**
- В БД есть service_function "Интеграция с календарем" (ID: 5)
- В коде есть только календарь для выбора дат записи (компоненты `PlaceCalendarModal`, `BookingOverviewCalendar`, `MasterScheduleCalendar`)
- **НЕТ** интеграции с Google Calendar или другими внешними календарями
- Календарь для выбора дат - это базовая функция системы

**Вывод:** Функция не реализована, должна быть удалена из service_functions типа SUBSCRIPTION.

---

### 3. Стоп-листы и предоплата
**Текущее состояние:**
- ✅ Полностью реализована функциональность:
  - Модель `ClientRestriction` с типами `blacklist` и `advance_payment_only`
  - Эндпоинты `/api/master/restrictions` и `/api/master/restriction-rules`
  - Компонент `ClientRestrictionsManager` на фронтенде
  - Функция `has_client_restrictions()` в `backend/utils/subscription_features.py`
- ❌ **ПРОБЛЕМА:** Проверка доступа идет через `has_client_restrictions` в `features` плана, а не через `service_functions`
- ❌ **ПРОБЛЕМА:** В БД нет service_function для стоп-листов и предоплаты

**Вывод:** Функция реализована, но не добавлена в service_functions. Нужно:
1. Создать service_function "Стоп-листы и предоплата"
2. Убрать проверку через `has_client_restrictions` из features
3. Добавить проверку через service_functions

---

## 🎯 Цель доработок

Объединить "Функции плана" и "Платные услуги" в одну сущность - все должно быть через `service_functions`.

---

## 📝 План доработок

### Этап 1: Очистка нереализованных функций

#### 1.1. Удалить "Уведомления по SMS" из service_functions
**Файл:** `backend/bookme.db`
- Удалить или изменить тип service_function с ID 2 на `FREE` (так как это базовая функция верификации)

#### 1.2. Удалить "Интеграция с календарем" из service_functions
**Файл:** `backend/bookme.db`
- Удалить service_function с ID 5 (не реализована)

---

### Этап 2: Добавление функции "Стоп-листы и предоплата"

#### 2.1. Создать service_function в БД
**SQL:**
```sql
INSERT INTO service_functions (name, display_name, description, function_type, is_active, display_order)
VALUES (
  'Стоп-листы и предоплата',
  'Стоп-листы и предоплата',
  'Управление стоп-листами клиентов и настройка обязательной предоплаты',
  'SUBSCRIPTION',
  1,
  10
);
```

#### 2.2. Обновить проверку доступа
**Файл:** `backend/utils/subscription_features.py`
- Убрать проверку `has_client_restrictions` из features
- Добавить проверку через service_functions (проверять наличие ID функции в `plan.features.service_functions`)

**Файл:** `backend/routers/master.py`
- Обновить эндпоинты `/api/master/restrictions*` - проверять доступ через service_functions вместо `has_client_restrictions`

**Файл:** `frontend/src/components/ClientRestrictionsManager.jsx`
- Обновить проверку доступа - использовать проверку через service_functions

---

### Этап 3: Объединение "Функций плана" и "Платных услуг"

#### 3.1. Перенести все функции из features в service_functions

**Текущие функции в features:**
1. `can_customize_domain` → "Редактирование названия домена"
2. `can_add_page_modules` → "Модули страницы"
3. `has_finance_access` → "Финансы"
4. `has_extended_stats` → "Расширенная статистика"
5. `has_client_restrictions` → "Стоп-листы и предоплата" (уже создана выше)

**Действия:**
1. Проверить, какие из этих функций уже есть в service_functions
2. Создать недостающие service_functions в БД
3. Обновить существующие планы - перенести функции из `features` в `features.service_functions`

#### 3.2. Обновить форму редактирования планов
**Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`
- Удалить секцию "Функции плана" (жестко закодированные чекбоксы)
- Оставить только секцию "Платные услуги" (динамическая загрузка service_functions)
- Переименовать секцию "Платные услуги" в "Функции тарифа" или просто "Функции"

#### 3.3. Обновить утилиту getPlanFeatures
**Файл:** `frontend/src/utils/subscriptionFeatures.js`
- Убрать жестко закодированные функции из `SUBSCRIPTION_FEATURES_CONFIG`
- Оставить только логику для Free плана ("Ограничение в 30 активных записей")
- Все остальные функции загружать из service_functions

#### 3.4. Обновить проверку доступа на backend
**Файл:** `backend/utils/subscription_features.py`
- Убрать все проверки через features (can_customize_domain, can_add_page_modules, has_finance_access, has_extended_stats, has_client_restrictions)
- Добавить универсальную функцию проверки через service_functions:
  ```python
  def has_service_function(db: Session, user_id: int, service_function_name: str) -> bool:
      """Проверить доступ к service_function по имени"""
      # Получить подписку и план
      # Проверить наличие service_function в plan.features.service_functions
  ```

---

### Этап 4: Миграция данных

#### 4.1. Создать скрипт миграции
**Файл:** `backend/scripts/migrate_features_to_service_functions.py`
- Для каждого плана:
  1. Прочитать `features` (can_customize_domain, can_add_page_modules, etc.)
  2. Найти соответствующие service_functions по имени
  3. Добавить их ID в `features.service_functions`
  4. Удалить старые поля из `features` (или оставить для обратной совместимости на время)

#### 4.2. Обновить существующие планы в БД
- Free: только "Ограничение в 30 активных записей" (не через service_functions)
- Basic: добавить соответствующие service_functions
- Pro: добавить соответствующие service_functions
- Premium: добавить все service_functions

---

### Этап 5: Обновление компонентов

#### 5.1. Обновить компонент MasterTariff
**Файл:** `frontend/src/pages/MasterTariff.jsx`
- Убрать использование `SUBSCRIPTION_FEATURES_CONFIG`
- Использовать только service_functions из плана

#### 5.2. Обновить компонент SubscriptionModal
**Файл:** `frontend/src/components/SubscriptionModal.jsx`
- Убрать использование `SUBSCRIPTION_FEATURES_CONFIG`
- Использовать только service_functions из плана

---

## ⚠️ Важные замечания

1. **Обратная совместимость:** На время миграции можно оставить старые поля в features, но проверять доступ только через service_functions

2. **Free план:** Особенность - всегда показывает "Ограничение в 30 активных записей". Это не service_function, а специальная логика для Free плана.

3. **Миграция данных:** Нужно аккуратно перенести все существующие настройки планов из features в service_functions, чтобы не потерять конфигурацию.

---

## 📊 Итоговый список service_functions (после доработок)

1. ✅ **Редактирование названия домена** (can_customize_domain)
2. ✅ **Модули страницы** (can_add_page_modules)
3. ✅ **Финансы** (has_finance_access)
4. ✅ **Расширенная статистика** (has_extended_stats)
5. ✅ **Стоп-листы и предоплата** (has_client_restrictions) - **НОВАЯ**
6. ✅ **Аналитика и отчеты** (уже есть, ID: 4)
7. ✅ **Персональная страница мастера** (уже есть, ID: 7)
8. ✅ **Управление клиентской базой** (уже есть, ID: 8)

**Удалить:**
- ❌ Уведомления по SMS (ID: 2) - не реализовано
- ❌ Интеграция с календарем (ID: 5) - не реализовано

---

## ✅ Критерии готовности

- [ ] Все функции плана перенесены в service_functions
- [ ] Удалены нереализованные функции (SMS, календарь)
- [ ] Добавлена функция "Стоп-листы и предоплата"
- [ ] Форма редактирования планов показывает только service_functions
- [ ] Проверка доступа идет только через service_functions
- [ ] Миграция данных выполнена для всех планов
- [ ] Free план по-прежнему показывает "Ограничение в 30 активных записей"

---

## 🔄 Порядок выполнения

1. **Этап 1** - Очистка нереализованных функций
2. **Этап 2** - Добавление функции "Стоп-листы и предоплата"
3. **Этап 3** - Объединение функций (backend)
4. **Этап 4** - Миграция данных
5. **Этап 5** - Обновление компонентов (frontend)

