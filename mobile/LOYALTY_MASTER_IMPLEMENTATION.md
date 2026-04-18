# Реализация системы лояльности для мастера в мобильном приложении

## Созданные/изменённые файлы

### Backend
1. **`backend/routers/client_loyalty.py`** (изменён)
   - Добавлен endpoint `GET /api/client/loyalty/master/{master_id}/loyalty-settings` для получения публичных настроек лояльности мастера (read-only для клиентов)

### Mobile - API
2. **`mobile/src/services/api/master.ts`** (изменён)
   - Добавлены типы: `LoyaltySettings`, `LoyaltySettingsUpdate`, `LoyaltyStats`, `LoyaltyTransaction`, `LoyaltyHistoryFilters`
   - Добавлены функции:
     - `getLoyaltySettings()` - GET /api/master/loyalty/settings
     - `updateLoyaltySettings()` - PUT /api/master/loyalty/settings
     - `getLoyaltyStats()` - GET /api/master/loyalty/stats
     - `getLoyaltyHistory()` - GET /api/master/loyalty/history

3. **`mobile/src/services/api/loyalty.ts`** (изменён)
   - Добавлен тип `MasterLoyaltySettingsPublic`
   - Добавлена функция `getMasterLoyaltySettingsPublic()` - GET /api/client/loyalty/master/{master_id}/loyalty-settings

### Mobile - UI
4. **`mobile/app/master/loyalty.tsx`** (переписан)
   - Полноценный экран настройки программы лояльности для мастера
   - Табы: Настройки, Статистика, История
   - Обработка 403 (нет доступа Pro+) с CTA на управление подпиской

5. **`mobile/src/components/loyalty/MasterLoyaltyInfo.tsx`** (создан)
   - Read-only компонент для отображения информации о программе лояльности мастера
   - Используется в клиентском UI

6. **`mobile/app/bookings/[id].tsx`** (изменён)
   - Добавлен компонент `MasterLoyaltyInfo` для отображения информации о лояльности мастера в деталях бронирования

---

## Ключевые фрагменты кода

### 1. API функции (master.ts)

```typescript
// Получить настройки
export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const response = await apiClient.get<LoyaltySettings>('/api/master/loyalty/settings');
  return response.data;
}

// Обновить настройки
export async function updateLoyaltySettings(settings: LoyaltySettingsUpdate): Promise<LoyaltySettings> {
  const response = await apiClient.put<LoyaltySettings>('/api/master/loyalty/settings', settings);
  return response.data;
}

// Получить статистику
export async function getLoyaltyStats(): Promise<LoyaltyStats> {
  const response = await apiClient.get<LoyaltyStats>('/api/master/loyalty/stats');
  return response.data;
}
```

### 2. Экран лояльности (loyalty.tsx)

**Основные части:**
- Проверка доступа через `useMasterFeatures()` → `has_loyalty_access`
- Locked state при отсутствии доступа (403) с кнопкой "Управление подпиской"
- Табы: Настройки / Статистика / История
- Валидация полей (1-100 для процентов)
- Отслеживание изменений (`hasChanges`) для disabled кнопки "Сохранить"
- Toast-сообщения об успехе/ошибке

**Ключевой фрагмент валидации:**
```typescript
if (settings.is_enabled) {
  if (!settings.accrual_percent || settings.accrual_percent < 1 || settings.accrual_percent > 100) {
    Alert.alert('Ошибка', 'Процент начисления должен быть от 1 до 100');
    return;
  }
  // ... аналогично для max_payment_percent
}
```

### 3. Read-only компонент для клиента (MasterLoyaltyInfo.tsx)

```typescript
export function MasterLoyaltyInfo({ masterId, style }: MasterLoyaltyInfoProps) {
  // Загружает публичные настройки лояльности мастера
  // Показывает только если is_enabled === true
  // Форматирует: "Начисляем X% баллами", "Можно оплатить до Y%", "Срок действия: N дней"
}
```

**Использование:**
```typescript
// В деталях бронирования
{booking.master_id && (
  <View style={styles.section}>
    <MasterLoyaltyInfo masterId={booking.master_id} />
  </View>
)}
```

---

## Backend эндпоинты (источник истины)

### Для мастера

1. **GET /api/master/loyalty/settings**
   - Response: `LoyaltySettingsOut`
   - Поля: `id`, `master_id`, `is_enabled`, `accrual_percent`, `max_payment_percent`, `points_lifetime_days`, `created_at`, `updated_at`
   - Проверка доступа: `has_loyalty_access` (403 если нет)

