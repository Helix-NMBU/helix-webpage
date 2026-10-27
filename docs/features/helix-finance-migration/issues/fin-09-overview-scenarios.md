# FIN-09: Show commitment-aware scenarios and Finance overview

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-14, F-15
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Connect canonical actuals, plans, approvals and funding to Overview and detailed budget summaries, with restricted-funding scenarios and input-preserving refresh behavior.

## Acceptance criteria

- [ ] FIN-09-A01 [F-14] Per item/scenario, need equals actual plus max of open approved commitments and eligible remaining plan. Preserve three source funding/priority sets and restricted-cover/gap formulas, including negative unrestricted remainder. Several commitments on one item sum before max.
- [ ] FIN-09-A02 [F-14] Approved 10,000 with actual 4,000 and eligible plan 12,000 produces need 12,000; an excluded priority still contributes 10,000. Actual 11,000 against approval 10,000 remains 11,000 in every scenario with zero remaining commitment.
- [ ] FIN-09-A03 [F-14] Earmark usage respects purchase date on/before deadline, caps at part amount and starts must-return the next Oslo day. Keep scenario and deadline-aware usage distinct. Unused restricted balances do not cover unrelated need.
- [ ] FIN-09-A04 [F-15] Overview shows budget absence/draft/approval, configured department ordering and system drill-down, planned/actual/difference/use, commitments and separate unbudgeted totals. Retain inactive systems with meaningful amounts and show unassigned parts.
- [ ] FIN-09-A05 [F-15] Public responses contain only approved aggregate information and public earmark fields; Business/Finance/Head receive scenarios/sources/conditions as permitted. Neither balances nor differences are labeled bank cash.
- [ ] FIN-09-A06 [F-15] Read-only views refresh after version/focus checks and local mutations without losing expanded state/location. Dirty forms retain input and get shared update notifications; 401, 403 and account-switch responses clear only the appropriate cached state.

## Blocked by

- [HELIX-37: FIN-03](https://linear.app/helixnmbu/issue/HELIX-37/fin-03-manage-financing-and-earmarked-funding)
- [HELIX-41: FIN-07](https://linear.app/helixnmbu/issue/HELIX-41/fin-07-fulfill-requests-through-several-actual-purchases)

## Shared contracts and change areas

- Finance Overview and budget summary components
- Shared finance-calculations and role-filtered summary service
- Finance version/freshness cache and cross-page invalidation

Needs financing and fulfilled actual/commitment inputs, not the final queue or mail/export UI. Own calculation/summary/freshness modules. FIN-08 mutations use shared invalidation contracts and are exercised during FIN-11.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Run source calculation examples plus new commitment golden cases at domain and SQL/read boundaries. Include cancelled/unallocated/voided spending, deleted/over-earmarked funding and deadline boundaries. Browser-check drill-down and two-session update/dirty-form behavior with separate privacy assertions.

Baseline references: Inventory 7, 11, 14.3; FIN-08 through FIN-15, SYS-04/SYS-05; agreed D9 overrides the old no-commitment baseline. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
