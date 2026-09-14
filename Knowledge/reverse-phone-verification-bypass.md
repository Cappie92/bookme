---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-09-13
artifact: Bug
---

# Reverse-phone verification bypass

Исторический P1. Не является текущим verification mechanism.

## Finding

Legacy reverse-phone API позволял anonymous caller изменить `is_phone_verified` без полноценного challenge/provider proof. Live status helper в этом контуре не доказывал possession у провайдера.

## Resolution

Удалены оба legacy endpoints и неиспользуемый status helper. Current repository отвечает `404`. Актуальная phone verification остаётся code/challenge-based и описана в [Identity and access](identity-access.md).

**Source:** `backend/tests/test_reverse_phone_routes_removed.py`; commit `2e97c7f`.
