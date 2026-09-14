---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-09-13
artifact: Decision
---

# Decision — pre-created readonly demo

Исторический P1 и принятое решение. Живой контракт принадлежит [Identity and access](identity-access.md); этот документ не заменяет его.

## Previous contract (retired)

Anonymous demo access мог создать или reseed shared demo и выдавал ordinary JWT. Readonly enforcement было неполным (dependency-scoped) и допускало cross-owner mutations.

Это больше не текущая истина.

## Decision

Перейти на **pre-created shared demo**: anonymous access больше не создаёт, не reseed-ит и не repair-ит shared demo. Readonly session и mutation boundary — living identity contract, не второй SSOT в этом файле.

**Source:** commit `958518d`. Living current owner: [Identity and access](identity-access.md).
