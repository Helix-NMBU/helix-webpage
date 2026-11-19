# PBA-06: Store uploaded invoices in shared Drive with recovery

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-04, F-08, F-09, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Transfer verified new invoice uploads automatically into the approved shared Drive location, while preserving actual expenses during provider failure and all historical private-storage evidence. Use the factual Drive research and implement durable retry/reconciliation through existing finance entrypoints.

## Acceptance criteria

- [ ] Preserve owned private upload staging, immutable verified bytes/digest, 1-15 supporting files and 10 MiB per file. New invoices automatically target the configured server-controlled Drive folder; users do not paste links or choose arbitrary destinations.
- [ ] Commit actual expense/allocations and durable evidence-transfer jobs together after bytes are safe. Return a saved purchase with pending evidence honestly. Store pending/transferring/stored/needs-attention state separately from paid/void/actual state.
- [ ] Persist a generated Drive file ID before upload, then use shared-drive-aware resumable transfer. Reconcile interrupted/expired/uncertain completion and 409 by that same ID and verified metadata/content. Concurrent retries create no duplicate purchase or invoice.
- [ ] Use a dedicated server identity, fixed shared drive/parent and validated narrow scope. Do not borrow Gmail tokens, enable domain-wide delegation or create public/domain-wide file permissions. Credential/scope/setup failures remain explicit service gates.
- [ ] Only confirmed evidence gets a restricted invoice viewer link. Authorize app references and retain actual Google viewer access checks. Keep stable app document IDs and provider-aware legacy download/export support.
- [ ] Finance can recover failed/uncertain transfers through shared notifications and existing recovery tooling. Keep pending staged bytes safe from cleanup, and never mark stored solely because an upload request was sent.
- [ ] Document the actual required credential/configuration and an authorized synthetic-file acceptance procedure. Do not claim real service verification until Drive/folder, identity, scope and intended readers have been exercised under explicit service-write authorization.

## Blocked by

HELIX-80. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

New finance Drive adapter/transfer module; api/_lib/finance-storage.ts, finance-purchases.ts, finance-recovery.ts and finance-export.ts; existing recovery tooling; src/features/Finance/PurchaseRegister.tsx, FinanceRecoveryPanel.tsx and registration UI; evidence metadata migration. No extra top-level API route. Read drive-invoice-research.md before implementing. Existing private storage remains for old files and verified staging.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- V-06 fault-injected adapter/service cases for 10 MiB/multiple files, wrong ownership/destination, mismatch, lost successful response, 409 verification, expired sessions, concurrent leases/retries and pending cleanup.
- Regression that provider failure preserves one actual expense and historical private evidence remains readable; verify exports and invoice links never contain service tokens.
- Local UI recovery flow plus authorized synthetic shared-Drive acceptance when configured. Record unperformed real access/reader tests as open release gates rather than replace them with mocks.

Specification cases: V-01, V-06, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

