# FIN-11: Verify the integrated Finance milestone and prepare review

## Parent and requirements

Parent: [HELIX-34: approved Finance specification revision 1](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing).
Feature: `helix-finance-migration`
Requirements: F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-11, F-12, F-13, F-14, F-15, F-16, F-17, F-18
Tracker: Linear, HELIX team, Helix member Platform, existing Finance milestone ID `eb62b788-596a-4920-ab8d-cfda9aa53cc0`.

## What to build

Integrate the complete four-page Finance feature, verify every requirement through existing high-level seams and local browser flows, obtain independent review, and prepare one unmerged PR when publication is authorized.

## Acceptance criteria

- [ ] FIN-11-A01 [F-01 through F-18] Every requirement maps to passing integrated evidence. Port applicable inventory section 19 cases and explicitly replace source tests for procurement, member access, invoice files, commitments and historical cutover. No fixture or source-suite result is mislabeled real service evidence.
- [ ] FIN-11-A02 [F-02, F-09, F-10, F-11] Prove role denial/revocation, identity switches, private storage, atomic quota/reference/fulfillment races and lost-response idempotency at the actual service boundary. Use independent Postgres connections where single-process PGlite cannot prove concurrency.
- [ ] FIN-11-A03 [F-18] All three typechecks, lint, full tests, build, diff check, static-size guard and both source/generated function counts pass on the integrated revision. Preserve main sanitizer/runtime setup. Diagnose pre-existing failures with evidence; do not weaken assertions for a green report.
- [ ] FIN-11-A04 [F-01, F-08, F-12, F-15, F-18] Local desktop/mobile and keyboard inspection covers all four profiles/pages, CSV errors/previews, request/decision/partial fulfillment/closure, invoice/outlay work, void/review and dirty-form refresh. Capture useful screenshots outside the repo.
- [ ] FIN-11-A05 [F-16, F-17, F-18] Record configured auth/grant/storage/CORS/mail/recovery/export evidence and remaining operator inputs. Unused reference start, approved systems/grants and migration-ledger readiness are explicit production prerequisites; do not execute a release without authorization.
- [ ] FIN-11-A06 [F-18] Independent Standards and Spec reviews clear actionable findings. With authorized PR publication, create/attach one feature PR to main and record exact-head CI. Leave it unmerged; no push/PR/production changes occur without the applicable user authorization. Keep the milestone open while required acceptance remains incomplete.

## Blocked by

- [HELIX-38: FIN-04](https://linear.app/helixnmbu/issue/HELIX-38/fin-04-preview-and-atomically-re-import-department-budgets)
- [HELIX-42: FIN-08](https://linear.app/helixnmbu/issue/HELIX-42/fin-08-process-unpaid-work-voids-and-approval-exception-reviews)
- [HELIX-43: FIN-09](https://linear.app/helixnmbu/issue/HELIX-43/fin-09-show-commitment-aware-scenarios-and-finance-overview)
- [HELIX-44: FIN-10](https://linear.app/helixnmbu/issue/HELIX-44/fin-10-deliver-durable-notifications-exports-and-recovery)

## Shared contracts and change areas

- Finance integration, member shell/sidebar/router and deployment wiring
- Finance domain/API/SQL/UI tests and documentation
- docs/features/helix-finance-migration delivery/verification records and release runbook

Final integration owns routing conflict resolution and acceptance evidence. It cannot close the parent from child completion percentages alone. No merge/deploy or unrelated project-management integration is part of this ticket.

Recheck paths and current main before implementation. Shared changes require coordinator scheduling even when there is no graph edge. Preserve unrelated checkout work and recorded migrations.

## Verification

Run the full spec command list and all acceptance scenarios. Inspect real rendered UI, exercise actual configured services only in an authorized isolated environment and distinguish missing evidence. Review the complete diff for unrelated changes before an unmerged PR and verify its CI after publication.

Baseline references: Spec F-01 through F-18, all scoped inventory acceptance cases and decisions D1 through D9. The supplied source inventory is evidence of the previous implementation, not proof that this ticket passes.

## Status

Approved specification revision 1, 26 October 2026. Blocked for execution until the listed native blockers are complete.

Implementation has not started. The ready-for-agent label does not override blockers or authorize production changes. Follow the parent specification, current repository instructions and applicable delivery authorization.

## Source inventory

[Supplied source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49). The approved parent specification takes precedence.
