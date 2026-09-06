# Yandex / Plusofon: manifest локального cleanup

Baseline: `4d423cf3d91324b1dee599fc7aaa0e5f899d6886`.

Manifest подготовлен до изменения исходников. Новый Suggest key не используется. Zvonok, Robokassa, OAuth, mobile и production workflow вне scope изменений. История Git и production env не изменяются.

## DELETE

| Файл | Группа | Причина / runtime consumer | Действие |
|---|---|---|---|
| `backend/routers/yandex_geocoder.py` | YANDEX LEGACY | Публичный legacy API; только diagnostic consumers | DELETE |
| `backend/routers/address_extraction.py` | YANDEX LEGACY | Публичный legacy API; только diagnostic consumers | DELETE |
| `frontend/src/pages/test/YandexGeocoderTest.jsx` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/src/components/YandexApiStatus.jsx` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/src/components/YandexGeocoder.jsx` | YANDEX LEGACY | Нет продуктовых consumers | DELETE |
| `frontend/src/components/AddressAutocomplete.jsx` | YANDEX LEGACY | Нет продуктовых consumers | DELETE |
| `frontend/src/components/AddressInputDemo.jsx` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/src/components/AddressExtractor.jsx` | YANDEX LEGACY | Нет продуктовых consumers | DELETE |
| `frontend/src/components/AddressFromYandexMaps.jsx` | YANDEX LEGACY | Отключённая legacy страница и её карта | DELETE |
| `frontend/src/components/AdvancedAddressFromYandexMaps.jsx` | YANDEX LEGACY | Отключённая legacy страница и её карта | DELETE |
| `frontend/src/components/SimpleAddressFromYandexMaps.jsx` | YANDEX LEGACY | Отключённая legacy страница и её карта | DELETE |
| `frontend/src/components/ServerBasedAddressExtractor.jsx` | YANDEX LEGACY | Нет продуктовых consumers | DELETE |
| `frontend/src/components/AddressValidator.jsx` | YANDEX LEGACY | Нет продуктовых consumers | DELETE |
| `frontend/src/components/YandexMap.jsx` | YANDEX LEGACY | Отключённая legacy страница и её карта | DELETE |
| `frontend/src/pages/SubdomainPage.jsx` | YANDEX LEGACY | Отключённая legacy страница и её карта | DELETE |
| `frontend/test_yandex_api.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_yandex_geocoder.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_address_extraction.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_address_extractor.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_api_status.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_server_api.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `frontend/test_short_links.html` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `test_address_api.py` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `test_short_links.py` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `test_simple_api.py` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `test_frontend_api.py` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `test_yandex_api.py` | YANDEX LEGACY | Legacy diagnostic, не продуктовый flow | DELETE |
| `YANDEX_API_SETUP.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `YANDEX_API_SETUP_COMPLETE.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `YANDEX_API_SETUP_FINAL.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `YANDEX_API_SOLUTION.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `YANDEX_GEOCODER_SETUP.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/src/components/YANDEX_API_SETUP.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/src/components/README_YANDEX_API_SETUP.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/src/components/README_ADDRESS_API.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/src/components/SIMPLE_ADDRESS_SOLUTION.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/SHORT_LINKS_SOLUTION.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/SETUP_ENV.md` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/.env.backup` | YANDEX LEGACY | Инструкции/конфигурация удаляемого контура | DELETE |
| `backend/services/plusofon_service.py` | PLUSOFON | Нет imports или runtime consumers | DELETE |
| `backend/PLUSOFON_SETUP.md` | PLUSOFON | Инструкции/конфигурация удаляемого контура | DELETE |
| `frontend/ADDRESS_EXTRACTION_GUIDE.md` | YANDEX LEGACY | Инструкции снятых demo HTML; runtime consumers нет; дополнение manifest до удаления | DELETE |

## MODIFY

Дополнение preflight перед удалением: `frontend/ADDRESS_EXTRACTION_GUIDE.md` — YANDEX LEGACY, DELETE; только инструкции снятых demo HTML и извлечения адресов, runtime consumers нет. `indie_refs.md` и `indie_refs.txt` — KEEP: исторические результаты поиска, не действующий runbook, секретов удаляемого контура не содержат.

| Файл | Причина / consumer | Действие |
|---|---|---|
| `backend/main.py` | Startup: снять два legacy router | MODIFY |
| `backend/settings.py` | Startup: убрать Plusofon declarations/validation/helper | MODIFY |
| `frontend/src/App.jsx` | Удалить публичный diagnostic route | MODIFY |
| `frontend/src/pages/ServiceDashboard.jsx` | Удалить unused import | MODIFY |
| `backend/.env.example` | Убрать obsolete Plusofon vars | MODIFY |
| `deploy/prod/backend.env.example` | Убрать obsolete Plusofon vars | MODIFY |
| `deploy/staging/backend.env.example` | Убрать obsolete Plusofon vars | MODIFY |
| `deploy/staging/check-env.sh` | Staging preflight: убрать требование мёртвого provider | MODIFY |
| `scripts/e2e_full.sh` | Убрать obsolete Plusofon vars | MODIFY |
| `scripts/test_e2e.sh` | Убрать obsolete Plusofon vars | MODIFY |
| `backend/test_phone_verification_scenarios.py` | Сохранить общий smoke; удалить только Plusofon-блок | MODIFY |
| `docs/archive/by-topic/deploy-legacy/SERVER_SETUP.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/PLUSOFON_AUDIT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `PROJECT_STRUCTURE.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/CONFIG_AUDIT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/CONFIG_CLEANUP_PLAN.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/E2E_PHASED_PLAN.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/E2E_RUNBOOK.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/E2E_STATUS_AUDIT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/END_TO_END_READY_REPORT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/SWAGGER_ACTIONABLE_SHORTLIST.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/SWAGGER_AND_SYSTEM_AUDIT_REPORT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/archive/by-topic/loyalty/LOYALTY_CONTRACT_FIX_REPORT.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `docs/c4/01-context.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/backend-api.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/configuration.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/coverage-matrix.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/domain-map.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/drift-queue.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/privacy-data-handling.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |
| `Knowledge/staging.md` | Точечно очистить ссылки/инструкции удалённых компонентов; сохранить unrelated содержание | MODIFY |

