# Структура проекта DeDato

## 1. Frontend (React)

```
frontend/src/
├── App.jsx                    # Главный компонент приложения
├── App.css                    # Стили приложения
├── main.jsx                   # Точка входа
├── index.css                  # Глобальные стили
│
├── assets/                    # Статические ресурсы
│   └── react.svg
│
├── components/                # React компоненты
│   ├── AddressAutocomplete.jsx
│   ├── AddressExtractor.jsx
│   ├── AddressFromYandexMaps.jsx
│   ├── AddressInputDemo.jsx
│   ├── AddressValidator.jsx
│   ├── AdminSidebar.jsx
│   ├── AdvancedAddressFromYandexMaps.jsx
│   ├── AdvancedScheduleView.jsx
│   ├── BlogEditor.jsx
│   ├── BlogEditor.css
│   ├── BlogMeta.jsx
│   ├── BlogNavigation.jsx
│   ├── BlogPreview.jsx
│   ├── BookingConfirmations.jsx
│   ├── BookingOverviewCalendar.jsx
│   ├── Breadcrumbs.jsx
│   ├── ClientDashboardStats.jsx
│   ├── ClientMasterNote.jsx
│   ├── ClientRestrictionsManager.jsx
│   ├── ClientSalonNote.jsx
│   ├── ColorPicker.jsx
│   ├── ConflictsList.jsx
│   ├── DomainChecker.jsx
│   ├── FavoriteButton.jsx
│   ├── Footer.jsx
│   ├── Header.jsx
│   ├── JSONLDEditor.jsx
│   ├── LoyaltySystem.jsx
│   ├── ManagerInvitations.jsx
│   ├── MasterAccounting.jsx
│   ├── MasterDashboardStats.jsx
│   ├── MasterPageModules.jsx
│   ├── MasterScheduleCalendar.jsx
│   ├── MasterSettings.jsx
│   ├── MasterStats.jsx
│   ├── PastAppointments.jsx
│   ├── PaymentMethodSelector.jsx
│   ├── PlacesList.jsx
│   ├── PlacesManagementCalendar.jsx
│   ├── PopupCard.jsx
│   ├── SEOAnalyzer.jsx
│   ├── SalonDashboardStats.jsx
│   ├── SalonMasters.jsx
│   ├── SalonSidebar.jsx
│   ├── SalonWorkSchedule.jsx
│   ├── ServerBasedAddressExtractor.jsx
│   ├── Sidebar.jsx
│   ├── SimpleAddressFromYandexMaps.jsx
│   ├── SubscriptionModal.jsx
│   ├── SubscriptionPlanForm.jsx
│   ├── Tooltip.jsx
│   ├── WorkingHours.jsx
│   ├── YandexApiStatus.jsx
│   ├── YandexGeocoder.jsx
│   │
│   ├── booking/               # Компоненты бронирования
│   │   ├── BranchBookingModule.jsx
│   │   ├── MasterBookingModule.jsx
│   │   ├── MasterBookingSidebar.jsx
│   │   ├── SalonBookingModule.jsx
│   │   ├── index.js
│   │   └── *.md (документация)
│   │
│   └── ui/                    # UI компоненты (дизайн-система)
│       ├── Alert.jsx
│       ├── Badge.jsx
│       ├── Button.jsx
│       ├── Calendar.jsx
│       ├── Card.jsx
│       ├── Checkbox.jsx
│       ├── Input.jsx
│       ├── Logo.jsx
│       ├── ProfileCard.jsx
│       ├── Radio.jsx
│       ├── ServiceCard.jsx
│       ├── StatusIndicator.jsx
│       ├── Tabs.jsx
│       └── index.js
│
├── config/                    # Конфигурация
│   └── features.js            # Настройки функций
│
├── contexts/                  # React Contexts
│   ├── AuthContext.jsx        # Контекст авторизации
│   └── FavoritesContext.jsx   # Контекст избранного
│
├── hooks/                     # Custom React Hooks
│   ├── useMasterSubscription.js
│   └── useModal.js
│
├── layouts/                   # Layout компоненты
│   ├── AdminLayout.jsx
│   ├── ClientLayout.jsx
│   └── MainLayout.jsx
│
├── modals/                    # Модальные окна
│   ├── AuthModal.jsx
│   ├── BookingModal.jsx
│   ├── CategoryEditModal.jsx
│   ├── ClientNoteModal.jsx
│   ├── ConfirmCloseModal.jsx
│   ├── DeleteConfirmModal.jsx
│   ├── DepositModal.jsx
│   ├── ExpenseModal.jsx
│   ├── MasterModal.jsx
│   ├── MasterSettingsModal.jsx
│   ├── ModeratorModal.jsx
│   ├── PasswordSetupModal.jsx
│   ├── PaymentModal.jsx
│   ├── PlaceCalendarModal.jsx
│   ├── PlaceCreateModal.jsx
│   ├── RepeatBookingModal.jsx
│   ├── ScheduleModal.jsx
│   ├── ServiceEditModal.jsx
│   ├── ServiceModal.jsx
│   └── TaxRateModal.jsx
│
├── pages/                     # Страницы приложения
│   ├── About.jsx
│   ├── AdminAlwaysFreeLogs.jsx
│   ├── AdminBlog.jsx
│   ├── AdminDashboard.jsx
│   ├── AdminFunctions.jsx
│   ├── AdminModerators.jsx
│   ├── AdminSettings.jsx
│   ├── AdminStats.jsx
│   ├── AdminUsers.jsx
│   ├── AuthTest.jsx
│   ├── BlogList.jsx
│   ├── BlogPost.jsx
│   ├── BookingDemo.jsx
│   ├── BranchBookingPage.jsx
│   ├── BranchesDashboard.jsx
│   ├── BranchManagementPage.jsx
│   ├── ClientDashboard.jsx
│   ├── ClientFavorite.jsx
│   ├── ClientMasterNotes.jsx
│   ├── ClientProfile.jsx
│   ├── DesignSystemDemo.jsx
│   ├── Home.jsx
│   ├── MasterDashboard.jsx
│   ├── MasterSubscriptionPlans.jsx
│   ├── MasterTariff.jsx
│   ├── NotFound.jsx
│   ├── PlacesDashboard.jsx
│   ├── Pricing.jsx
│   ├── PublicProfile.jsx
│   ├── SalonTariff.jsx
│   ├── ServiceDashboard.jsx
│   ├── SubdomainPage.jsx
│   ├── TestAnyMaster.jsx
│   ├── UserAgreement.jsx
│   │
│   └── test/                  # Тестовые страницы
│       ├── BookingForm.jsx
│       ├── DomainTest.jsx
│       ├── MasterBookingTest.jsx
│       ├── ScheduleTest.jsx
│       ├── SimpleDomainTest.jsx
│       ├── WorkingHoursTest.jsx
│       └── YandexGeocoderTest.jsx
│
├── routes/                    # Роутинг (пустая папка)
│
└── utils/                     # Утилиты
    ├── api.js                 # API клиент (fetch обёртки)
    ├── calendarUtils.js       # Утилиты календаря
    ├── cities.js              # Список городов
    ├── config.js              # Конфигурация
    ├── dateUtils.js           # Утилиты работы с датами
    ├── designTokens.js        # Дизайн-токены
    ├── deviceUtils.js         # Утилиты определения устройств
    ├── domainUtils.js         # Утилиты работы с доменами
    ├── scheduleUtils.js       # Утилиты расписания
    └── subscriptionFeatures.js # Логика функций подписок
```

