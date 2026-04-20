# docs/internal

**Не** публичная документация продукта. Сюда — заметки команды, чек-листы внутренних релизов, scratchpad (по соглашению команды).

Рекомендация: не класть сюда секреты; при необходимости — ссылка на secret store, без копий ключей.

- [SSL_TLS_SERVER_TEMPLATE.md](SSL_TLS_SERVER_TEMPLATE.md) — шаблон TLS/nginx; **секреты в репо не кладём** (см. предупреждение в файле).
- [SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md) — оценка и план при утечке ключа в git (internal runbook, без destructive шагов).
- [TLS_ROTATION_RUNBOOK_DEDATO_RU.md](TLS_ROTATION_RUNBOOK_DEDATO_RU.md) — **операционная** ротация TLS после подтверждённого MATCH (host nginx).
- [POST_INCIDENT_REPO_HARDENING.md](POST_INCIDENT_REPO_HARDENING.md) — post-incident: history rewrite vs компенсации, gitleaks, политика.
- [GIT_HISTORY_REWRITE_TLS_PLAN.md](GIT_HISTORY_REWRITE_TLS_PLAN.md) — подготовка к **безопасному** history rewrite (TLS; не выполнять вслепую).
- [GIT_HISTORY_REWRITE_INVENTORY_FINAL.md](GIT_HISTORY_REWRITE_INVENTORY_FINAL.md) — **финальный** pre-rewrite inventory (пути, классификация).
