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

The approved parent, nine children and all comments were reconciled. All nine children were Backlog with no comments. The extensive unrelated original checkout remains intact. Only approved feature documents, its ADR and agreed glossary additions were copied into the new integration checkout. No application code has yet been changed.

The current remote base has 11 API functions. The original working tree's two extra unrelated wrappers are not part of this feature. New operations must reuse existing entrypoints.

## Assignments and dependency frontier

| Ticket | Tracker | State | Worker/worktree/branch | Evidence |
| --- | --- | --- | --- | --- |
| PBA-01 | HELIX-76 | running | `/root/pba_01_contracts`; `/Users/henrik.noteless/.codex/worktrees/pba-01-contracts/helix-webpage`; `codex/pba-01-contracts`; base `93d2e4774a381e55dc01621a5407f5a2bd4efa93` | No worker commit yet. |
| PBA-02 | HELIX-78 | blocked | unassigned | Needs integrated PBA-01. |
| PBA-03 | HELIX-79 | blocked | unassigned | Needs integrated PBA-02. |
| PBA-04 | HELIX-77 | closed on feature branch | `/root/pba_04_threshold`; `/private/tmp/helix-pba-04-threshold`; `codex/pba-04-threshold`; base `93d2e4774a381e55dc01621a5407f5a2bd4efa93` | Worker `56415c57534dc3823e242c5a90df2fa98a206ea8`; integrated `dada27b`; 104 integrated tests including6 real PG; all3 typechecks; verified Done in Linear. |
| PBA-05 | HELIX-80 | blocked | unassigned | Needs integrated PBA-02. |
| PBA-06 | HELIX-81 | blocked | unassigned | Needs integrated PBA-05. |
| PBA-07 | HELIX-82 | blocked | unassigned | Needs integrated PBA-03. |
| PBA-08 | HELIX-83 | blocked | unassigned | Needs integrated PBA-06 and PBA-07. |
| PBA-09 | HELIX-84 | blocked | unassigned | Needs integrated PBA-04 and PBA-08. |

Reserve migration numbers from 066 upwards: 066 foundation, 067 threshold policy, 068 approvals, 069 revisions/import, 070 purchases, 071 Drive evidence, 072 award obligations, 073 totals if needed. The original checkout has an unrelated untracked 065; do not copy or overwrite it. Workers may leave reserved numbers unused, but must coordinate new migrations and contracts.

## Verification and infrastructure

- Baseline at documentation commit `93d2e4774a381e55dc01621a5407f5a2bd4efa93`: client/API/runtime TypeScript checks passed; npm test passed 1,820 tests in 172 files with 8 environment-skipped cases in 2 files, plus 3 deployment guards. Existing real PostgreSQL finance concurrency suite separately passed 6 tests using the temporary loopback server. Logs: `/private/tmp/helix-pba-baseline-tests.log` and `/private/tmp/helix-pba-baseline-postgres.log`.
- Local Node v24.19.0 and npm 11.17.0 match required major/toolchain versions.
- Docker has no running daemon. Installed PostgreSQL17 for tests and started an isolated temporary cluster at `/private/tmp/helix-pba-postgres.J3mOMS/data`, bound only to 127.0.0.1:55475. Test URL is `postgresql://postgres@127.0.0.1:55475/postgres`; use unique disposable test databases. No production data is present; no login background service was enabled. Server path pointer: `/private/tmp/helix-pba-postgres-path`.
- Drive destination/service identity/narrow OAuth scope/reader ACL and real entry-to-project mapping remain release inputs. No live DB or Drive writes are authorized merely for validation. Local fixtures and isolated databases are permitted.
- Baseline npm run build passed, 9.00 MB static output and 11 source functions. Generated Vercel function compilation has not yet been checked. Log: `/private/tmp/helix-pba-baseline-build.log`.
- Independent review has not started. No feature PR exists yet. PBA-04 is verified/closed on the feature branch; the parent stays open.

## Next action

Approved documentation scaffold committed as `93d2e4774a381e55dc01621a5407f5a2bd4efa93`; clean npm ci completed. PBA-01 and PBA-04 are assigned in distinct verified branches/worktrees and marked In Progress in Linear. The managed second-worktree call stalled and was reconciled without a created checkout; Git worktree creation was used for that worker. Continue collecting contract/worker evidence, establish baseline and isolated PostgreSQL17, then integrate completed roots serially. Record worker refs/base commits and verify each slice after serial integration. The user authorized ordinary feature push, PR creation and ticket updates by invoking Deliver; merging and deployment remain unauthorized.

## PBA-04 integration, 19 November 2026

Inspected worker patch before serial cherry-pick `56415c57534dc3823e242c5a90df2fa98a206ea8` -> integration `dada27b`. Seven focused files passed 104 tests with real PostgreSQL enabled, all three TypeScript commands passed, and active-source search confirms only always-null/deprecated compatibility names remain. Historical exception evidence is retained and labeled historical. Integrated log: `/private/tmp/helix-pba04-integrated-tests.log`. HELIX-77 closed with this evidence; later integration or review failures require reopening it.

## Read-only integration preflight

Agent `/root/integration_scout` inspected the clean baseline, not the completed feature. Key downstream seams: scoped registration needs both service dispatch and SQL `begin_purchase_mutation`/`reserve_upload_final_candidate` authority; unbudgeted-before-first-approval needs TS validation, SQL registration and absent ledger handling; legacy anchor EM/earmark constraints remain; raw reads in finance-summary, finance-budgets, finance-funding-read, request choices and season-financials gating must consume effective facts. Restricted funding must not disappear when priority derives P0. Drive transfer must use finalized immutable bytes; documents.storage_key remains required. Budget outbox events need actual composers/recipient rechecks. Project-delete failures need an actionable financial-history message. Align promotion and registration lock order, including legacy requests/multi-project purchases. Scope helper must use an existing header's department rather than a caller override. These are implementation seams, not scope changes or final independent review evidence.
