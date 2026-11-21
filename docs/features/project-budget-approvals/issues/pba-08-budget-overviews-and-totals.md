# PBA-08: Show purchased budgets and consistent financial totals

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-05, F-09, F-12, F-13, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Finish the Finance budget overview and purchased-entry details using the canonical effective-version and fulfillment projections. Update project/department/season totals and financing scenarios, including P0 and legacy mapping, and preserve the existing minimal Season Overview summary.

## Acceptance criteria

- [ ] Finance can filter approved and all submitted budgets by project, department and stage. Show approved and pending revision facts together; only department-approved submissions are actionable for Head of Finance.
- [ ] Each budget entry shows not purchased/partial/complete, cumulative actual and all invoice links. Distinguish confirmed Drive evidence, actionable pending/failed evidence and historical private files. Do not equate completion with payment.
- [ ] Count each stable entry and actual once across effective approved versions and remaining legacy plans. Candidate revisions, mapping copies and removed-entry history never duplicate approved amounts.
- [ ] Every scenario includes actual plus the larger of remaining approved request commitments and scenario-eligible approved remaining plan. P0 makes its approved remaining plan mandatory in every scenario independently of funding eligibility. Restricted funding still covers only eligible linked need.
- [ ] Preserve unbudgeted/removed-entry actual, imported historical expenses, optional commitments and existing funding coverage/gaps. Show draft obligation proposals separately rather than quietly include unapproved amounts in approved totals.
- [ ] Season Overview uses the same authoritative summary without gaining invoice, pipeline or private funding data. Dirty forms retain input while view versions refresh after approvals, registration, transfer completion, award/release, imports and voids.

## Blocked by

HELIX-81, HELIX-82. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

api/_lib/finance-summary.ts, finance-budgets.ts and finance-register.ts; src/features/Finance/finance-calculations.ts, budget-summary.tsx, BudgetsPage.tsx and OverviewPage.tsx; FinanceAccess freshness; season-financials projection and project/department navigation. Uses PBA-06 evidence and PBA-07 priority contracts; do not create independent totals in each view.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-08 through existing finance-calculation/service/season-summary seams with mixed legacy/project records, pending revisions, P0 with missing/restricted funding, commitments, partials, removed entries and unbudgeted actual.
- Regression tests proving financial summary privacy, actual/payment separation, unchanged dated bank snapshot meaning and no P0/funding double count.
- Local browser role/view checks for filters, pending-versus-approved state, all invoice providers/recovery, cross-space navigation and external-change notification with dirty input.

Specification cases: V-01, V-05, V-06, V-07, V-08, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.



## D18 direct UI refinement

Place the approved budget/spending circle widget at the bottom of the project sidebar below Progress. Remove the metadata line and refresh controls. Keep candidate totals distinct, provide permission-aware drafting/continuation when unapproved, and automatically refresh after material writes and access/focus/visible/cross-tab changes. Preserve dirty input and current authorization. Reverify canonical actuals including unbudgeted and voided purchases.


## D19 department Budget tab

Move the existing approved department allocation/project breakdown into a Budget tab for eligible department memberships. Remove its Home sidebar instance and Home allocation fetch. Keep existing reviewer workflows isolated, preserve nonmember Finance review, avoid admin wildcards and retain existing links/refresh/revocation behavior.
