# Fix + Verify: подписка «Pro → Base» и диагностика Robokassa KZ

**Цель:** устранить кейс «аккаунт был Pro → перезапуск приложения → стал Base» и дать ясную диагностику «почему Robokassa открывается на домене KZ».

---

## Что изменено (файлы)

### Mobile

| Файл | Изменения |
|------|-----------|
| `mobile/src/utils/subscriptionCache.ts` | **Новый.** Ключи `@master_features`, `@subscription_plans`, `@master_settings`; user-scoped варианты `:userId`. `invalidateSubscriptionCaches(userId?)` — удаляет все subscription-related кэши (в т.ч. по `getAllKeys` + префиксы). |
| `mobile/src/auth/AuthContext.tsx` | Импорт `invalidateSubscriptionCaches`. **Login/register:** после `getCurrentUser` и записи `user_data` вызывается `invalidateSubscriptionCaches(userData.id)`. **Logout:** перед `clearAuth` читается `user_data` → `userId` → `invalidateSubscriptionCaches(userId)`, затем очистка токена и `user_data`. **Cold start (`loadStoredAuth`):** после `getCurrentUser` — обновление `user_data` в AsyncStorage, затем `invalidateSubscriptionCaches(userData.id)`. __DEV__ лог «Session restored» (userId, phone, role, source: network). |
| `mobile/src/hooks/useMasterFeatures.ts` | Cache key только user-scoped: `@master_features:{user.id}` (из `useAuth`, не из `user_data`). Поддержка роли `indie`. При skip (нет токена/юзера/роль не master|indie) — `setFeatures(null)`, `setLoading(false)`, `setSource(null)`. Возврат `source`: `'cache' | 'network' | 'fallback' | null`. __DEV__ логи при cache/network/fallback (plan_name, has_extended_stats, source). Убрана зависимость от `user_data` для ключа кэша. |
| `mobile/src/hooks/useFeatureAccess.ts` | User-scoped кэш: `@master_features:{userId}`, `@subscription_plans:{userId}`. `userId` из `useAuth().user.id`. Поддержка `indie`. Использование `FEATURES_PREFIX`, `PLANS_PREFIX` из `subscriptionCache`. |
| `mobile/src/components/MasterHamburgerMenu.tsx` | Импорт `useAuth`, `PLANS_PREFIX`, `SETTINGS_PREFIX`. Планы и настройки — user-scoped ключи `{PLANS_PREFIX}:{userId}`, `{SETTINGS_PREFIX}:{userId}`. `userId` из `useAuth().user?.id`. |
| `mobile/app/master/stats.tsx` | Использование `loading` и `source` из `useMasterFeatures`. Пока `featuresLoading` — вместо таба «Базовая/Расширенная» и «Доступно в Pro» показывается скелетон: «Загрузка подписки…» + `ActivityIndicator`. «Доступно в Pro» только после загрузки и при `!isPro`. __DEV__ лог `[STATS] isPro` (isPro, source, plan_name, plan_id, has_extended_stats). |
| `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx` | Перед `Linking.openURL(payment.payment_url)` — __DEV__ лог домена: `URL` → `protocol//host/pathname`, либо первые 80 символов при ошибке парсинга. |

### Backend

| Файл | Изменения |
|------|-----------|
| `backend/routers/payments.py` | Импорт `urlparse`. После формирования `payment_url` в `init_subscription_payment`: при `PAYMENT_URL_DEBUG=1` **или** `ENVIRONMENT=development` пишется лог `payment_url_diag` с `user_id`, `phone`, `env`, `merchant` (логин), `is_test`, `payment_url` (домен+path), `result_url`, `success_url`, `fail_url` (домен+path). Чувствительные query-параметры не логируются. |

---

## Почему слетал Pro (конкретно)

1. **Кэш features не инвалидировался** при login/logout/cold start. После перезапуска использовался старый кэш (TTL 15 мин), в котором могли быть данные Base или другого пользователя.
2. **`user_data` не обновлялся при cold start.** Ключ кэша брался из `user_data` в AsyncStorage. При старте вызывался только `getCurrentUser` → state, без перезаписи `user_data`. В результате ключ кэша мог не соответствовать текущему пользователю (или использовался legacy-ключ без `userId`).
3. **Планы кэшировались глобально** (`@subscription_plans` без `userId`). При смене пользователя показывались планы предыдущего аккаунта.
4. **До загрузки features показывался Base.** При `features === null` (ещё loading) `isPro` считался `false`, отображалось «Доступно в Pro» и блокировка Extended. Не было отдельного loading-состояния для подписки.

