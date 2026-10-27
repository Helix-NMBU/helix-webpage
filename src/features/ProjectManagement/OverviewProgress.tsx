import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { IconChevronDown, IconCube, IconDiamonds, IconFilter2 } from "@tabler/icons-react";
import { Card, CardContent } from "@libs/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { formatDate, osloDate, summarize } from "./model";
import { isOrganized } from "./hierarchy";
import { progressSeries, progressStepPath } from "./progress";
import { chartDay, progressChartRange, seasonChartRange } from "./progress-chart";
import { ProgressRing } from "./ProgressRing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { AssigneeAvatars } from "./TaskAssignees";
import { PriorityIndicator, TargetDate } from "./MilestoneTableControls";
import { OverviewColumnMenu, OVERVIEW_PROJECT_COLUMNS } from "./OverviewColumnMenu";
import { ORGANIZATION_DEPARTMENTS, type ProjectDepartment, type ProjectWorkspace, type Task } from "./types";

const series = [
  { key: "scope", label: "Scoped", description: "All non-cancelled tasks, excluding milestones", color: "var(--muted-foreground)" },
  { key: "started", label: "Started", description: "In progress, blocked and completed tasks", color: "var(--progress-started)" },
  { key: "completed", label: "Completed", description: "Tasks marked Done", color: "var(--progress-completed)" },
] as const;
const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

const seasonEventOptions = [
  { value: "season-start", label: "Season start" },
  { value: "concept", label: "Concept Event" },
  { value: "design", label: "Design Event" },
  { value: "production-start", label: "Production start" },
  { value: "car-unveiling", label: "Car Unveiling" },
  { value: "season-end", label: "Season End" },
] as const;
type SeasonEvent = typeof seasonEventOptions[number]["value"];

function seasonEventDate(event: SeasonEvent, startDate: string, endDate: string) {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  switch (event) {
    case "season-start": return startDate;
    case "concept": return `${startYear}-10-22`;
    case "design": return `${startYear}-11-25`;
    case "production-start": return `${endYear}-01-04`;
    case "car-unveiling": return `${endYear}-05-05`;
    case "season-end": return endDate;
  }
}

