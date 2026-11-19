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
| PBA-03 | HELIX-79 | closed on feature branch | reused `/root/pba_01_contracts`; `/private/tmp/helix-pba-03-revisions`; `codex/pba-03-revisions`; base78e6c74 | Verified PBA-02 prerequisite; owns069 revision/import core and review UI. |
| PBA-04 | HELIX-77 | closed on feature branch | `/root/pba_04_threshold`; original `/private/tmp/helix-pba-04-threshold`, repair `/private/tmp/helix-pba-04-repair`; branches `codex/pba-04-threshold` and `codex/pba-04-cleanup` | Policy `56415c5` -> `dada27b`; teardown `0be6671` -> `4cac50f`; 104 initial tests, then clean exact PostgreSQL CI selection 27/27; Done again. |
| PBA-05 | HELIX-80 | closed again after reviewed repair | reused `/root/pba_04_threshold`; `/private/tmp/helix-pba-05-purchases`; `codex/pba-05-purchases`; base78e6c74 | Verified PBA-02 prerequisite; owns070 purchase/completion routines and purchase UI. |
| PBA-06 | HELIX-81 | running | reused `/root/pba_04_threshold`; `/private/tmp/helix-pba-06-drive-invoices`; `codex/pba-06-drive-invoices`; basedb25e84 | PBA-05 verified;071 Drive transfer/evidence/recovery assigned. |
| PBA-07 | HELIX-82 | closed again after reviewed repair | reused `/root/pba_01_contracts`; `/private/tmp/helix-pba-07-obligations`; `codex/pba-07-obligations`; base990e0de | PBA-03 verified;072 funding applications, awarded obligations, limited HOF review assigned. |
| PBA-08 | HELIX-83 | blocked | unassigned | Needs integrated PBA-06 and PBA-07. |
| PBA-09 | HELIX-84 | blocked | unassigned | Needs integrated PBA-04 and PBA-08. |

Reserve migration numbers from 066 upwards: 066 foundation, 067 threshold policy, 068 approvals, 069 revisions/import, 070 purchases, 071 Drive evidence, 072 award obligations, 073 totals if needed. The actual remote base already includes tracked 065_finance_historical_purchases.sql; preserve it and load it in feature test bootstrap. The older original checkout's untracked copy must not replace it. Workers may leave reserved numbers unused, but must coordinate new migrations and contracts.

## Verification and infrastructure

- Baseline at documentation commit `93d2e4774a381e55dc01621a5407f5a2bd4efa93`: client/API/runtime TypeScript checks passed; npm test passed 1,820 tests in 172 files with 8 environment-skipped cases in 2 files, plus 3 deployment guards. Existing real PostgreSQL finance concurrency suite separately passed 6 tests using the temporary loopback server. Logs: `/private/tmp/helix-pba-baseline-tests.log` and `/private/tmp/helix-pba-baseline-postgres.log`.
- Local Node v24.19.0 and npm 11.17.0 match required major/toolchain versions.
- Docker has no running daemon. Installed PostgreSQL17 for tests and started an isolated temporary cluster at `/private/tmp/helix-pba-postgres.J3mOMS/data`, bound only to 127.0.0.1:55475. Test URL is `postgresql://postgres@127.0.0.1:55475/postgres`; use unique disposable test databases. No production data is present; no login background service was enabled. Server path pointer: `/private/tmp/helix-pba-postgres-path`.
- Drive destination/service identity/narrow OAuth scope/reader ACL and real entry-to-project mapping remain release inputs. No live DB or Drive writes are authorized merely for validation. Local fixtures and isolated databases are permitted.
- Baseline npm run build passed, 9.00 MB static output and 11 source functions. The later local compiler baseline passed 11 generated functions; final code compilation remains required. Log: `/private/tmp/helix-pba-baseline-build.log`.
- Independent full-feature review has not started. No PR exists. PBA-01 through PBA-04 are closed on the feature branch. PBA-05 awaits integration; PBA-07 is running. PBA-06 remains blocked by05 verification. The parent stays open.

## Next action

PBA-01 through PBA-05 and PBA-07 are integrated, verified and closed on the feature branch. PBA-06 runs from verifieddb25e84. PBA-08 remains blocked by06; worker07 is doing read-only consumer/test preflight. PBA-09 follows08. Root must integrate/verify06, then assign08 from that verified head. Broad Finance-page browser validation still needs dedicated loopback Finance fixtures in09; do not mutate persistent grants.

