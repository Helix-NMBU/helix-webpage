# PBA-04: Remove the NOK 5,000 rule across active workflows

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-06, F-09, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Remove the amount-triggered prior purchase-approval policy throughout the existing workflow, including SQL, registration validation, UI copy, emails and exports. Keep optional request behavior and its historical commitments compatible; no new amount threshold replaces it.

## Acceptance criteria

- [ ] Exactly NOK 5,000, NOK 5,000.01 and higher values do not demand a purchase request or prior approval merely because of their amount.
- [ ] Remove active threshold consumption, conditional request prompts, threshold-only missing-approval creation and approval-limit email subjects/warnings. Do not leave an API or SQL path enforcing the removed rule.
- [ ] Current exports do not recompute or label a purchase against the abolished limit. Historical exception records and recorded approval facts remain historical evidence with no current-policy implication.
- [ ] Keep existing optional requests, decisions, linked fulfillment, closure/void balances and financial scenario commitments usable. Do not delete or automatically close existing approvals.
- [ ] Keep budget discrepancy review, actual cost, payment and file validation intact. This ticket alone does not change the season/project approval model or authorize pending budget entries.
- [ ] Record any existing stale threshold setting as retired; it must not become active again through configuration. Test threshold removal even when a historical setting remains present.

## Blocked by

None. Eligible when Deliver is requested.

## Shared contracts and change areas

src/features/Finance/purchase-domain.ts, money.ts, requests/PurchasesPage and export-text; api/_lib/finance-purchases.ts, finance-service.ts, finance-mail.ts and finance-export.ts; new migration replacing current registration logic as needed. Preserve old applied SQL files. This root ticket overlaps types/service/mail changes in PBA-01/02/05; coordinate merges without inventing a blocker.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-04 through registration/service, notification-email and export seams, with an old threshold setting deliberately present.
- Regression cases for optional approved request partial fulfillment, closure, void and commitment calculations, plus historical missing-approval evidence.
- Focused existing finance tests, relevant typechecks and lint. Full revised project/unbudgeted behavior is integrated in PBA-05 and V-04 is repeated in PBA-09.

Specification cases: V-04, V-08.

## Status

Closed on the feature branch on 19 November 2026 after coordinator integration and acceptance checks. Main release and full-feature review/PR CI remain separate.


## Integrated completion evidence

Worker commit `56415c57534dc3823e242c5a90df2fa98a206ea8`, integration commit `dada27b`. Coordinator inspected the full patch, ran seven relevant files with 104 passing tests including six real PostgreSQL retirement cases, and passed all three typechecks on the integrated code. Worker lint and source function guard11/11 passed. Historical exceptions/optional requests/commitments/payment/voids are preserved; no active threshold enforcement/setting reads remain. Log: `/private/tmp/helix-pba04-integrated-tests.log`. Tracker HELIX-77 is Done; this is not release on main.
