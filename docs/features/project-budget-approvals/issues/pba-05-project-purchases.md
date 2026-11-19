# PBA-05: Register project purchases and track partial completion

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-04, F-06, F-07, F-09, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Adapt Register a purchase to effective project-budget versions, while retaining an explicit path for already-incurred costs outside approved plans. Deliver multiple purchases per entry, actuals, Finance review and an explicit completion state independent of payment.

## Acceptance criteria

- [ ] Department leads register within their authorized department; Finance retains cross-project registration. Select only effective approved entries, retain stable entry ID and the version used, and reject forged project/system/season relationships.
- [ ] Record incurred unbudgeted costs and cumulative actual above approved plan with Finance review flags, including when no project budget has yet been approved. Never fabricate prior approval or reinstate an amount threshold.
- [ ] Allow multiple lines/entries and partial purchases across registrations. Quantities and line-total NOK retain existing validation; totals are not multiplied by quantity.
- [ ] Expose not purchased, partial and explicit complete states. Authorized registering leads/Finance can complete and reopen with a recorded reason. Further purchases or a linked void reopen for review; invoice payment remains independent.
- [ ] Persist one actual expense/allocations per request ID despite a lost response or retry. Provide the stable document/evidence hook for PBA-06 and retain existing private evidence compatibility until that integration is installed.
- [ ] Serialize registration against current approval promotion and cumulative actual. Review preserves the original discrepancy even if a later budget revision approves more; preserve imported historical purchases and existing request fulfillment/closure behavior.

## Blocked by

HELIX-78. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

src/features/Finance/PurchasesPage.tsx, purchase-domain.ts, types.ts and PurchaseRegister.tsx; api/_lib/finance-purchases.ts, finance-processing.ts, finance-register.ts and current registration SQL replacements; project-budget effective-entry/completion relations. Uses PBA-01/02 contracts. Shares purchase widgets/evidence hooks with PBA-06 and promotion reads with PBA-03; coordinator resolves central service edits.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-04/V-05 at service/API and component seams, including unauthorized department, no approved budget, one purchase across several entries, two partial orders and explicit completion.
- Real PostgreSQL concurrent registrations, retry after lost response, cumulative overrun and promotion racing registration after PBA-03 integration.
- Local UI checks for entry selection, partial/complete transitions, saved actual with review notification, retained dirty input, keyboard selection and old invoice links.

Specification cases: V-01, V-03, V-04, V-05, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