The user authorized ordinary feature push, PR creation and ticket updates by invoking Deliver. Merging and deployment remain unauthorized. GitHub authentication and unchanged remotemainb05c5a4 were verified with network-enabled read access. No feature remote branch or PR exists. Both source and generated Vercel function counts passed11/11 on earlier root slices; final compilation must bind to final feature code and use isolated dependencies.

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

## PBA-03 final acceptance

Integrated d1fff70 ->d11952c,24f06f8 ->8ea1e56,104da5f ->9b4e3ae,6b6884d ->131c7d5 and preview follow-up2aab842 ->990e0de. All3 typechecks/lint pass. Root sequential exact Finance PostgreSQL selection55/55 in9files and preview/integrity7/7 passed with zero skips/timeouts. Logs `/private/tmp/helix-pba03-repaired-ci.log` and `/private/tmp/helix-pba03-repaired-ui.log`. Earlier parallel attempts hit PGlite startup/component timeouts; retained `-contention.log` files document them, without treating skipped assertions as passing. Earlier broad UI201/201 remains valid; affected formatter7-case verification plus IAB preview confirmed exact NOK/system labels. Screenshot project-budget-import-preview.jpg saved in existing visualization directory; CUA completion issued.

Historical fixtures retain legacy SQL approval actor/date. The earlier intermittent first-ledger409 had no captured raw constraint despite repeats.069 now handles all unique conflicts with authoritative reselect and a missing-ledger conflict, and an actual counter-lock overlap test requires both independent approvals to succeed; safe test-only action/code/constraint diagnostics are retained. Do not claim the original cause was proven. HELIX-79 and HELIX-77 Done/readback verified.

PBA-07 assignment: new clean `/private/tmp/helix-pba-07-obligations`, branch `codex/pba-07-obligations`, fullbase990e0dea704c3bc8e38925917e0b9d18166fca5e; worker `/root/pba_01_contracts`. Owns072 and full awarded-application/P0 behavior, limited DTO/queue rather than unfiltered pipeline, proposals distinct from project-lead candidate edits, promotion/CSV/project-delete guards, immutable release history and real permission/race cases. May reuse UI child in a new isolated worktree. HELIX-82 In Progress/readback verified. No dependent work started before03 verification.

PBA-05 worker commits ready:7bed9225acb2ff020472131e32fecf508d665e42 plus169e40b62650f0376f813ba47aefe988fce4be0f, clean worker head169e40b. Evidence reported158 focused cases,31 then33 actual PostgreSQL cases,3typechecks/lint/source11. Generic register/void now lock verified identity/grants after sorted headers, before old request/anchor/ledger logic. Mapped Draft legacy-authority registration and cumulative overruns tested through generic/scoped paths, no invented approved_version_id. Root still must inspect/integrate and verify the combined code;05 remains open.06 reading/research allowed, implementation still blocked.

## PBA-05 integration and combined checks

Reviewed/integrated7bed922 ->2360e0a and169e40b ->9dc67b8. Resolved five ProjectBudgetsPanel conflicts by retaining comparison/import controls, importOpen/version selector/history, purchase controls/no-header scopes and combined dirty tracking. Auto-merges preserve03 history queries and05 purchase_count projection; scoped purchase/completion dispatch precedes the old Finance gate while candidate imports/legacy write retirement remain. All feature files remain isolated from the original checkout. Integrated checks are running; do not close05 from worker evidence alone.

New combined-test assignment for `/root/pba_04_threshold`: clean `/private/tmp/helix-pba-05-integrated-verification`, branch `codex/pba-05-integration-tests`, fullbase9dc67b899648727f88da4d32e59a0334eaefe6cb. Owns a new PostgreSQL test file against actual069+070 for purchase versus revision promotion, original overrun review/provenance, completion versus linked void, and actual candidate adoption preserving legacy purchases. Focused tests/fixes only, no integration/tracker changes.06 implementation remains blocked by final05 acceptance.

PBA-07 UI child assignment reported: `/root/pba_01_contracts/approval_ui`, `/private/tmp/helix-pba-07-obligation-ui`, branch `codex/pba-07-obligation-ui`, cleanbase990e0de. It owns classification/limited queue/proposal/adoption/award/release UI and gated fixtures; backend07 owns072 and shared contracts. Root reserved5293; child uses another isolated port. Header-before-application lock order and stable proposal identities outside version contents agreed.


