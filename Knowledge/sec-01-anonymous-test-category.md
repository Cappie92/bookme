---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-09-13
artifact: Bug
---

# SEC-01 — anonymous test-category write route

Исторический security finding. Не является текущим API.

## Finding

`POST /api/master/test-category` был anonymous production write route: позволял создавать category без authenticated master context.

## Resolution

Route полностью удалён. Production и current repository отвечают `404`. Текущий catalog contract принадлежит [Master catalog](master-catalog.md); этот path туда не входит.

**Source:** `backend/tests/test_master_category_route_security.py`; commit `11ca917`.