2. **PUT /api/master/loyalty/settings**
   - Request: `LoyaltySettingsUpdate` (все поля optional)
   - Response: `LoyaltySettingsOut`
   - Валидация:
     - `accrual_percent`: 1-100
     - `max_payment_percent`: 1-100
     - `points_lifetime_days`: 14, 30, 60, 90, 180, 365 или null

3. **GET /api/master/loyalty/stats**
   - Response: `LoyaltyStatsOut`
   - Поля: `total_earned`, `total_spent`, `current_balance`, `active_clients_count`

4. **GET /api/master/loyalty/history**
   - Query params: `client_id?`, `transaction_type?`, `start_date?`, `end_date?`, `skip?`, `limit?`
   - Response: `List[LoyaltyTransactionOut]`

### Для клиента (read-only)

5. **GET /api/client/loyalty/master/{master_id}/loyalty-settings** (новый)
   - Response: `{ master_id, is_enabled, accrual_percent, max_payment_percent, points_lifetime_days }`
   - Read-only, не требует доступа к Pro+

---

## Как проверить в эмуляторе

### Для мастера

1. **Вход как мастер с подпиской Pro+**
   - Откройте приложение
   - Войдите как мастер с активной подпиской Pro или выше
   - Перейдите в меню мастера (☰) → "Лояльность"

2. **Проверка locked state (без доступа)**
   - Войдите как мастер БЕЗ подписки Pro+
   - Перейдите в "Лояльность"
   - Ожидаемый результат: экран с 🔒, текст "Раздел недоступен", кнопка "Управление подпиской"
   - Нажмите кнопку → должен открыться экран `/subscriptions`

3. **Настройки программы**
   - Включите тумблер "Включить программу лояльности"
   - Заполните поля:
     - Процент начисления: `5` (1-100)
     - Срок жизни баллов: выберите из списка (14/30/60/90/180/365/∞)
     - Процент оплаты баллами: `50` (1-100)
   - Нажмите "Сохранить настройки"
   - Ожидаемый результат: зелёный toast "Настройки успешно сохранены", кнопка становится disabled

4. **Валидация**
   - Попробуйте ввести `0` или `101` в поле "Процент начисления"
   - Нажмите "Сохранить"
   - Ожидаемый результат: Alert с ошибкой "Процент начисления должен быть от 1 до 100"

5. **Статистика**
   - Переключитесь на таб "Статистика"
   - Ожидаемый результат: 4 карточки с цифрами:
     - 🎁 Выдано баллов
     - 💸 Списано баллов
     - 💰 Текущий баланс
     - 👥 Активных клиентов

6. **История**
   - Переключитесь на таб "История"
   - Ожидаемый результат: список последних 50 транзакций с бейджами "Начислено" (зелёный) / "Списано" (красный)

### Для клиента

7. **Информация о лояльности мастера**
   - Войдите как клиент
   - Откройте любое бронирование, где есть `master_id`
   - Прокрутите вниз до секции с информацией о мастере
   - Ожидаемый результат: карточка "🎁 Программа лояльности" с текстом:
     - "Начисляем X% баллами"
     - "Можно оплатить до Y%"
     - "Срок действия: N дней" (или "бесконечно")
   - Если у мастера программа выключена → карточка не показывается

8. **Проверка без мастера**
   - Откройте бронирование без `master_id` (например, салон)
   - Ожидаемый результат: карточка лояльности не показывается

---

## Технические детали

### Валидация
- `accrual_percent`: 1-100 (целое число)
- `max_payment_percent`: 1-100 (целое число)
- `points_lifetime_days`: 14, 30, 60, 90, 180, 365 или null (бесконечно)

### Обработка ошибок
- **403**: Показывается locked state с CTA на `/subscriptions`
- **400**: Alert с текстом ошибки из `response.data.detail`
- **500/Network**: Показывается ошибка, fallback на кеш (если есть)

### Кеширование
- Настройки не кешируются (должны быть свежими)
- Статистика и история загружаются по требованию (при переключении таба)

### Диагностические логи
- Все API вызовы логируются в `__DEV__` режиме
- Формат: `[LOYALTY]` префикс для логов лояльности
- Формат: `[MASTER LOYALTY INFO]` для read-only компонента

---

## Следующие шаги (опционально)

1. Добавить фильтры в историю (по клиенту, типу транзакции, датам)
2. Добавить пагинацию в историю (сейчас limit 50)
3. Добавить экспорт статистики/истории
4. Добавить уведомления об истечении баллов клиентов

---

## Примечания

- Все изменения соответствуют существующим паттернам проекта
- Используется существующий API client с токен-инжектом
- Нет новых зависимостей
- Типы TypeScript полностью соответствуют backend схемам
- Read-only компонент для клиента не требует доступа к Pro+
