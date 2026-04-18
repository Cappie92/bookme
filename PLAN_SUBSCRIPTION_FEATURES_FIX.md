# План доработок: Добавление платных функций в настройку тарифов

## 📋 Общая информация

**Проблема:** В админке при настройке тарифов не отображаются все платные функции, которые должны входить в подписку.

**Требуемые функции:**
1. ✅ Редактирование названия домена (`can_customize_domain`) - уже есть
2. ✅ Расширенная статистика (`has_extended_stats`) - уже есть
3. ✅ Финансы (`has_finance_access`) - уже есть
4. ❌ Лояльность (`has_loyalty_access`) - отсутствует
5. ❌ Предоплата и стоп-листы (`has_client_restrictions`) - есть в коде, но нет в форме и БД

---

## 🔍 Анализ текущего состояния

### Backend
- ✅ `backend/utils/subscription_features.py` - есть функция `has_client_restrictions()` (строки 206-210)
- ✅ `backend/utils/subscription_features.py` - функция `get_master_features()` возвращает `has_client_restrictions` (строки 130, 143, 157, 170)
- ❌ Нет функции для проверки доступа к лояльности
- ❌ В БД в `features` планов отсутствует `has_client_restrictions`
- ❌ В БД в `features` планов отсутствует `has_loyalty_access`

### Frontend
- ❌ `frontend/src/components/SubscriptionPlanForm.jsx` - не отображает `has_client_restrictions`
- ❌ `frontend/src/components/SubscriptionPlanForm.jsx` - не отображает `has_loyalty_access`
- ❌ `frontend/src/utils/subscriptionFeatures.js` - нет функций для лояльности и ограничений клиентов

---

## 📝 План доработок

### Этап 1: Backend - Добавление функции лояльности

#### 1.1. Добавить функцию проверки доступа к лояльности
**Файл:** `backend/utils/subscription_features.py`

**Действия:**
- Добавить функцию `has_loyalty_access(db: Session, user_id: int) -> bool` (аналогично `has_client_restrictions`)
- Добавить `has_loyalty_access` в функцию `get_master_features()` для всех случаев (is_always_free, обычные пользователи, без подписки)

**Строки для изменения:**
- После строки 210 (после функции `has_client_restrictions`)
- Строки 130, 143, 157, 170 (в `get_master_features()`)

**Ожидаемый результат:**
```python
def has_loyalty_access(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к функции лояльности.
    """
    return check_feature_access(db, user_id, "has_loyalty_access", SubscriptionType.MASTER)
```

---

### Этап 2: Backend - Обновление существующих планов в БД

#### 2.1. Создать скрипт для обновления features планов
**Файл:** `backend/scripts/update_subscription_plans_features.py` (новый файл)

**Действия:**
- Добавить `has_client_restrictions: false` во все планы (Free, Basic)
- Добавить `has_client_restrictions: true` в планы Pro и Premium
- Добавить `has_loyalty_access: false` во все планы (Free, Basic)
- Добавить `has_loyalty_access: true` в планы Pro и Premium (или по необходимости)

**Логика:**
- Free: `has_client_restrictions: false`, `has_loyalty_access: false`
- Basic: `has_client_restrictions: false`, `has_loyalty_access: false` (или `true` - уточнить)
- Pro: `has_client_restrictions: true`, `has_loyalty_access: true`
- Premium: `has_client_restrictions: true`, `has_loyalty_access: true`

**Ожидаемый результат:**
Скрипт обновит JSON поле `features` для всех планов, добавив недостающие ключи.

---

### Этап 3: Frontend - Обновление формы редактирования планов

#### 3.1. Добавить поля в начальное состояние формы
**Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`

**Действия:**
- В начальном состоянии `formData.features` (строка 16-23) добавить:
  - `has_client_restrictions: false`
  - `has_loyalty_access: false`
- В `useEffect` при загрузке существующего плана (строка 42-49) добавить дефолтные значения:
  - `has_client_restrictions: plan.features?.has_client_restrictions || false`
  - `has_loyalty_access: plan.features?.has_loyalty_access || false`

**Строки для изменения:**
- Строки 16-23 (начальное состояние)
- Строки 42-49 (загрузка существующего плана)

---

#### 3.2. Добавить чекбоксы в форму
**Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`

**Действия:**
- После строки 338 (после чекбокса `has_extended_stats`) добавить два новых чекбокса:
  1. `has_client_restrictions` - "Предоплата и стоп-листы"
  2. `has_loyalty_access` - "Программа лояльности"

