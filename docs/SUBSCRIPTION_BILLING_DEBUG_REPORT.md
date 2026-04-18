# FULL DEBUG-AUDIT: подписка мастера и платёжный поток (mobile + backend)

**Кейс:** тестовый аккаунт +79990000006 был Pro → после перезагрузки приложения стал Base; на счёте 199 000 ₽; при апгрейде обратно до Pro приложение открывает Robokassa на домене Казахстана.

**Режим:** read-only аудит. Код не меняем, только отчёт и места для логов.

---

## 1. Источник истины статуса подписки

### Backend

| Что | Где | Примечание |
|-----|-----|------------|
| **Subscription** | `models.Subscription` | `user_id`, `plan_id`, `status`, `start_date`, `end_date`, `is_active` |
| **SubscriptionPlan** | `models.SubscriptionPlan` | `name` (Free, Pro, …), `display_name`, `features`, `limits` |
| **SubscriptionReservation** | `models.SubscriptionReservation` | `reserved_amount` — зарезервированные средства под текущую подписку |
| **UserBalance** | `models.UserBalance` | `balance`, `currency` — общий счёт. Доступный = balance − reserved_total |
| **Эффективная подписка** | `utils.subscription_features.get_effective_subscription()` | Единый селектор: ACTIVE, `start_date ≤ now < end_date`, приоритет `plan_id != NULL`. Нормализует статусы по датам (EXPIRED/PENDING). |
| **Features** | `utils.subscription_features.get_master_features()` | Использует `get_user_subscription_with_plan` → `get_effective_subscription`. Возвращает `plan_id`, `plan_name`, флаги `has_*`. |

**API ответы:**

- `GET /api/master/subscription/features` — план и флаги (`plan_id`, `plan_name`, `has_extended_stats`, …). Источник для «Pro/Base» в UI.
- `GET /api/subscriptions/my` — текущая подписка (в т.ч. `plan_id`, `plan_name`, `plan_display_name`). Используется экраном «Мой тариф» и модалкой апгрейда.
- `GET /api/balance/` — `balance`, `available_balance`, `reserved_total`.
- `GET /api/balance/subscription-status` — статус подписки для баланса/списаний (отдельно от features).

### Mobile

| Что | Где | Примечание |
|-----|-----|------------|
| **Токен** | `SecureStore` (приоритет) / `AsyncStorage` по ключу `access_token` | Читается в `apiClient` interceptor и `AuthContext`. |
| **user_data** | `AsyncStorage` по ключу `user_data` | JSON `{id, phone, role, …}`. Пишется при login/register/refreshUser; **при холодном старте не обновляется** (только `getCurrentUser` → state). |
| **Features cache** | `AsyncStorage`: `@master_features` или `@master_features:{userId}` | TTL 15 мин. `userId` берётся из `user_data`. Fallback при ошибке API — stale cache по тому же ключу. |
| **Plans cache** | `AsyncStorage`: `@subscription_plans` | TTL 15 мин, **без привязки к userId**. |

**Кто выставляет / кто читает (сводка):**

- Токен: Auth (login/register) → пишет; client interceptor, AuthContext → читают.
- `user_data`: Auth (login/register/refreshUser) → пишет; useMasterFeatures, useFeatureAccess, MasterHamburgerMenu → читают для cache key и проверок.
- Features: `getMasterFeatures()` API → useMasterFeatures → кэш + состояние; Stats/Loyalty/Finance/Menu читают `features` и флаги.

---

## 2. Эндпоинты подписки/фич и платежей, которые вызывает mobile

