# iOS free-companion privacy evidence — 1.0.1 (3)

| App Privacy category | iOS runtime evidence | Proposed ASC answer later |
| --- | --- | --- |
| Purchase History | `IOS_IAP_ENABLED=false`; lifecycle is not mounted; StoreKit and Apple backend entry points fail closed. iOS «Мой доступ» and dashboard use only `GET /api/subscriptions/access-summary`; its allowlisted response contains access level, status/end date, feature flags and booking-limit state, and excludes price, billing provider/method, payment identifiers, payment snapshots and history. The iOS branch does not call `/api/subscriptions/my`, payment history, pending Robokassa verification or subscription revenue reporting. | No |
| Financial Info | The iOS access-only response contains no subscription price, payment method/provider, paid amount, balance/reserve/spend, points or transaction identifiers. Unrelated master-entered finance records remain part of the finance product feature and must be assessed under their existing declaration. | No for subscription purchase data; no change to declarations for user-entered finance records |
| Product Interaction | Ordinary AppMetrica product-interaction events remain enabled | Yes, linked as currently declared if User ID is attached |
| User ID | Existing authenticated numeric profile identifier behavior is unchanged | No change from the current declaration |
| Diagnostics | AppMetrica Core/Crashes remains enabled; StoreKit transaction diagnostics are not added | No change from the current declaration |
| Other Data | No new data type is introduced by the free-companion model | No delta |

This document is code evidence only. It does not authorize or perform an App Store Connect change.