## KEEP

| Файл | Причина / consumer | Действие |
|---|---|---|
| `backend/models.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/schemas.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/routers/master.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/routers/public_master.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/utils/yandex_maps_url.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/utils/calendar_ics.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/routers/client.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `frontend/src/components/MasterSettings.jsx` | Строковый address, API/public UI, map links или persistence | KEEP |
| `frontend/src/pages/MasterPublicBookingPage.jsx` | Строковый address, API/public UI, map links или persistence | KEEP |
| `frontend/src/components/booking/PublicBookingSidebar.jsx` | Строковый address, API/public UI, map links или persistence | KEEP |
| `frontend/src/utils/publicAddressDisplay.js` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/utils/masterAddress.ts` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/utils/publicAddressDisplay.ts` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/components/modals/EditWorkSettingsModal.tsx` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/components/publicBooking/MasterPublicBookingPresentational.tsx` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/services/api/master.ts` | Строковый address, API/public UI, map links или persistence | KEEP |
| `mobile/src/services/api/publicMasters.ts` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/routers/auth.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `frontend/src/components/auth/YandexAccountLinkPanel.jsx` | Действующие OAuth/analytics | KEEP |
| `frontend/src/pages/OAuthCallback.jsx` | Действующие OAuth/analytics | KEEP |
| `frontend/src/modals/AuthModal.jsx` | Действующие OAuth/analytics | KEEP |
| `frontend/src/analytics/metrika.js` | Действующие OAuth/analytics | KEEP |
| `mobile/src/config/yandexMobileAuth.ts` | Действующие OAuth/analytics | KEEP |
| `backend/services/zvonok_service.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `backend/services/verification_service.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `backend/routers/bookings.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `backend/tests/test_signup_phone_verification.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `backend/tests/test_password_reset_phone.py` | Строковый address, API/public UI, map links или persistence | KEEP |
| `backend/tests/test_public_booking_phone_verification.py` | Действующие OTP/OAuth flows и regression tests | KEEP |
| `backend/tests/test_pending_contact_change.py` | Строковый address, API/public UI, map links или persistence | KEEP |

