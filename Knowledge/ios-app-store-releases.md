---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-10-20
artifact: Release
---

# Release — iOS App Store decisions through 1.1.0

Неизменяемые store-события. Текущий кандидат, CI и production deploy принадлежат [Production topology](production-topology.md). Этот файл не заменяет living-контракт Free Companion.

## iOS 1.0 — build 2

App Store rejection. Apple issues: **2.1** App Completeness, **2.3.10** Accurate Metadata, **3.1.1** In-App Purchase. Релиз ещё шёл в сторону paid/IAP.

## iOS 1.0.1 — build 8

Крупный technical release после IAP/security/release hardening. Сборка загружена в App Store Connect, установлена через TestFlight, прошла real-iPhone smoke и повторно отправлена на App Review.

Apple снова отклонил сборку по **3.1.1**: native app мог открывать paid digital functionality, купленную вне IAP.

## iOS 1.1.0 — Free Companion

Стратегия Free Companion принята после коммуникации с Apple. Это решение релиза, не текущий operational gate.

- Build 15 (`94d5319`, EAS `cdfc7a56-a2fa-42cd-81b4-edc37d9f6a77`) — промежуточный Free Companion candidate. Superseded historical candidate. Не текущая версия и не финальный submission candidate. EAS Build ID остаётся только идентификатором этой сборки.
- `60eba89` — mobile schedule и push hardening после build 15.
- `eca7aff` — bump iOS build number до 16. Из этого коммита собран final iOS candidate, build 16.
- `d072998` — backend-only выравнивание booking-limit, сделанное после build 16. Изменение полностью server-side и новой iOS-сборки не требует.

Живой store/deploy status build 16: [Production topology](production-topology.md).
