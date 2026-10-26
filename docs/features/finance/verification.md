# Finance access verification

Finance is available from the member shell. Overview, Purchases, and Budgets load for every verified active member. Financing loads only for an active business, finance, or head profile. Signed-out visitors, banned sessions, partner-only identities, and unrelated identities are denied. A replaced Google account is denied even when the member id still exists.

## Local evidence

- Injected-identity API tests cover a signed-out caller, a banned session, an unrelated identity, a replaced account, an ordinary member, a platform administrator with no finance profile, business, finance, and head grants, and a revoked grant.
- Public responses omit item notes, funding source names, earmark conditions, and refund account or phone values. The purchase register includes those refund fields only for a finance profile.
- Unimplemented mutations return a service-unavailable response and do not insert purchases, audit rows, or idempotency keys.
- PGlite applies `db/migrations/011_finance_core.sql` on a minimal identity schema. Every finance table has row level security enabled. `anon`, `authenticated`, `anonymous`, and `public` cannot select `finance.member_grants`. The migration seeds no grants or business rows. The view version starts at 0.
- Profile flags match the shared capability union for every combination of business, finance, and head. Platform role, department, and recruiting rows do not add a profile. Self-grant fails.
- The operator settings functions store a season, a strict ore threshold, and an annual reference start. The reference function leaves the last issued value empty and rejects a backward or reused start.
- Closed seasons, an earmark linked to two systems, and a purchase line without a matching allocation are rejected. Audit updates and deletes are rejected.
- Member-shell tests show the finance links without `team.finance`, hide Financing from a wildcard platform feature list, redirect the legacy budget and expenses URLs, and leave the other team links in place.
- Focus tests clear financing and refund details when the grant changes, clear the cache on a denied identity, and ignore a late response from the previous account.
- The grant script refuses a self-grant and prints a dry run without opening a database connection.

## Checks

Commands run on Node 24.19.0:

- `npm ci`
- `npm run typecheck`
- `npm run typecheck:api`
- `npm run typecheck:api:runtime`
- `npm run lint`
- `npm test`: 86 Vitest files, 1027 tests passed, then 3 deployment-guard tests passed
- `npm run build`: static output 9.21 MB of 10 MB; source functions 11 of 11. The Vite build does not emit `.vercel/output/functions`, so the generated-function comparison is unchanged from the existing guard and is skipped until that directory exists.
- `git diff --check`

The member-local server was opened on loopback. Overview, Purchases, and Budgets rendered for the local member. Financing was not in the navigation. A direct financing URL returned to Overview and raised a notification. The legacy budget URL landed on Budgets and kept the query and hash. Department team links remained.

## Release boundary

No migration was applied to a hosted database. No finance deployment was made. Production still requires explicit operator grants, a season, a threshold, and an unused reference start before later slices issue references or store files.