type ChartEvent = { value: SeasonEvent; label: string; date: string };
export function ProgressChart({ workspace, compact = true, deadline = null, startDate = null, endDate = null, showDeadlineTail = false, events = [], visibleEventIds = [], startEventId, endEventId, deadlineLabel = "Deadline", footerLabels }: {
  workspace: ProjectWorkspace;
  compact?: boolean;
  deadline?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  showDeadlineTail?: boolean;
  events?: ChartEvent[];
  visibleEventIds?: string[];
  startEventId?: SeasonEvent;
  endEventId?: SeasonEvent;
  deadlineLabel?: string;
  footerLabels?: { start: string; end: string };
}) {
  const chartId = useId().replace(/:/g, "");
  const deadlinePatternId = `${chartId}-deadline`;
  const scopeLineGradientId = `${chartId}-scope-line-gradient`;
  const scopeAreaGradientId = `${chartId}-scope-area-gradient`;
  const clipId = `${chartId}-plot`;
  const historyClipId = `${chartId}-history`;
  const today = osloDate();
  const points = progressSeries(workspace.progressEvents, workspace.tasks, today);
  const current = points[points.length - 1];
  const { start, end } = progressChartRange(points[0].date, today, deadline, { startDate, endDate });
  const maximum = Math.max(1, ...points.map(point => point.scope));
  // Reserve a visible post-deadline tail without changing the season's end date.
  const plotRight = showDeadlineTail && deadline === end ? 570 : 618;
  const x = (date: string) => 22 + (chartDay(date) - chartDay(start)) / (chartDay(end) - chartDay(start)) * (plotRight - 22);
  const y = (value: number) => 174 - value / maximum * 146;
  const line = (key: typeof series[number]["key"]) => progressStepPath(points, key, x, y);
  const scopeX = Math.max(22, Math.min(plotRight, x(today)));
  const scopeY = y(current.scope);
  const scopeCurveWidth = Math.max(0, scopeX - 22);
  const scopeProgress = Math.max(0.01, Math.min(0.99, (scopeX - 22) / (plotRight - 22)));
  const scopeLinePath = scopeCurveWidth
    ? `M22,174 C${22 + scopeCurveWidth * 0.25},174 ${scopeX - scopeCurveWidth * 0.12},${scopeY} ${scopeX},${scopeY} H${plotRight}`
    : `M22,174 V${scopeY} H${plotRight}`;
  const scopeAreaPath = `${scopeLinePath} V174 Z`;
  const boundedX = (date: string) => Math.max(22, Math.min(618, x(date)));
  const deadlineX = deadline && deadline >= start && deadline <= end ? x(deadline) : null;
  const visibleEvents = events.filter(event => event.date >= start && event.date <= end && (visibleEventIds.includes(event.value) || event.value === startEventId || event.value === endEventId));
  const eventLabels = visibleEvents.map(event => ({ ...event, position: x(event.date) }));
  const redStart = deadline ? boundedX(deadline) : 618;
  const currentVisible = current.date >= start && current.date <= end;
  const labelStyle = (position: number) => ({
    left: `${position / 640 * 100}%`,
    transform: position < 90 ? undefined : position > 550 ? "translateX(-100%)" : "translateX(-50%)",
  });
  return <div className="space-y-1.5" data-progress-start={start} data-progress-end={end}>
    <div className="grid w-full grid-cols-3 items-center" style={{ paddingInline: `${22 / 640 * 100}%` }} aria-label={`Progress on ${formatDate(current.date)}`}>
      {series.map((item, index) => <div key={item.key} className={`flex items-baseline gap-2 ${index === 0 ? "justify-self-start" : index === 1 ? "justify-self-center" : "justify-self-end"}`}><div title={item.description} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5" style={{ background: item.color }} />{item.label}</div><div className="text-sm font-medium tabular-nums">{current[item.key]}</div></div>)}
    </div>
    <div>
      <div className={compact ? "relative h-20" : "relative h-40"}>
        <svg viewBox="0 0 640 180" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Task progress over time" aria-describedby={`${chartId}-description`}>
          <desc id={`${chartId}-description`}>
            Scoped counts include non-cancelled tasks. Started includes in-progress, blocked and completed tasks.
            The shaded scope area rises from zero to today's task count, then stays level. Started and completed lines show recorded daily states through today, without a progress forecast.
            Displayed range: {formatDate(start)} to {formatDate(end)}.
            {visibleEvents.map(event => ` ${event.label}: ${formatDate(event.date)}.`).join("")}
            {deadline && `${deadlineX !== null ? ` The red line marks the end event on ${formatDate(deadline)}.` : ` The end event on ${formatDate(deadline)} is outside the displayed range.`} Red hatching marks time after the end event.`}
          </desc>
          <defs>
            <clipPath id={clipId}><rect x="22" y="20" width="596" height="160" /></clipPath>
            <clipPath id={historyClipId}><rect x="22" y="20" width={plotRight - 22} height="160" /></clipPath>
            <linearGradient id={scopeLineGradientId} gradientUnits="userSpaceOnUse" x1="22" x2={plotRight} y1="0" y2="0">
              <stop offset="0%" stopColor="#777777" stopOpacity="0.32" />
              <stop offset={`${scopeProgress * 100}%`} stopColor="#a0a0a0" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#858585" stopOpacity="0.48" />
            </linearGradient>
            <linearGradient id={scopeAreaGradientId} gradientUnits="userSpaceOnUse" x1="22" x2="22" y1="20" y2="174">
              <stop offset="0%" stopColor="#a0a0a0" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#777777" stopOpacity="0" />
            </linearGradient>
            <pattern id={deadlinePatternId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--destructive)" strokeOpacity="0.45" strokeWidth="2" />
            </pattern>
          </defs>
          <g clipPath={`url(#${clipId})`}>
          {[0, 0.5, 1].map(fraction => <line key={fraction} x1="22" x2="618" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />)}
          <path d={scopeAreaPath} fill={`url(#${scopeAreaGradientId})`} data-scope-area />
          {deadline && <g data-progress-deadline={deadline} data-progress-event={endEventId} data-event-date={deadline}>
            <title>{`End event: ${deadlineLabel} (${formatDate(deadline)}). Red area: after this event.`}</title>
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill="var(--destructive)" fillOpacity="0.04" />
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill={`url(#${deadlinePatternId})`} />
            {deadlineX !== null && <line x1={deadlineX} x2={deadlineX} y1="20" y2="179" stroke="var(--destructive)" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />}
          </g>}
          <g clipPath={`url(#${historyClipId})`}>
          <path d={scopeLinePath} fill="none" stroke={`url(#${scopeLineGradientId})`} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-scope-line />
          <path d={`${line("completed")} L${x(current.date)},174 L${x(points[0].date)},174 Z`} fill="var(--progress-completed)" fillOpacity="0.08" />
          {series.filter(item => item.key !== "scope").map(item => <path key={item.key} d={line(item.key)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={item.key === "started" ? "4 3" : undefined} />)}
          {today >= start && today <= end && <line x1={x(today)} x2={x(today)} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          </g>
          {eventLabels.filter(event => event.value !== endEventId).map(event => <g key={event.value} data-progress-event={event.value} data-event-date={event.date}>
            <title>{`${event.label}: ${formatDate(event.date)}`}</title>
            <line x1={event.position} x2={event.position} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.8" className="text-foreground" vectorEffect="non-scaling-stroke" />
          </g>)}
          </g>
        </svg>
        {currentVisible && series.map(item => <span key={item.key} aria-hidden="true" className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(current.date) / 640 * 100}%`, top: `${y(current[item.key]) / 180 * 100}%`, background: item.color }} />)}
      </div>
      <span className="sr-only" data-chart-boundary="start"><time dateTime={start}>{shortDate(start)}</time></span>
      <span className="sr-only" data-chart-boundary="end"><time dateTime={end}>{shortDate(end)}</time></span>
      <div className="relative mt-1 h-9 text-[10px] text-muted-foreground [&>span]:whitespace-nowrap">
        {eventLabels.map(event => <span key={event.value} className={`absolute flex -translate-x-1/2 flex-col items-center text-center leading-4 ${event.value === endEventId ? "text-destructive" : "text-foreground"}`} title={`${event.label}: ${formatDate(event.date)}`} data-event-label={event.value} style={{ left: `${event.position / 640 * 100}%`, top: 0 }}><time dateTime={event.date}>{shortDate(event.date)}</time><span>{event.label}</span></span>)}
        {today >= start && today <= end && eventLabels.every(event => Math.abs(event.position - x(today)) > 58) && <span className="absolute text-muted-foreground" style={{ ...labelStyle(x(today)), top: "18px" }}>Today</span>}
      </div>
    </div>
    {!events.length && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span>{footerLabels?.start ?? (points.length === 1 ? `History begins ${shortDate(current.date)}` : `Recorded since ${shortDate(points[0].date)}`)}</span>
      {deadline && <span className="text-destructive" title="Red hatching marks time after the end event">{footerLabels?.end ?? `End event: ${shortDate(deadline)}`}</span>}
    </div>}
    <table className="sr-only"><caption>Progress history</caption><thead><tr><th>Date</th>{series.map(item => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><th scope="row">{shortDate(point.date)}</th><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table>
  </div>;
}

type AreaRow = { id: string; label: string; tasks: Task[]; department?: ProjectDepartment };
function OverviewEventFilter({ startEvent, endEvent, eventDates, visibleEventIds, onStartChange, onEndChange, onToggleEvent }: {
  startEvent: SeasonEvent;
  endEvent: SeasonEvent;
  eventDates: Record<SeasonEvent, string>;
  visibleEventIds: string[];
  onStartChange: (value: SeasonEvent) => void;
  onEndChange: (value: SeasonEvent) => void;
  onToggleEvent: (value: SeasonEvent) => void;
}) {
  const startDate = eventDates[startEvent];
  const endDate = eventDates[endEvent];
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Overview event settings" title="Overview event settings"><IconFilter2 aria-hidden="true" className="size-4" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5"><Label htmlFor="overview-start-event" className="text-xs text-muted-foreground">Start event</Label><Select value={startEvent} onValueChange={value => onStartChange(value as SeasonEvent)}><SelectTrigger id="overview-start-event" className="w-full"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start">{seasonEventOptions.map(event => <SelectItem key={event.value} value={event.value} disabled={eventDates[event.value] >= endDate}>{event.label}<span className="ml-auto pl-3 text-xs text-muted-foreground">{shortDate(eventDates[event.value])}</span></SelectItem>)}</SelectContent></Select></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="overview-end-event" className="text-xs text-muted-foreground">End event</Label><Select value={endEvent} onValueChange={value => onEndChange(value as SeasonEvent)}><SelectTrigger id="overview-end-event" className="w-full"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start">{seasonEventOptions.map(event => <SelectItem key={event.value} value={event.value} disabled={eventDates[event.value] <= startDate}>{event.label}<span className="ml-auto pl-3 text-xs text-muted-foreground">{shortDate(eventDates[event.value])}</span></SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">Events shown</p><div role="group" aria-label="Events shown in chart" className="flex flex-wrap gap-1.5">{seasonEventOptions.map(event => {
        const boundary = event.value === startEvent || event.value === endEvent;
        const active = visibleEventIds.includes(event.value) || boundary;
        return <Button key={event.value} type="button" size="sm" variant={active ? "secondary" : "outline"} aria-pressed={active} disabled={boundary} title={boundary ? `${event.label} is always shown as a chart boundary` : `${active ? "Hide" : "Show"} ${event.label}`} className="h-7 rounded-full px-2.5 text-xs disabled:opacity-100" onClick={() => onToggleEvent(event.value)}>{event.label}</Button>;
      })}</div></div>
    </PopoverContent>
  </Popover>;
}

function ProgressBreakdown({ rows, workspace, busy, onEdit }: { rows: AreaRow[]; workspace: ProjectWorkspace; busy: boolean; onEdit: (department: ProjectDepartment) => void }) {
  return <Table aria-label="Department progress"><TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Members</TableHead><TableHead>Lead</TableHead><TableHead>Tasks</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => { const progress = summarize(row.tasks); return <TableRow key={row.id}>
    <TableCell>{workspace.canManage && row.department ? <button disabled={busy} className="text-left hover:underline" aria-label={`Edit department ${row.label}`} onClick={() => onEdit(row.department!)}>{row.label}</button> : row.label}</TableCell>
    <TableCell className="tabular-nums text-muted-foreground">{row.department ? row.department.memberIds.length : <span title={row.id === "unallocated" ? "Work without a department" : "Department membership has not been set up"}>—</span>}</TableCell>
    <TableCell>{row.department?.leadId ? <AssigneeAvatars assigneeIds={[row.department.leadId]} members={workspace.members} assignmentRole="lead" showNames /> : <span className="text-muted-foreground">{row.id === "unallocated" ? "—" : "No Lead"}</span>}</TableCell>
    <TableCell className="tabular-nums"><span aria-label={`${row.label}: ${progress.done} of ${progress.total} tasks complete`}>{progress.done} / {progress.total}</span></TableCell>
    <TableCell><ProgressRing {...progress} label={row.label} showTotal={false} /></TableCell>
  </TableRow>; })}</TableBody></Table>;
}
const departmentKey = (name: string) => name.trim().toLowerCase();

export function OverviewProgress({ workspace, busy, projectColumns, onToggleProjectColumn, onSelectProject, onEditDepartment }: {
  workspace: ProjectWorkspace; busy: boolean; projectColumns: string[]; onToggleProjectColumn: (key: string) => void; onSelectProject: (id: string) => void; onEditDepartment: (department: ProjectDepartment) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projects = [...workspace.projects].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name));
  const seasonRange = seasonChartRange(workspace.season);
  const eventDates = Object.fromEntries(seasonEventOptions.map(event => [event.value, seasonEventDate(event.value, seasonRange.startDate, seasonRange.endDate)])) as Record<SeasonEvent, string>;
  const requestedStart = seasonEventOptions.find(event => event.value === searchParams.get("startEvent"))?.value ?? "season-start";
  const requestedEnd = seasonEventOptions.find(event => event.value === searchParams.get("endEvent"))?.value ?? "season-end";
  const startEvent = eventDates[requestedStart] < eventDates[requestedEnd] ? requestedStart : "season-start";
  const endEvent = eventDates[requestedEnd] > eventDates[startEvent] ? requestedEnd : "season-end";
  const startEventDate = eventDates[startEvent];
  const endEventDate = eventDates[endEvent];
  const events = seasonEventOptions.map(event => ({ ...event, date: eventDates[event.value] }));
  const visibleEventIds = searchParams.has("events")
    ? (searchParams.get("events") ?? "").split(",").filter(value => seasonEventOptions.some(event => event.value === value))
    : seasonEventOptions.map(event => event.value);
  const setEventParam = (name: string, value: string, defaultValue: string) => setSearchParams(previous => { const next = new URLSearchParams(previous); if (value === defaultValue) next.delete(name); else next.set(name, value); return next; }, { replace: true });
  const toggleEvent = (value: SeasonEvent) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    const active = previous.has("events") ? (previous.get("events") ?? "").split(",").filter(item => seasonEventOptions.some(event => event.value === item)) : seasonEventOptions.map(event => event.value);
    const updated = active.includes(value) ? active.filter(item => item !== value) : [...active, value];
    if (updated.length === seasonEventOptions.length) next.delete("events"); else next.set("events", updated.join(","));
    return next;
  }, { replace: true });
  const configured = new Map((workspace.departments ?? []).map(department => [departmentKey(department.name), department]));
  const areaRows: AreaRow[] = ORGANIZATION_DEPARTMENTS.map(name => {
    const key = departmentKey(name);
    const projectIds = new Set(workspace.projects.filter(project => project.departments.some(value => departmentKey(value) === key)).map(project => project.id));
    return { id: `department:${key}`, label: name, department: configured.get(key), tasks: workspace.tasks.filter(task => task.projectId && projectIds.has(task.projectId)) };
  });
  const allocatedProjects = new Set(workspace.projects.filter(project => project.departments.length > 0).map(project => project.id));
  const unallocatedTasks = workspace.tasks.filter(task => isOrganized(task, workspace) && !allocatedProjects.has(task.projectId!));
  if (summarize(unallocatedTasks).total > 0) areaRows.push({ id: "unallocated", label: "No department", tasks: unallocatedTasks });
  return <div data-project-progress className="grid w-full grid-cols-1 gap-8">
    <section aria-labelledby="progress-title" className="space-y-3"><div className="flex items-center justify-between"><h2 id="progress-title" className="text-base font-medium">Progress</h2><OverviewEventFilter startEvent={startEvent} endEvent={endEvent} eventDates={eventDates} visibleEventIds={visibleEventIds} onStartChange={value => setEventParam("startEvent", value, "season-start")} onEndChange={value => setEventParam("endEvent", value, "season-end")} onToggleEvent={toggleEvent} /></div>
    <Card className="gap-2 py-3"><CardContent className="space-y-2 px-4"><ProgressChart workspace={workspace} deadline={endEventDate} deadlineLabel={seasonEventOptions.find(event => event.value === endEvent)!.label} startDate={startEventDate} endDate={endEventDate} showDeadlineTail events={events} visibleEventIds={visibleEventIds} startEventId={startEvent} endEventId={endEvent} footerLabels={{ start: `Start event: ${seasonEventOptions.find(event => event.value === startEvent)!.label}`, end: `End event: ${seasonEventOptions.find(event => event.value === endEvent)!.label}` }} /><section className="border-t pt-2" aria-labelledby="progress-areas-title"><Collapsible defaultOpen><div className="mb-1 flex items-center justify-between"><CollapsibleTrigger asChild><button type="button" className="group flex items-center gap-1.5 text-sm font-medium"><IconChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" /><span id="progress-areas-title">Areas</span></button></CollapsibleTrigger></div><CollapsibleContent><ProgressBreakdown rows={areaRows} workspace={workspace} busy={busy} onEdit={onEditDepartment} /></CollapsibleContent></Collapsible></section></CardContent></Card></section>
    <section aria-labelledby="overview-projects-title" className="space-y-3"><div className="flex items-start justify-between"><div><h2 id="overview-projects-title" className="text-base font-medium">Projects <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{projects.length}</span></h2><p className="mt-1 text-sm text-muted-foreground">Open projects due in the next 30 days, nearest deadline first.</p></div><OverviewColumnMenu label="Projects" columns={OVERVIEW_PROJECT_COLUMNS} visible={projectColumns} onToggle={onToggleProjectColumn} /></div><Card className="gap-0 py-0"><CardContent className="overflow-x-auto px-0"><Table aria-label="Season projects"><TableHeader><TableRow><TableHead className="min-w-56 pl-4">Name</TableHead>{projectColumns.includes("department") && <TableHead>Department</TableHead>}{projectColumns.includes("priority") && <TableHead>Priority</TableHead>}{projectColumns.includes("leads") && <TableHead>Leads</TableHead>}{projectColumns.includes("start") && <TableHead>Start date</TableHead>}{projectColumns.includes("deadline") && <TableHead>Target date</TableHead>}{projectColumns.includes("milestones") && <TableHead>Milestones</TableHead>}{projectColumns.includes("tasks") && <TableHead>Tasks</TableHead>}{projectColumns.includes("status") && <TableHead>Status</TableHead>}</TableRow></TableHeader><TableBody>
      {projects.map(project => { const progress = summarize(workspace.tasks.filter(task => task.projectId === project.id && isOrganized(task, workspace))); const milestones = workspace.tasks.filter(task => task.kind === "milestone" && task.projectId === project.id && isOrganized(task, workspace)); return <TableRow key={project.id}>
        <TableCell className="py-3 pl-4"><div className="flex items-center gap-2"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><button className="text-left font-medium hover:underline" onClick={() => onSelectProject(project.id)}>{project.name}</button></div></TableCell>
        {projectColumns.includes("department") && <TableCell className="max-w-52 text-muted-foreground">{project.departments.join(", ") || "—"}</TableCell>}
        {projectColumns.includes("priority") && <TableCell><PriorityIndicator priority={project.priority ?? "normal"} /></TableCell>}
        {projectColumns.includes("leads") && <TableCell><AssigneeAvatars assigneeIds={project.leadIds ?? []} members={workspace.members} assignmentRole="lead" /></TableCell>}
        {projectColumns.includes("start") && <TableCell className="whitespace-nowrap">{project.startDate ? <TargetDate deadline={project.startDate} /> : <span className="text-muted-foreground">Not set</span>}</TableCell>}
        {projectColumns.includes("deadline") && <TableCell className="whitespace-nowrap"><TargetDate deadline={project.deadline} /></TableCell>}
        {projectColumns.includes("milestones") && <TableCell className="tabular-nums"><span className="inline-flex items-center gap-1.5"><IconDiamonds aria-hidden="true" className="size-4 text-muted-foreground" />{milestones.length}</span></TableCell>}
        {projectColumns.includes("tasks") && <TableCell className="tabular-nums">{progress.total}</TableCell>}
        {projectColumns.includes("status") && <TableCell><ProgressRing {...progress} label={project.name} showTotal={false} /></TableCell>}
      </TableRow>; })}
      {!projects.length && <TableRow><TableCell colSpan={1 + projectColumns.length} className="h-24 text-center text-sm text-muted-foreground">No projects yet.</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card></section>
  </div>;
}
