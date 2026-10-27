# FIN-01: Establish Finance access, data contracts and protected routes

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-01, F-02, F-03, F-18
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Deliver a testable Finance entry point with verified member access, role-filtered public reads and private-action denial. Reuse current main identity/department catalogs. Establish the shared domain/API contracts and additive private schema needed by later end-to-end slices.

## Acceptance criteria

- [ ] FIN-01-A01 [F-01, F-02] All verified active members can reach Overview, Purchases and public Budgets, including a member outside Finance. Signed-out, banned, partner-only and unrelated identities are denied. Legacy sample finance URLs redirect without changing other team navigation.
- [ ] FIN-01-A02 [F-02] Explicit active Business/Finance/Head profiles determine capabilities. A title, Finance department/team feature, generic administrator or wildcard without a finance profile does not receive private data or authority. Revocation and account change clear private state and reject late responses.
- [ ] FIN-01-A03 [F-03] The additive private schema and TypeScript operation/response contracts cover budgets, funding, requests/revisions, actuals, obligations/documents, uploads, outbox, audit, revisions, idempotency and annual counters. Reuse canonical department/member keys and seed no real grants or finance records.
- [ ] FIN-01-A04 [F-03] Exact amount/date/reference helpers preserve inventory 11.1 and 12.1 behavior. The trusted settings path can set S27, threshold and a monotonically safe annual reference start without issuing a production reference.
- [ ] FIN-01-A05 [F-18] One consolidated Finance function and its local adapter mapping remain within at most 11 source/generated functions. Local accounts are loopback-only. Public Finance loading/errors use existing components and shared notifications.

## Blocked by

None. This is the first eligible slice after delivery is authorized.

## Shared contracts and change areas

- New src/features/Finance/types.ts, routes and access/repository modules
- New api/finance.ts and api/_lib/finance-* dispatch/access modules
- Additive `db/migrations/*_finance_*.sql`, canonical identity references
- Existing member shell/sidebar, local API mapping, vercel.json and relevant guards

Coordinator owns shared contracts, dispatch registrations, migration filenames, shell/sidebar and local adapter. Later workers consume these contracts and add their bounded modules. Current main access files differ from the canonical checkout; start from refreshed main, not the project-management branch.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use injected identity/grant API tests, PGlite schema/privacy tests and member-shell route/component tests. Include a platform administrator with no finance profile, an ordinary non-Finance member, revoked access and an old-account response. Run all typechecks and function/deployment guards. Inspect the new entry point locally.

Baseline references: Inventory 5, 6, 11.1, 12, 14; PER-01 through PER-09; SYS-01, SYS-09. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Eligible first when delivery is authorized.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
