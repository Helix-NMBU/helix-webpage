# Season overview financial widgets

Feature: `season-overview-financial-widgets`
Status: approved for publication, revision 1, 29 October 2026. The user confirmed the scope and explicitly requested preparation and publication of its tasks in Linear. The user requested implementation on 29 October 2026. Deployment remains separately authorized.
Scope: [scope.md](scope.md)
Tracker: Linear, Helix member Platform. Parent: [HELIX-59](https://linear.app/helixnmbu/issue/HELIX-59/season-overview-financial-widgets). Ticket map and blockers: [tickets.md](tickets.md).

## Outcome and requirements

A reader of Season Overview can understand the season's planned expense budget, recorded costs and combined bank balance, and compare spending across departments. The scope decisions in `scope.md` are the source of product authority.

- F-01: All authorized Season Overview users can read the current season's approved planned expense total and recorded actual spending, with all department totals and expandable system totals. This grant is limited to the summary; it does not confer Financials access or expose purchases, receipts, refund fields, funding sources, conditions or scenarios. Check authorization on the server and avoid sending private fields. Existing draft-budget capability rules continue to apply. Show a draft label when an authorized user can see a draft; do not leak its amounts otherwise.
- F-02: Derive totals from the existing finance calculations with exact NOK arithmetic. Include unbudgeted actual, cancelled-item historical actual, and meaningful inactive systems. Unpaid recorded invoices count as actual; voids do not. Compare department actual with plan, with accessible text amounts and over-budget/unbudgeted values. Explain that actual is not bank cash paid.
- F-03: Financials-authorized users can enter and update a single combined balance across Helix bank accounts and its as-of date. Store it in Neon, validate amount and date, protect writes server-side using the existing Finance-level capability (currently granted to all Financials users), and retain actor and update time for accountability. Preserve input on failure, notify success or failure through shared notifications and provide recovery. Handle conflicting updates safely. No bank connection or inferred balance.
- F-04: All Season Overview users can read the latest manually entered bank snapshot and as-of date. Label it as a manual snapshot, not a verified or live balance. Distinguish no snapshot from zero. A snapshot is not a per-season expense calculation.
- F-05: Use the current project season and finance season consistently. If mismatched, identify the mismatch and do not combine their values. Distinguish absent budget, inaccessible draft, actual zero, unavailable and stale data. Refresh after updates and offer recovery when loading fails; financial failure must leave the existing project overview usable. No fabricated zeroes. Show a Financials link only to authorized users.
- F-06: Preserve project content; use responsive English shadcn/ui components, keyboard-accessible expansion, exact text values, and shared notifications. Local test identities/data are loopback development only. Partner OTP is not member authorization.

## Boundaries and evidence

No account-level banking, automated bank integration, bank payments or reconciliation, funding inference, forecast, accounting, private purchase details or historical season selector. The existing finance scope explicitly excludes a verified balance; this feature adds only a manual snapshot. Existing finance read calculations and authorization are in `api/_lib/finance-summary.ts`, `finance-service.ts`, and `finance-access.ts`; Season Overview lives in `src/features/ProjectManagement/ProjectManagement.tsx`. Recheck current code before execution. Source and generated Vercel functions must stay at most 11; consolidate existing entrypoints as necessary. Use Neon, no Supabase, local untracked `.env`/`.env.local`; publication/deployment needs separate authorization.

The Finance milestone in Linear reports implementation merged but configured-service acceptance and production migrations/roles unconfirmed. Do not treat those as completed; verify prerequisites before release. This is a release/acceptance dependency, not a reason to claim current production data exists.

## Verification and completion

Test server authorization for Season Overview-only, Finance, draft-capable, revoked and unauthenticated users; assert response fields exclude private data. Exercise real aggregate cases including zero, cancelled, unbudgeted, unpaid, voided and inactive systems. Test balance validation, write permissions, conflicts, persistence and as-of date. Exercise missing/inaccessible/unavailable/mismatched states and separate financial failure. Browser-check desktop and narrow view, expansion, keyboard, exact text, edit and recovery in local mode. Run focused tests plus `npm test`, `npm run lint`, `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, and `npm run build` with function-budget check. Verify configured Neon-backed behavior where available and document any unverified production prerequisites.

Feature completion requires integrated requirements, independent review, local checks, PR CI and documented release prerequisites. No automatic merge or deployment.

## Execution context

GitHub reports `main` as the default branch, verified 29 October 2026. At delivery, refresh and verify base; proposed integration branch `codex/season-overview-financial-widgets`, worker branches `codex/season-financial-<ticket>`. Create clean worktrees from the agreed base only when delivery authorizes the workflow; do not switch or create branches in preparation. Preserve unrelated local changes. Install with the repository's Node 24/npm 11 and `npm ci` as needed; use `npm run dev:member` with local untracked configuration. Coordinate shared finance dispatch/types, migrations, authorization and notification edits across tickets.
