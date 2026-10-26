# Finance access verification

Finance is available from the member shell. Overview, Purchases, and Budgets load for every verified active member. Financing loads only for an active business, finance, or head profile. Signed-out visitors, banned sessions, partner-only identities, and unrelated identities are denied. A replaced Google account is denied even when the member id still exists.

## Local evidence

- Injected-identity API tests cover a signed-out caller, a banned session, an unrelated identity, a replaced account, an ordinary member, a platform administrator with no finance profile, business, finance, and head grants, and a revoked grant.
- Public responses omit item notes, funding source names, earmark conditions, and refund account or phone values. The purchase register includes refund fields only when the files-and-refunds capability is true. Draft budget items are omitted without the draft-items capability. The register query is limited to the current season.
- Season-budget mutations create one budget, approve it once, maintain items, and bump the view version in the same transaction. A rolled-back call restores the version. Purchase, import, funding, and request mutations still return a service-unavailable response and do not insert purchases, audit rows, or idempotency keys.
- PGlite applies `db/migrations/011_finance_core.sql` on a minimal identity schema. Every finance table has row level security enabled. `anon`, `authenticated`, `anonymous`, and `public` cannot select `finance.member_grants`. The migration seeds no grants or business rows. The view version starts at 0.
- Profile flags match the shared capability union for every combination of business, finance, and head. A finance department, a "Head of Finance" title, `team.finance` grants and roles, and the administrator wildcard do not add a finance capability. The same denial is covered in the API and in the capability resolver. Self-grant fails. A grant from a member who is not an active platform administrator fails.
- The operator settings functions store a season, a strict ore threshold, and an annual reference start. The reference function leaves the last issued value empty and rejects a backward or reused start.
- Closed seasons, an earmark linked to two systems, an earmark from another season, and a purchase line without a matching allocation are rejected. Audit updates, deletes, and truncates are rejected. `request:SNN` is a separate reference counter. Deleting a member who still has a finance grant is rejected.
- Member-shell tests show the finance links without `team.finance`, hide Financing from a wildcard platform feature list, redirect the legacy budget and expenses URLs, and leave the other team links in place.
- Focus tests clear financing and refund details when the grant changes, clear the cache on a denied identity, and ignore a late response from the previous account. A purchase or financing response that arrives after the grant is removed is discarded. Refund fields are redacted when only the files capability is removed. Draft items are dropped the same way.
- Capability flags and the view version are loaded in one snapshot.
- The grant script refuses a self-grant and prints a dry run, including the platform-administrator requirement, without opening a database connection.

## Checks

Commands run on Node 24.19.0 and npm 11.17.0:

- `npm ci`
- `npm run typecheck`
- `npm run typecheck:api`
- `npm run typecheck:api:runtime`
- `npm run lint`
- `npm test`: 89 Vitest files, 1057 tests passed, then 3 deployment-guard tests passed
- `npm run build`: static output 9.23 MB of 10 MB; source functions 11 of 11. The Vite build does not emit `.vercel/output/functions`, so the generated-function comparison is unchanged from the existing guard and is skipped until that directory exists.
- `git diff --check`

Component tests cover the budgets page: a member sees planned, actual, and difference amounts, can reveal a cancelled row, and does not see create or edit actions. The head can create a missing budget and approve a draft. A finance edit keeps the typed description when the save is rejected and sends the revision from when editing started. A browser session was not used for this slice. The local member shell still does not call the finance API.

## Release boundary

No migration was applied to a hosted database. No finance deployment was made. Production still requires explicit operator grants, a season, a threshold, and an unused reference start before later slices issue references or store files.
