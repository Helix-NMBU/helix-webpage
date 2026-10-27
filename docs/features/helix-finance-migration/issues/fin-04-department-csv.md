# FIN-04: Preview and atomically re-import department budgets

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-06
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Add pasted/file CSV import to Budgets with the full source parser, authoritative preview/diff and atomic re-import preserving existing purchase references.

## Acceptance criteria

- [ ] FIN-04-A01 [F-06] Parse required/optional headers, comma or semicolon delimiters, quotes/escaped quotes/multiline cells, UTF-8 BOM, CRLF and blank records. Reject empty/header-only files, unknown headers, duplicate matching keys, invalid rows and foreign-department systems with original line/field errors.
- [ ] FIN-04-A02 [F-06] Preview writes nothing and shows added/changed/unchanged/removed rows, before/after fields, cancellation/spending warnings, server subtotals and total. Failed parsing keeps the source input.
- [ ] FIN-04-A03 [F-06] Re-import matches exact system ID plus normalized description, keeps item IDs and actual links, retains omitted optional fields and active lifecycle states, restores reappearing cancelled matches and cancels missing ordinary rows. Never touch another department or unallocated items.
- [ ] FIN-04-A04 [F-06] Apply defaults P2/other/new for parsed new rows and validate resulting EM links across the entire diff. Approved imports enforce each protected change and required Head/reason rules; a Finance note-only import remains allowed.
- [ ] FIN-04-A05 [F-06] Commit revalidates preview revision/diff under transaction. Any invalid/stale/failed row leaves all items and audit unchanged; an identical import creates no duplicates.

## Blocked by

- [HELIX-36: FIN-02](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets)

## Shared contracts and change areas

- Finance Budgets import preview and input components
- New finance-budget-import parser/diff/service
- Budget SQL operations and shared Money/date/earmark checks

Shares Budgets layout and item mutations with FIN-02, which must land first. Thereafter owns import-specific modules. Coordinate any new financial editor components without changing shared field semantics.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Port applicable source golden CSV cases into parser/service tests and run SQL rollback/stale-preview/authorization scenarios. Inspect preview totals, cancelled-spending warnings, row errors and retry in the local browser.

Baseline references: Inventory 9.5, 9.6; BUD-11 through BUD-17. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
