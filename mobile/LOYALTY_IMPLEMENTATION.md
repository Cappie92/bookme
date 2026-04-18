# Реализация системы лояльности в мобильном приложении

## Структура файлов

```
mobile/src/
├── services/api/
│   └── loyalty.ts                    # API клиент + типы + утилиты
├── hooks/
│   ├── useLoyaltyPoints.ts           # Хук для баланса клиента
│   └── useAvailableLoyaltyPoints.ts # Хук для доступных баллов при бронировании
└── components/loyalty/
    ├── LoyaltyPointsScreen.tsx       # Экран "Мои баллы"
    ├── LoyaltyMasterCard.tsx         # Карточка баланса по мастеру
    ├── LoyaltyTransactionsList.tsx   # Список транзакций
    ├── LoyaltyTransactionItem.tsx   # Элемент транзакции
    └── UseLoyaltyPointsToggle.tsx    # Переключатель при бронировании
```

---

## 1. Типы данных (TypeScript)

**Файл:** `mobile/src/services/api/loyalty.ts`

### Интерфейсы:

```typescript
// Тип транзакции
export enum LoyaltyTransactionType {
  EARNED = 'earned',
  SPENT = 'spent',
}

// Настройки (только для чтения)
export interface LoyaltySettings {
  id: number;
  master_id: number;
  is_enabled: boolean;
  accrual_percent: number | null;
  max_payment_percent: number | null;
  points_lifetime_days: number | null;
  created_at: string;
  updated_at: string;
}

// Транзакция
export interface LoyaltyTransaction {
  id: number;
  master_id: number;
  client_id: number;
  booking_id: number | null;
  service_id: number | null;
  transaction_type: LoyaltyTransactionType;
  points: number;
  earned_at: string;
  expires_at: string | null;
  created_at: string;
  client_name?: string | null;
  service_name?: string | null;
}

// Баланс по мастеру
export interface ClientLoyaltyPointsOut {
  master_id: number;
  master_name: string;
  total_points: number;
  active_points: number;
  expired_points: number;
  transactions: LoyaltyTransaction[];
}

// Доступные баллы для списания
export interface AvailableLoyaltyPointsOut {
  master_id: number;
  available_points: number;
  max_payment_percent: number | null;
  is_loyalty_enabled: boolean;
  // TODO: Добавить max_spendable (см. раздел 6)
}
```

---

## 2. API Client слой

**Файл:** `mobile/src/services/api/loyalty.ts`

### Функции:

```typescript
// Получить баланс по всем мастерам
getClientLoyaltyPoints(): Promise<ClientLoyaltyPointsOut[]>
// Обработка ошибок:
// - 403 → "Доступ к программе лояльности доступен на плане Pro и выше"
// - 500 → "Ошибка сервера при загрузке баллов"
// - Network → "Проблемы с подключением к серверу"

// Получить доступные баллы для списания
getAvailablePoints(masterId: number): Promise<AvailableLoyaltyPointsOut>
// Обработка ошибок:
// - 404 → "Мастер не найден"
// - 500 → "Ошибка сервера при загрузке доступных баллов"

// (Опционально) Статистика для мастера
getMasterLoyaltyStats(): Promise<LoyaltyStatsOut>
// Обработка ошибок:
// - 403 → "Доступ к программе лояльности доступен на плане Pro и выше"

// (Опционально) История транзакций мастера
getMasterLoyaltyHistory(filters?: LoyaltyHistoryFilters): Promise<LoyaltyTransaction[]>
```

---

## 3. Store/Hooks слой

### Вариант A: React Hooks с AsyncStorage кешированием

**Файлы:**
- `mobile/src/hooks/useLoyaltyPoints.ts`
- `mobile/src/hooks/useAvailableLoyaltyPoints.ts`

**Особенности:**
- Кеширование с TTL 30 секунд (как требовалось)
- Автообновление при фокусе приложения
- Fallback на кеш при ошибках сети
- Состояния: `loading`, `error`, `data`, `refresh()`

**Пример использования:**
```typescript
const { data, loading, error, refresh } = useLoyaltyPoints();
```

---

## 4. UI-компоненты

### LoyaltyPointsScreen
**Файл:** `mobile/src/components/loyalty/LoyaltyPointsScreen.tsx`

**Состояния:**
- Loading: спиннер + "Загрузка баллов..."
- Error: текст ошибки + кнопка "Повторить"
- Empty: "🎁 У вас пока нет баллов" + описание
- Success: список `LoyaltyMasterCard`

### LoyaltyMasterCard
**Файл:** `mobile/src/components/loyalty/LoyaltyMasterCard.tsx`

**Показывает:**
- Имя мастера
- Активный баланс (форматированный)
- Истекшие баллы (если > 0)
- Кнопка раскрытия истории

### LoyaltyTransactionItem
**Файл:** `mobile/src/components/loyalty/LoyaltyTransactionItem.tsx`

**Показывает:**
- Бейдж типа (earned/spent) с цветом
- Количество баллов (+/-)
- Название услуги
- Дата операции
- Дата истечения (только для earned)

---

## 5. Интеграция с бронированием

### UseLoyaltyPointsToggle
**Файл:** `mobile/src/components/loyalty/UseLoyaltyPointsToggle.tsx`

**Логика:**
```typescript
// Показывать только если:
shouldShow = availablePoints?.is_loyalty_enabled && 
             availablePoints?.available_points > 0

// При включении показывать:
// - Будет списано: X баллов (Y ₽)
// - К доплате: Z ₽
```

**Использование:**
```typescript
<UseLoyaltyPointsToggle
  availablePoints={availablePointsData}
  servicePrice={selectedService.price}
  isEnabled={useLoyaltyPoints}
  onToggle={setUseLoyaltyPoints}
/>
```

