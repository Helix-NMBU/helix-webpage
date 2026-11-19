# Project budget delivery record

Feature: `project-budget-approvals`, approved specification revision 1.
Repository: `Helix-NMBU/helix-webpage`.
Tracker parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking).
Started: 19 November 2026 after the user explicitly invoked Deliver.
Base: remote `main`, `b05c5a457a378a76aaba7535ab6c0664505cf089`, reverified live.
Integration branch: `codex/project-budget-approvals`.
Integration worktree: `/Users/henrik.noteless/.codex/worktrees/project-budget-approvals/helix-webpage`.
PR: none. No matching existing feature PR, branch or active worktree was found before setup.

## Reconciliation

The approved parent, nine children and all comments were reconciled. All nine children were Backlog with no comments. The extensive unrelated original checkout remains intact. Only approved feature documents, its ADR and agreed glossary additions were copied into the new integration checkout. That was the setup snapshot; foundation and threshold changes are now integrated as recorded below.

The current remote base has 11 API functions. The original working tree's two extra unrelated wrappers are not part of this feature. New operations must reuse existing entrypoints.

## Assignments and dependency frontier

| Ticket | Tracker | State | Worker/worktree/branch | Evidence |
| --- | --- | --- | --- | --- |
| PBA-01 | HELIX-76 | closed on feature branch | `/root/pba_01_contracts`; `/Users/henrik.noteless/.codex/worktrees/pba-01-contracts/helix-webpage`; `codex/pba-01-contracts`; base `93d2e4774a381e55dc01621a5407f5a2bd4efa93` | Worker `5d9e052a733f039166be4a96882b388ccc6fdac2`; integrated `1cadc34`; 17 integrated foundation tests incl3 PG; all3 typechecks; Done in Linear. |
| PBA-02 | HELIX-78 | closed on feature branch | reused agent `/root/pba_01_contracts`; `/private/tmp/helix-pba-02-approval`; `codex/pba-02-approval`; base `4cac50ffe33d32142e04c9ce3c8e631b11d53393` | Integrated through78e6c74;42 server +80 UI +15 follow-up cases; all3 typechecks/lint/source11; Done readback verified. |
| PBA-03 | HELIX-79 | integrated, awaiting regression repair | reused `/root/pba_01_contracts`; `/private/tmp/helix-pba-03-revisions`; `codex/pba-03-revisions`; base78e6c74 | Verified PBA-02 prerequisite; owns069 revision/import core and review UI. |
| PBA-04 | HELIX-77 | reopened for integration fixture repair | `/root/pba_04_threshold`; original `/private/tmp/helix-pba-04-threshold`, repair `/private/tmp/helix-pba-04-repair`; branches `codex/pba-04-threshold` and `codex/pba-04-cleanup` | Policy `56415c5` -> `dada27b`; teardown `0be6671` -> `4cac50f`; 104 initial tests, then clean exact PostgreSQL CI selection 27/27; Done again. |
| PBA-05 | HELIX-80 | running | reused `/root/pba_04_threshold`; `/private/tmp/helix-pba-05-purchases`; `codex/pba-05-purchases`; base78e6c74 | Verified PBA-02 prerequisite; owns070 purchase/completion routines and purchase UI. |
| PBA-06 | HELIX-81 | blocked | unassigned | Needs integrated PBA-05. |
| PBA-07 | HELIX-82 | blocked | unassigned | Needs integrated PBA-03. |
| PBA-08 | HELIX-83 | blocked | unassigned | Needs integrated PBA-06 and PBA-07. |
| PBA-09 | HELIX-84 | blocked | unassigned | Needs integrated PBA-04 and PBA-08. |

Reserve migration numbers from 066 upwards: 066 foundation, 067 threshold policy, 068 approvals, 069 revisions/import, 070 purchases, 071 Drive evidence, 072 award obligations, 073 totals if needed. The actual remote base already includes tracked 065_finance_historical_purchases.sql; preserve it and load it in feature test bootstrap. The older original checkout's untracked copy must not replace it. Workers may leave reserved numbers unused, but must coordinate new migrations and contracts.

## Verification and infrastructure

