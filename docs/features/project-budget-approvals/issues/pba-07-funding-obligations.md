# PBA-07: Apply and release awarded funding obligations

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-04, F-10, F-11, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Extend relevant pipeline cards with funding-application context and a scoped Head of Finance review. Link stable budget entries, explicitly record funding awards, derive P0 and protect obligations through every edit/import/revision path. Keep sponsor Won, cash receipt and funding reconciliation distinct.

## Acceptance criteria

- [ ] Business & Marketing can identify relevant funding application cards and their purchase conditions using existing card permissions. Head of Finance sees those relevant cards in a limited queue/detail, without reading unrelated pipeline/negotiation data or gaining pipeline mutation rights.
- [ ] Head of Finance can link existing entries or propose new ones and record an award with actor/date/reference. Application submission, normal Won transitions and funding reconciliation do not activate P0. Award alone creates no sponsor invoice/Marketing task or received cash.
- [ ] On award, each linked entry derives P0. Its ordinary P1-P4 remains available for eventual restoration. Newly proposed entries and increases stay outside approved spend until the candidate passes both budget reviews.
- [ ] Project leads cannot manually choose P0 or downgrade/delete/cancel an active obligation through normal edits, CSV, entry removal, project deletion or changed links.
- [ ] Only Head of Finance releases an obligation with a reason. Preserve its award/link/release history and purchased evidence. P0 remains while any other awarded unreleased obligation still covers the entry; otherwise use the current approved ordinary priority.
- [ ] Do not auto-convert legacy EM or cash sponsorships into awarded applications. Preserve restricted-funding links and avoid duplicate funding. Changed/rejected/deleted funding cannot silently release P0.
- [ ] Award/release/link actions are revision-checked, duplicate-safe and invalidate affected budgets/queues. Failed saves retain input and use shared notifications.

## Blocked by

HELIX-79. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

api/_lib/partner-deals-service.ts and handler; partner_deals authorization/records via additive migrations; src/features/PartnerDeals pipeline/detail UI and limited Finance application view; budget obligation guards/effective-entry projection from PBA-01/03; finance types/audit. Keep PBA-08 responsible for scenario presentation; do not fork the effective priority calculation.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-07 through real permission and service seams: Head of Finance with no pipeline grant, unrelated-card denial, pending versus awarded, retry, multiple obligations, release reason/actor checks and unchanged cash status.
- Apply a P0 link while a candidate revision is pending; prove promotion, imports and removal cannot shed the obligation, and new money still requires both approvals.
- Local role-switched application/award/release UI checks and regression for ordinary sponsor Won follow-up and legacy EM behavior.

Specification cases: V-01, V-03, V-07, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

