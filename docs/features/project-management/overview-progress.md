# Overview progress and milestones

User request, 26 October 2026: replace Overview's four summary cards with a Linear-inspired progress graph and show milestones with completion progress. Reference screenshots show Scope, Started, Completed, an assignee breakdown, and milestone percentages. This extends the current Project Management feature on `codex/project-management`; no publishing or production migration is authorized.

## Behavior

- Overview has a full-width progress graph in place of its four summary cards, followed by the milestone widget beneath it. Area pages retain their summary cards. My tasks stays a personal list.
- Scope is the number of non-cancelled task-kind records. Started includes In progress, Blocked and Done. Completed is Done. Milestones are excluded from these counts. Every task has equal weight.
- Lines show end-of-day recorded states in Europe/Oslo, carried forward after the first observation. There is no inferred earlier history and no forecast. Future space is shaded. Accessible progress data exposes each recorded day's values.
- The fixed Areas section shows completion by the departments assigned to projects. Shared-project tasks count toward each participating department and once in overall scope. Known departments with no tasks show zero progress; work without an allocated department appears under No department. There is no Assignees view or breakdown switch.
- A milestone is a dated goal, using the existing milestone task kind. The confirmed hierarchy is Season → Project → Milestone → Task, currently S27. Every new milestone requires a department-level project; every new task requires a milestone and inherits that goal's project. Parent and child must match season, project and work area. Milestones cannot nest.
- A milestone's percentage is completed linked tasks divided by non-cancelled linked tasks. An empty goal shows 0% of 0. Its status and deadline remain separate from its child-task completion; finishing tasks does not silently close the goal.
- Selecting a milestone shows its linked tasks, including completed work. Needs organization shows pre-existing work without a valid project/milestone chain. The user explicitly chose to preserve that work until a Department Lead places it; no placeholder projects or milestones are generated. A separate details button opens the goal itself. Project cards expose expandable milestones and their child tasks, preserving the season/project/milestone/task structure.
- Department Leads create and edit milestones and task links in their authorized work areas. Overview's add control selects an authorized area and opens the milestone composer there. Personal and Overview details retain status-only editing.
- Legacy work remains readable and status-updatable. Full detail saves require placement in the hierarchy; Overview's Organize action navigates a scoped Lead to the proper work area. Existing links to a cancelled goal remain; new links to a cancelled goal are rejected. Changing a goal's type, area or project must not invalidate child links.

## Persistence and validation

Migration 013 enforces the strict hierarchy for new records, association changes and full saves while preserving unchanged legacy records and their status updates. Migration 012 adds the milestone relation and immutable task-state events. The baseline records existing state at migration time. Later inserts, relevant state changes and deletions add observed events in the same transaction as the change. Scheduled dates and old completion timestamps do not create history. Database locking serializes task relation changes; failed edits roll back both data and events. Existing identity, access, Lead authorization and revision checks remain in force.

The API includes explicit nullable `milestoneId` and ordered `progressEvents`. Old detail-save payloads lacking `milestoneId` are rejected to avoid clearing links from stale tabs. Deploy the migration, API and client together and reload older tabs. Dedicated loopback fixtures upgrade existing data with a present-time baseline and no automatic milestone links; fresh fixtures include known synthetic activity and linked goals for local checks.

Run focused model, local repository, UI, API and database integration tests; all three typechecks, lint and build. Inspect graph, empty state, milestones, linking, completion changes and creation navigation in the browser. Real Neon migration, real Google login and production release remain separate operator steps.

## Platform icons

The user requested Tabler icons across the whole platform. Use the official `@tabler/icons-react` package and Tabler component names in navigation, controls and feature UI. Milestones use `IconDiamonds`; Tasks uses `IconCheckbox`. Preserve existing accessibility labels, hide decorative control glyphs from assistive technology, and keep branding and chart geometry separate from UI icons. The shadcn configuration also selects Tabler for future components.
