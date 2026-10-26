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

## Attio task workflow refinement, 26 October 2026

The user supplied Attio screenshots and requested a compact personal task list and task creation/assignment restricted to Department Leads in the appropriate Project Management subfolder. This supersedes the original generic manager permission for task creation and assignment.

- Synced the completed feature into the attached managed worktree on `codex/project-management-api` at `ef7f3f1`; resolved the API test conflict using the newer integrated feature tests. The managed worktree is the implementation workspace for this refinement. The prior canonical checkout's unrelated changes are preserved.
- My tasks now uses compact grouped rows, completion circles, due-date sorting, search, area filtering, view settings, contextual project/partner links and assignee chips. It contains no project/task creation controls and only allows status updates when a task is opened.
- Task creation uses a compact composer within the selected work area. Its category is fixed by the subfolder. Optional details and Create another retain the context for batch entry. Failed saves keep the draft and reuse its client-generated ID.
- Additive migration `010_department_lead_tasks.sql` introduces explicit `task_lead_categories` permissions on the existing access grant. Existing grants receive no automatic Lead permission. Creation, editing and assignment require a current Lead grant covering both the existing and requested task area, independently of project-management access. My tasks and Overview never expose assignment editing.
- Focused UI, model, repository, SQL authorization, member-shell and HTTP boundary tests cover the new workflow. The combined run passed 72 tests but hit a PGlite setup hook timeout. Its 10 database tests passed in isolation with a longer setup allowance. The final Overview permission regression passed in a 16-test UI run; client TypeScript passed again. Both API typechecks, lint and the production build passed. Output is 9.19 MB, with 11 API functions in the isolated worktree. No full-suite pass is claimed for this refinement.
- Standards and Spec/correctness reviewers inspected `ef7f3f1...eba3540`. Both found the same Overview status-permission mismatch for a scoped Lead without project-management permission. Commit `79767e5` separates Lead status permission from full editing permission and adds UI and cross-area database regressions. Both reviewers cleared all actionable findings at `79767e5fcc5eb5069dcd149ad22230d78dd758b5`.
- Integrated the refinement and repair onto `codex/project-management` in the canonical checkout as `68e4e50` and `5407b1b`. Its pre-existing unrelated changes remain unstaged and preserved.
- Browser verification on port 5193 confirmed compact grouped rows, one-click completion moving a task to Completed, compact area-specific task creation with an assignee and deadline, appearance in My tasks, and persistence after reload. Screenshots are saved outside the repository as `my-tasks-attio.png` and `task-composer.png` in this chat's visualization directory.
- A local `.env.local` with the member-platform flag is ignored by Git. The isolated preview runs on loopback port 5193; it does not use real identities, write to Neon or import Attio tasks. Production grants and migrations remain unapplied.


## Multiple task assignees and avatars, 26 October 2026

The user requested the shadcn Avatar presentation and multiple people per task. Work continues in the canonical checkout on `codex/project-management`.

- Shared avatar groups now appear in task tables and the searchable multi-person assignment picker. Eligible authentication-profile photos use the existing shadcn Avatar component, with initials as the fallback and an overflow count for larger groups.
- Task contracts use `assigneeIds` arrays, with deduplication and a 20-person limit. Each assignee sees the shared task in My tasks and may update its shared status. Department Lead permissions still control creation, assignment and task details.
- Migration `011_task_assignees.sql` adds the normalized assignment relation, preserves old assignments and removes the singular column. Assignment replacement and task revisions remain atomic. Reapplying the migration cannot restore a previously removed assignee. Every selected member must retain an eligible verified Google identity and active module grant. The client, API and migration require a coordinated release; old single-assignee payloads are rejected.
- Local fixture storage upgrades old assignments without resetting data. Browser verification on loopback port 5190 added Alex as a second assignee to a task already assigned to Sam, saved it, confirmed both avatars, and verified its appearance in Alex's My tasks after reload. Profile-photo rendering uses the existing Avatar image/fallback behavior; real Google photos and authentication were not exercised.
- Focused tests cover multi-person creation and removal, second-assignee visibility, legacy data upgrades, validation, migration backfill/idempotency, co-assignee status updates, conflicting shared edits, assignment rollback and revoked ownership. The 13 database integration tests passed in isolation; 79 focused project, API and member-shell tests also passed. All three TypeScript checks, lint and the production build passed (9.20 MB output and 9 API functions in the current checkout).
- The pre-existing sidebar CircleCheckBig change and unrelated checkout changes remain unstaged. No push, PR, real Neon migration or deployment was performed.


### Standards review