- Baseline at documentation commit `93d2e4774a381e55dc01621a5407f5a2bd4efa93`: client/API/runtime TypeScript checks passed; npm test passed 1,820 tests in 172 files with 8 environment-skipped cases in 2 files, plus 3 deployment guards. Existing real PostgreSQL finance concurrency suite separately passed 6 tests using the temporary loopback server. Logs: `/private/tmp/helix-pba-baseline-tests.log` and `/private/tmp/helix-pba-baseline-postgres.log`.
- Local Node v24.19.0 and npm 11.17.0 match required major/toolchain versions.
- Docker has no running daemon. Installed PostgreSQL17 for tests and started an isolated temporary cluster at `/private/tmp/helix-pba-postgres.J3mOMS/data`, bound only to 127.0.0.1:55475. Test URL is `postgresql://postgres@127.0.0.1:55475/postgres`; use unique disposable test databases. No production data is present; no login background service was enabled. Server path pointer: `/private/tmp/helix-pba-postgres-path`.
- Drive destination/service identity/narrow OAuth scope/reader ACL and real entry-to-project mapping remain release inputs. No live DB or Drive writes are authorized merely for validation. Local fixtures and isolated databases are permitted.
- Baseline npm run build passed, 9.00 MB static output and 11 source functions. The later local compiler baseline passed 11 generated functions; final code compilation remains required. Log: `/private/tmp/helix-pba-baseline-build.log`.
- Independent full-feature review has not started. No PR exists. PBA-01 and PBA-02 are closed; PBA-03 is integrated pending compatibility repairs, PBA-04 reopened for historical fixture repair, and PBA-05 is running. The parent stays open.

## Next action

PBA-03 revision/import is integrated at29e67b0 pending historical PostgreSQL fixture repair and a small preview presentation follow-up. PBA-05 purchases/completion is running in its separate verified worktree from78e6c74. Integrate/verify completed commits serially, then schedule PBA-07 after03 and PBA-06 after05. Keep completion SQL separate from the revision core and coordinate central service/UI edits. Whole-feature Finance-page browser coverage remains in PBA-09 using a dedicated local Finance fixture, without persistent member grant changes.

The user authorized ordinary feature push, PR creation and ticket updates by invoking Deliver. Merging and deployment remain unauthorized. Both source and generated Vercel function counts passed11/11 on the root slices; final compilation must bind to the final feature commit and use isolated dependencies.

## PBA-04 integration, 19 November 2026

Inspected worker patch before serial cherry-pick `56415c57534dc3823e242c5a90df2fa98a206ea8` -> integration `dada27b`. Seven focused files passed 104 tests with real PostgreSQL enabled, all three TypeScript commands passed, and active-source search confirms only always-null/deprecated compatibility names remain. Historical exception evidence is retained and labeled historical. Integrated log: `/private/tmp/helix-pba04-integrated-tests.log`. HELIX-77 closed with this evidence; later integration or review failures require reopening it.

## Read-only integration preflight

Agent `/root/integration_scout` inspected the clean baseline, not the completed feature. Key downstream seams: scoped registration needs both service dispatch and SQL `begin_purchase_mutation`/`reserve_upload_final_candidate` authority; unbudgeted-before-first-approval needs TS validation, SQL registration and absent ledger handling; legacy anchor EM/earmark constraints remain; raw reads in finance-summary, finance-budgets, finance-funding-read, request choices and season-financials gating must consume effective facts. Restricted funding must not disappear when priority derives P0. Drive transfer must use finalized immutable bytes; documents.storage_key remains required. Budget outbox events need actual composers/recipient rechecks. Project-delete failures need an actionable financial-history message. Align promotion and registration lock order, including legacy requests/multi-project purchases. Scope helper must use an existing header's department rather than a caller override. These are implementation seams, not scope changes or final independent review evidence.

## Local generated-function baseline

Vercel CLI65.2.0 completed a local build against the verified existing Helix NMBU/helix-webpage context on feature code through PBA-04. No deploy command was run. Log: `/private/tmp/helix-pba-vercel-baseline-build.log`. Its npm ci temporarily replaced the shared dependency directory while PBA-01 was checking; worker paused rather than use an npx fallback. Compiler finished, locked tool versions were rechecked, and the affected worker checks are being rerun. The compiler's only generated tracked change was pruning45 lines of optional peer lock metadata; that own generated lockfile change was restored. Avoid compiler/install overlap with worker checks; use a separate compiler dependency checkout for the final function build.

## PBA-01 integration, 19 November 2026

Reviewed actual foundation schema/helper/contracts/fixtures and integrated `5d9e052a733f039166be4a96882b388ccc6fdac2` as `1cadc34`. Isolated integrated foundation run passed17/17, including3 real PostgreSQL cases; all3 typechecks passed. Actual066/bootstrap065 preservation includes imported historical-paid/null-requester invoice, unbudgeted actual, stable IDs, authoritative department, canonical Electrical/Electronics and partial adoption totals. No central financial gate was widened. HELIX-76 closed with evidence. Log `/private/tmp/helix-pba01-foundation-only.log`.

Combined PBA01/04 assertions passed23/23 but emitted2 uncaught57P01 errors from forced database teardown in the policy test. HELIX-77 reopened; worker04 is repairing actual client-end waits in a reusable test pool helper, not suppressing errors. This does not invalidate the clean foundation acceptance; the combined run must pass after repair. Log `/private/tmp/helix-pba01-integrated-tests.log`.

