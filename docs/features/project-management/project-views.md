# Project directory views

The Projects toolbar has a primary `+ New project` button for project managers and department Leads, plus an icon-only Project filters and view control available to all directory readers. Creation uses the existing project form and server permissions.

The menu switches between List and Timeline, filters by department, Lead, priority and task completion, groups by department or Lead, and orders by target date, name, priority or completion percentage. Search matches project names, descriptions and departments. Completed means a project has at least one task and all counted tasks are complete; empty projects remain distinct. Shared projects appear in each participating department/Lead group, and Lead identities remain separate even when their names match.

List display properties toggle milestones, department, priority, Leads, target date, task count and progress. The project name always remains visible. The menu's reset restores all properties and clears filters, grouping, ordering, layout, scale and search. Settings use URL query parameters, including `view=timeline`, so reloads and shared URLs retain them. Search remains local to the current page.

Timeline plots stored project target dates and milestone dates, with a Today marker and month/quarter/year zoom scales. It does not infer project start dates or duration bars: those dates are not stored in the project model. Projects without targets stay visible as undated rows, and their dated milestones still appear. The calendar domain covers today, overdue and distant dates with padding at the ends. Nearby milestone markers use separate vertical lanes to remain clickable.

Project names and target markers open the project; milestone diamonds open its milestone filter. Calendar scrolling is contained, with a sticky project-name column and month header. Today recenters the calendar on the current Oslo date. Narrow screens use a smaller fixed name column and keep horizontal overflow inside the calendar. Empty results have a bounded empty state.

The views use existing directory metadata and aggregate task counts. No private-task read, API entry point, database migration, shared default or new access grant is added.