| Эндпоинт | Файл | Функция / использование |
|----------|------|--------------------------|
| `GET /api/auth/users/me` | `auth.ts` | `getCurrentUser()` — при старте, login, refreshUser |
| `GET /api/master/subscription/features` | `master.ts` | `getMasterFeatures()` — useMasterFeatures, useFeatureAccess |
| `GET /api/subscriptions/my` | `subscriptions.ts` | `fetchCurrentSubscription()` — экран подписок, дашборд, модалка апгрейда |
| `GET /api/subscription-plans/available?subscription_type=master` | `subscriptions.ts` | `fetchAvailableSubscriptions()` — модалка, loyalty, finance, меню |
| `POST /api/subscriptions/calculate` | `subscriptions.ts` | `calculateSubscription()` — модалка апгрейда (шаг 2→3) |
| `DELETE /api/subscriptions/calculate/{id}` | `subscriptions.ts` | `deleteSubscriptionCalculationSnapshot()` — при смене плана/закрытии модалки |
| `POST /api/subscriptions/apply-upgrade-free` | `subscriptions.ts` | `applyUpgradeFree()` — когда backend вернул `requires_payment: false` |
| `POST /api/payments/subscription/init` | `payments.ts` | `initSubscriptionPayment()` — «Перейти к оплате» в модалке |
| `GET /api/balance/` | `master.ts` | `getBalance()` — дашборд, отображение баланса |
| `GET /api/balance/subscription-status` | `master.ts` | `getSubscriptionStatus()` — в коде есть, но дашборд использует `fetchCurrentSubscription` |

**Итог:** модалка апгрейда использует `calculate` → `init` (и при `requires_payment === false` — `apply-upgrade-free`). Дашборд грузит баланс и подписку через `getBalance` и `fetchCurrentSubscription`.

---

## 3. Как вычисляется «Pro / Base» в mobile UI

- **Stats (расширенная статистика):** `isPro = features?.has_extended_stats === true`. Если не Pro — показывается «Доступно в Pro» и переход в подписки.  
  Файл: `mobile/app/master/stats.tsx` (стр. 43).
- **Loyalty:** `hasLoyaltyAccess = features?.has_loyalty_access === true`. Иначе — плашка «Раздел доступен с тарифа X» и ссылка на подписки.  
  Файл: `mobile/app/master/loyalty.tsx` (стр. 137).
- **Finance:** `hasFinanceAccess = features?.has_finance_access === true`. Иначе — «Демо-режим. Полный доступ — в подписке Pro.»  
  Файл: `mobile/app/master/finance.tsx` (стр. 2081, 2898).
- **Экран «Мой тариф»:** название плана = `subscription.plan_display_name || subscription.plan_name || 'Базовый план'`.  
  «Базовый план» — это **fallback**, когда оба поля `null` (подписка без плана).  
  Файл: `mobile/app/subscriptions/index.tsx` (стр. 106, 246).

**Итого:** «Pro» определяется по **features** (`has_extended_stats` и др.), «Base» — либо по отсутствию этих флагов, либо по плану «Базовый план» на экране тарифа (нет плана / `plan_name`/`plan_display_name` пусты).

---

## 4. Кеширование

| Кеш | Ключ | TTL | Инвалидация |
|-----|------|-----|-------------|
| Features | `@master_features` или `@master_features:{userId}` | 15 мин | `forceRefresh` при AppState `active` (useMasterFeatures); `refresh()` при фокусе экрана Stats. **Нет** инвалидации при login/logout. |
| Plans | `@subscription_plans` | 15 мин | AppState `active` в useFeatureAccess. Общий кеш **без userId**. |
| Master settings (can_work_in_salon) | `@master_settings:{userId}` | 15 мин | При открытии меню. |

**Важно:**

- `user_data` при холодном старте **не перезаписывается**: вызывается только `getCurrentUser` → state. В кэш features идёт `userId` из **уже сохранённого** `user_data`. Если был смена аккаунта или старый пользователь — возможен неверный ключ.
- При 401 по любому запросу (кроме `/api/auth/users/me`) токен и `user_data` **очищаются** в interceptor (`client.ts`). При 401 на `users/me` очистку делает AuthContext.
- Фичи грузятся только если `token && user && user.role === 'master'|'indie'`. До появления `user` хуки не дергают API.

---

