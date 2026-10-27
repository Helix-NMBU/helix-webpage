# FIN-06: Register actual purchases with private supporting files

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-10, F-11
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Deliver a complete member direct-registration flow with multiple budget allocations, owned private uploads, atomic/idempotent persistence and submission feedback. Request fulfillment is connected in FIN-07.

## Acceptance criteria

- [ ] FIN-06-A01 [F-10] All inventory 8.2/8.3 required fields, refund formats, valid current-budget relationships and explicit unbudgeted choices validate server-side. Non-outlays discard stale refund values. Quantity 3 and line total 900 adds 900, and repeated lines combine for item warnings.
- [ ] FIN-06-A02 [F-11] Upload 1 to 15 supported files up to 10 MiB each directly to dedicated private storage. Validate metadata before upload and stored size/type/signature/ownership at finalization. Another member cannot reuse upload IDs, arbitrary keys or finalized files.
- [ ] FIN-06-A03 [F-11] Permanent evidence uses a fresh final key that the staged upload signer cannot overwrite. Storage/finalization failures are recoverable and cannot return a saved purchase with missing evidence. Never delete a key after an uncertain commit without checking saved references.
- [ ] FIN-06-A04 [F-10] One final submit persists purchase/lines/full-value allocations/documents/obligation/audit/reference and event intent. Concurrent annual references are unique; retries of the same submission return its saved result, while a mismatched key payload conflicts. Enforce the strict saved-record 20/hour quota atomically.
- [ ] FIN-06-A05 [F-10] Actual cost above 5,000 without prior approval still saves and records missing-approval context. Over-budget/unbudgeted warnings save and appear in shared notifications with the reference. The form retains errors/input and resets only after confirmed success.
- [ ] FIN-06-A06 [F-11] Only Finance/Head can mint short-lived finalized-file downloads after fresh checks. Ordinary submitters do not gain receipt history. Local fixtures remain loopback-only and real uploads require the configured private bucket.

## Blocked by

- [HELIX-36: FIN-02](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets)

## Shared contracts and change areas

- Finance purchase registration form/line editor and upload flow
- New finance-purchase and finance-storage services, injected storage adapter
- Registration transaction, upload/finalization/idempotency/quota/reference/outbox contracts

Can run alongside FIN-05. Own registration/storage modules and retain the public request-link contract without claiming fulfillment is complete. Use new final storage keys, not bucket versioning assumptions. Do not add file-byte endpoints or broaden existing CV/application adapters.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use API/PGlite failure-injection tests and independent-connection Postgres concurrency checks. Test lost response, mismatched replay, quota race, upload substitution, 10 MiB/15-file limits and post-signature overwrite attempts. Inspect local forms and record separate real private-storage/CORS evidence.

Baseline references: Inventory 8.2 through 8.6, 12.1, 14.2; PUR-01 through PUR-16, SYS-01, SYS-03, SYS-09. Old above-threshold expectations follow scope D4/D5 instead. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