## PBA-05 integrated follow-up verification

Integrated combined verification390f4e9 as7e8adde, launcher recoverya818ed4 as0c728cd and authoritative generic warnings3370f7c as9889624. The coordinator's conflict resolution had omitted the import modal and no-header project section. Typecheck detected it;39cef59 restored both, and HELIX-79 was reopened and closed again after verification. No history was rewritten.

Root UI selection passed218/218 in31files with no unhandled errors. All3 typechecks, lint and source11 passed. Exact Finance PostgreSQL selection passed75/75 in12files, without skips. Log `/private/tmp/helix-pba05-final-postgres-serial.log`. Commit4f80223 gives only full-schema PGlite setup hooks a30second budget and serializes CI test files. Independent database-connection races remain concurrent; assertion timeouts are unchanged. Previous default10second setup timeouts remain recorded in the earlier logs.

Root IAB5293 registered two partial invoice purchases totaling5000 against approved Frame material order8250.50, marked completion explicitly, then reopened it with a recorded reason while the approved v2 remained effective beside Draft v3. Screenshots `project-budget-partial-complete.jpg` and `project-budget-partial-reopened.jpg` are in the existing visualization directory. The no-header Marketing project exposed unbudgeted registration with Finance-review labeling, captured in `project-purchase-before-budget.jpg`. No actual cost was entered for that latter project. These are local fixture checks; real PostgreSQL tests separately cover promotion/registration and completion/void ordering, exact provenance, historical invoice/payment retention and replay.

Broader API regression selection currently fails54/166 assertions in4older suites, mostly setup through retired legacy budget APIs. This is unresolved verification, so HELIX-80 remains In Progress and06 implementation remains blocked. Agent `/root/pba_04_threshold` is assigned a new worktree `/private/tmp/helix-pba-finance-regressions`, branch `codex/pba-finance-regressions`, base4f80223, to retain meaningful request/history/privacy/processing cases while adapting historical setup and explicit retirement assertions. It owns only the4affected test files and focused helpers. Root owns integration and closure. Log `/private/tmp/helix-pba05-finance-api-regression.log`.

Current next action: inspect/integrate the bounded Finance regression repair, verify05, then create06 from that verified head.07 backend and UI remain in their assigned isolated worktrees.08 has not started; its verified prerequisites are06 and07. Current parent/child blocker state was checked in Linear and agrees with this frontier. No PR, push, merge or deployment has occurred.


## PBA-05 and PBA-07 final integration acceptance

Integrated regression repairf16f064 asdb25e84. Root broad Finance API selection passed163/163 in12files without unhandled errors, retaining request, processing, historical privacy/evidence/anchor coverage and actual scoped CSV safety. Log `/private/tmp/helix-pba05-finance-api-repaired.log`. Root combined PostgreSQL selection on070+072 passed93/93 in15files without skips; Finance/Pipeline/member UI252/252 in34files passed. All3 typechecks, lint and source11 passed. Generated11 is still earlier compiler evidence. HELIX-80 Done readback verified, unblocking06.

PBA-07 integrated contracts4295ba5 as7ee53bf,e5c4d2c asc2e46d9, backend2ead8e6 asa041a9b, UI6fdd49f asbfe93f9, restorationf96b8a6 as8cbd8d2. Conflicts retained scoped purchase dispatch/read actions, both purchase/proposal dirty guards and both panels.072 wraps the existing financial-assignment helper rather than replacing070. Root93-case database run covers actual full migrated schema and independent connection races;252-case UI run has no unhandled errors. Logs `/private/tmp/helix-pba07-integrated-postgres.log` and `/private/tmp/helix-pba07-integrated-ui.log`. Worker18 backend,90 UI and63 Pipeline/member selections passed separately, with overlap.

Root IAB5293 classified Workshop equipment application with purchase conditions, linked Frame8250.50, proposed Drill press250.25, recorded synthetic award, and observed two P0 obligations while new proposed spend remained0. PL adopted into Draft, keeping approved8650.50 until department and Head of Finance promoted8900.75. Existing actual5000 remained. Reasoned release restored FrameP1 and retained DrillP0 plus release history. Ordinary Finance was denied application review. Screenshots `funding-awarded-obligations.jpg`, `funding-budget-approved.jpg`, `funding-release-history.jpg` and `funding-finance-access-denied.jpg` saved outside repo. CUA completion issued. HELIX-82 Done readback verified. These are synthetic fixtures, not live service acceptance.