## 5. Почему после перезапуска «слетает» Pro — гипотезы (топ-5 по коду)

1. **Stale features cache по `@master_features:{userId}`**  
   После рестарта берётся кэш из AsyncStorage. Если при прошлой сессии был Base (или ошибка API → fallback на старый кэш), показываем его. TTL 15 мин не сбрасывается при перезапуске.  
   Файлы: `useMasterFeatures.ts` (стр. 55–84, 133–177), `useFeatureAccess.ts` (аналогичная логика).

2. **`user_data` не обновлён при холодном старте → неверный cache key**  
   `userId` для кэша фич берётся из `user_data`. В `loadStoredAuth` мы только вызываем `getCurrentUser` и пишем в state, **но не в AsyncStorage**. Значит, для кэша используется старый `user_data`. Если меняли аккаунт или был другой пользователь — возможен ключ `@master_features:{другой_id}` и «чужие» фичи, либо legacy-ключ без `userId`.  
   Файлы: `AuthContext.tsx` (стр. 51–82), `useMasterFeatures.ts` (стр. 42–51).

3. **Backend: подписка перешла в EXPIRED**  
   `get_effective_subscription` смотрит на `end_date` и при `end_date ≤ now` помечает подписку как EXPIRED, `is_active=False`. В итоге эффективной активной подписки нет → `get_master_features` отдаёт fallback без плана (`plan_name`/`plan_id` = null, все `has_*` = false) → UI показывает Base.  
   Файл: `utils/subscription_features.py` (стр. 26–120, 508–522).

4. **401 при запросе features → очистка токена и user_data**  
   Если после рестарта первый запрос `GET /api/master/subscription/features` (или другой) возвращает 401, interceptor очищает токен и `user_data`. Дальше возможен logout и показ гостя/ошибки. Но сценарий «был Pro, стал Base» скорее при **успешном** ответе с кэшем или fallback. 401 скорее приводит к «выкинуло из аккаунта», а не к смене плана.  
   Файл: `client.ts` (стр. 71–115).

5. **Race: фичи грузятся до появления `user`**  
   useMasterFeatures не дергает API, пока нет `token` и `user` с ролью master/indie. Но при быстром переходе на экраны (Stats, Loyalty и т.д.) может использоваться пустое `features` или старый кэш до прихода свежего ответа. Тогда временно показывается «не Pro».  
   Файлы: `useMasterFeatures.ts` (стр. 25–30, 186–203), `stats.tsx` (стр. 43).

---

## 6. Платёжный поток: баланс vs Robokassa

### Кто решает

- **Расчёт «к оплате»:** backend `POST /api/subscriptions/calculate`. Считает `final_price = total_price - credit`, где **credit** — только из `SubscriptionReservation.reserved_amount` (остаток резерва текущей подписки). **Доступный баланс (UserBalance − reserved) в расчёте не используется.**
- **Нужна ли оплата:** `requires_immediate_payment = (final_price > 0)`. Если `final_price ≤ 0` → backend при `POST /api/payments/subscription/init` возвращает `requires_payment: false` и не создаёт Payment/Robokassa. Применение — через `apply-upgrade-free`.
- **Итог:** решение «списание с баланса vs внешняя оплата» принимает **backend**. Mobile только: при `requires_payment === false` показывает алерт и вызывает `apply-upgrade-free`; иначе открывает `payment_url` (Robokassa).

### Как ведёт себя mobile

- В модалке кнопка «Перейти к оплате» активна при `canPay`:
  - `calculation.final_price > 0` (и остальные условия).  
  Если `final_price === 0`, кнопка **неактивна** — пользователь не может нажать «Перейти к оплате». Сценарий «оплата не требуется» возможен только если сначала вызывают `init` (например, обходя проверку `canPay`), что в текущем коде не делается для шага 3.  
  Файл: `SubscriptionPurchaseModal.tsx` (стр. 504–509, 578–587).