Independent reviewer `assignees_standards_review` inspected `3f040024...57cf955`. One P2 accessibility finding: the fixed assignment-picker label hid selected names from screen readers, particularly when disabled in status-only details. The trigger now references an explicit accessible assignment summary, and a regression checks both selected names in the disabled personal-task editor. No documented-standard breaches or substantial smell-baseline findings were reported.

### Spec and correctness review

Independent reviewer `assignees_spec_review` inspected the same commits and found no actionable Spec, correctness or security issues. Shared visibility/status ownership, scoped Lead assignment, atomic replacement, backfill/idempotency, revocation, revision conflicts and old-payload rejection matched the approved behavior. Neither reviewer reran tests.

## Overview graph and milestone progress, 26 October 2026

Scope: user request and reference screenshots, recorded in `overview-progress.md`. Fixed base `7642daf`; integration remains `codex/project-management` in the canonical checkout. Unrelated uncommitted changes are preserved. No remote push, PR, ticket closure, production migration or deployment is authorized.

- Backend worker `milestone_data` used isolated managed worktree `/Users/henrik.noteless/.codex/worktrees/project-milestone-data/helix-webpage`, detached at `7642daf`. Commit `59c5081` was integrated as `0691f31`. It owns migration 012, API, shared contracts and API/DB tests. Its 29 focused tests and both API typechecks passed.
- Coordinator implemented the Overview graph/list, milestone creation/linking UI, model calculations, local fixture upgrades, documentation and client tests. Browser on loopback port 5190 verified existing task linking, milestone progress changing 50% → 100% → 50% through My tasks completion and reopening, persistence after reload, milestone task-list drill-down, and Overview add navigation into Production with a dated milestone successfully created. Existing local data received a present-time history baseline; earlier history was not invented. Independent final review is pending.

- Integrated verification: 95 focused UI/model/repository/API/member-shell tests and 20 database tests passed. All three TypeScript checks, lint and production build passed (9.21 MB, 9 API functions). One additional shared draft-update regression was then added; the final focused run is recorded after review. No real Neon or Google authentication flow was exercised.


### Confirmed hierarchy and Tabler icons

The user confirmed linked-task milestone progress, then refined the hierarchy to S27 → department-level Project → Milestone → Task. They explicitly chose to retain ungrouped work in Needs organization until a Lead places it. New milestones require a project; new tasks require a milestone and inherit its project. Legacy status updates remain supported; full saves require organization. No synthetic production containers are created.

Backend worker `milestone_data` advanced its clean isolated worktree to the integrated UI and implemented migration 013 plus API validation/regressions at `7d989f4`, integrated as `ce4e218`. Its 32 focused tests and both API typechecks passed. Worker `tabler_icons` used `/Users/henrik.noteless/.codex/worktrees/platform-tabler-icons/helix-webpage` at base `941acb8` and committed icon conversion `aa95b92`. The coordinator applied its patch while preserving ongoing Overview changes and manually converted the icon-only changes in that component. The coordinator also converted two Lucide icons added by pre-existing uncommitted recruitment work; those edits stay with the unstaged user file rather than committing unrelated visibility-control behavior. The icon worker passed 118 UI tests, TypeScript, and build (9.21 MB, 11 source functions in its isolated checkout). The canonical checkout retains the user's entrypoint consolidation and its lower function count.

Initial independent reviewers `milestones_spec_review` and `milestones_standards_review` found sparse graph dates interpolating quiet days, milestone filtering retaining Open work, and hardcoded colors with poor light-mode contrast. Commit `4f2082a` fixes these with step paths, all-status milestone selection and theme-specific chart-token mappings. Its 51 feature tests and client TypeScript check passed. The later confirmed hierarchy and icon changes require a fresh final review.


- Final integrated validation before the new review: 169 UI/model/repository/API tests across 17 files and 23 database tests passed. All three TypeScript checks, lint and build passed. The canonical static output is 9.22 MB with 9 source API functions. The final filter layout waits until the xl breakpoint for four columns to avoid crowding the narrower member-content viewport.
- Browser verification in member-local mode on loopback port 5190 placed a legacy goal into Chassis & assembly, placed Verify assembly handover under that goal, confirmed the queue count decreased, and verified the complete association after reload. Expanding both project milestones showed their respective child tasks. Light and dark graph rendering was inspected; the original System appearance preference was restored. Light-mode screenshot: `season-hierarchy-light.png` in this chat's visualization directory. Production migrations and real authentication remain untested and unapplied.


### Final Standards review

Independent reviewer `hierarchy_standards_review` inspected `7642daf...b4064fa` and found one P2 accessibility defect: the breakdown tabs had no associated panels. The repair places Assignees and Areas content in separate shared TabsContent panels and labels the tab list. A regression verifies active tab-to-panel relationships and matching content. No other documented-standard violations or actionable Fowler smells were reported.

