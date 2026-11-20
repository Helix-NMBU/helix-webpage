# PBA-09: Rehearse migration and verify the integrated feature

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 2.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 2. Read the complete approved specification before implementation.
Requirements: F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-11, F-12, F-13, F-14, F-15.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D15. Revision 1 was published on 19 November 2026; revision 2 was approved on 20 November 2026 with "Approve, publish and continue delivery". Deliver is already active.

## What to build

Verify the complete project-budget workflow and safe adoption of existing financial records. Resolve integration failures, record code readiness and outstanding real-service gates, and prepare one focused unmerged PR. This ticket is integration evidence, not authorization to change production.

## Acceptance criteria

- [ ] Verify department readiness with No budget/Draft projects, grouped New/Changed/Removed comparisons, complete responsible-department allocation and two-project all-or-none package approval. Deny individual-project final bypass and preserve unchanged approved baselines, purchases and invoice history through stale/returned/withdrawn packages.
- [ ] Run V-01 through V-09 against the integrated feature, including real PostgreSQL races and a legacy-to-project mapping rehearsal. Recheck all fifteen scope decisions and all F-01 through F-15 requirements against implementation evidence.
- [ ] Demonstrate a dry run writes nothing, mapping conflicts remain visible, real mapped project candidates receive sequential approval, legacy effective plan switches once, and IDs/actuals/requests/commitments/private evidence/payment/void history survive. Preserve unmatched records; do not fabricate mapping data.
- [ ] Ensure finance concurrency CI actually loads the new migrations and executes the new cases with its loopback test database. A green run with skipped race cases is insufficient.
- [ ] Pass client/API/runtime typechecks, relevant full tests, lint, build/static guard and both source/generated at-most-11 function checks. Re-run only when further changes or unresolved failures justify it; document unrelated baseline issues without hiding them.
- [ ] Inspect all affected UI locally, covering assigned lead, department lead, Finance and Head of Finance, keyboard/focus/dismissal, supported narrow layout and error/recovery states. Save useful screenshots outside the repository and include them in the PR when practical.
- [ ] Complete independent review against the approved spec and repository standards, fix actionable findings, and obtain passing required verify CI on the actual PR commit.
- [ ] Record actual Drive setup/ACL acceptance and operator mapping approval if explicitly authorized and available. Otherwise keep them as named release gates; do not claim feature release complete from mocked tests. Prepare one focused unmerged PR with limitations and migration instructions, without pushing or creating it until those actions are authorized.

## Blocked by

HELIX-77, HELIX-83 and PBA-10 / HELIX-85. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

Integration-owned routing/types, migration mapping/rehearsal tooling, PostgreSQL test bootstrap/CI, feature tests and docs. Fix only failures caused by or necessary for the approved feature. Preserve unrelated local changes and recheck base/main drift. Deliver owns delivery.md and closure evidence; publication.json remains the approval/publication record.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- Full approved verification matrix plus independent review and required exact-commit CI. Use known package scripts from spec.md; never use a production DB as test data.
- Compare pre/post identifiers and amounts on isolated legacy fixtures, including imported rows and inaccessible/legacy evidence. Record counts and any unresolved mapping/service inputs.
- Inspect the final diff and git status, demonstrate no unrelated files or screenshots are committed, and verify one unmerged PR with no automatic merge/deployment.

Specification cases: V-01, V-02, V-03, V-04, V-05, V-06, V-07, V-08, V-09.

## Status

Existing HELIX-84 is published and Backlog. Its revision 2 scope and added PBA-10 / HELIX-85 blocker were approved on 20 November 2026; publication and native blocker readback are verified. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