PBA-06 assignment: new clean `/private/tmp/helix-pba-06-drive-invoices`, branch `codex/pba-06-drive-invoices`, fullbase`db25e84dd2b6ca0a949a3d5e6b3c62b53e4e7136`, agent `/root/pba_04_threshold`. Migration071 reserved. Full adapter, durable jobs, provider-aware reference/export/recovery, permission checks and UI included. Stable integration dependencies symlinked; no reinstall. Managed worktree creation stopped returning and produced no checkout in Git inventory before fallback. A late empty managed checkout, if created, must be reconciled; the assigned worker uses only this verified tmp path. No duplicate implementation was assigned.

Worker `/root/pba_01_contracts` has read-only08 preflight while06 runs, including canonical consumers, P0/restricted coverage/commitment calculations, legacy and project actual once, Season Overview privacy, old test schema setup and06 evidence contracts. It must not implement08 until06 is integrated and verified. Root remains the sole integration, delivery record, tracker and PR writer.


## Broad regression checkpoint and08 read-only preflight, 20 November 2026

At48a2b9e, `npm test` passed1948 tests in194 files plus3 deployment guards. It skipped50 environment-dependent cases in9files; those skips are not PostgreSQL acceptance. The separately enabled exact Finance selection passed93/93 against isolated loopback PostgreSQL as recorded above. Log `/private/tmp/helix-pba07-full-suite.log`. Heavy worker testing paused during this broad run and is now released. This checkpoint predates06/08 and does not replace final verification of their new code.

08 preflight found stale raw anchor reads in summary/hierarchy/funding/current choices/export and legacy-only visibility gates in Finance service, FinanceAccess and Season Overview. Project-only approval legitimately leaves the compatibility ledger Draft.08 must use effective approved presence and canonical entries, without a runtime missing-view fallback. AddP0 to read types without enabling manualP0 mutation. Keep restricted funding independent of derived priority. Preserve `actual + max(open approved commitment, eligible approved remaining plan)`. Project unbudgeted actuals before a header use purchase project/department context; do not attribute a whole shared protected anchor to each project.

Historical funding attribution needs recorded project purchase approved_version_id where available and original legacy anchor provenance otherwise. Current plan links use effective entries; a later approved funding-link edit must not rewrite earlier usage. Historical request/allocation descriptions remain recorded facts. Old Finance/Season test bootstraps need actual feature migrations when they begin reading canonical views. Evidence presentation must consume06's shared provider/status/viewer/recovery projection, without another independent invoice reader. Project/department filters supplement the existing stage filter. No08 implementation has started.

Managed create_worktree call was terminated after it remained silent and no checkout appeared in repeated Git inventory. Git fallback06 path remains the only assigned implementation checkout; reconcile any late empty managed result before cleanup. No original user checkout was modified.


##06 parallel UI and early independent review

06 backend worker committed shared invoice contracts`cf27a031c1d523f9274ba5bf1861263063a6e2ed` and created/verified `/private/tmp/helix-pba-06-invoice-ui`, branch `codex/pba-06-invoice-ui`, at that contract commit. It delegated the independent invoice/recovery UI to reused `/root/pba_01_contracts/approval_ui`. Backend06 owns durable transfer/adapter/schema/server; child owns shared invoice states/recovery presentation, client continuation/local fixtures and focused UI tests under the agreed contract. Root will integrate original commits once, then verify combined06. Contracts are not yet integrated on root.

Automatic transfer design: document insert creates durable jobs in the expense transaction. Registration then attempts purchase jobs under a bounded server deadline; repository continuation through the same Finance endpoint automatically handles remaining pending work while signed in. Each continuation authorizes stored purchase context and current member scope. Client departure or outage leaves honest recoverable state. No manual ordinary start, new top-level route or new runtime dependency. Needs-attention jobs must not enter blind retry loops. Current runtime code remains unverified until the worker hands it off.

Fresh `/root/correctness_review` is reviewing completed slices read-only at fixedbaseb05c5a4 and featureccae3a9. Scope is PBA-01 through05 plus07, excluding the explicitly unfinished06/08 read/evidence/scenario work. It must inspect the full diff and relevant surrounding code for concrete correctness, regression, failure-path, race and permission defects. This early pass does not establish final full-feature review. The same fresh reviewer must inspect the final complete commit and fixes before PR. Separate Standards/Spec axes remain pending. No worker implemented this reviewer's code.


