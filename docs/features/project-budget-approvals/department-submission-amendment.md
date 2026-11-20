# Department budget submission amendment

Feature: `project-budget-approvals`, parent HELIX-75.
Status: draft amendment incorporated into specification revision 2. Not yet published or implemented.
Date: 20 November 2026.
Source: the user's department-budget clarification and explicit answers D11 through D14 in scope.md.

## Confirmed behavior

A department lead submits the whole allocated department budget. Head of Finance approves the included project changes together as one fixed package. Finance sees every project grouped with its entries and subtotal, and the department total. Entry comparisons explicitly show New, Changed and Removed, previous/proposed values and the net change. Removed entries remain visible in the comparison and retain their purchase/invoice history.

Before sending, the department lead sees every relevant project, including No budget and Draft projects. Missing or unfinished budgets do not block submission. An unfinished project contributes its last approved amount if it has one; unapproved proposed amounts remain outside the submitted total. The submission clearly identifies the candidates it includes, the unchanged approved baselines and the unfinished projects.

The user confirmed full-project allocation to its responsible budget department, including other departments' systems. This supersedes the current system-department aggregation for project-owned entries. The concrete revision is now in spec.md and the new task draft is issues/pba-10-department-budget-packages.md. All product questions for this amendment are resolved.

## Proposed executable contract

- Project leads continue to draft and submit project candidates for department review. A department lead can return an individual candidate for correction with a reason.
- The department lead previews the complete package, including the comparison against each last approved project version. Sending records department approval for the included submitted candidates and moves those candidates to Sent to approval (Finance). The department package, rather than an individual project button, becomes the Finance approval unit.
- The package pins the reviewed project versions, previous approved baselines, readiness facts and exact totals. It lists projects that are unstarted or still drafting without leaking their unsubmitted entries to Finance.
- Only explicit Head of Finance approves the package. One transaction promotes all included candidate versions or promotes none. Individual-project final approval cannot bypass this package decision.
- Purchases continue against the last approved versions during review. Actual-cost or invoice changes refresh evidence without silently replacing the submitted plan or invalidating it merely because spending occurred.
- Returning or withdrawing a package needs a reason and preserves its snapshot/history. Included candidates return to Draft and must pass department submission and Finance approval again. Unchanged approved baselines remain effective.
- Stale or changed candidate contents, reassignment, current permission loss and concurrent decisions fail safely. A withdrawn or superseded candidate cannot be approved from an older package. Retries cannot duplicate decisions, promotions or notifications.
- Preserve existing unmapped legacy plans as an explicit transition section with its own subtotal, rather than inventing projects or counting replacement plans twice. The complete department total remains reconcilable.

## Proposed task change

Add one implementation ticket, PBA-10, Submit and approve department budget packages. It follows verified PBA-08 and delivers the lifecycle, grouped review and project-readiness view together. It owns the additive packet migration and shared contracts, scoped API, department and Finance interfaces, fixtures, audit/outbox behavior, and transaction/browser tests. Existing completed tickets retain their revision 1 evidence; PBA-10 replaces the individual Finance handoff rather than redoing unrelated completed work.

Extend PBA-09's verification matrix and blockers so it follows PBA-04, PBA-08 and PBA-10. It must verify atomic approval across at least two projects, missing/Draft projects, unchanged baselines, cross-department attribution, added/edited/removed lines, stale/returned/withdrawn packages, current roles, concurrent purchase and approval, duplicate decisions, invoice/history preservation and dirty-input refresh. Final independent reviews and exact-commit CI apply to the amended complete feature.

Dependency change: PBA-08 -> PBA-10 -> PBA-09. PBA-04 remains a prerequisite of PBA-09.

No merge, production migration, Drive setup or deployment is included. Existing real-service and operator mapping release gates remain open. Publication and implementation of this amendment will be requested against the complete revised specification and ticket draft against the complete specification revision 2 and task plan.