## ADD

| Файл | Назначение |
|---|---|
| `backend/tests/test_legacy_integrations_cleanup.py` | Address persistence/public link, startup и отсутствие legacy API/config |
| `frontend/src/utils/addressIntegrationContract.test.js` | Адресные ссылки и отсутствие diagnostic UI/Maps API consumers |
| `docs/YANDEX_PLUSOFON_CLEANUP.md` | Этот manifest и итоговые evidence |

## Future deployment

BACKEND + FRONTEND. Migration NONE. После успешного deploy старый Geocoder key отозвать без замены; Plusofon token отозвать без выпуска нового. Новый Suggest key оставить неиспользуемым.

## Финальная классификация diff

Полный список: 42 удаления, 31 изменение существующих файлов, 3 добавления. UNEXPECTED = 0. Staged index пуст; commit/push/deploy не выполнялись.

| Path | Операция | Классификация |
|---|---|---|
| `backend/.env.example` | MODIFY | EXPECTED MODIFY |
| `backend/main.py` | MODIFY | EXPECTED MODIFY |
| `backend/PLUSOFON_SETUP.md` | DELETE | DOC CLEANUP |
| `backend/routers/address_extraction.py` | DELETE | EXPECTED DELETE |
| `backend/routers/yandex_geocoder.py` | DELETE | EXPECTED DELETE |
| `backend/services/plusofon_service.py` | DELETE | EXPECTED DELETE |
| `backend/settings.py` | MODIFY | EXPECTED MODIFY |
| `backend/test_phone_verification_scenarios.py` | MODIFY | TEST |
| `backend/tests/test_legacy_integrations_cleanup.py` | ADD | TEST |
| `deploy/prod/backend.env.example` | MODIFY | EXPECTED MODIFY |
| `deploy/staging/backend.env.example` | MODIFY | EXPECTED MODIFY |
| `deploy/staging/check-env.sh` | MODIFY | EXPECTED MODIFY |
| `docs/archive/by-topic/deploy-legacy/SERVER_SETUP.md` | MODIFY | DOC CLEANUP |
| `docs/archive/by-topic/loyalty/LOYALTY_CONTRACT_FIX_REPORT.md` | MODIFY | DOC CLEANUP |
| `docs/c4/01-context.md` | MODIFY | DOC CLEANUP |
| `docs/CONFIG_AUDIT.md` | MODIFY | DOC CLEANUP |
| `docs/CONFIG_CLEANUP_PLAN.md` | MODIFY | DOC CLEANUP |
| `docs/E2E_PHASED_PLAN.md` | MODIFY | DOC CLEANUP |
| `docs/E2E_RUNBOOK.md` | MODIFY | DOC CLEANUP |
| `docs/E2E_STATUS_AUDIT.md` | MODIFY | DOC CLEANUP |
| `docs/END_TO_END_READY_REPORT.md` | MODIFY | DOC CLEANUP |
| `docs/PLUSOFON_AUDIT.md` | MODIFY | DOC CLEANUP |
| `docs/SWAGGER_ACTIONABLE_SHORTLIST.md` | MODIFY | DOC CLEANUP |
| `docs/SWAGGER_AND_SYSTEM_AUDIT_REPORT.md` | MODIFY | DOC CLEANUP |
| `docs/YANDEX_PLUSOFON_CLEANUP.md` | ADD | DOC CLEANUP |
| `frontend/.env.backup` | DELETE | EXPECTED DELETE |
| `frontend/ADDRESS_EXTRACTION_GUIDE.md` | DELETE | DOC CLEANUP |
| `frontend/SETUP_ENV.md` | DELETE | DOC CLEANUP |
| `frontend/SHORT_LINKS_SOLUTION.md` | DELETE | DOC CLEANUP |
| `frontend/src/App.jsx` | MODIFY | EXPECTED MODIFY |
| `frontend/src/components/AddressAutocomplete.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/AddressExtractor.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/AddressFromYandexMaps.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/AddressInputDemo.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/AddressValidator.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/AdvancedAddressFromYandexMaps.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/README_ADDRESS_API.md` | DELETE | DOC CLEANUP |
| `frontend/src/components/README_YANDEX_API_SETUP.md` | DELETE | DOC CLEANUP |
| `frontend/src/components/ServerBasedAddressExtractor.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/SIMPLE_ADDRESS_SOLUTION.md` | DELETE | DOC CLEANUP |
| `frontend/src/components/SimpleAddressFromYandexMaps.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/YANDEX_API_SETUP.md` | DELETE | DOC CLEANUP |
| `frontend/src/components/YandexApiStatus.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/YandexGeocoder.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/components/YandexMap.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/pages/ServiceDashboard.jsx` | MODIFY | EXPECTED MODIFY |
| `frontend/src/pages/SubdomainPage.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/pages/test/YandexGeocoderTest.jsx` | DELETE | EXPECTED DELETE |
| `frontend/src/utils/addressIntegrationContract.test.js` | ADD | TEST |
| `frontend/test_address_extraction.html` | DELETE | EXPECTED DELETE |
| `frontend/test_address_extractor.html` | DELETE | EXPECTED DELETE |
| `frontend/test_api_status.html` | DELETE | EXPECTED DELETE |
| `frontend/test_server_api.html` | DELETE | EXPECTED DELETE |
| `frontend/test_short_links.html` | DELETE | EXPECTED DELETE |
| `frontend/test_yandex_api.html` | DELETE | EXPECTED DELETE |
| `frontend/test_yandex_geocoder.html` | DELETE | EXPECTED DELETE |
| `Knowledge/backend-api.md` | MODIFY | DOC CLEANUP |
| `Knowledge/configuration.md` | MODIFY | DOC CLEANUP |
| `Knowledge/coverage-matrix.md` | MODIFY | DOC CLEANUP |
| `Knowledge/domain-map.md` | MODIFY | DOC CLEANUP |
| `Knowledge/drift-queue.md` | MODIFY | DOC CLEANUP |
| `Knowledge/privacy-data-handling.md` | MODIFY | DOC CLEANUP |
| `Knowledge/staging.md` | MODIFY | DOC CLEANUP |
| `PROJECT_STRUCTURE.md` | MODIFY | DOC CLEANUP |
| `scripts/e2e_full.sh` | MODIFY | EXPECTED MODIFY |
| `scripts/test_e2e.sh` | MODIFY | EXPECTED MODIFY |
| `test_address_api.py` | DELETE | EXPECTED DELETE |
| `test_frontend_api.py` | DELETE | EXPECTED DELETE |
| `test_short_links.py` | DELETE | EXPECTED DELETE |
| `test_simple_api.py` | DELETE | EXPECTED DELETE |
| `test_yandex_api.py` | DELETE | EXPECTED DELETE |
| `YANDEX_API_SETUP_COMPLETE.md` | DELETE | DOC CLEANUP |
| `YANDEX_API_SETUP_FINAL.md` | DELETE | DOC CLEANUP |
| `YANDEX_API_SETUP.md` | DELETE | DOC CLEANUP |
| `YANDEX_API_SOLUTION.md` | DELETE | DOC CLEANUP |
| `YANDEX_GEOCODER_SETUP.md` | DELETE | DOC CLEANUP |