## Early independent findings and repairs in review

Fresh correctness reviewer atccae3a9 reported3P2 defects. Generic register/void could discover a new mapped header only after holding allocation anchors, deadlocking against promotion. Proposal approval status checked entry presence/version but not whether the desired amount and contents were approved. Purchase/completion mutation401/403 retained private form/context until a later refresh. No additional actionable findings were found in the inspected completed slices;06/08 and final09 were excluded. HELIX-80 and HELIX-82 reopened In Progress, retaining earlier evidence.06 interface work continues independently; its eventual integration must include verified prerequisite repairs.

Root created clean `/private/tmp/helix-pba-review-repairs`, branch `codex/pba-review-repairs`, base27e4241, and committedb71d6b0 race repair ande4c9675 proposal repair. Race tests force the exact ordering with separate identity/ledger/purchase/promotion connections. Both tests fail against original070 with explicit40P01. With the repair, the8-case race suite passes; mapping changes return40001/409 before late header acquisition, failed writes/idempotency are absent, promotion succeeds, and same-request retries/replays retain one purchase/invoice. Logs `/private/tmp/helix-pba-adoption-race-before-repair.log` and `/private/tmp/helix-pba-adoption-race-repair.log`.

Proposal API and local fixture tests pass19/19, including an awarded5000baseline/8000proposal approved at6000, and8000approved for a different description. Neither is labeled approved; matching contents with at least the proposed amount are. The test exposed local proposal whole-number money lacking canonical decimals, now normalized consistently. Log `/private/tmp/helix-pba-proposal-review-repair.log`.

Worker01 used separate `/private/tmp/helix-pba-revocation-repair`, branch `codex/pba-revocation-repair`, base27e4241, commit10bba5b. Root combined it as016df04 on the repair branch and addedd5618ab to clear enclosing budget caches through both child instances and focus Refresh budgets.35/35 component tests pass, covering401/403 at upload/check/register/completion, input/locks/dialog clearing, late response invalidation, authorized recovery, preserved recoverable-error input, and parent header/no-header paths. Log `/private/tmp/helix-pba-revocation-integrated-repair.log`. All3 typechecks/lint/diff check pass on final repair head`d5618ab200ef5dbf6dab8ffec918482afc0c462e`.

Fresh reviewer is checking those repairs read-only against27e4241. They are not yet integrated on root or accepted closed. Next root action: obtain repair review, serially integrateb71d6b0,e4c9675,016df04,d5618ab, verify combined code and reclose80/82.06 backend/UI then require their own integration/acceptance;08 remains blocked.06 UI reports commitscb08bf6 and0625b54, the latter only invoice-summary toast in ProjectBudgetPurchases for careful merge with revocation clearing.


## Reviewed repairs integrated and accepted

Fresh reviewer found one missing earmark comparison during repair review. Follow-up5a81c64 adds null-safe restricted-funding equality in API/local status and real changed-funding regressions. All3 repairs were independently cleared at`5a81c64195835e38848b19765fc5e5519de043a3`. This is bounded repair clearance, not final full-feature review.

Root serially integratedb71d6b0 as60ef2af,e4c9675 asa72afd3,016df04 as3dc891c,d5618ab as94ed6df and5a81c64 as01f9a8c. Root exact Finance database selection96/96 in15files passed without skips; affected UI/local42/42 in4files passed. All3 typechecks and lint pass. Logs `/private/tmp/helix-pba-reviewed-repairs-integrated-db.log` and `/private/tmp/helix-pba-reviewed-repairs-integrated-ui.log`. HELIX-80 and82 Done again/readback verified.06 prerequisite repairs are now integrated and verified.

06 backend handoff includes347efa4 after contractcf27a03/localf594f12; child UI originalcb08bf6 and toast0625b54 map to worker45723df/9475b27. Root inspection identified a silent missing071 runtime bypass through invoiceTransfersAvailable: new registrations could save without a durable transfer job and later be treated as historical. Worker06 is removing that bypass or making required-migration readiness explicit, upgrading test bootstraps as appropriate. Missing Drive configuration remains recoverable after atomic expense+job.06 acceptance is still pending, and08 implementation remains blocked.
