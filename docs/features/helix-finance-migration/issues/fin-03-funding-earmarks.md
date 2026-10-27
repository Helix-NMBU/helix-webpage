# FIN-03: Manage financing and earmarked funding

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-07
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Deliver the restricted Financing page with funding/earmarked-part maintenance, derived part usage, over-earmark warnings and funding soft-delete/restore.

## Acceptance criteria

- [ ] FIN-03-A01 [F-07] Business, Finance and Head can maintain every funding field and source enum/default in inventory 10. Members and generic administrators without finance profiles cannot load the route/API or private conditions/source names.
- [ ] FIN-03-A02 [F-07] Add/edit parts with positive amounts, purpose, optional deadline/conditions and derived linked system/items. Retain unassigned parts and do not add destructive part deletion or parent reassignment.
- [ ] FIN-03-A03 [F-07] Parts exceeding funding or a reduced funding total save with exact excess warnings; unrestricted remainder may be negative. No auto-scaling or silent discard occurs.
- [ ] FIN-03-A04 [F-07] Funding delete is a soft state change; reveal/restore recovers the prior status and preserves part/item links and spending. Warn about active linked items and audit each mutation.
- [ ] FIN-03-A05 [F-07] Funding exists without a budget. Same-season/link invariants and concurrent revision checks hold. Public earmark projections exclude source names and conditions.

## Blocked by

- [HELIX-35: FIN-01](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes)

## Shared contracts and change areas

- New Finance Financing page/editor
- New finance-funding service/domain/read modules
- Funding/part schema contracts, audit and public projections

Can run alongside FIN-02 after FIN-01. Coordinate funding/part reference contracts and cross-table constraints; retain module ownership rather than editing the budget UI. FIN-09 owns final scenarios/Overview wiring.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Use SQL/API tests for all profiles, field validation, warning-and-save behavior, restore fallback/status history and links. Seed synthetic purchases in isolated SQL tests to verify part usage before the Overview integration. Inspect desktop/mobile forms with failed-save recovery.

Baseline references: Inventory 10, 11.5, 11.6; FIN-01 through FIN-07 and FIN-11 through FIN-13. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
