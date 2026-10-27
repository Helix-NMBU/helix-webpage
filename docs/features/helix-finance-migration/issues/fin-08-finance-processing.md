# FIN-08: Process unpaid work, voids and approval-exception reviews

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-12, F-13
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Deliver the finance-only purchase register, unpaid queue, invoice/outlay marking, voiding and recorded review of approval exceptions.

## Acceptance criteria

- [ ] FIN-08-A01 [F-12] Finance/Head can list registered/voided purchases with reference, supplier/buyer/requester, date/justification, lines/allocations, documents and permitted refund details. Members/Business/generic administrators without the grant cannot access any list or evidence.
- [ ] FIN-08-A02 [F-12] One invoice purchase has one due date/number/payment state shared across all supporting files. Outlay reimbursement is tracked separately. The unpaid predicate includes any applicable unsettled obligation and excludes voided purchases.
- [ ] FIN-08-A03 [F-12] Mark/undo sets/clears the correct date/state and appends audit. Wrong types, invalid parent states, unauthorized callers and repeated no-change operations fail. Payment markers never change actual or commitment.
- [ ] FIN-08-A04 [F-12] Void requires a reason, retains facts/files/reference, removes actual and unpaid work, recalculates earmark usage and updates open commitments through FIN-07. No unvoid or permanent delete is added.
- [ ] FIN-08-A05 [F-13] Finance records a reviewed exception event with reason/actor/time. The original missing/late/exceeded approval facts remain intact. Reviewing cannot imply prior approval or mark a payment settled, and failed saves preserve input.

## Blocked by

- [HELIX-41: FIN-07](https://linear.app/helixnmbu/issue/HELIX-41/fin-07-fulfill-requests-through-several-actual-purchases)

## Shared contracts and change areas

- Finance purchase register, unpaid filters, payment/void/review controls
- New finance-payment/void/review service/SQL modules
- Invoice obligation, reimbursement, exception review, audit and commitment hooks

Depends on FIN-07 for correct request-linked void behavior. Own finance processing modules; coordinate shared purchase/detail response changes centrally. Do not add registered amount correction, reallocation or member history.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use role-filtered API and SQL integration tests for dual obligation combinations, all attachment payment consistency, repeated actions, invalid/void parent guards and the approved closure/void balance matrix. Browser-check the finance queue on desktop/mobile with recovery notifications.

Baseline references: Inventory 8.7 through 8.9; PAY-01 through PAY-07, FIN-13/FIN-15. Replace first-document semantics with scope D7. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
