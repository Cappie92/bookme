# План доработок: Динамическое управление платными функциями в тарифах

## 📋 Общая информация

**Цель:** Сделать систему, где администратор может самостоятельно наполнять каждый план подписки платными услугами (service_functions), и это отображается у мастера на странице "Мой тариф" с зелеными галочками (входит) и красными крестиками (не входит).

**Особенности:**
- У тарифа Free всегда отображается "Ограничение в 30 активных записей"
- Названия тарифных планов должны быть централизованы и редактируемы в админке

---

## ✅ Принятые решения

### 1. Хранение связи между планами и service_functions
**Решение:** В JSON поле `features` плана как массив ID: `features: { "service_functions": [2, 4, 5, 7, 8] }`

### 2. Какие service_functions показывать для выбора
**Решение:** Только с типом `SUBSCRIPTION` (исключая `FREE` и `VOLUME_BASED`)

### 3. Отображение на странице "Мой тариф"
**Решение:** Показывать ВСЕ service_functions с типом SUBSCRIPTION, для каждой отметка входит/не входит

### 4. Названия тарифных планов
**Решение:** Добавить поле `display_name` в модель `SubscriptionPlan` (для отображения) и оставить `name` как техническое

### 5. Порядок отображения service_functions
**Решение:** Сначала входящие в план (с галочкой), потом не входящие (с крестиком), внутри каждой группы - по `display_order`

### 6. Дополнительные поля для ServiceFunction
**Решение:** 
- Добавить поле `display_name` в модель `ServiceFunction` для кастомных названий
- Добавить поле `display_order` в модель `ServiceFunction` для управления порядком отображения
- При удалении service_function из плана автоматически отключать эти функции для мастеров

---

## 📝 Предварительный план доработок

### Этап 1: Backend - Модель и хранение данных

#### 1.1. Добавить поле `display_name` в модель SubscriptionPlan
**Файл:** `backend/models.py`
- Добавить поле `display_name = Column(String, nullable=True)` в модель `SubscriptionPlan` (после строки 1759)
- Если `display_name` пустое, использовать `name` как fallback

#### 1.2. Добавить поля `display_name` и `display_order` в модель ServiceFunction
**Файл:** `backend/models.py`
- Добавить поле `display_name = Column(String, nullable=True)` в модель `ServiceFunction` (после строки 1800)
- Добавить поле `display_order = Column(Integer, default=0)` в модель `ServiceFunction` (после строки 1803)
- Если `display_name` пустое, использовать `name` как fallback

#### 1.3. Создать миграцию для добавления полей
**Файл:** `backend/alembic/versions/XXXX_add_display_fields_to_plans_and_functions.py`
- Добавить колонку `display_name` в таблицу `subscription_plans`
- Заполнить существующие планы: `display_name = name` (Free, Basic, Pro, Premium)
- Добавить колонку `display_name` в таблицу `service_functions`
- Добавить колонку `display_order` в таблицу `service_functions`
- Заполнить существующие service_functions: `display_name = name`, `display_order = id`

#### 1.4. Обновить схемы
**Файл:** `backend/schemas.py`
- Добавить `display_name: Optional[str]` в `SubscriptionPlanCreate`, `SubscriptionPlanUpdate`, `SubscriptionPlanOut`
- Добавить `display_name: Optional[str]` в `ServiceFunctionCreate`, `ServiceFunctionUpdate`, `ServiceFunctionOut`
- Добавить `display_order: Optional[int]` в `ServiceFunctionCreate`, `ServiceFunctionUpdate`, `ServiceFunctionOut`

---

### Этап 2: Backend - API для работы с service_functions в планах

#### 2.1. Обновить логику сохранения плана
**Файл:** `backend/routers/subscription_plans.py`
- При создании/обновлении плана сохранять массив ID service_functions в `features.service_functions`
- Валидация: проверять, что все ID существуют, активны и имеют тип `SUBSCRIPTION`
- При обновлении плана:
  1. Получить старый список service_functions из БД (если план существует)
  2. Сравнить старый и новый списки
  3. Найти удаленные функции (были в старом, нет в новом)
  4. Вызвать функцию автоматического отключения для удаленных функций

#### 2.2. Добавить функцию для автоматического отключения функций
**Файл:** `backend/utils/subscription_features.py` (добавить в существующий)
- Функция `disable_service_functions_for_plan(db: Session, plan_id: int, removed_function_ids: List[int])`
- При изменении плана проверять, какие функции были удалены
- Логика: 
  - Найти все активные подписки на этот план
  - Для каждой подписки обновить `features` (если там есть кэшированные данные)
  - В реальности функции автоматически станут недоступны при следующей проверке через план
  - Можно добавить логирование для отслеживания изменений
