# Project budget implementation plan

Feature: `project-budget-approvals`
Specification: [spec.md](spec.md), revision 2
Status: revision 2 approved on 20 November 2026 with "Approve, publish and continue delivery"; published in Linear. Revision 1 evidence remains preserved.
Tracker: Linear, HELIX / Helix member Platform / existing Finance milestone
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking)

The user approved revision 1 and nine tasks on 19 November 2026, then invoked Deliver. Original approval hashes/readbacks remain in publication.json. On 20 November the user confirmed one fixed department package approval, allowing unfinished projects and allocating each full project budget to its responsible department. This amendment adds one task and extends final verification; it does not discard the completed work.

## Task breakdown

| Local ID | Linear issue | Behavior and ticket draft | Requirements | Blocked by |
| --- | --- | --- | --- | --- |
| PBA-01 | [HELIX-76](https://linear.app/helixnmbu/issue/HELIX-76/pba-01-establish-project-budget-contracts-and-safe-migration) | [Establish project budget contracts and safe migration groundwork](issues/pba-01-contracts-and-migration.md) | F-01, F-04, F-13, F-15 | None |
| PBA-02 | [HELIX-78](https://linear.app/helixnmbu/issue/HELIX-78/pba-02-draft-project-budgets-and-complete-both-approval-stages) | [Draft project budgets and complete both approval stages](issues/pba-02-project-budget-approval.md) | F-01, F-02, F-04, F-05, F-14 | PBA-01 |
| PBA-03 | [HELIX-79](https://linear.app/helixnmbu/issue/HELIX-79/pba-03-revise-approved-budgets-with-reviewable-changes) | [Revise approved budgets with reviewable changes](issues/pba-03-budget-revisions.md) | F-03, F-13, F-14 | PBA-02 |
| PBA-04 | [HELIX-77](https://linear.app/helixnmbu/issue/HELIX-77/pba-04-remove-the-nok-5000-rule-across-active-workflows) | [Remove the NOK 5,000 rule across active workflows](issues/pba-04-remove-purchase-threshold.md) | F-06, F-09, F-14 | None |
| PBA-05 | [HELIX-80](https://linear.app/helixnmbu/issue/HELIX-80/pba-05-register-project-purchases-and-track-partial-completion) | [Register project purchases and track partial completion](issues/pba-05-project-purchases.md) | F-04, F-06, F-07, F-09, F-14 | PBA-02 |
| PBA-06 | [HELIX-81](https://linear.app/helixnmbu/issue/HELIX-81/pba-06-store-uploaded-invoices-in-shared-drive-with-recovery) | [Store uploaded invoices in shared Drive with recovery](issues/pba-06-drive-invoices.md) | F-04, F-08, F-09, F-14 | PBA-05 |
| PBA-07 | [HELIX-82](https://linear.app/helixnmbu/issue/HELIX-82/pba-07-apply-and-release-awarded-funding-obligations) | [Apply and release awarded funding obligations](issues/pba-07-funding-obligations.md) | F-04, F-10, F-11, F-14 | PBA-03 |
| PBA-08 | [HELIX-83](https://linear.app/helixnmbu/issue/HELIX-83/pba-08-show-purchased-budgets-and-consistent-financial-totals) | [Show purchased budgets and consistent financial totals](issues/pba-08-budget-overviews-and-totals.md) | F-05, F-09, F-12, F-13, F-14 | PBA-06, PBA-07 |
| PBA-10 | [HELIX-85](https://linear.app/helixnmbu/issue/HELIX-85/pba-10-submit-and-approve-department-budget-packages) | [Submit and approve department budget packages](issues/pba-10-department-budget-packages.md) | F-01 through F-05, F-12 through F-15 | PBA-08 |
| PBA-09 | [HELIX-84](https://linear.app/helixnmbu/issue/HELIX-84/pba-09-rehearse-migration-and-verify-the-integrated-feature) | [Rehearse migration and verify the integrated feature](issues/pba-09-integration-and-migration-verification.md) | F-01 through F-15 | PBA-04, PBA-08, PBA-10 |

## Dependency graph

```text
PBA-01 -> PBA-02
PBA-02 -> PBA-03, PBA-05
PBA-03 -> PBA-07
PBA-05 -> PBA-06
PBA-06, PBA-07 -> PBA-08
PBA-08 -> PBA-10
PBA-04, PBA-08, PBA-10 -> PBA-09
```

PBA-01 through PBA-07 are complete on the feature branch under revision 1. PBA-08 is finishing reusable canonical facts, evidence, scenarios and local projections. PBA-10 then replaces individual Finance handoff with the complete department package, readiness and grouped change review. PBA-09 verifies the amended integrated feature after all three blockers are satisfied.

## Amendment behavior

- Project leads draft and submit their own candidates. Department leads preview all projects and send the complete department budget. Head of Finance approves the included project changes together, with no individual-project final-approval bypass.
- Missing/Draft projects remain visible for follow-up and do not block sending. They contribute only their last approved amounts. Multi-department projects with no selected budget owner are explicitly unallocated; a scope-discovery fallback never creates financial ownership.
- Each department homepage shows its approved allocation and project breakdown to authorized department members. It reuses the same totals and omits private evidence and unsubmitted Draft values.
- Each project contributes its full budget to its responsible department, including entries for another department's systems. Keep physical system and recorded purchase identities. Show unmapped legacy plans separately until genuine approved replacement.
- Finance sees every project group, entry, project subtotal and department total, with New/Changed/Removed and old/new values. A fixed submission pins plan contents while actuals/invoices refresh separately.
- Atomic approval, package-aware return/withdrawal, current role checks and ordered locks preserve old approvals, purchased evidence, P0 and restricted funding. Existing Finance-pending candidates need a real department package send; no synthetic package approval.

The unchanged purchase, Drive invoice, funding, mapping and release boundaries remain in spec.md. No new top-level API function is budgeted. Keep at most 11 source/generated functions.

## Shared writes and verification

PBA-10 owns the additive 074 package contract, lifecycle, canonical department allocation and scoped UI as one end-to-end task. A backend and UI worker may work independently in separate worktrees after shared contracts are committed; root integrates serially and owns tracker/delivery/PR. Avoid competing financial formulas. The final-union validation must precede materialization across all included projects.

PBA-09 extends V-01 through V-09 with grouped department readiness/diffs, two-project atomicity, missing/Draft and unchanged projects, cross-department allocation, late purchases, stale/withdrawn packages, direct-action denial and current-role checks. Run real PostgreSQL races, migration rehearsal, all typechecks, repository lint, full tests, local browser checks, build and source/generated function guards. Fresh Standards, Spec and full correctness review must apply to the final amended commit, followed by exact-commit required verify CI and one unmerged PR.

Real Drive identity/folder/narrow scope/readers ACL, approved live entry mapping and Finance approver grants remain release inputs. No merge, production migration or deployment is authorized.

## Approval and publication delta

The user approved spec revision 2, PBA-10 and the PBA-09 extension together. Update the existing HELIX-75 specification, create exactly one new child in its Finance milestone, preserve the existing children and completion evidence, and add the native PBA-10 -> PBA-09 blocker. Read back content, parent, milestone, label and dependencies. Keep publication.json's revision 1 record; save the amendment's approval/hash/readbacks separately. Continue the already requested Deliver workflow after approval.

Publication verified: HELIX-85 is the tenth child of HELIX-75 in the existing Finance milestone, blocked by HELIX-83 and blocking HELIX-84. The original seven completed children retain Done status; HELIX-83 remains In Progress and HELIX-84 Backlog. Parent remains open. Amendment approval, original draft hashes and readbacks are in amendment-publication.json.