## 2. Backend (FastAPI)

```
backend/
├── main.py                    # Точка входа FastAPI приложения
├── database.py                # Настройки БД (SQLAlchemy)
├── models.py                  # SQLAlchemy модели
├── models_unified.py          # Унифицированные модели (legacy)
├── schemas.py                 # Pydantic схемы (валидация данных)
├── schemas_backup.py          # Резервная копия схем
├── auth.py                    # Аутентификация и авторизация
├── sms.py                     # SMS сервис
│
├── routers/                   # API роутеры (endpoints)
│   ├── __init__.py
│   ├── accounting.py          # Финансовый учет
│   ├── address_extraction.py  # Извлечение адресов
│   ├── admin.py               # Админ панель
│   ├── auth.py                # Авторизация
│   ├── balance.py             # Баланс пользователей
│   ├── blog.py                # Блог
│   ├── bookings.py            # Бронирования
│   ├── client.py              # Клиентский функционал
│   ├── domain.py              # Управление доменами
│   ├── expenses.py            # Расходы
│   ├── loyalty.py             # Программа лояльности
│   ├── master.py              # Функционал мастера
│   ├── master_page_modules.py # Модули страницы мастера
│   ├── moderator.py           # Модераторы
│   ├── promo_codes.py         # Промокоды
│   ├── salon.py               # Функционал салона
│   ├── service_functions.py   # Функции услуг
│   ├── subscription_plans.py        # Планы подписок (админ)
│   ├── subscription_plans_public.py # Планы подписок (публичные)
│   ├── subscriptions.py      # Подписки
│   ├── tax_rates.py           # Налоговые ставки
│   └── yandex_geocoder.py     # Яндекс геокодер
│
├── utils/                     # Бизнес-логика и утилиты
│   ├── __init__.py
│   ├── balance_utils.py        # Утилиты работы с балансом
│   ├── base62.py              # Кодирование base62
│   ├── booking_status.py      # Логика статусов бронирований
│   ├── schedule_conflicts.py  # Проверка конфликтов расписания
│   ├── seo.py                 # SEO утилиты
│   ├── subscription_features.py # Функции подписок
│   └── subscription_limits.py  # Лимиты подписок
│
├── services/                  # Фоновые сервисы
│   ├── bookings_limit_monitor.py    # Мониторинг лимитов бронирований
│   ├── daily_charges.py             # Ежедневные списания
│   ├── email_service.py             # Email сервис
│   ├── plusofon_service.py          # Plusofon интеграция
│   ├── recalc_favorites.py           # Пересчет избранного
│   ├── recurring_expenses.py         # Циклические расходы
│   ├── scheduling.py                 # Планирование задач
│   ├── verification_service.py       # Сервис верификации
│   └── zvonok_service.py             # Zvonok интеграция
│
├── alembic/                   # Миграции БД
│   ├── env.py
│   ├── script.py.mako
│   └── versions/              # 57 файлов миграций
│       ├── add_balance_system.py
│       ├── add_subscriptions_table.py
│       ├── add_loyalty_system.py
│       └── ... (54 других миграций)
│
├── scripts/                   # Скрипты
│   ├── create_subscription_plans.py
│   ├── create_test_accounting_data.py
│   ├── create_test_bookings_for_master.py
│   └── update_free_plan_limit.py
│
├── tests/                     # Тесты
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_bookings.py
│   ├── test_extended_stats.py
│   ├── test_master_page_modules.py
│   ├── test_scheduling.py
│   ├── test_subscription_features.py
│   └── test_subscription_plans.py
│
├── uploads/                   # Загруженные файлы
│   ├── logos/
│   └── photos/
│
└── [множество тестовых и утилитарных скриптов]
    ├── test_*.py              # Тестовые скрипты
    ├── create_*.py             # Скрипты создания данных
    ├── check_*.py              # Скрипты проверки
    ├── setup_*.py              # Скрипты настройки
    └── ...
```