## Repaired root-suite cleanup

Worker repair `0be66712a366a41514e1c2a3c23b4de2c310f7b5` was inspected and integrated as `4cac50f`. Its shared test-only pool utility awaits actual public client end events before dropping databases normally. Threshold, foundation and existing Finance concurrency suites use it. Root exact Finance PostgreSQL workflow selection passed27/27 in4 files without uncaught errors; log `/private/tmp/helix-pba-roots-postgres-integrated.log`. Worker passed three6-case standalone runs, three23-case combined runs and the27-case CI selection. HELIX-77 closed again, retaining the earlier reopened state/evidence as history.

## PBA-02 assignment

Reused agent `/root/pba_01_contracts` with a NEW clean ticket-specific worktree `/private/tmp/helix-pba-02-approval`, branch `codex/pba-02-approval`, verified base `4cac50ffe33d32142e04c9ce3c8e631b11d53393`. Full backend, scoped API dispatch, project/department/Finance UI, local role fixtures and real decision tests are required. Migration068 reserved. Central app routing has one assigned writer at this frontier. Existing record/delivery coordinator ownership remains with root.

## PBA-02 parallel sub-assignment

Backend worker delegated the independent frontend portion within the same approved ticket to agent `/root/pba_01_contracts/approval_ui`. Its distinct worktree is `/private/tmp/helix-pba-02-ui`, branch `codex/pba-02-ui`, verified base `4cac50ffe33d32142e04c9ce3c8e631b11d53393`. It owns new UI/client repository and project/department/Finance entry points; backend worker owns SQL068, server, shared wire types and database tests. Local-only role query is `budgetRole=project_lead|department_lead|finance|head_of_finance`, gated on dedicated loopback mode and sign-in, with shared synthetic budget state across role changes. The backend worker will inspect/merge the UI commit on its own worker branch; only root updates the feature integration branch. HELIX-78 remains one ticket and requires combined acceptance before closure.

## Next parallel frontier coordination

After PBA-02 is integrated and verified, PBA-03 revisions/import and PBA-05 purchases/completion can proceed independently. Reserve mutation core/revision SQL069 to PBA-03. PBA-05 should add dedicated completion/purchase functions and a narrow dispatch seam in070 rather than replace a stale full copy of mutate_project_budget from068. Serialize shared service/type wiring during integration. Both must agree on header/request/ordered-entry/legacy-container lock order and cover promotion versus purchase using independent PostgreSQL connections. PBA-07 should add obligation guard functions/triggers without overwriting unrelated mutation changes. Every raw effective-read consumer identified in the preflight remains in PBA-08's coverage.

## Isolated final compiler setup

Created detached local compiler worktree `/private/tmp/helix-pba-compiler` at `21c43a5` with its own dependency install. Before the final Vercel build, fast-forward this disposable checkout to the reviewed feature commit and copy only ignored local Vercel project context. No deployment is authorized. Integration dependencies are no longer shared with compiler installs.

## PBA-02 acceptance and next frontier

Reviewed/integrated a741ec4 ->cbd1182, cb0e35c ->365f736, e40ab65 ->cab1ca6, frontend d0c5cc3 ->d487f51 and5bfc82e ->78e6c74. Root server selection passed42/42 in6 files; UI selection80/80 in8 files; final mail/repository follow-up15/15. All3 typechecks, lint and source11 passed. Existing generated11 remains a prior baseline, not final approval-code compilation. Logs `/private/tmp/helix-pba02-integrated-{server,ui,followup}.log`. Worker combined selection110/110. HELIX-78 Done update/readback verified.

Root fresh IAB journey at5292 covered explicit multi-department choice, Draft, entry8000.25, submission, department approval, ordinary Finance read-only and Head of Finance final approval/history. Root integrated port5293 verified save restores focus to Add entry; screenshot `/Users/henrik.noteless/.codex/visualizations/2026/11/19/01a1f507-0bd9-7353-8e02-363fe7cc5fa3/project-budget-draft.jpg`. Browser uses synthetic loopback fixtures; actual database authorization/races are separate evidence. CUA completion summaries issued. A child attempt to save local Alex's persistent Financials grant was rejected by automatic approval review as an unauthorized privilege change; it was not retried. Broad Finance page remains component-verified until PBA-09's dedicated fixture coverage.

Created and verified clean03/05 worktrees above at fullbase78e6c74ddd9c0bbf4b62c15cfc024ca1f629d22f. Each uses the stable integration dependencies via node_modules symlink; do not reinstall them. Compiler dependencies are separate. PBA-03 owns core069 and panel revisions/diffs; PBA-05 owns070, new purchase/completion modules and narrow panel import only. Both use header -> verified authority/project -> candidate as needed -> ordered anchors -> legacy ledger -> reference/view locks. No dependent implementation started before02 acceptance.

