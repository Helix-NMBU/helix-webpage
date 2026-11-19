# Project budget implementation plan

Feature: `project-budget-approvals`
Specification: [spec.md](spec.md), revision 1
Status: approved, published in Linear
Tracker: Linear, HELIX / Helix member Platform / existing Finance milestone
Parent issue: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking)

The user approved revision 1 and all nine implementation tickets on 19 November 2026 by selecting "Approve and publish in Linear". The exact answer and approved draft hashes are recorded in publication.json. This plan does not start implementation.

## Ticket breakdown and native blockers

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
| PBA-09 | [HELIX-84](https://linear.app/helixnmbu/issue/HELIX-84/pba-09-rehearse-migration-and-verify-the-integrated-feature) | [Rehearse migration and verify the integrated feature](issues/pba-09-integration-and-migration-verification.md) | F-01 through F-15 | PBA-04, PBA-08 |

Dependencies, in publication order:

```text
PBA-01 -> PBA-02
PBA-02 -> PBA-03, PBA-05
PBA-03 -> PBA-07
PBA-05 -> PBA-06
PBA-06, PBA-07 -> PBA-08
PBA-04, PBA-08 -> PBA-09
```

The table is authoritative. PBA-08 needs PBA-06 and PBA-07. PBA-09 needs PBA-04 and PBA-08. No other blocker is implied by the drawing.

First eligible work is PBA-01 and PBA-04 after approval and a separate Deliver request. PBA-02 needs the shared contracts. Revisions and project purchases can follow PBA-02 independently. Drive needs the stable purchase/evidence hook; obligation enforcement needs the revision paths. Overview needs confirmed evidence and derived P0. Final integration needs the removed policy and the completed overview.

## Decisions included in this proposed plan

- One budget per project/season and one pending candidate. Current department leads can approve their responsible department's candidate; Head of Finance gives the final decision. Return/withdraw requires a reason and restarts both approvals. Overlapping assignments are not given a new self-approval prohibition or bypass.
- Keep optional purchase requests and historical commitments. Remove the NOK 5,000 policy and all active threshold enforcement/messages rather than delete procurement history.
- Completion is independent of money and payment. A new purchase or linked void reopens a complete entry for review.
- Map old entries into project Draft candidates and acquire genuine sequential approvals. Existing genuine legacy approval remains effective during transition until each approved replacement takes over. Mapping never fabricates department approvals or counts an entry twice.
- Award recording belongs to Head of Finance on relevant funding-application context. A grant award is distinct from sponsor Won, cash receipt and marketing/invoicing tasks. Legacy restricted-funding EM is not automatically P0.
- Use verified private staging and durable Drive-transfer jobs. Save actual expense independently of Drive availability, show evidence pending honestly, and reconcile retry using one persisted generated file ID. Old private invoices remain accessible. No public permission widening.
- Use the current 11 API entrypoints. Remote main was verified at b05c5a457a378a76aaba7535ab6c0664505cf089. The unrelated current checkout has 13 source functions and extensive local changes; preserve it and isolate delivery from fresh main.

These are reviewable implementation choices, not additional user answers inferred from silence. The approval applies to this complete revision.

## Requirement coverage

- F-01: PBA-01, PBA-02; integrated acceptance in PBA-09.
- F-02: PBA-02; integrated acceptance in PBA-09.
- F-03: PBA-03; integrated acceptance in PBA-09.
- F-04: PBA-01, PBA-02, PBA-05, PBA-06, PBA-07; integrated acceptance in PBA-09.
- F-05: PBA-02, PBA-08; integrated acceptance in PBA-09.
- F-06: PBA-04, PBA-05; integrated acceptance in PBA-09.
- F-07: PBA-05; integrated acceptance in PBA-09.
- F-08: PBA-06; integrated acceptance in PBA-09.
- F-09: PBA-04, PBA-05, PBA-06, PBA-08; integrated acceptance in PBA-09.
- F-10: PBA-07; integrated acceptance in PBA-09.
- F-11: PBA-07; integrated acceptance in PBA-09.
- F-12: PBA-08; integrated acceptance in PBA-09.
- F-13: PBA-01, PBA-03, PBA-08; integrated acceptance in PBA-09.
- F-14: PBA-02, PBA-03, PBA-04, PBA-05, PBA-06, PBA-07, PBA-08; integrated acceptance in PBA-09.
- F-15: PBA-01; integrated acceptance in PBA-09.

## Shared writes and integration ownership

| Shared area | Tickets | Scheduling rule |
| --- | --- | --- |
| Finance TypeScript contracts and central service/API dispatch | PBA-01, PBA-02, PBA-04, PBA-05, PBA-06, PBA-07 | PBA-01 publishes the contract. Coordinator registers modules and serializes edits to central files. PBA-04 may proceed independently, with a deliberate compatibility merge. |
| SQL migration numbering and effective-entry reads | PBA-01, PBA-02, PBA-03, PBA-05, PBA-07, PBA-08 | Reserve non-overlapping migration files on the actual base. One authoritative effective-entry projection, no parallel copies of approved totals. |
| Budget list/detail, FinanceAccess and project/department entry points | PBA-02, PBA-03, PBA-08 | Reuse the same workflow controls. PBA-08 enriches existing screens rather than replace them. |
| Purchase registration, documents, recovery and exports | PBA-04, PBA-05, PBA-06, PBA-08 | Retire the threshold once; use one provider-aware document contract and stable registration/evidence IDs. |
| Partner card context and P0 guards | PBA-03, PBA-07, PBA-08 | PBA-03 uses the shared protection interface; PBA-07 owns obligation authority; PBA-08 consumes derived priority. |
| Test bootstrap, CI, route/function checks | PBA-01, PBA-09 and each slice's tests | Establish safe local schemas first; each slice adds its own tests; final integration executes them on real PostgreSQL and the actual PR commit. |

Shared-file overlap is not automatically a blocking dependency. Merge these edits deliberately; no additional tasks were added to fill agent slots.

## Verification and operational gates

Each ticket includes acceptance requirements, likely source files and behavior-based verification. The specification's V-01 through V-09 cover permission denial, sequential approval, review diffs, ongoing purchases during revision, removed threshold, unbudgeted actuals, partial completion, Drive recovery, funding awards/releases and financial totals.

Use existing API/service/component seams plus independent PostgreSQL connections for races. Validate local UI in the browser, including keyboard/pointer/focus/dismissal and dirty-form recovery. Run client/API/runtime typechecks, lint, integrated tests, build/static checks and source/generated function guards. Required PR check is currently verify; recheck at delivery. Independent review and one focused unmerged PR are required for code readiness.

Actual Drive/folder/service credentials, effective narrow-scope access, Finance viewer ACLs and the approved real entry-to-project mapping remain release inputs. They are not permission to use production data for tests or to claim configured-service acceptance from mocks. No factual gap blocks this plan; unavailable operational inputs may block real-service/release acceptance later.

Execution defaults and future branch/worktree naming are in spec.md. Prepare has created no implementation branch or PR. Publication approval does not start Deliver.

## Publication plan and record

After one user approval of the complete revision:

1. Recheck Linear for an existing publication before creating anything, including after uncertain tool outcomes.
2. Create one specification parent in HELIX / P-HELIX-4 / Finance. Relate it to HELIX-34 and HELIX-63. Do not add ready-for-agent to this parent.
3. Publish PBA-01 and PBA-04, then the dependent children in topological order, using ready-for-agent and the existing Backlog state. Leave assignees, dates and estimates unset.
4. Set real parent references and native blockedBy relationships; preserve acceptance text and requirement identifiers. A ready label does not mean its blockers are satisfied.
5. Read back every issue, relation and label; verify exactly nine children. Update spec.md, ticket drafts and publication.json with the approved revision, user answer and actual IDs/URLs. Do not mark partial publication complete.
6. Stop at the execution handoff unless the user explicitly also requests Deliver.

Publication: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking) and all nine children below are created. Native blocker, label, parent and content readback is recorded in publication.json. First eligible tickets are HELIX-76 and HELIX-77. Continue with $deliver HELIX-75 when implementation is requested.

