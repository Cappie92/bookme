---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-13
---

# Master catalog — categories and services

Канон текущего category/service mutation contract для кабинета мастера. Scheduling читает duration, Booking хранит canonical `Service.id`; этот документ владеет каталогом и его редактированием.

## Category deletion

Удаление category **не** удаляет services. После delete:

- `MasterService.category_id = NULL`;
- услуга остаётся в каталоге и отображается в группе «Без категории».

Контракт одинаков для web, trusted iOS companion, Android и backend. Знание `category_id` само по себе не удаляет связанные услуги.

**Source:** `backend/routers/master.py` — `delete_master_category`; `backend/tests/test_master_category_preservation.py`; `frontend/src/modals/DeleteConfirmModal.jsx`; `mobile/app/(master)/master/services.tsx`.

## Uncategorized editing

Существующую услугу с `category_id = NULL` можно открыть, изменить и сохранить без назначения новой category. После refetch она остаётся `NULL` и видимой в «Без категории».

CREATE новой услуги по-прежнему требует category.

Если создание инициировано внутри конкретной category, эта category должна быть предвыбрана в форме.

**Source:** `backend/tests/test_master_category_preservation.py`; `frontend/src/modals/ServiceEditModal.jsx`; `mobile/app/(master)/master/services.tsx`.

## Price, duration and description

Общий parsing/validation вынесен в `shared/serviceEdit.js`. Клиенты принимают price:

- `100`
- `100.5`
- `100,5`
- `100.50`
- `100,50`

Некорректные строки (`100,5,2` и аналоги) не отправляются: `parseServicePrice` возвращает `null`.

Backend:

- price — finite number, `>= 0`; цена `0` валидна;
- duration — integer, 10–480 минут.

Пустая description означает реальную очистку и должна сохраняться как пустое значение, а не исчезать из payload.

Structured backend errors преобразуются в human-readable message (`serviceEditError`): не `[object Object]`, не stack/internal details. Форма остаётся доступной для исправления и retry.

**Source:** `shared/serviceEdit.js`; `frontend/src/modals/ServiceEditModal.jsx`; `frontend/src/utils/serviceEdit.test.js`; `mobile/app/(master)/master/services.tsx`.

## Client UX invariants

- Mobile category picker не должен конфликтовать с открытой keyboard.
- Web category/service deletion не должен приводить к blank page; backend error отображается управляемо.

## Boundaries

- Каталог не владеет slot generation, booking ownership или SaaS entitlements.
- Ordinary web и Android сохраняют полный catalog editor; trusted `ios_app` companion использует те же backend invariants на разрешённой Services surface — см. [Web architecture](web.md).