- При нажатии «Перейти к оплате» всегда вызывается `initSubscriptionPayment`. Ответ:
  - `requires_payment === false` → алерт «Оплата не требуется» + `applyUpgradeFree` по `calculation_id`.
  - иначе → `Linking.openURL(payment.payment_url)` (Robokassa).

**Почему при 199 000 ₽ всё равно уходим в Robokassa:**  
199k хранятся в **UserBalance** (доступный баланс). В `calculate` используется только **резерв** (SubscriptionReservation). При апгрейде с Base без активной подписки (или без резерва) `reserved_balance = 0` → `credit = 0` → `final_price = total_price > 0` → `init` создаёт Payment и возвращает `payment_url` → открывается Robokassa. **Доступный баланс в этом потоке не задействован.**

Файлы: `backend/routers/subscriptions.py` (стр. 935–1005, 1148–1196), `backend/routers/payments.py` (стр. 52–199), `SubscriptionPurchaseModal.tsx` (стр. 454–507).

---

## 7. Robokassa KZ: откуда домен / merchant / URL

### Backend

- Конфиг: `utils/robokassa.get_robokassa_config()` читает env:
  - `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD_1`, `ROBOKASSA_PASSWORD_2`
  - `ROBOKASSA_IS_TEST`
  - `ROBOKASSA_RESULT_URL`, `ROBOKASSA_SUCCESS_URL`, `ROBOKASSA_FAIL_URL`
- URL формы оплаты: **в коде жёстко** `https://auth.robokassa.ru/Merchant/Index.aspx` (и test, и prod). **Вариантов `.kz` в коде нет.**  
  Файл: `backend/utils/robokassa.py` (стр. 72–88, 90–127, 124–127).

- `payment_url` собирается на backend и отдаётся в `PaymentInitResponse`. Mobile его **нигде не собирает сам** — только открывает через `Linking.openURL(payment.payment_url)`.

### Env / конфиг

- Шаблон: `backend/env_template.txt` — только `.ru` (localhost/front). Упоминаний KZ нет.
- В репозитории нет отдельного DEV/PROD/KZ switch для региона Robokassa.

### Откуда тогда KZ (топ-5 гипотез по коду/конфигу)

1. **Редирект Robokassa по региону/IP**  
   У провайдера есть домен `auth.robokassa.kz` для Казахстана. Пользователь из KZ может попадать на `.kz` уже после перехода по нашей ссылке на `.ru` (редирект на стороне Robokassa). В нашем коде мы всегда даём только `.ru`.

2. **Success/Fail URL ведут на .kz**  
   `ROBOKASSA_SUCCESS_URL` / `ROBOKASSA_FAIL_URL` в env на сервере могут указывать на домен вида `*.kz`. Мы не формируем их в коде — только передаём в Robokassa. Пользователь мог запомнить именно страницу успеха/ошибки (после оплаты), а не саму форму. Но в кейсе речь о «попытке апгрейда» → открытие формы, так что это менее вероятно.

3. **Мерчант в личном кабинете Robokassa заведён для KZ**  
   Для KZ-мерчанта форма может отдаваться с `.kz`. Тогда при тех же `auth.robokassa.ru` в ссылке возможен редирект. Наш код не выбирает мерчанта по региону — только один `ROBOKASSA_MERCHANT_LOGIN`.

4. **Другой backend / env на проде**  
   На сервере может быть свой `.env` с другими `SUCCESS_URL`/`FAIL_URL` или (гипотетически) доработанный код с `.kz`. В текущем репозитории такого нет.

5. **Путаница с доменом**  
   Пользователь мог иметь в виду не форму оплаты, а, например, сайт приложения или редирект после оплаты. Тогда «домен Казахстана» может быть не Robokassa, а ваш фронт/апп.

---

## 8. Места для временного логирования (только перечень, код не менять)

Добавить логи (в т.ч. только в `__DEV__`) в указанных местах:

