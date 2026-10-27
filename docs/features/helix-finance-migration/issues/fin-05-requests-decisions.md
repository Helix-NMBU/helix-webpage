# FIN-05: Submit requests and record Head of Finance decisions

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-08, F-09
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Deliver own-request drafting, submission, tracking and the Head of Finance decision queue, with preserved revision/decision history and initial approved commitments. Implement the lifecycle table in spec revision 1.

## Acceptance criteria

- [ ] FIN-05-A01 [F-08] Any verified member drafts/submits a request with supplier, justification, planned date and budget-linked positive estimated lines, without receipt requirements. Late submissions below three calendar days require a reason; boundary dates use Oslo calendar days.
- [ ] FIN-05-A02 [F-08] Only Head of Finance approves/rejects the current submitted revision with reason, actor/time and line amounts. Invalid repeated/concurrent decisions cannot overwrite one another. Pending/rejected revisions create no commitment.
- [ ] FIN-05-A03 [F-08] Requester withdrawal invalidates the old submitted decision target. Rejected requests can be revised/resubmitted with old decisions retained. Approved content is immutable; further changes require a new request.
- [ ] FIN-05-A04 [F-09] A new open approval produces the correct per-line commitment. Requester or Head closes an open approval with reason and explicit released amount, including a fully consumed request. Closed/cancelled records do not silently reopen.
- [ ] FIN-05-A05 [F-08, F-09] Member reads include only their own requests and permitted summaries. Finance sees request context but gains no Head decision authority. Store idempotent submission/decision notification events for FIN-10, with transaction/audit consistency.

## Blocked by

- [HELIX-36: FIN-02](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets)

## Shared contracts and change areas

- New Finance request editor, own-request list/detail and Head decision queue
- New finance-request service/domain/SQL and request read models
- Request revision/decision/audit/outbox contracts

Can run alongside FIN-06 after FIN-02. Own request-specific Purchases subviews; the coordinator owns the shared Purchases container. Freeze decision and outbox contracts before FIN-07 and FIN-10.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use lifecycle model and SQL/API tests for all actors, submitted-revision conflicts, rejection/resubmission, late-date boundaries, closure/release and private ownership. Demonstrate request submit/approve/reject/follow in a browser. Actual-consumption integration is FIN-07.

Baseline references: Scope D4, D6, D8, D9; spec request lifecycle; inventory 17.1 is documented-only context, not implementation evidence. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