## Статистика

### Frontend
- **Компоненты**: ~60 компонентов
- **Страницы**: ~35 страниц
- **Модальные окна**: 18 модалок
- **Утилиты**: 10 утилит
- **Hooks**: 2 кастомных хука
- **Contexts**: 2 контекста

### Backend
- **Роутеры**: 20 роутеров
- **Утилиты**: 7 утилит
- **Сервисы**: 9 фоновых сервисов
- **Миграции**: 57 миграций БД
- **Тесты**: 8 тестовых файлов
- **Скрипты**: множество утилитарных скриптов

## Основные модули

### Frontend
- **Бронирования**: `components/booking/`, `pages/BranchBookingPage.jsx`
- **Подписки**: `components/SubscriptionModal.jsx`, `pages/MasterTariff.jsx`, `pages/SalonTariff.jsx`
- **Админка**: `pages/Admin*.jsx`, `components/AdminSidebar.jsx`
- **Блог**: `components/Blog*.jsx`, `pages/Blog*.jsx`
- **Статистика**: `components/*DashboardStats.jsx`, `components/MasterStats.jsx`

### Backend
- **Подписки**: `routers/subscriptions.py`, `routers/subscription_plans*.py`, `utils/subscription_*.py`
- **Баланс**: `routers/balance.py`, `utils/balance_utils.py`, `services/daily_charges.py`
- **Бронирования**: `routers/bookings.py`, `utils/booking_status.py`, `services/bookings_limit_monitor.py`
- **Админка**: `routers/admin.py`, `routers/moderator.py`
- **Финансы**: `routers/accounting.py`, `routers/expenses.py`, `routers/tax_rates.py`