### Final Spec and correctness review

Independent reviewer `hierarchy_spec_review` inspected the same full feature and found a P2 project-card milestone action retaining an unrelated search, plus P3 empty-state guidance still permitting direct season tasks. The repair clears search and selects the task list when opening a project milestone, and updates the empty-state and setup guidance to require a project and milestone. Regressions cover the reset and hierarchy wording. No additional correctness/security findings were reported.

After these repairs, all 60 focused project-management tests and the client TypeScript check passed. Both independent reviewers rechecked `b79657ac8c08c78e71af787dfe8e32d72dbaab29` and cleared every reported finding. Standards/React/accessibility: no remaining actionable findings. Spec/correctness/security: no remaining findings. No live database migration or deployment performed.

- Final implementation location remains `/Users/henrik.noteless/Documents/Github/helix-webpage` on `codex/project-management`. Temporary milestone-data and icon worker worktrees were queued for archival after returning the chat to its original managed attachment; the older attached API checkout is not the integration checkout. Continue feature work explicitly in the canonical path.


## Department Areas layout refinement, 26 October 2026

The user requested a single Areas breakdown by department, removal of the Assignees view, full-width Progress and Milestones underneath it. The Overview now uses a one-column layout and a fixed Areas section. Department membership comes from project department assignments; shared-project tasks contribute to each participating department, and work without an allocated department remains in No department. Known departments with no tasks show zero progress. Assignment avatars elsewhere are unchanged.

Client TypeScript and all 33 ProjectManagement UI tests passed. Regression coverage checks both participating departments in a shared project, absence of the old switch/assignee breakdown, and unallocated work. Browser verification confirmed the full-width graph, department rows and Milestones below. Screenshot: `overview-department-areas.png` in this chat's visualization directory. No live migration, push or deployment was performed.


## Compact Overview height, 26 October 2026

The user requested roughly half the Progress widget's total height while retaining its full width. The plot now uses a fixed 80px drawing area, with readable HTML axis labels and fixed-size current-value markers. Tighter card spacing, inline totals and compact two-column department rows reduce the desktop card from about 720px to about 355px in browser inspection. Milestones remains below it. TypeScript and all 33 ProjectManagement UI tests passed; the rendered result was inspected in the loopback preview. Screenshot: `overview-compact-height.png` in this chat's visualization directory. No data, migration, push or deployment changes.


## Projects overview widget, 26 October 2026

Overview now shows projects beneath Progress, using Tabler cube icons and task completion per project. Selecting a project clears the existing search and milestone/status filters and opens all its tasks; project editing remains manager-only. Needs organization is retained. The department helper sentence, visible progress-data disclosure and Overview Refresh button are removed. Screen readers retain a non-interactive history table. Task saves update the workspace immediately, and navigating into Overview reloads it.

Client TypeScript and all 36 ProjectManagement UI tests passed, including navigation reload, immediate completion progress and project-edit access. The repository ESLint configuration does not cover TSX, so its targeted invocation only reported ignored files. Browser inspection confirmed page reload, project selection, cube icons and the compact layout. Screenshot: `overview-project-widget.png` in this chat's visualization directory. No migration, push or deployment performed.


## Upcoming Milestones and multiple Leads, 26 October 2026

Overview omits the duplicate project cards, Department progress cards and latest-deadline summary. Its table is now an Upcoming Milestones widget beneath Projects. Only open milestones due today through day 30 (inclusive, Europe/Oslo) appear, sorted by nearest target date. Columns are Milestone, Priority, Leads, Target date, Tasks and Status. Tasks shows completed/total linked tasks and Status shows a circular progress ring with percentage. Child counts exclude cancelled tasks and include children outside the window. Tasks and undated, past, done or cancelled milestones are excluded; an empty state replaces the table when none qualify.

Area pages retain their full task lists, filters, Timeline and project hierarchy. Overview project links open the corresponding area filtered to the selected project. Needs organization opens a separate actionable work queue. Milestone owners use the existing multi-member assignment array, labelled Leads throughout selection, editing and avatar descriptions. Tasks retain multiple assignees. Assignment permissions and status-update access are unchanged; no storage migration is needed.

All 70 focused project-management tests, client TypeScript and production build passed (9.22 MB static output, 9 source functions). Coverage verifies day 0/day 30 boundaries; exclusion of past, undated, done and cancelled goals and ordinary tasks; linked-task counts; project drill-down; and multi-Lead creation/editing. Browser inspection confirmed the two qualifying local milestones, circular progress, organization queue and project filtering. A second Lead saved on a local milestone persisted after reload. Screenshot: `upcoming-milestones.png` in this chat's visualization directory. No live data migration, push or deployment performed.
