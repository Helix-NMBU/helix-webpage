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


## Upcoming milestone icons and dates, 26 October 2026

Upcoming Milestones uses icon-only priority cells: Tabler signal bars for Low, Normal and High, and an exclamation circle for Urgent. Accessible labels and tooltips identify each priority. Target dates use a leading calendar icon and day/month text without the year, while retaining the full machine-readable date and tooltip. Client TypeScript and all 42 ProjectManagement UI tests passed; the rendered widget was inspected locally. Screenshot: `upcoming-priority-icons.png` in this chat's visualization directory.


## Inline milestone menus and Department column, 26 October 2026

Upcoming Milestones now has a Department column sourced from its project's departments and no text underneath milestone names. Authorized area Department Leads can edit priority, multiple Leads and target date from the table. The menus use shared UI components, existing member selection without invitations, and a target-date calendar with input, month navigation and keyboard support. Full saves preserve all unrelated fields and use the existing revision guard. Legacy work must be organized before these detail edits. Failed saves retain input and offer recovery through shared notifications.

All 79 focused project-management tests, client TypeScript and the production build passed (9.23 MB static output, 9 source functions). Regression coverage includes permissions, field preservation, cancellation, revision conflicts, date validation and calendar keyboard navigation. Browser checks saved High priority, two Leads and 16 November on the local Manufacturing sign-off milestone and confirmed all three values persisted after reload. Screenshot: `milestone-inline-calendar.png` in this chat's visualization directory. No API/schema changes, live migration, push or deployment.


## Unorganized milestone edits and external headings, 26 October 2026

Removed the organization gate from inline milestone fields. A bounded `update_milestone` operation updates only priority, Leads and target date, with scoped Lead authorization, revision guards, eligible-member checks and date validation. Migration 014 adds that operation without rewriting legacy data or relaxing full-save hierarchy rules. The dedicated local repository follows the same behavior. Projects and Upcoming Milestones headings and counters now sit outside their bordered cards.

The previously blocked Submit competition registration milestone was edited in the loopback preview: High priority, two Leads and 8 November persisted after reload, while Needs organization remained at four items. Database checks prove links, child tasks and progress history remain unchanged and reject stale revisions, ineligible Leads, unauthorized actors and injected fields. All 93 focused UI/model/repository/API tests, 27 database tests, all three TypeScript checks and the production build passed (9.23 MB, 9 source functions). Screenshot: `milestone-editing-external-headings.png` in this chat's visualization directory. Apply migration 014 before releasing the API/client; no live migration, push or deployment performed.


## Reference priority glyphs, 26 October 2026

Replaced Tabler's antenna and circular alert approximations with custom 16px SVG glyphs traced from the user's reference pixels. High/Medium/Low share the same three rectangular bars at 6/9/12px heights, with inactive bars at 50% opacity; Urgent uses the filled rounded square and exclamation cutout. Icon color is the reference #929295, including focused menu items. The reusable set includes the three-dash glyph, without adding another stored priority level. The normal value displays as Medium. Client TypeScript and all 53 UI tests passed; browser inspection confirmed the menu and table use the same glyphs. Screenshot: `priority-reference-icons.png` in this chat's visualization directory.


## Platform-managed Areas membership, 26 October 2026

Areas now has one department per table row, with member count, Lead avatar/name, completed/total tasks and circular status. The user chose platform-managed membership rather than the website roster. Project managers can add departments and edit membership and the single Lead from Areas; removing the Lead from the member list clears that selection. Counts use explicit membership, not task assignments. Configured departments without projects remain visible, unknown membership is unset, and unallocated work has no membership fields. Task progress still counts project tasks once per participating department and excludes cancelled work and milestone records.

Migration 015 adds manager-only department saves with verified identity, eligible-member and Lead-membership checks, stable unique names, revision guards and atomic membership replacement. It imports no live roster and changes no access grants. Older local workspaces gain an empty department collection without invented assignments.

All 132 focused UI/model/repository/API/database tests, all three TypeScript checks and the production build passed (9.24 MB, 9 source functions). Local browser verification created Mechanical with two members and Alex as Lead, Electrical with one member and Sam as Lead, and confirmed both counts and Leads after reload. Screenshot: `department-areas-table.png` in this chat's visualization directory. Migration 015 remains unapplied to live data; no push or deployment performed.


## Fixed organization departments, 26 October 2026

