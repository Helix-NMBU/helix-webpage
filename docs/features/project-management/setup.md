# Project management setup

The member platform uses `/project-management/overview`, `/project-management/production`, `/project-management/partnership-deliverables`, `/project-management/marketing`, `/project-management/operations`, and `/tasks`. Legacy Mechanical & Production section links redirect to Production.

## Local development

Keep credentials in the existing untracked `.env.local`. Run `npm run dev:member` and open `http://127.0.0.1:5190/project-management/overview`. The dedicated `member-local` mode provides local accounts and project fixtures. Its tasks persist in browser local storage under `helix-member-local-projects-v1`; removing that key resets only the project fixtures. These fixtures do not call Neon and cannot be enabled in a production build or on a non-loopback host.

The regular development server uses the real `/api/projects` handler, the existing member session, and `DATABASE_URL`. It does not accept fixture tokens. Use an isolated Neon database branch to validate real authentication and persistence. Never point schema setup at production as part of a local UI check.

## Database and authorization

Migration `db/migrations/009_project_management.sql` adds the `project_management` schema, access grants, projects, tasks, and a transactional mutation function. Apply migrations through the existing `npm run neon:setup` workflow, using a direct database connection in an untracked environment file. Inspect pending migrations before applying them to an isolated database.

An authenticated Helix Google account also needs an explicit active row in `project_management.access`. The migration creates no accounts or access grants. Grant initial department leads and selected members through the trusted database operator, using the existing `identity.members.id` as `member_id`. `active = true, can_manage = true` grants project/task management; `active = true, can_manage = false` grants shared progress viewing and status updates on assigned tasks. Revocation takes effect on the next API request and is rechecked inside each database mutation. Browser account titles and partner OTP sessions do not grant module access.

Only the trusted server database owner can read and mutate the module tables. Browser database access is not exposed. Assignment choices return eligible members' IDs and names, without private CV data. Each mutation includes the saved revision; a conflicting edit returns HTTP 409 and retains the editor's unsaved input. Reload the task list, close the editor, and reopen the item to review the saved version before reapplying edits.

## Progress and scope

The first release is scoped to S27. A task belongs directly to the season or to a subproject in the same work area. Subprojects can list multiple departments. A milestone is a task record with type `milestone` and a required deadline. Completion is completed task-kind records divided by all non-cancelled task-kind records. Milestones are tracked separately through their status and deadline. Shared project tasks contribute to each participating department's progress.

Dates use calendar days in Europe/Oslo. Open tasks and milestones before today are overdue. Deadlines from today through seven days ahead are approaching. Closed and cancelled work does not count toward urgency. The timeline displays recorded start dates and deadlines; it does not model dependencies, effort or available team capacity. The last open deadline describes the current schedule rather than predicting completion.

Partnership deliverables record obligations by sponsor/partner name, with delivered and outstanding counts and a searchable list. Both completed and outstanding obligations appear by default. Sponsor imports, tier checklist generation and completeness against actual S27 agreements remain pending the confirmed Attio and benefit mappings. No sponsor obligations are inferred from a tier or imported from legacy data.

## Validation

Run `npm test`, `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, `npm run lint`, and `npm run build`. Database tests use isolated PGlite instances, not a live Neon project. The full suite starts loopback HTTP servers and needs permission to listen locally. Inspect creation, assignment, status changes, personal task filtering, delivery counts, timeline navigation and reload persistence in the browser. Local fixture checks and database integration tests do not establish that a hosted Neon migration or real Google sign-in has been exercised.

Publishing, migration of a production database, and deployment require user authorization.