## Проверки и ограничения

- Ветка: `codex/remove-legacy-yandex-plusofon`; HEAD и origin/main на проверенном baseline `4d423cf3d91324b1dee599fc7aaa0e5f899d6886`.
- Существующие WIP/worktrees не изменялись. Индекс пуст.
- Address save/update/read: новые backend tests проходят; provider requests запрещены fixture. Строка и детали сохраняются, public API отдаёт обычную поисковую ссылку без API key и без address_detail в query.
- Public address rendering: рендерится настоящий PublicBookingSidebar, проверены текст и href. Web/mobile address source и модель БД не менялись.
- Legacy API отсутствуют в registry и возвращают 404. Diagnostic UI и SDK/Suggest/Geocoder consumers удалены.
- Startup без legacy env проверен отдельным процессом; остаточные PLUSOFON_* не читаются Settings.
- Focused backend + OTP (первый запуск): 59 passed. Финальные новые address/config/startup tests вместе с daily-charge регрессиями: 26 passed.
- Full backend: 879 passed, 9 existing skipped, 113 warnings; exit 0; 409.30 s. Новых skips нет.
- Frontend: 123 passed, 16 test files; из них 8 новых address contract tests.
- Production frontend build: PASS (2669 modules). Предупреждения об устаревшем Browserslist, PostCSS и размере chunks остаются; конфигурация build не менялась.
- Mobile: 10 passed, 3 suites — masterAddress, yandexMobileAuth, yandexMobileAuthLink; mobile source diff = 0.
- Python compile: PASS при PYTHONPYCACHEPREFIX в /tmp; существующий SyntaxWarning в tests/test_admin_users.py не менялся. Shell syntax: PASS. git diff --check: PASS.
- Первоначальный full backend прогон не принят как итог: DATABASE_URL=sqlite:// расходился с файловой БД фикстур; дополнительный focused запуск пересёкся с общим test.db. Последовательный запуск использует DATABASE_URL=sqlite:///./test.db без изменений runtime/test infrastructure.
- Secret scan: все известные уникальные legacy credential values (два Yandex и один Plusofon) — 0 hits в текущих tracked/untracked candidate files и frontend/dist. Значения не включены в отчёт. Legacy API/SDK markers в frontend/dist — 0.
- Redacted Gitleaks: baseline 30 findings; текущие исходники 21, новых 0; generated dist содержит ещё 1 копию существующего frontend/public/test-auth.html finding (22 вместе с dist). Оставшиеся находки вне cleanup scope: Robokassa/общие документы и fixtures, legacy JWT test-файлы, StoreKit/Podfile false positives. Это не глобальный clean security verdict; отдельное remediation не выполнено.
- История Git не переписана. Удалённые tracked файлы пока восстановимы из baseline; после deploy необходим ручной отзыв старых ключей/токена.
- Robokassa, Zvonok (включая logging), OAuth, Apple/IAP, iOS fixed-feature, Android commerce, web ios_app policy, production deployment workflow: runtime diff = 0.
- Продакшен, production env, GitHub Secrets и аккаунты провайдеров не менялись. Никакие реальные звонки/платежи этим cleanup не проверялись.
- Новый Suggest key не устанавливался в code/env/build.
- iOS 1.0.1 (6), Android 1.0.1 (2) без изменения.

### Воспроизведение основных проверок

Из backend (использован существующий Python environment с repository dependencies):

```sh
ENVIRONMENT=development DATABASE_URL=sqlite:///./test.db ZVONOK_MODE=stub ROBOKASSA_MODE=stub EMAIL_ENABLED=false python -m pytest -q --disable-warnings --tb=short
```

Backend suite и focused DB tests запускать последовательно: fixture использует общий локальный test.db.

Из frontend:

```sh
npm test -- --run
npm run build
```

Ни commit, ни push, ни deploy в этом проходе не выполнялись.

## Итог

CLEANUP READY FOR PRE-COMMIT REVIEW.

В рамках согласованного cleanup blockers нет. Следующий gate: READY FOR COMMIT + PUSH + CONTROLLED DEPLOY; операции этого gate пока не выполнены. Общие ранее известные security findings не объявляются устранёнными.
