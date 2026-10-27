# FIN-10: Deliver durable notifications, exports and recovery

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-16, F-17
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Connect the transactional event outbox to safe server mail delivery and recovery, and provide a finance-only purchase export/document manifest with private archival retrieval and abandoned-upload cleanup.

## Acceptance criteria

- [ ] FIN-10-A01 [F-16] Request submission notifies active Head of Finance, decisions notify the requester and registrations notify active Finance/Head recipients. Event/recipient idempotency, sent/failed/uncertain status and safe reconciliation survive process failure without rolling back the business transaction.
- [ ] FIN-10-A02 [F-16] Registration messages retain reference/line/amount/budget/approval warnings and sign-in-required app links. Refund numbers and durable signed file URLs stay out of emails, exports and logs. Local delivery requires explicit allowlisted test recipients.
- [ ] FIN-10-A03 [F-17] Authorized export retains purchases, lines, allocations, references, payment/void states, current derivations and document IDs/names/content identity. Exclude refund numbers and public permanent file links; protect CSV formula-like user text.
- [ ] FIN-10-A04 [F-17] Archive/evidence access checks current Finance authorization and uses private outputs for large downloads. A manifest/export is repeatable and does not turn the public budget read model into an attachment directory.
- [ ] FIN-10-A05 [F-17] Controlled cleanup verifies expiry, ownership and absence of saved references before deleting staged/finalization leftovers. Unknown commit/email outcomes require reconciliation before retry; recovery actions report through shared notifications or operator output.
- [ ] FIN-10-A06 [F-16, F-17] Document configuration, bounded recovery/retry and backup/export/restore procedures. Existing server provider/storage conventions are reused; no Gmail connection, standing cron or new hosting service is required.

## Blocked by

- [HELIX-39: FIN-05](https://linear.app/helixnmbu/issue/HELIX-39/fin-05-submit-requests-and-record-head-of-finance-decisions)
- [HELIX-40: FIN-06](https://linear.app/helixnmbu/issue/HELIX-40/fin-06-register-actual-purchases-with-private-supporting-files)

## Shared contracts and change areas

- New finance-outbox/mailer/export/recovery modules and bounded commands/actions
- Finance integration-status notifications and authorized export controls
- Finance upload/outbox/audit storage contracts and operator runbook

Needs FIN-05/FIN-06 event production, not FIN-08/FIN-09 UI. Consume canonical purchase/payment fields so later queue states automatically export correctly. Coordinate dispatch registrations; do not copy the generic website mail table or silently retry unknown sends.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use injected mail/storage failures and SQL outbox persistence/idempotency tests, formula-safe export content checks, fresh grant denial on downloads and cleanup-after-uncertain-commit cases. Separately verify configured test mail, private exports and recovery on an authorized isolated branch.

Baseline references: Inventory 8.10, 14.2, 14.4/14.5; PUR-14, SYS-03/SYS-06; old purchase-spreadsheet sync is replaced by in-platform access/export. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