## PBA-03 UI sub-assignment

Backend worker reused `/root/pba_01_contracts/approval_ui` in a new isolated worktree `/private/tmp/helix-pba-03-revision-ui`, branch `codex/pba-03-revision-ui`, verified clean base `78e6c74ddd9c0bbf4b62c15cfc024ca1f629d22f`. It owns candidate revision/diff/import screens, retirement of legacy plan-write controls in BudgetsPage.tsx, local fixtures and browser port5294. Backend03 owns069/service/validation and will combine the child commit on its own branch. PBA-05 owns a standalone completion/purchase component and narrow dispatch; shared edits are coordinated explicitly. Root port5293 stays reserved.

## Broader Finance regression follow-up

At78e6c74/d492676, broader Finance tests passed301 cases and skipped12 environment-dependent cases but found one old freshness assertion expecting the historical season section expanded by default. HELIX-78 reopened while coordinator changed only the test interaction to open Season budget, retaining the original fresh-approval/cache assertions. Test-only commit71a1c62 passed the affected8/8 cases. Other301 passing results remain valid; the separately executed real PostgreSQL selection covers the12 environment-dependent cases. HELIX-78 Done again/readback verified. Logs `/private/tmp/helix-pba02-finance-regression.log` and `/private/tmp/helix-pba02-freshness-followup.log`. This does not change application code or the03/05 prerequisite contracts.

## Feature branch automatic deployment boundary

Before any authorized PR push, coordinator added exact-branch `git.deploymentEnabled["codex/project-budget-approvals"]=false` in vercel.json. This prevents the Git integration from automatically publishing a hosted preview of this feature; other branches keep Vercel's default behavior. The approved workflow verifies locally and ends with an unmerged PR. Official behavior checked19November2026: https://vercel.com/docs/project-configuration/git-configuration . No remote project setting or deployment was changed. Final local compiler and independent review must include this configuration.

## Early03/05 integration review

Root reviewed work-in-progress069 and070, not final acceptance.03 now reports guards for Request changes without an approved baseline and for obligations activated after candidate edits: promotion must recheck every candidate and omitted approved entry under the header lock. Tests remain pending.05 reports scoped upload/register routines with verified identity/current department, immutable upload checks, and header-first wrappers for legacy register/void. Root requested authoritative request/allocation-derived project sets and sorted multi-project locks; later combined PostgreSQL races must verify promotion, registration and completion. No ticket is closed from these reports.

Read-only07 preflight: existing partner pipeline load includes all private cards/organizations, so Head of Finance needs a separate limited funding-application DTO/queue rather than broader pipeline capability. Funding-application classification/award is separate from existing finance review/Won/received workflows. Existing verified final-object storage bytes and digest in finance-purchases.ts/finance-storage.ts are the06 transfer source; never use the still-writable presigned staging object. These are implementation seams, not additional requirements.

## PBA-03 partial integration and regression repair

Reviewed/cherry-picked88d000b ->192dc85, bf859b7 ->f2cfd3b, frontend780eda1 ->29e67b0. Worker combined head6fd23eb has equivalent UI commit; do not duplicate it. Root all3 typechecks passed; UI201/201 in28files passed. Broader server selection passed83 assertions but two old PostgreSQL suites failed beforeAll because setup calls retired legacy createBudget; their12 tests skipped, so the command failed. Logs `/private/tmp/helix-pba03-integrated-{server,ui}.log`. HELIX-79 remains In Progress. HELIX-77 reopened until the threshold suite executes against current integrated code. Backend03 worker is adapting historical fixtures and any obsolete old-plan edit scenario while retaining purchase/threshold/optional request/concurrency coverage, without restoring legacy writes.

Root integrated IAB5293 journey: approved baseline8000.25, Finance requested changes with reason, PL CSV updated stable Frame material order to8250.50 and added Electronics Control board400.00, proposed8650.50/net650.25. Both reviewers displayed identical exact field/total diffs; both approvals promoted8650.50; earlier approved version1 remains selectable at8000.25. Snapshots saved outside repository: project-budget-revision-draft.jpg, project-budget-finance-revision.jpg, project-budget-approved-history.jpg under the existing visualization directory. CUA completion summary issued. No actual provider/service acceptance is implied by synthetic fixtures.

Child03 UI agent is making one bounded import-preview presentation follow-up in `/private/tmp/helix-pba-03-revision-ui`: resolve System UUIDs to existing choice labels and render canonical planned amounts as exact NOK, with focused assertions. Core persistence/CSV contracts unchanged. Root must inspect/integrate its additional SHA before03 closure. PBA-07 remains unscheduled until03 passes.
