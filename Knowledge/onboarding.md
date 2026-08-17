---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# DeDato onboarding

Короткий безопасный маршрут для нового участника. Historical reports and root scripts are not authority merely because they are easy to find.

## Read first

1. [Knowledge governance](README.md) — source priority, confidence and security rules.
2. [Product roles and business model](product-roles-business-model.md) and [Domain map](domain-map.md).
3. [Backend architecture](backend.md), [Web architecture](web.md) or [Mobile architecture](mobile.md) for the component being changed.
4. The owning domain or contract document for the behavior.
5. The linked Debt document before changing a sensitive boundary.

Production topology is repository-known only. Do not connect to hosts, run `prod`/deploy/smoke scripts or inspect credential-like artifacts during ordinary onboarding.

## Establish a safe workspace

```bash
git status -sb
git log --oneline --decorate -5
```

Preserve existing user changes. Choose one package and follow [Local development](local-development.md). Do not install dependencies at repository root as a substitute for the frontend/mobile package lockfile.

Configuration values come from authorized local channels and tracked templates only after checking [Configuration](configuration.md) and [Security Debt](security-and-privacy.md). Never copy repository credential-like literals into chat, Knowledge, commits or issue reports.

## Before editing

- Identify the one canonical owner of the fact.
- Trace runtime/model/config sources before trusting an ADR, report or setup guide.
- Determine whether the path is public, authenticated, role-gated, object-owned or entitlement-gated.
- For data changes, inspect [Data and migrations](data-and-migrations.md).
- For cross-client behavior, inspect the relevant API/client contract and platform Debt.

If correct documentation would require revealing a credential-like value, stop that package and create only sanitized Debt; unrelated packages may continue.

## Verification and handoff

Use [Testing strategy](testing-strategy.md) to select the smallest owning suite and expand across affected boundaries. Before committing documentation, validate relative links/source paths, run `git diff --check`, inspect `git diff --stat` and confirm only intended files changed.

Product code, migrations, generated files, Knowledge and deployment are separate change scopes unless the task explicitly combines them. A client route guard, passing UI test or successful HTTP health response never substitutes for backend authorization, migration correctness or readiness.

## Where to ask for owner decisions

Repository evidence that is incomplete but safely documentable is marked `UNKNOWN`. A choice not determined by runtime belongs in an explicitly owned decision artifact; confirmed current limitations belong in the active debt documents registered in [Knowledge governance](README.md). Bugs, incidents, releases and target-state decisions are not created implicitly by onboarding work.
