Gate flows live in this folder. Shared login/logout helpers are in
`../shared/`. Debug screenshot helper is in `../debug/` and is excluded
from the default suite.

Run only through `../../scripts/run-maestro-e2e.sh` (or `npm run test:e2e:ios` /
`npm run test:e2e:android` from `mobile/`). See `../README.md`.

Do not point these flows at Expo Go (`host.exp.Exponent`) or at
`com.yourcompany.dedato`. Current identifiers:

- iOS: `com.dedato.app`
- Android: `ru.dedato.mobile`

Accounts: DEV_E2E Master A `+79991111111` / `e2e123` (digits typed: `9991111111`).
Never use production accounts.
