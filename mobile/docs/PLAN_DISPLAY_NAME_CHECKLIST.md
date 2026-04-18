# Чеклист: отображение названия тарифа (plan_display_name)

## Цель

В UI показывать `plan_display_name` (из админки «Отображаемое название»), если задано; иначе fallback на `plan_name`.

## Проверка

1. **В БД/админке** — для плана Pro задать `plan_display_name = "ПРО"` (или другое отличающееся значение).

2. **Дашборд мастера** (`app/index.tsx`)  
   - Карточка «Подписка»: должно отображаться «ПРО», а не «Pro».

3. **Экран «Мой тариф»** (`app/subscriptions/index.tsx`)  
   - В заголовке карточки подписки: «ПРО».

4. **Модалка покупки подписки** (`SubscriptionPurchaseModal.tsx`)  
   - Текущий план в шагах выбора: «ПРО».

5. **Очистить plan_display_name** в админке (оставить пустым).  
   - Везде снова должно отображаться «Pro» (fallback на plan_name).

## Места с getPlanTitle

- `app/index.tsx` — карточка подписки на дашборде
- `app/subscriptions/index.tsx` — карточка текущей подписки
- `SubscriptionPurchaseModal.tsx` — currentPlanLabel

## Бизнес-логика (plan_name)

Проверки `plan_name === 'Free'` / `isFreeLikePlan(plan_name)` остаются на техническом `plan_name` — не меняются.
