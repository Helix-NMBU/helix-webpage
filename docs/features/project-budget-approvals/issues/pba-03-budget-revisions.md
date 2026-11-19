# PBA-03: Revise approved budgets with reviewable changes

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-03, F-13, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Deliver Request changes and one pending candidate alongside the still-effective approved version. Reuse both approval steps and add version comparisons. Move CSV edits into the candidate workflow so existing imports cannot bypass approval.

## Acceptance criteria

- [ ] Assigned project leads, responsible department leads and Finance can request changes. Reuse an existing pending candidate instead of creating competing revisions; only project leads edit its entries.
- [ ] Both reviewers see additions, removals, old/new field values and the net total against the last approved version. Approvals are tied to submitted contents; edits after department approval return to Draft and invalidate the candidate's review.
- [ ] Approved entries remain purchasable and approved totals remain unchanged while the candidate is Draft or pending. Promotion switches the effective version atomically without losing actuals, prior approvals, removed-entry history or invoice links.
- [ ] Removed entries retain their stable allocation identity/history. Consult the obligation-protection contract so later PBA-07 can prevent P0 deletion or downgrade through every mutation path.
- [ ] CSV preview/re-import requires an authorized target project candidate and shows the candidate diff. Re-import preserves matching entry identities and optional omitted values; stale preview/CSV revisions cannot write. Direct approved-budget edit/import bypasses are removed.
- [ ] Recover stale edits and failed saves through shared notifications while retaining unsaved form input and the user's location.

## Blocked by

HELIX-78. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

Project-budget version service/UI from PBA-02; api/_lib/finance-budgets.ts and finance-budget-import.ts; src/features/Finance/BudgetImport.tsx and import/domain models; effective-version queries and audit/outbox. Shares approved-entry and obligation contracts with PBA-05/PBA-07; those modules must not each implement independent promotion logic.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-03 through service/component seams: add/edit/remove, duplicate Request changes, withdraw/return/resubmit, comparison baseline, dirty-form refresh and purchased removed entries.
- Rehearse unchanged and changed CSV re-import, cross-project denial, stale preview and approved-edit denial; ensure nothing becomes effective before both decisions.
- Run independent-connection promotion/return races; final integration with PBA-05 also covers a purchase racing promotion. Inspect old/pending version navigation and review diff locally.

Specification cases: V-02, V-03, V-08, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

