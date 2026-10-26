# Project management implementation

Approved scope: user request on 26 October 2026, reconciled with Linear Helix member Platform, Project management milestone c66e730f-1f7b-4994-96b5-cfa3dead11cd.

Base: codex/recruitment-milestone-completion at 59eca2433d610c09e829bc588e85c6596100b191. Integration branch: codex/project-management. Preserve all pre-existing uncommitted changes. Publishing and deployment require separate user authorization. No PR or remote push is authorized in this run.

## Requirements

- Replace the Mechanical & Production navigation entry with Project Management, with Overview, Production, Partnership deliverables, Marketing, Operations.
- Add Tasks immediately below Mail, showing only tasks assigned to the authenticated member.
- Support S27 subprojects spanning departments, tasks and milestones, assignment, descriptions, deadlines, status, priority, and blocked reasons.
- Overview and Production show recorded completion, overdue and approaching deadlines, blocked work, and scheduled timelines. Predictive forecasts remain deferred under the existing Linear scope.
- Partnership deliverables list manually recorded obligations per partner for S27 and distinguish delivered from outstanding work. Do not assert completeness of imported sponsorship obligations. Attio import and tier checklist generation require confirmed mappings and are deferred.
- Use an explicit server-side module grant, verified Helix Google identity, Neon persistence, optimistic concurrency, and shared notifications. Assignees may update their own task status; managers may create and edit projects/tasks.
- Fixtures are allowed only in member-local development mode on loopback. Production never accepts local fixture identities.

## Implementation decisions

Statuses: To do, In progress, Blocked, Done, Cancelled. Progress is Done divided by all non-cancelled task-kind records. Milestones are excluded from this denominator and tracked separately by status and deadline. No tasks gives 0% with an explicit task count. Approaching deadlines are within seven calendar days in Europe/Oslo, including today. Done and Cancelled tasks do not count as overdue or approaching. A milestone is a dated task of kind milestone. Start/deadline dates describe the schedule and are not calculated completion forecasts. Tasks can be assigned directly to S27 or to a subproject; subproject category must match task category.

## Execution

- Shared type contract defined in src/features/ProjectManagement/types.ts.
- Backend worker `/root/project_backend` used `/Users/henrik.noteless/.codex/worktrees/project-management-api/helix-webpage`, branch `codex/project-management-api`, base `a9b814f`. Its commit `c9a728c` was integrated as `fdf8e4d`. API, SQL migration and 15 security/database tests passed. The clean worker worktree is retained; the app declined archival because it considers it a primary checkout.
- UI, model, local repository, navigation, documentation and client tests integrated at `621f491`. Continue work in the canonical `/Users/henrik.noteless/Documents/Github/helix-webpage` checkout on `codex/project-management`; the backend worktree is not the feature integration checkout.
- The public `/api/projects` URL now rewrites to the existing authenticated member entrypoint, `/api/member-login?__module=projects`. It adds no function. The feature has 11 source functions without the separate user consolidation, and the working checkout has 9 with that consolidation. No unrelated consolidation changes were committed.

## Verification and review

- Full suite after the initial session recovery repairs: 982 tests across 79 files, plus 2 Node deployment guards, passed. After API entrypoint consolidation: 99 focused UI/auth/API tests and 12 local HTTP adapter tests passed. After the final API-session-cache repair: 83 focused project, member-session and routing tests passed, plus the client TypeScript check. The reviewers separately reran 41 focused tests successfully.
- Client TypeScript, API TypeScript, Node runtime API TypeScript, ESLint and production build passed. ESLint's existing configuration excludes TypeScript files; typechecks and tests cover the new TypeScript. Static output is 9.18 MB under the 10 MB limit. Source function count is 9 in the working checkout. No generated Vercel deployment was built or deployed.
- Browser on `127.0.0.1:5190`, dedicated member-local mode, with the existing untracked `.env.local`: verified task creation, assignment, reload persistence, personal assignment filtering, sponsor completion updating Delivered/Outstanding counts, and navigation. Screenshot stored outside the repo at `/Users/henrik.noteless/.codex/visualizations/2026/10/26/01a178e3-9f76-7250-b8d2-385063cfcf12/project-management.png`.
- Fresh Standards reviewer `/root/pm_standards_review` and Spec/correctness reviewer `/root/pm_spec_review` inspected base `59eca243` through `621f491`. They identified typed token failures missing sign-in recovery, a superseded-refresh loading state, and incomplete Google return-path handling. All three were repaired with regression tests. A validation-duplication heuristic remains a nonblocking maintainability note; both boundaries continue validating inputs.
- Both reviewers rechecked the repairs and consolidated entrypoint at `302c023`. Spec review found one further HTTP 401 cache-recovery defect. Commit `4aed3b6` now invalidates the cached member landing/JWT when the project API rejects authentication, while leaving HTTP 403 module-denial sessions intact. Real-cache regression tests cover load and save; the local HTTP adapter verifies signed-out requests return 401 and dedicated fixture mode cannot invoke real APIs.
- Both reviewers independently cleared all actionable findings at `4aed3b67ffde59d1d850aacdb2c4cba70b8cef0a`. Spec review independently reran 41 focused tests. No outstanding correctness/security findings remain. The optional validation-duplication note remains nonblocking.
- A final 4-worker suite encountered 6 five-second timeouts in existing sponsor database tests while review tests also ran. Its other 980 tests passed. A 2-worker retry again timed out in those sponsor suites and was stopped to avoid continuing a resource-heavy run. No assertion failure was reported, but a final full-suite pass is not established. The earlier 982-test run is historical evidence, not the final suite outcome. Final API typechecks, lint and production build passed after the cache repair.
- No live Neon migration or real Google login was exercised. Explicit database grants and production setup remain operator steps. Attio mappings, tier checklist generation and actual sponsorship obligation coverage remain open. No tracker tickets were closed; the milestone remains open.
- No push, PR, production migration or deployment performed. Publishing and deployment require separate user authorization.
