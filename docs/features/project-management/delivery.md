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
- Backend and UI implementation pending.
- Verification and independent review pending. No tracker tickets have been closed; the milestone remains open.
