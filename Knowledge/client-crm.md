---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Client CRM

Живой канон клиентской базы мастера и клиентских связей с профилями. CRM использует факты Booking, но не владеет жизненным циклом записи, loyalty ledger или Identity.

## Клиентская база мастера

Основной master-only список строится из `Booking` со статусом `completed` и непустым `client_id`. Для каждого клиента он агрегирует число завершённых и отменённых записей, последний визит, top services и фактическую выручку после зарезервированных/списанных loyalty points. Поиск и сортировка выполняются после загрузки агрегата.

Карточка может существовать без completed-записи: detail допускает любую связанную Booking или `MasterClientMetadata`. Поэтому множество карточек шире множества строк списка.

`MasterClientMetadata` хранит master-specific alias и заметку по паре `(master_id, client_phone)`; эта пара защищена DB uniqueness. В API внешний `client_key` может быть `user:{id}` или `phone:{phone}`, а persisted metadata остаётся phone-keyed.

**Sources:** `backend/routers/master_clients.py` — `_get_clients_with_completed`, `get_client_detail`, `update_client_metadata`; `backend/models.py` — `MasterClientMetadata`; `backend/tests/test_master_clients_completed_only.py`, `backend/tests/test_master_clients_patch_note.py`.

## Ограничения записи

`ClientRestriction` поддерживает `blacklist` и `advance_payment_only`, soft-deactivation через `is_active` и три owner dimensions: salon, legacy `IndieMaster` или canonical `Master`. Выбор master/legacy owner path определяется `LEGACY_INDIE_MODE`.

Ручные ограничения создаются и читаются через master/salon APIs и карточку клиента. `ClientRestrictionRule` описывает автоматический порог отмен по причине, периоду и типу ограничения. `check_client_restrictions` сначала ищет ручное ограничение, затем для зарегистрированного клиента проверяет blacklist rules и только после них advance-payment rules. При срабатывании rule функция создаёт или обновляет persisted `ClientRestriction` и сама выполняет commit.

Проверка вызывается синхронно из public booking, обычной и temporary client booking, public eligibility и master eligibility. Blacklist блокирует создание; advance-only направляет поддерживаемые client paths к temporary/payment flow, а public master path отклоняет создание с указанием использовать другой flow.

**Sources:** `backend/models.py` — `ClientRestriction`, `ClientRestrictionRule`; `backend/utils/client_restrictions.py`; `backend/routers/public_master.py` — `create_public_booking`, `get_public_eligibility`; `backend/routers/client.py` — `create_booking`, `create_temporary_booking`; `backend/routers/master.py` — restriction handlers and `check_booking_eligibility`.

## Заметки и избранное клиента

Клиентские данные о профилях отделены от заметки мастера о клиенте:

- `ClientFavorite` хранит client-owned избранные salon/master/service targets;
- `ClientNote` хранит phone-keyed заметку клиента о master или salon target;
- `ClientSalonNote` и `ClientMasterNote` — user-keyed клиентские заметки для salon/branch и master-in-salon contexts;
- `MasterClientMetadata.note` — заметка мастера о клиенте.

Эти таблицы не являются взаимозаменяемыми и не должны объединяться только по сходству названий.

**Sources:** `backend/models.py` — named models; `backend/routers/client.py` — notes/favorites routes; `backend/routers/public_master.py` — `get_public_client_note`; `backend/services/account_deletion.py`.

## Entitlement и privacy boundaries

Master client-list/card handlers проверяют `has_clients_access`. Общие master restriction handlers имеют authentication/owner checks, но не тот же capability guard; это зафиксировано в [feature entitlement Debt](feature-entitlements-and-jobs.md#entitlement-enforcement-is-not-centralized).

CRM содержит phone, notes, booking-derived history and revenue. Удаление аккаунта удаляет текущие metadata/restrictions/notes/favorites в пределах repository service, но исторические и внешние retention boundaries принадлежат [privacy canon](privacy-data-handling.md).

## Подтверждённые ограничения

Failure boundaries и schema/lifecycle drift находятся в [CRM/Loyalty/Promo/Finance Debt](client-crm-loyalty-promo-finance.md). Никакой event bus между Booking и CRM не подтверждён: агрегаты читают Booking напрямую, а restriction checks вызываются синхронно.