| # | Где | Что логировать |
|---|-----|----------------|
| 1 | `AuthContext` после `loadStoredAuth` / `getCurrentUser` | `userId`, `role`, `phone`, источник (storage vs API) |
| 2 | `useMasterFeatures` перед запросом features | `userId` (из user_data), `token` (есть/нет), `role` |
| 3 | `useMasterFeatures` при чтении кэша (hit) | `cacheKey`, `plan_id`, `plan_name`, `has_extended_stats`, `cachedAt` |
| 4 | `useMasterFeatures` при ответе API | то же + `isPro` |
| 5 | `useMasterFeatures` при fallback на кэш после ошибки | `error`, `cacheKey`, `plan_name`, `has_extended_stats` |
| 6 | `client` interceptor: запросы к `/api/master/subscription/features` | уже есть `🧩 [FEATURES RESPONSE]`; при необходимости — и request (userId из заголовков не идёт, но можно логнуть url + наличие Authorization) |
| 7 | `SubscriptionPurchaseModal` при открытии и при `handlePayment` | `currentSubscription.plan_id`, `plan_name`, `calculation_id`, `final_price`, `requires_payment` (из ответа init) |
| 8 | `initSubscriptionPayment` сразу после ответа | `requires_payment`, `payment_id`, `payment_url` (полностью), домен из `payment_url` |
| 9 | Экран подписок после `fetchCurrentSubscription` | `subscription.plan_id`, `plan_name`, `plan_display_name`, `status`, `end_date` |
| 10 | Дашборд после `getBalance` / `fetchCurrentSubscription` | `balance.available_balance`, `balance.reserved_total`, `subscription.plan_name` |
| 11 | Backend `GET /api/master/subscription/features` | уже есть опциональный debug при `SUBSCRIPTION_FEATURES_DEBUG=1`: `user_id`, `chosen_sub`, `plan_id`, `plan_name`, `flags`. При необходимости добавить явный лог `isPro` (например, `has_extended_stats`). |
| 12 | Backend `POST /api/subscriptions/calculate` | при `SUBSCRIPTION_CALC_DEBUG=1`: `user_id`, `current_sub_id`, `plan_id`, `reserved_balance`, `credit_amount`, `total_price`, `final_price` |
| 13 | Backend `POST /api/payments/subscription/init` | перед return: `user_id`, `total_price`, `requires_payment` (или факт возврата `payment_url`), `payment_url` (или хотя бы домен), `merchant_login` из config |

---

## Таблица «поле → где хранится → кто выставляет → кто читает»

| Поле | Где хранится | Кто выставляет | Кто читает |
|------|--------------|----------------|------------|
| `access_token` | SecureStore / AsyncStorage `access_token` | AuthContext (login/register) | apiClient interceptor, AuthContext |
| `user_data` | AsyncStorage `user_data` | AuthContext (login/register/refreshUser) | useMasterFeatures, useFeatureAccess, MasterHamburgerMenu, client (удаление при 401) |
| `plan_id` / `plan_name` | API features, API subscription | Backend (effective sub + plan) | Stats, Loyalty, Finance, Subscriptions screen, Purchase modal |
| `has_extended_stats` и др. | API features, кэш `@master_features` | Backend; кэш — useMasterFeatures | Stats (isPro), Loyalty, Finance, Menu |
| `balance` / `available_balance` | API `/api/balance/` | Backend (UserBalance, reserved) | Dashboard, UI баланса |
| `subscription` (my) | API `/api/subscriptions/my` | Backend (effective sub или вновь созданная) | Subscriptions screen, Purchase modal, Dashboard |
| `payment_url` | Ответ `POST /api/payments/subscription/init` | Backend (robokassa.generate_payment_url) | SubscriptionPurchaseModal → Linking.openURL |

---

## Диаграмма потока (кратко)