- **Примечание:** Так как проверка доступа идет через `plan.features.service_functions`, удаление функции из плана автоматически делает её недоступной. Явное обновление подписок не требуется, но можно добавить для логирования.

#### 2.3. Обновить эндпоинт получения service_functions
**Файл:** `backend/routers/service_functions.py`
- Обновить эндпоинт `/api/admin/service-functions` для возврата `display_name` и `display_order`
- Сортировка по `display_order`, затем по `id`

---

### Этап 3: Frontend - Форма редактирования планов

#### 3.1. Добавить поле `display_name` в форму
**Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`
- Добавить поле ввода для `display_name`
- Добавить в начальное состояние и в `useEffect` при загрузке плана

#### 3.2. Добавить выбор service_functions
**Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`
- Добавить состояние `const [serviceFunctions, setServiceFunctions] = useState([])`
- Добавить загрузку списка service_functions (тип SUBSCRIPTION, активные) при монтировании компонента
- Сортировать по `display_order`, затем по `id`
- Добавить секцию "Платные услуги" с чекбоксами для каждой service_function
- Сохранять выбранные ID в `features.service_functions` как массив
- Использовать `display_name || name` для отображения названия

**Структура:**
```jsx
<div className="border-t pt-4">
  <h4 className="text-md font-semibold mb-3">Платные услуги</h4>
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
    <p className="text-xs text-blue-800">
      <strong>💡 Важно:</strong> Выберите услуги, которые будут входить в этот тарифный план.
      При удалении услуги из плана она автоматически отключится для всех мастеров с этим планом.
    </p>
  </div>
  <div className="space-y-3">
    {serviceFunctions.map(func => (
      <div key={func.id} className="flex items-start">
        <input
          type="checkbox"
          checked={formData.features.service_functions?.includes(func.id) || false}
          onChange={(e) => {
            const currentIds = formData.features.service_functions || []
            const newIds = e.target.checked
              ? [...currentIds, func.id]
              : currentIds.filter(id => id !== func.id)
            setFormData(prev => ({
              ...prev,
              features: {
                ...prev.features,
                service_functions: newIds
              }
            }))
          }}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
        />
        <div className="ml-2 flex-1">
          <label className="block text-sm text-gray-700">
            {func.display_name || func.name}
          </label>
          {func.description && (
            <span className="text-xs text-gray-500 block mt-1">{func.description}</span>
          )}
        </div>
      </div>
    ))}
  </div>
</div>
```

---

### Этап 4: Frontend - Отображение на странице "Мой тариф"

#### 4.1. Обновить утилиту getPlanFeatures
**Файл:** `frontend/src/utils/subscriptionFeatures.js`
- Обновить функцию `getPlanFeatures(plan, serviceFunctions)` - добавить параметр `serviceFunctions`
- Для каждой service_function проверять, есть ли её ID в `plan.features.service_functions`
- Использовать `display_name || name` для отображения
- Сортировка: сначала входящие в план (available: true), потом не входящие (available: false)
- Внутри каждой группы сортировать по `display_order`, затем по `id`

**Логика:**
```javascript
export function getPlanFeatures(plan, serviceFunctions = []) {
  if (!plan) return []
  
  const planServiceFunctionIds = plan.features?.service_functions || []
  
  // Создаем массив функций с отметками входит/не входит
  const features = serviceFunctions.map(func => ({
    available: planServiceFunctionIds.includes(func.id),
    text: func.display_name || func.name,
    description: func.description,
    display_order: func.display_order || 0,
    id: func.id
  }))
  
  // Сортируем: сначала входящие, потом не входящие
  const availableFeatures = features.filter(f => f.available)
    .sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id))
  const unavailableFeatures = features.filter(f => !f.available)
    .sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id))
  
  return [...availableFeatures, ...unavailableFeatures]
}
```

#### 4.1.1. Добавить загрузку service_functions в компонент MasterTariff
**Файл:** `frontend/src/pages/MasterTariff.jsx`
- Добавить состояние `const [serviceFunctions, setServiceFunctions] = useState([])`
- Добавить функцию загрузки service_functions при монтировании компонента
- Фильтровать по типу `SUBSCRIPTION` и `is_active = true`

#### 4.2. Обновить компонент MasterTariff
**Файл:** `frontend/src/pages/MasterTariff.jsx`
- Передавать `serviceFunctions` в `getPlanFeatures(planData, serviceFunctions)`
- Отображать с зелеными галочками (✅) для входящих и красными крестиками (❌) для не входящих