**Структура чекбокса (пример):**
```jsx
<div className="flex items-center">
  <input
    type="checkbox"
    name="features.has_client_restrictions"
    checked={formData.features.has_client_restrictions}
    onChange={handleChange}
    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
  />
  <label className="ml-2 block text-sm text-gray-700">
    Предоплата и стоп-листы (has_client_restrictions)
  </label>
  <span className="ml-2 text-xs text-gray-500">✅ Отображается как "предоплата и стоп-листы"</span>
</div>
```

**Строки для изменения:**
- После строки 338 (в секции "Функции плана")

---

### Этап 4: Frontend - Обновление утилиты отображения функций

#### 4.1. Добавить функции в конфигурацию
**Файл:** `frontend/src/utils/subscriptionFeatures.js`

**Действия:**
- В массив `SUBSCRIPTION_FEATURES_CONFIG` (после строки 57) добавить два новых объекта:
  1. `client_restrictions` - "предоплата и стоп-листы"
  2. `loyalty_access` - "программа лояльности"

**Структура (пример):**
```javascript
{
  key: 'client_restrictions',
  label: 'предоплата и стоп-листы',
  checkFunction: (plan) => ({
    available: plan.features?.has_client_restrictions === true,
    text: 'предоплата и стоп-листы'
  })
},
{
  key: 'loyalty_access',
  label: 'программа лояльности',
  checkFunction: (plan) => ({
    available: plan.features?.has_loyalty_access === true,
    text: 'программа лояльности'
  })
}
```

**Строки для изменения:**
- После строки 57 (в массив `SUBSCRIPTION_FEATURES_CONFIG`)

---

### Этап 5: Проверка и тестирование

#### 5.1. Проверка Backend
- [ ] Убедиться, что функция `has_loyalty_access()` работает корректно
- [ ] Проверить, что `get_master_features()` возвращает все функции
- [ ] Запустить скрипт обновления планов и проверить БД

#### 5.2. Проверка Frontend
- [ ] Открыть форму редактирования плана в админке
- [ ] Убедиться, что отображаются все 5 функций:
  - Редактирование названия домена
  - Расширенная статистика
  - Финансы
  - Лояльность
  - Предоплата и стоп-листы
- [ ] Создать новый план и проверить сохранение
- [ ] Отредактировать существующий план и проверить сохранение
- [ ] Проверить отображение функций на странице "Мой тариф"

#### 5.3. Проверка интеграции
- [ ] Проверить, что функции корректно отображаются в карточках тарифов
- [ ] Проверить, что функции корректно отображаются на странице "Мой тариф"
- [ ] Проверить работу проверки доступа в backend для новых функций

---

## 📊 Порядок выполнения

1. **Этап 1** - Backend: Добавление функции лояльности
2. **Этап 2** - Backend: Обновление планов в БД
3. **Этап 3** - Frontend: Обновление формы редактирования
4. **Этап 4** - Frontend: Обновление утилиты отображения
5. **Этап 5** - Тестирование

---

## ⚠️ Важные замечания

1. **Обратная совместимость:** При обновлении существующих планов нужно сохранить все существующие значения features
2. **Дефолтные значения:** Если в плане нет новой функции, она должна считаться `false`
3. **Порядок отображения:** Функции должны отображаться в логическом порядке (сначала базовые, потом расширенные)
4. **Валидация:** При сохранении плана нужно убедиться, что все поля features корректны

---

## 🔄 Откат изменений

В случае проблем можно откатить изменения:
1. Восстановить предыдущую версию файлов из git
2. Запустить миграцию для восстановления features планов (если нужно)
3. Очистить кэш браузера на фронтенде

---

## 📝 Дополнительные вопросы для уточнения

1. **Лояльность:** В каких планах должна быть доступна лояльность? (Free/Basic/Pro/Premium)
2. **Предоплата и стоп-листы:** В каких планах должна быть доступна? (сейчас только Pro и Premium)
3. **Порядок функций:** В каком порядке должны отображаться функции в форме и на странице тарифа?

---

## ✅ Критерии готовности

- [ ] Все 5 функций отображаются в форме редактирования плана
- [ ] Все функции сохраняются в БД корректно
- [ ] Функции отображаются на странице "Мой тариф"
- [ ] Функции отображаются в карточках тарифов
- [ ] Проверка доступа работает для всех функций
- [ ] Существующие планы обновлены с новыми функциями