---

## Как теперь гарантируется актуальность

- **Инвалидация кэшей:** при **login**, **register**, **logout** и **cold start** вызывается `invalidateSubscriptionCaches(userId)`. Удаляются все ключи с префиксами `@master_features`, `@subscription_plans`, `@master_settings` (и legacy, и user-scoped).
- **Обновление `user_data` на cold start:** в `loadStoredAuth` после `getCurrentUser` выполняется `AsyncStorage.setItem(USER_KEY, ...)` и инвалидация. Дальнейшие запросы используют актуального пользователя.
- **User-scoped ключи:** везде используются ключи вида `@master_features:{userId}`, `@subscription_plans:{userId}`, `@master_settings:{userId}`. `userId` из `useAuth().user.id` (не из `user_data`).
- **Рефетч после login/cold start:** из-за инвалидации при первом заходе в экраны с features/plans/settings кэш пуст → идёт запрос в сеть (`/api/master/subscription/features`, `getMasterSettings`, `fetchCurrentSubscription` при открытии соответствующих экранов).
- **Loading вместо Base:** пока `featuresLoading` на Stats показывается «Загрузка подписки…», а не «Доступно в Pro». После загрузки решение Pro/Base строится только по пришедшим данным.
- **Сброс при logout:** при logout инвалидация выполняется до очистки auth; при отсутствии master/indie в `useMasterFeatures` выполняется `setFeatures(null)` и сброс `source`.

---

## Диагностика KZ: что нашли

- **Формирование `payment_url`:** только в backend, в `routers/payments.py` → `utils.robokassa.generate_payment_url`. В коде используется **только** `https://auth.robokassa.ru/Merchant/Index.aspx` (и test, и prod). Вариантов `.kz` в коде **нет**.
- **Конфиг:** `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_*_URL` берутся из env. В `env_template` и типовых env-файлах — только `.ru` и локальные URL. Отдельного переключателя RU/KZ или «test merchant KZ» в коде нет.
- **Диагностические логи:**
  - **Backend:** при `PAYMENT_URL_DEBUG=1` или `ENVIRONMENT=development` в лог пишется `payment_url_diag` с `user_id`, `phone`, `env`, `merchant`, `is_test`, доменами `payment_url`, `result_url`, `success_url`, `fail_url`. По ним можно проверить, что реально отдаёт backend.
  - **Mobile:** в __DEV__ при открытии ссылки на оплату логируется домен `payment_url` (или до 80 символов URL при ошибке парсинга).
- **Вывод:** `payment_url` отдаёт **backend**; в нём фигурирует только `auth.robokassa.ru`. Если пользователь попадает на **KZ**, это происходит **после** перехода по нашей ссылке, скорее всего из-за **редиректа на стороне Robokassa** (например, по geo/IP в Казахстане) или из-за конфигурации мерчанта в личном кабинете Robokassa. Имеет смысл проверить в логах фактические `payment_url_domain`, `success_url_domain`, `fail_url_domain` и при необходимости — настройки мерчанта и поведение Robokassa для трафика из KZ.

**Включение логов:** в dev лог `payment_url_diag` пишется автоматически. На проде задать `PAYMENT_URL_DEBUG=1`, чтобы включить диагностику.

---

## Smoke checklist

1. **Login Pro → расширенная статистика доступна**  
   Залогиниться Pro-аккаунтом → «Статистика» → сегмент «Расширенная» доступен, «Доступно в Pro» не показывается.

2. **Kill app → cold start → всё ещё Pro**  
   Полностью закрыть приложение → снова открыть (cold start) → «Статистика» → по-прежнему Pro, расширенная статистика доступна.

3. **Logout → login другим юзером → не подтягиваются чужие cached features**  
   Выйти из аккаунта → залогиниться другим пользователем (другой plan) → «Статистика» / «Лояльность» / «Финансы» отражают **нового** пользователя (plan/флаги), не предыдущего.

4. **Upgrade flow: при «Перейти к оплате» логируется домен `payment_url`**  
   «Мой тариф» → «Управление тарифом» → выбрать план, период → «Перейти к оплате».  
   - В **backend**-логах (при `ENVIRONMENT=development` или `PAYMENT_URL_DEBUG=1`) должна появиться строка `payment_url_diag` с `payment_url_domain`, `success_url_domain`, `fail_url_domain`.  
   - В **mobile** (__DEV__) в консоли — лог `[PAYMENT] Opening payment_url` с `domain` / `origin`.  
   По ним можно проверить, какой домен уходит в Robokassa и меняется ли он редиректом.