Areas now always lists the seven organization departments in the user's specified order. Removed Add department and editable department names. Each row still lets project managers edit its members and Lead. Project editing uses seven department checkboxes, and client/API/database validation rejects arbitrary departments or creation requests. The separate unallocated-work row remains for tasks without a department.

Migration 016 preserves recognized old memberships, maps Mechanical/Electrical and the other former labels, merges membership lists, and archives original department/project metadata. Conflicting merged Leads remain unset rather than being guessed. Task data, task progress history and access grants are unchanged. Local fixture upgrades preserve the prior department collection and retain the existing Mechanical and Electronics members and Leads.

All 134 focused UI/model/repository/API/database tests, all three TypeScript checks and the production build passed (9.24 MB, 9 source functions). Browser inspection confirmed seven ordered rows, no creation control, preserved membership/Lead values and the fixed project selector. Screenshot: `fixed-departments.png` in this chat's visualization directory. Migration 016 remains unapplied to live data; no push or deployment performed.


## Workspace navigation and directories — 26 October 2026

Removed the Platform section label, changed Home to Tabler SmartHome, and replaced Teams with a collapsible Workspace (Members, Projects, Departments). Your spaces contains the existing Project Overview, authorized Recruiting and only the viewer's department memberships. Legacy team placeholder routes redirect to Departments.

Added searchable member, project and fixed-department tables. Members are visible to all verified platform members; only platform admins can edit names, Helix titles and department memberships. Projects show departments, priority, multiple Leads, target dates, task counts and completion rings. Project managers and the relevant department Leads can create/edit projects, with server checks. All seven departments are listed, while only joined departments open their placeholder workspace. No invite/add-department controls were added. Workspace destinations survive member sign-in; membership changes refresh navigation.

Migration 017 adds directory metadata, revision checks and project priority/Leads. Directory membership does not infer task-module or recruiting grants. Last seen is recorded workspace activity; missing dates remain blank. The API is consolidated into the existing member-login function. Local fixture browser checks covered the three directories, multi-Lead project persistence, department navigation and admin member editing. Automated checks cover directory visibility, permission boundaries, stale edits, Lead conflicts, progress counts and migration replay. Production migration and deployment remain pending user authorization.

Validation: all 1,106 regression tests passed with a 15-second timeout for cold local-API startup; three additional HTTP/database assertions subsequently passed in the focused suites. TypeScript (client/API/Node runtime), repository lint, deployment guards and the production build passed. Build size is 9.26 MB; source function count remains 9. Browser screenshots are `workspace-members.png`, `workspace-projects.png` and `workspace-departments.png` in this chat's visualization directory. No live migration, push or deployment performed.


## Department workspace — 26 October 2026

Replaced the department placeholder with a workspace matching the supplied layout: compact department header, Overview/Documents/Members tabs, department identity and description, resources, member/Lead avatars and useful quick links. The table and Your spaces open the same guarded route. Members uses the platform roster; Projects opens the existing directory filtered to this department. Tab URLs survive navigation and sign-in. Settings save the description and a normalized HTTPS Google Drive folder URL; no documents are copied into the platform, and no OAuth connection is claimed.

Migration 018 keeps home metadata separate from directory membership revisions and private to current verified department members. Department Leads and joined platform admins can edit it; ordinary members are read-only. Stale writes are rejected, membership removal is enforced on every read/write, and shared Drive access remains Google's responsibility. No real folders or permissions were changed. Local browser checks covered both entry points, all tabs, the settings form, saved-description reload and project navigation. A Google Drive file-browser connection is still follow-up work.

Validation: all 1,123 regression tests, all three TypeScript checks, repository lint, deployment guards and the production build passed. Static size 9.28 MB; 9 source API functions. Browser screenshots: `department-workspace-overview.png` and `department-workspace-members.png` in this chat's visualization folder. Migration 018 remains unapplied to live data; no push or deployment performed.


## Department settings permissions — 26 October 2026

Department settings now accepts the department head, an active project manager or a platform administrator. Current department membership and verified Google identity remain required. Ordinary members, task-area Leads and heads of other departments have no settings access unless they separately have a manager/admin grant. The server-derived edit capability controls the settings, description and Drive-link controls; the database rechecks the same role on every write. Migration 019 locks the manager grant against concurrent revocation and preserves existing data.

Validation: 72 focused UI/model/API/database tests and client/API TypeScript checks passed, including a manager write, revoked-manager denial, ordinary-member denial and migration replay. Migration 019 remains unapplied to live data. No push or deployment performed.