**При создании бронирования:**
```typescript
// Отправлять в POST /client/bookings:
{
  ...bookingData,
  use_loyalty_points: useLoyaltyPoints, // boolean
}
```

**⚠️ ВАЖНО:** Мобила НЕ списывает баллы реально. Реальное списание происходит на backend при подтверждении мастером (`POST /api/master/accounting/confirm/{booking_id}`).

---

## 6. Предложение улучшения API

### Проблема

Сейчас `calculateMaxSpendable()` дублируется на клиенте и backend:
- Backend: `backend/utils/loyalty.py:calculate_points_to_spend()`
- Frontend: `mobile/src/services/api/loyalty.ts:calculateMaxSpendable()`

Это создаёт риск расхождения логики при изменениях.

### Решение

**Добавить поле `max_spendable` в `AvailableLoyaltyPointsOut`**

**Файл:** `backend/schemas.py:2536-2538`

**Изменение:**
```python
class AvailableLoyaltyPointsOut(BaseModel):
    master_id: int
    available_points: int
    max_payment_percent: int | None
    is_loyalty_enabled: bool
    max_spendable: float  # ← ДОБАВИТЬ
```

**Где вычислять:** `backend/routers/client_loyalty.py:177-211`

**Код:**
```python
@router.get("/points/{master_id}/available", response_model=AvailableLoyaltyPointsOut)
async def get_available_loyalty_points(
    master_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ... существующий код ...
    
    # Вычисляем max_spendable
    max_spendable = calculate_points_to_spend(
        available_points=available_points,
        service_price=0,  # Не знаем цену услуги на этом этапе
        max_payment_percent=loyalty_settings.max_payment_percent if loyalty_settings else None
    )
    # ИЛИ: если знаем цену услуги из query params:
    # service_price = request.query_params.get('service_price', 0)
    
    return AvailableLoyaltyPointsOut(
        master_id=master_id,
        available_points=available_points,
        max_payment_percent=loyalty_settings.max_payment_percent if loyalty_settings else None,
        is_loyalty_enabled=loyalty_settings.is_enabled if loyalty_settings else False,
        max_spendable=max_spendable,  # ← ДОБАВИТЬ
    )
```

**Альтернатива (если нужна цена услуги):**
```python
@router.get("/points/{master_id}/available", response_model=AvailableLoyaltyPointsOut)
async def get_available_loyalty_points(
    master_id: int,
    service_price: float = Query(0, description="Цена услуги для расчёта max_spendable"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ... код ...
    
    max_spendable = calculate_points_to_spend(
        available_points=available_points,
        service_price=service_price,
        max_payment_percent=loyalty_settings.max_payment_percent if loyalty_settings else None
    )
    
    return AvailableLoyaltyPointsOut(
        # ... поля ...
        max_spendable=max_spendable,
    )
```

**Зачем:**
- Убрать дублирование логики
- Гарантировать единообразие расчёта
- Упростить клиентский код (не нужно пересчитывать)

**После добавления:**
- Удалить `calculateMaxSpendable()` из `mobile/src/services/api/loyalty.ts`
- Использовать `availablePoints.max_spendable` напрямую в `UseLoyaltyPointsToggle`

---

## 7. Интеграция в приложение

### Добавить экран в роутинг

**Пример (Expo Router):**
```typescript
// mobile/app/loyalty/index.tsx
import { LoyaltyPointsScreen } from '@src/components/loyalty/LoyaltyPointsScreen';

export default function LoyaltyPage() {
  return <LoyaltyPointsScreen />;
}
```

### Использовать в бронировании

**Пример:**
```typescript
import { useAvailableLoyaltyPoints } from '@src/hooks/useAvailableLoyaltyPoints';
import { UseLoyaltyPointsToggle } from '@src/components/loyalty/UseLoyaltyPointsToggle';

function BookingScreen() {
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const { data: availablePoints } = useAvailableLoyaltyPoints(selectedMasterId);
  
  return (
    <View>
      {/* ... другие поля ... */}
      
      <UseLoyaltyPointsToggle
        availablePoints={availablePoints}
        servicePrice={selectedService.price}
        isEnabled={useLoyaltyPoints}
        onToggle={setUseLoyaltyPoints}
      />
      
      {/* ... */}
    </View>
  );
}
```

---

## 8. Тестовые сценарии

- [ ] Загрузка баланса при 0 баллах → Empty state
- [ ] Загрузка баланса с несколькими мастерами → Список карточек
- [ ] Отображение истекших баллов → Баннер "Истекло: X баллов"
- [ ] Раскрытие истории транзакций → Список транзакций
- [ ] Чекбокс при бронировании:
  - Показывается только если `is_loyalty_enabled && available_points > 0`
  - При включении показывает сумму списания и доплату
- [ ] Обработка ошибок:
  - 403 → Сообщение о необходимости плана Pro+
  - 500 → Сообщение об ошибке сервера
  - Network → Сообщение о проблемах с сетью
- [ ] Кеширование: данные из кеша показываются при ошибке сети

---

## 9. Зависимости

Все зависимости уже есть в проекте:
- `@react-native-async-storage/async-storage` (для кеширования)
- `axios` (через `apiClient`)
- React Native компоненты (`View`, `Text`, `ScrollView`, `Switch`, etc.)

**Новых зависимостей не требуется.**

---

## 10. Следующие шаги

1. ✅ Создать типы и API клиент
2. ✅ Создать хуки с кешированием
3. ✅ Создать UI компоненты
4. ⏳ Интегрировать экран в роутинг приложения
5. ⏳ Интегрировать `UseLoyaltyPointsToggle` в экран бронирования
6. ⏳ Протестировать все сценарии
7. ⏳ (Опционально) Предложить backend добавить `max_spendable` в API
