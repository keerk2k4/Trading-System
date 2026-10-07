# Generated API clients (do not edit)

Everything under `src/generated/` is **generated** from the OpenAPI contracts by
[OpenAPI Generator](https://openapi-generator.tech). It is committed to git on purpose,
so a contract change shows up as a reviewable diff and the app builds without Java.

| Contract | Output | Angular services |
|---|---|---|
| `sprint09/contracts/auth-api.yaml` | `src/generated/auth-client/` | `AuthService`, `KYCService`, `ProfileService` |
| `sprint09/contracts/trade-api.yaml` | `src/generated/trade-client/` | `AccountsService`, `OrdersService` |
| `Contracts/API-Schemas/auth-admin-api.yaml` (the team's own) | `src/generated/auth-admin-client/` | `HealthService` |
| `Contracts/API-Schemas/trade-admin-api.yaml` (the team's own) | `src/generated/trade-admin-client/` | `AdminService` |

The two `*-admin-api.yaml` contracts were written by the team for the admin dashboard; the
programme's `auth-api.yaml` and `trade-api.yaml` stay untouched. Their wrapper is
`src/app/shared/services/service-health.service.ts`.

## Rules

- **Never edit files in this folder by hand.** Changes are overwritten on the next run.
  Change the contract, then regenerate.
- **Never import from here in components.** Use the wrappers instead:
  - `src/app/shared/api/api-clients.ts`: base URLs and bearer-token wiring (`provideApiClients()`)
  - `src/app/shared/services/trade-api.service.ts`: trade client wrapper
  - `src/app/shared/services/auth.service.ts`: auth client wrapper
  - `src/app/shared/services/kyc.service.ts`: KYC client wrapper
  - `src/app/shared/models/*.models.ts`: app types are aliases of the generated models

## Regenerate

From `sprint09/trading-ui` (needs Java 11+ on the PATH):

```bash
npm run generate:clients
```

Then rebuild. Any code that no longer matches the contract fails to compile:

```bash
npx ng build
```

Commit the contract change, the regenerated `src/generated/` and any code fixes together.

## Configuration and pinned versions

All generator settings live in `trading-ui/openapitools.json`. Both versions are pinned exactly:

| What | Version | Where |
|---|---|---|
| OpenAPI Generator (the Java generator) | `7.25.0` | `openapitools.json` → `generator-cli.version` |
| `@openapitools/openapi-generator-cli` (npm wrapper that downloads it) | `2.41.0` | `package.json` devDependencies |
| Generator | `typescript-angular`, `ngVersion` 21.0.0 | `openapitools.json` |

Upgrading is a deliberate change: bump the version in `openapitools.json`, regenerate, review the diff.

Why 7.25.0: older generators (e.g. 7.14.0) mishandle OpenAPI 3.1's `additionalProperties: false`
and emit `[key: string]: any` on the trade models, which would let code read fields that are not
in the contract and still compile.
