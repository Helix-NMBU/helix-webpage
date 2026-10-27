# FIN-02: Create, approve and maintain season budgets

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-04, F-05
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Implement the Budgets page and server operations from draft creation through approval, item maintenance, cancellation and restoration. Include the member read hierarchy and explicit unbudgeted selection options used by later purchase/request forms.

## Acceptance criteria

- [ ] FIN-02-A01 [F-04] Only Head of Finance creates the single S27 budget, with unallocated zero-plan items for active systems, and approves the draft once. Approver/date/audit persist and repeated create/approval cannot succeed concurrently.
- [ ] FIN-02-A02 [F-05] All members read department/system/item planned, actual and difference values without private purchase/funding payloads. Cancelled rows are revealable; their effective plan is zero and historical actual survives.
- [ ] FIN-02-A03 [F-05] All inventory 9.3 item fields/defaults validate on the server. Finance edits draft items and allowed non-protected approved fields. Protected changes after approval require Head of Finance plus reason and before/after audit.
- [ ] FIN-02-A04 [F-05] Cancel/restore retains IDs, stored planned amount and references. Ordinary maintenance cannot edit/move/cancel an unallocated item beyond its note. A later active system can acquire its unallocated item safely.
- [ ] FIN-02-A05 [F-05] EM parts belong to the same season; non-cancelled links for a part occupy at most one system. Preserve the existing allowed Finance system move, with audit and invariant checks. Stale edits retain client input.

## Blocked by

- [HELIX-35: FIN-01](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes)

## Shared contracts and change areas

- New Finance Budgets hierarchy and item editor
- New finance-budget service/domain/read modules and SQL mutation functions
- Shared budget/item contracts from FIN-01; additive migration extensions allocated centrally

Budget item/choice APIs are consumed by CSV, requests, registration and financing links. Funding tables/contracts exist in FIN-01, so funding UI implementation is not a blocker. Coordinate schema changes with FIN-03 rather than inventing a duplicate earmark model.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Exercise service and SQL transitions through real mutation seams, including competing approvals, protected field patches, cancellation with actuals, restoration, new-system unallocated creation, private response redaction and stale revisions. Browser-check member versus Finance versus Head flows.

Baseline references: Inventory 7.1, 9.1 through 9.4, 11.2; BUD-01 through BUD-10. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
