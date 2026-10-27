# FIN-07: Fulfill requests through several actual purchases

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-09, F-13
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Connect approved requests to several actual registrations, derive remaining commitments and capture cumulative approval exceptions without blocking incurred actual costs.

## Acceptance criteria

- [ ] FIN-07-A01 [F-09] An approved 10,000 request with a 4,000 linked registration shows actual 4,000 and commitment 6,000. Further registrations consume the same approved lines, not fresh copies of approval. Multiple requests for one item sum their remaining balances.
- [ ] FIN-07-A02 [F-09, F-13] Check requester, season, approved revision and request-line/budget-item match. Record valid overruns as actual with a cumulative review flag and zero remaining once exceeded. Invalid links offer a clear direct-registration recovery with request context.
- [ ] FIN-07-A03 [F-09] Lock/revalidate approval and line fulfillment with registration. Simultaneous registrations retain every actual and produce correct balances/flags; no double consumption, lost audit or duplicate event occurs.
- [ ] FIN-07-A04 [F-13] Missing approval, cumulative overrun, line mismatch and a purchase date before the approval date retain immutable exception context. Exactly 5,000 versus 5,000.01 follows the threshold rule; no undocumented 10%/1,000 tolerance applies.
- [ ] FIN-07-A05 [F-09] Explicit closure releases unused balance. Voiding a linked registration restores commitment only on an open request; a closed request stays closed. Provide shared calculation hooks for FIN-08 and FIN-09 and verify this behavior through transaction tests.
- [ ] FIN-07-A06 [F-13] Own request detail shows permitted aggregate/reference/date/total fulfillment context without exposing a general purchase register, private refund values or attachment downloads.

## Blocked by

- [HELIX-39: FIN-05](https://linear.app/helixnmbu/issue/HELIX-39/fin-05-submit-requests-and-record-head-of-finance-decisions)
- [HELIX-40: FIN-06](https://linear.app/helixnmbu/issue/HELIX-40/fin-06-register-actual-purchases-with-private-supporting-files)

## Shared contracts and change areas

- Finance request detail and registration request-link controls
- Request/purchase service bridge and fulfillment read model
- Shared commitment arithmetic, transaction locks, exception facts and audit

Requires both request decisions and direct registration. Own the bridge/commitment modules; request and registration owners help resolve their shared DTO changes. FIN-08 consumes the void hooks, and FIN-09 consumes the aggregate need inputs.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Run request plus registration integration tests with multiple lines/requests/registrations. Use real independent Postgres transactions for final-balance races and closure/registration conflicts. Inspect a member tracking and fulfilling one approval several times, including an overrun.

Baseline references: Scope D4 through D6 and D9; spec calculation/request contracts; new workflow has no source parity test that proves it. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