```
Login
  → saveToken, getCurrentUser → setUser, AsyncStorage user_data
  → apiClient defaults Authorization

[Экраны мастеров]
  → useMasterFeatures: token + user + role master?
       → AsyncStorage user_data → userId → cache key @master_features:{id}
       → cache hit && TTL ok? → setFeatures(cached)
       → else GET /api/master/subscription/features → setFeatures → cache set
  → compute isPro = features.has_extended_stats === true
  → UI: Stats/Loyalty/Finance гейтят по has_* / isPro

[Подписки]
  → fetchCurrentSubscription → GET /api/subscriptions/my
  → UI: plan_display_name || plan_name || 'Базовый план'

[Апгрейд]
  → fetchAvailableSubscriptions, calculateSubscription (snapshot)
  → initSubscriptionPayment
       → requires_payment false? → applyUpgradeFree → refresh
       → иначе → Linking.openURL(payment_url)
```

---

## Топ-5 причин «Почему мог стать Base после перезапуска» (по коду)

1. **Кэш features** с прошлой сессии (Base или ошибка → fallback), TTL не истёк, после рестарта читается первым.
2. **user_data не обновлён при cold start** → неверный или общий cache key → старые/чужие фичи.
3. **Подписка истекла** (`end_date ≤ now`) → `get_effective_subscription` не возвращает активную → fallback без плана → Base.
4. **Нет активной подписки с plan_id** (например, создана «базовая» без плана через `/api/subscriptions/my`) → `plan_name` null → «Базовый план» и нет Pro-фич.
5. **Race при загрузке** — до прихода актуальных features показывается пустое/старое состояние или кэш.

---

## Топ-5 причин «Почему Robokassa KZ» (по коду/конфигу)

1. Редирект **Robokassa по geo** (Казахстан) на `auth.robokassa.kz` при переходе по нашей ссылке на `.ru`.
2. **Success/Fail URL** в env указывают на `*.kz` — пользователь вспомнил страницу после оплаты, а не форму.
3. **Мерчант** в кабинете Robokassa заведён для KZ → форма/редирект на `.kz`.
4. **Другой env или версия backend на проде** с иным конфигом или кодом.
5. Имелась в виду не форма Robokassa, а **другой домен** (приложение, фронт).

---

## Минимальный план фикса (пункты, без внедрения)

- **Pro после перезапуска**
  1. Инвалидировать кэш features при login/logout (очищать `@master_features` и `@master_features:*` при смене пользователя).
  2. В `loadStoredAuth` после успешного `getCurrentUser` обновлять `user_data` в AsyncStorage, чтобы cache key всегда соответствовал текущему пользователю.
  3. При фокусе экранов подписки/тарифа (и при открытии модалки апгрейда) вызывать `refresh` фич (и при необходимости `fetchCurrentSubscription`), чтобы снизить влияние race и stale cache.
  4. Добавить логи по п. 8 (хотя бы `userId`, `plan_name`, `has_extended_stats`, `cacheKey`) для отладки на устройстве тестового аккаунта.

- **Апгрейд при наличии баланса**
  5. Разрешить использование **доступного баланса** (UserBalance − reserved) при расчёте `final_price` в `calculate` и при `apply-upgrade-free` (списание с баланса в счёт подписки), чтобы при 199k ₽ не уводить в Robokassa.
  6. Уточнить UX модалки при `final_price === 0`: либо отдельная кнопка «Применить без оплаты» (и вызов `apply-upgrade-free` без `init`), либо разрешить «Перейти к оплате» и обрабатывать ответ `requires_payment: false` (уже есть) так, чтобы пользователь не упирался в неактивную кнопку.

- **Robokassa KZ**
  7. Залогировать фактический `payment_url` (и домен) в backend при `init` и в mobile при открытии ссылки; проверить на проде env `ROBOKASSA_*` и факт редиректа на `.kz` (в т.ч. по geo).
  8. При необходимости явно поддерживать RU/KZ (например, отдельный мерчант или домен) — ввести конфиг/флаг и использовать его в `robokassa.py`, пока не трогая текущий prod.

Фиксы **не внедрялись** — только план. Подтверждение перед изменениями — по вашему решению.