**Особенность для Free:**
- Всегда показывать "Ограничение в 30 активных записей" как доступную функцию (первой в списке)
- Остальные service_functions показывать с крестиками (не входят)
- Использовать существующую логику для Free плана из `SUBSCRIPTION_FEATURES_CONFIG`

---

### Этап 5: Frontend - Централизация названий планов

#### 5.1. Создать утилиту для получения названия плана
**Файл:** `frontend/src/utils/subscriptionPlanNames.js` (новый)
- Функция `getPlanDisplayName(plan)` - возвращает `plan.display_name || plan.name`
- Заменить все использования `plan.name` на `getPlanDisplayName(plan)`

#### 5.2. Обновить все места использования названий планов
**Файлы для обновления:**
- `frontend/src/pages/MasterTariff.jsx` - функция `getPlanName()`
- `frontend/src/components/SubscriptionModal.jsx` - функция `getPlanName()`
- `frontend/src/pages/MasterDashboard.jsx` - отображение названия плана
- `frontend/src/components/MasterDashboardStats.jsx` - функция `getPlanNameInRussian()`
- `frontend/src/pages/MasterSubscriptionPlans.jsx` - отображение названий
- Другие места (найти через grep)

**Стратегия:**
- Заменить все хардкодные маппинги названий на использование `display_name`
- Если `display_name` пустое, использовать `name` как fallback

---

### Этап 6: Backend - Обновление эндпоинтов для возврата display_name

#### 6.1. Обновить эндпоинты подписок
**Файлы:**
- `backend/routers/subscriptions.py` - эндпоинт `/api/subscriptions/my`
- `backend/routers/balance.py` - эндпоинт `/api/balance/subscription-status`
- `backend/routers/master.py` - эндпоинт `/api/master/dashboard/stats`

**Действия:**
- При возврате информации о подписке включать `plan.display_name`
- Обновить схемы ответов для включения `display_name`

---

## 📊 Порядок выполнения

1. **Этап 1** - Backend: Модель и миграция для `display_name` и `display_order`
2. **Этап 2** - Backend: API для работы с service_functions и автоматическое отключение
3. **Этап 3** - Frontend: Форма редактирования планов с выбором service_functions
4. **Этап 4** - Frontend: Отображение service_functions на странице "Мой тариф"
5. **Этап 5** - Frontend: Централизация названий планов
6. **Этап 6** - Backend: Обновление эндпоинтов для возврата display_name

---

## ⚠️ Важные замечания

1. **Обратная совместимость:** При отсутствии `display_name` использовать `name` (для планов и service_functions)
2. **Миграция данных:** 
   - Существующие планы должны получить `display_name = name`
   - Существующие service_functions должны получить `display_name = name`, `display_order = id`
3. **Валидация:** При сохранении плана проверять, что все service_function IDs существуют, активны и имеют тип SUBSCRIPTION
4. **Производительность:** Кэшировать список service_functions на фронтенде
5. **Free план:** Всегда показывать "Ограничение в 30 активных записей" независимо от выбранных функций
6. **Автоматическое отключение:** При удалении service_function из плана автоматически отключать её для всех мастеров с этим планом
7. **Сортировка:** Service_functions сортируются по `display_order`, затем по `id`; при отображении - сначала входящие, потом не входящие

---

## 🔄 Откат изменений

В случае проблем:
1. Восстановить предыдущую версию файлов из git
2. Откатить миграцию БД (если была применена)
3. Очистить кэш браузера

---

## ✅ Критерии готовности

- [ ] В админке можно редактировать `display_name` плана
- [ ] В админке можно редактировать `display_name` и `display_order` service_functions
- [ ] В админке можно выбирать service_functions для каждого плана (только тип SUBSCRIPTION)
- [ ] На странице "Мой тариф" отображаются все service_functions с отметками входит/не входит
- [ ] Service_functions отображаются в правильном порядке: сначала входящие, потом не входящие
- [ ] Для Free плана всегда показывается "Ограничение в 30 активных записей"
- [ ] Названия планов централизованы и используются везде `display_name`
- [ ] Названия service_functions используют `display_name || name`
- [ ] Все эндпоинты возвращают `display_name` в ответах
- [ ] При удалении service_function из плана автоматически отключается для всех мастеров
- [ ] Обратная совместимость: если `display_name` пустое, используется `name`
- [ ] Миграция данных выполнена для всех существующих записей

