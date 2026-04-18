# Чеклист деплоя: Динамическое управление платными функциями

## ✅ Преддеплойная проверка

### Backend
- [x] Модели обновлены (display_name, display_order)
- [x] Миграция создана
- [x] Схемы Pydantic обновлены
- [x] Роутеры обновлены
- [x] Валидация service_functions добавлена
- [x] Автоматическое отключение функций реализовано
- [x] Эндпоинты возвращают display_name

### Frontend
- [x] Форма редактирования планов обновлена
- [x] Выбор service_functions добавлен
- [x] Утилита getPlanFeatures обновлена
- [x] Компонент MasterTariff обновлен
- [x] Утилита subscriptionPlanNames создана
- [x] Все места использования названий обновлены

### Ранее внесенные исправления
- [x] Исправление 404 на /api/subscriptions/freeze
- [x] Исправление has_extended_stats для Pro плана
- [x] Исправление проверки подписки в дашборде
- [x] Добавление features и limits в SubscriptionOut

---

## 🚀 Шаги деплоя

### 1. Backup базы данных
```bash
cp backend/bookme.db backend/bookme.db.backup_$(date +%Y%m%d_%H%M%S)
```

### 2. Применение миграции
```bash
cd backend
python3 -m alembic upgrade head
```

### 3. Проверка миграции
```bash
sqlite3 backend/bookme.db "PRAGMA table_info(subscription_plans);" | grep display_name
sqlite3 backend/bookme.db "PRAGMA table_info(service_functions);" | grep -E "display_name|display_order"
```

### 4. Проверка данных
```bash
# Проверка планов
sqlite3 backend/bookme.db "SELECT id, name, display_name FROM subscription_plans;"

# Проверка service_functions
sqlite3 backend/bookme.db "SELECT id, name, display_name, display_order FROM service_functions WHERE function_type = 'SUBSCRIPTION';"
```

### 5. Перезапуск Backend
```bash
# Если используется systemd или другой менеджер процессов
sudo systemctl restart bookme-backend

# Или если запущен вручную - перезапустить процесс
```

### 6. Перезапуск Frontend
```bash
cd frontend
npm run build
# Или для разработки: npm run dev
```

### 7. Очистка кэша браузера
- Открыть DevTools (F12)
- Правый клик на кнопке обновления
- Выбрать "Очистить кэш и жесткая перезагрузка"

---

## 🧪 Тестирование после деплоя

### Тест 1: Админка - Создание плана
1. Войти как администратор
2. Открыть `/admin/functions` → вкладка "Планы подписки"
3. Нажать "Создать план"
4. Заполнить форму:
   - Название: "Test Plan"
   - Отображаемое название: "Тестовый план"
   - Выбрать несколько service_functions
5. Сохранить
6. ✅ Проверить, что план создан с выбранными service_functions

### Тест 2: Админка - Редактирование плана
1. Открыть существующий план (например, Pro)
2. Изменить отображаемое название
3. Добавить/удалить service_functions
4. Сохранить
5. ✅ Проверить, что изменения сохранились

### Тест 3: Страница "Мой тариф"
1. Войти как мастер с подпиской Pro
2. Открыть `/master/tariff`
3. ✅ Проверить отображение всех service_functions с отметками ✅/❌
4. ✅ Проверить правильный порядок (сначала входящие, потом не входящие)
5. ✅ Проверить отображаемое название плана

### Тест 4: Free план
1. Войти как мастер с Free планом
2. Открыть `/master/tariff`
3. ✅ Проверить, что всегда показывается "Ограничение в 30 активных записей"
4. ✅ Проверить, что остальные service_functions показываются с ❌

### Тест 5: Названия планов
1. Проверить страницу выбора тарифа - используются display_name
2. Проверить дашборд мастера - используется display_name
3. Проверить все места, где отображаются названия планов

### Тест 6: API эндпоинты
```bash
# Проверка возврата display_name
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/subscriptions/my | jq '.plan_display_name'
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/balance/subscription-status | jq '.plan_display_name'
```

---

## 📊 Итоговый список измененных файлов

### Backend
1. `backend/models.py` - добавлены поля display_name и display_order
2. `backend/schemas.py` - обновлены схемы
3. `backend/alembic/versions/20250128_add_display_fields_to_plans_and_functions.py` - миграция
4. `backend/routers/subscription_plans.py` - валидация и автоматическое отключение
5. `backend/routers/service_functions.py` - обновлена сортировка
6. `backend/routers/subscriptions.py` - добавлен plan_display_name
7. `backend/routers/balance.py` - добавлен plan_display_name
8. `backend/routers/master.py` - добавлен plan_display_name
9. `backend/utils/balance_utils.py` - добавлен plan_display_name

### Frontend
1. `frontend/src/components/SubscriptionPlanForm.jsx` - форма с display_name и service_functions
2. `frontend/src/pages/MasterTariff.jsx` - загрузка и отображение service_functions
3. `frontend/src/utils/subscriptionPlanNames.js` - новая утилита
4. `frontend/src/utils/subscriptionFeatures.js` - обновлена для работы с service_functions
5. `frontend/src/components/SubscriptionModal.jsx` - использование getPlanDisplayName
6. `frontend/src/components/MasterDashboardStats.jsx` - использование getPlanDisplayName
7. `frontend/src/pages/MasterDashboard.jsx` - использование plan_display_name
8. `frontend/src/pages/MasterSubscriptionPlans.jsx` - использование getPlanDisplayName

---

## ✅ Готово к деплою!

Все изменения реализованы и протестированы. Документация сохранена в `DEPLOYMENT_PLAN.md`.
