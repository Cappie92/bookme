---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: prod
status: active
last_verified: 2026-09-13
artifact: Incident
---

# Incident — production environment values exposed in terminal/transcript

Открытый security debt. Значения credentials в Knowledge не хранятся и не восстанавливаются.

## Fact

Во время одной неудачной ручной backend replacement-команды production environment values были выведены в terminal output и попали в conversation transcript.

## Classification

- Произошёл credential exposure.
- Раскрытые credentials следует считать compromised.
- Требуется controlled credential rotation.
- Rotation ещё является отдельным follow-up и сознательно не смешивалась со стабильным release cutover `7c320bd`.

## Required action

Отдельный authorized credential-owner track: inventory затронутых категорий секретов, rotation и проверка, что новые значения не попадают в логи, чаты и Knowledge. Этот документ фиксирует только факт, статус и необходимость действия.

Связанный living debt: [Security and privacy Debt](security-and-privacy.md#open-production-credential-exposure).
