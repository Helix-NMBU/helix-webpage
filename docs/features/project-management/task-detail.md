# Task detail page

Task titles in My tasks, project task lists and activity, work-area tables and timelines, project milestone children, and Needs organization open `/tasks/:taskId`. The page displays the title and plain-text description, preserving line breaks. Missing descriptions have an empty-state message. Milestone entries retain their existing controls.

The Properties column shows status, priority, all assignees, target/start dates, project, milestone, department, work area, season, and any sponsor/partner or blocked reason. Project and milestone links open the project and its milestone filter. Back returns to the originating list URL, preserving URL-based filters, or My tasks for direct links. My tasks search, filters, grouping, ordering and visible properties are encoded in that return URL. The Tasks sidebar entry remains active and the shell breadcrumb links to My tasks.

On desktop, the page fits the viewport beneath the shell breadcrumb and task actions. Task content and properties have independent keyboard-focusable scroll regions with contained overscroll. On mobile, both columns stack with normal page scrolling.

Details require the existing project-module access and authenticated project repository. Directory access alone does not load private task data. Missing tasks and revoked access show a bounded empty state, while recoverable errors use shared notifications. Route changes reset the task view; stale responses cannot replace the next task. No new endpoint, grant or database migration is added.

Existing scoped task Leads can use Edit task; assigned members and project managers can update status through the existing form. My tasks preserves its status-only editing flow, including for Leads; assignment changes remain available from work-area/project entry points. API authorization remains authoritative. Failed saves retain input; successful saves refresh the task and workspace aggregates. Access-denied responses clear the private task and editor.