## Project issue workspace — 26 October 2026

Project entries now open a dedicated Overview/Activity/Issues workspace with grouped issue lists and Properties, Milestones and Progress side widgets. The milestone widget acts as a single toggle filter: selecting a milestone shows its linked issues, selecting it again clears the filter, and selecting another replaces it. Search, clear controls, URL restoration, empty milestones and legacy No milestone work are supported. Properties uses the existing project editor and permissions. Issue completion, issue/milestone creation and task editing reuse existing repositories and authorization. New issues preselect the selected milestone.

Project and milestone progress update directly from mutation responses, while the directory refreshes aggregate counts. Whole-project progress remains independent of list filters. The chart shares the existing observed-state model and compact palette; global Overview keeps its compact chart. Activity displays recorded status observations for current project issues. It does not invent actors, pre-baseline history, forecasts or former project membership.

Validation: all 1,130 regression tests, client/API/Node-runtime TypeScript checks, repository lint, deployment guards and production build passed. Static size is 9.29 MB; the source API function count remains 9. Browser checks covered project navigation, milestone toggling and clear behavior, completion/reopen updates, Properties save, tab navigation and narrow-layout overflow. Screenshots: `project-detail-issues.png` and `project-detail-milestone-filter.png` in this chat's visualization folder. No migration, push or deployment performed.

## Task creation modal and terminology — 26 October 2026

Replaced project-view Issue terminology with Task in visible and accessible controls, notifications, status groups, filters and progress text. Renamed the project task-list component accordingly, while preserving existing project routes and default handling for old tab links.

The shared New task modal now follows the reference layout: prominent title and description, status/priority/assignee/project/milestone/date controls, optional extra fields, expand/restore, Create more and an explicit Create task action. Milestones use New milestone/Create milestone with the same underlying hierarchy checks. Blocked work exposes the required blocked reason; partner work retains partner selection. The normal task description is visible immediately. New tasks continue to inherit the selected milestone context. The project detail parent now lets the composer decide whether to close, so Create more works there as well as in work-area pages.

Local browser checks covered the new modal, pill layout, expansion, Create more switch and task wording. Automated checks cover full creation fields, blocked status, priority, multiple assignees, milestone creation, repeated creation, failure recovery and keeping the modal open from a project. No schema or API change, migration, push or deployment was performed.

Validation: all 1,132 regression tests passed, along with client TypeScript and the production build (9.30 MB static output; 9 API functions). API and Node-runtime TypeScript, repository lint and both deployment guards also passed during this change.

## Independent project column scrolling — 26 October 2026

The desktop project view is bounded by the viewport, with independent scroll regions for project content and the Properties/Milestones/Progress column. Overscroll stays within each column at its boundaries; the shell breadcrumb and project tabs stay visible. Scroll regions support keyboard focus. Below the desktop breakpoint, content remains stacked with normal page scrolling.

Validation: all 57 member-platform interface tests, client TypeScript and the production build passed (9.30 MB static output; 9 API functions). Browser wheel checks moved the widget column to its bottom while page and task-list scroll offsets remained zero, including another wheel gesture at the bottom. Keyboard scrolling was also checked. Screenshots: `project-scroll-before.png` and `project-independent-scroll.png` in this chat’s visualization folder. The ESLint configuration does not include these TSX files. No push or deployment performed.

## Deadline regions in progress charts — 27 October 2026

Progress charts now show a red vertical boundary at the project target date and red diagonal hatching for the time after it. The chart date range includes padding beyond the target so distant deadlines remain visible. Past deadlines stay at their actual date. Project charts receive their own stored target; the overall Overview chart uses the latest dated project. Undated projects show no deadline region. Axis labels avoid the deadline label when close together; accessible descriptions and hover text identify the date and region. Recorded progress remains unchanged, with no future observations or forecasts added.

Validation: 133 chart, progress-model and project-interface tests passed, along with client TypeScript and the production build (9.30 MB static output; 9 API functions). Coverage includes future, today, overdue and absent deadlines, aggregate deadline selection, and unchanged recorded history. Browser checks covered both project and Overview charts without horizontal overflow. Screenshots: `project-deadline-chart.png`, `project-deadline-chart-full.png` and `overview-deadline-chart.png` in this chat’s visualization folder. No migration, push or deployment performed.
