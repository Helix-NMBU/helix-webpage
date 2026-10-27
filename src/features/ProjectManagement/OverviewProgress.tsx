import { useId } from "react";
import { IconCube, IconDots, IconPlus } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { formatDate, osloDate, summarize } from "./model";
import { isOrganized } from "./hierarchy";
import { progressSeries, progressStepPath } from "./progress";
import { chartDay, progressChartRange, seasonChartRange } from "./progress-chart";
import { ProgressRing } from "./ProgressRing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { AssigneeAvatars } from "./TaskAssignees";
import { ORGANIZATION_DEPARTMENTS, type Project, type ProjectDepartment, type ProjectWorkspace, type Task } from "./types";

const series = [
  { key: "scope", label: "Scope", description: "All non-cancelled tasks, excluding milestones", color: "var(--muted-foreground)" },
  { key: "started", label: "Started", description: "In progress, blocked and completed tasks", color: "var(--progress-started)" },
  { key: "completed", label: "Completed", description: "Tasks marked Done", color: "var(--progress-completed)" },
] as const;
const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function ProgressChart({ workspace, compact = true, deadline = null, startDate = null, endDate = null, showDeadlineTail = false, newYearDate = null }: {
  workspace: ProjectWorkspace;
  compact?: boolean;
  deadline?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  showDeadlineTail?: boolean;
  newYearDate?: string | null;
}) {
  const patternId = useId().replace(/:/g, "");
  const deadlinePatternId = `${patternId}-deadline`;
  const clipId = `${patternId}-plot`;
  const historyClipId = `${patternId}-history`;
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
  const boundedX = (date: string) => Math.max(22, Math.min(618, x(date)));
  const deadlineX = deadline && deadline >= start && deadline <= end ? x(deadline) : null;
  const newYearX = newYearDate && newYearDate > start && newYearDate < end ? x(newYearDate) : null;
  const redStart = deadline ? boundedX(deadline) : 618;
  const currentVisible = current.date >= start && current.date <= end;
  const labelStyle = (position: number) => ({
    left: `${position / 640 * 100}%`,
    transform: position < 90 ? undefined : position > 550 ? "translateX(-100%)" : "translateX(-50%)",
  });
  return <div className="space-y-1.5" data-progress-start={start} data-progress-end={end}>
    <div className="grid grid-cols-3 gap-3" aria-label={`Progress on ${formatDate(current.date)}`}>
      {series.map(item => <div key={item.key} className={compact ? "flex items-baseline gap-2" : "space-y-1"}><div title={item.description} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5" style={{ background: item.color }} />{item.label}</div><div className="text-base font-medium tabular-nums">{current[item.key]}</div></div>)}
    </div>
    <div>
      <div className={compact ? "relative h-20" : "relative h-40"}>
        <svg viewBox="0 0 640 180" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Task progress over time" aria-describedby={`${patternId}-description`}>
          <desc id={`${patternId}-description`}>
            Scope is non-cancelled tasks. Started includes in-progress, blocked and completed tasks.
            Lines show recorded daily states through today; shaded space is the future, without a forecast.
            Displayed range: {formatDate(start)} to {formatDate(end)}.
            {newYearX !== null && newYearDate && ` The new year marker shows ${formatDate(newYearDate)}.`}
            {deadline && `${deadlineX !== null ? ` The red line marks the deadline on ${formatDate(deadline)}.` : ` The deadline on ${formatDate(deadline)} is outside the displayed range.`} Red hatching marks time after that deadline.`}
          </desc>
          <defs>
            <clipPath id={clipId}><rect x="22" y="20" width="596" height="160" /></clipPath>
            <clipPath id={historyClipId}><rect x="22" y="20" width={plotRight - 22} height="160" /></clipPath>
            <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeOpacity="0.1" strokeWidth="2" />
            </pattern>
            <pattern id={deadlinePatternId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--destructive)" strokeOpacity="0.45" strokeWidth="2" />
            </pattern>
          </defs>
          <g clipPath={`url(#${clipId})`}>
          {[0, 0.5, 1].map(fraction => <line key={fraction} x1="22" x2="618" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />)}
          <rect x={boundedX(today)} y="20" width={618 - boundedX(today)} height="154" fill={`url(#${patternId})`} className="text-muted-foreground" />
          {deadline && <g data-progress-deadline={deadline}>
            <title>{`Deadline: ${formatDate(deadline)}. Red area: after deadline.`}</title>
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill="var(--destructive)" fillOpacity="0.04" />
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill={`url(#${deadlinePatternId})`} />
            {deadlineX !== null && <line x1={deadlineX} x2={deadlineX} y1="20" y2="179" stroke="var(--destructive)" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />}
          </g>}
          <g clipPath={`url(#${historyClipId})`}>
          <path d={`${line("completed")} L${x(current.date)},174 L${x(points[0].date)},174 Z`} fill="var(--progress-completed)" fillOpacity="0.08" />
          {series.map(item => <path key={item.key} d={line(item.key)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={item.key === "started" ? "4 3" : undefined} />)}
          {today >= start && today <= end && <line x1={x(today)} x2={x(today)} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          </g>
          {newYearX !== null && newYearDate && <g data-progress-new-year={newYearDate}>
            <title>{`New year: ${formatDate(newYearDate)}`}</title>
            <line x1={newYearX} x2={newYearX} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.8" className="text-foreground" vectorEffect="non-scaling-stroke" />
          </g>}
          </g>
        </svg>
        {currentVisible && series.map(item => <span key={item.key} aria-hidden="true" className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(current.date) / 640 * 100}%`, top: `${y(current[item.key]) / 180 * 100}%`, background: item.color }} />)}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted-foreground [&>span]:whitespace-nowrap">
        <span className={`absolute ${deadline === start ? "text-destructive" : ""}`} data-chart-boundary="start" style={labelStyle(22)}><time dateTime={start}>{shortDate(start)}</time></span>
        {x(today) - 22 > 120 && plotRight - x(today) > 120 && (deadlineX === null || Math.abs(deadlineX - x(today)) > 120) && (newYearX === null || Math.abs(newYearX - x(today)) > 60) && <span className="absolute" style={labelStyle(x(today))}>Today</span>}
        {newYearX !== null && newYearDate && <span className="absolute text-foreground" title={`New year: ${formatDate(newYearDate)}`} style={labelStyle(newYearX)}><time dateTime={newYearDate}>1 Jan</time></span>}
        <span className={`absolute ${deadline === end ? "text-destructive" : ""}`} data-chart-boundary="end" style={labelStyle(plotRight)}><time dateTime={end}>{shortDate(end)}</time></span>
        {deadlineX !== null && deadline && deadline !== end && deadlineX - 22 > 120 && plotRight - deadlineX > 120 && <span className="absolute text-destructive" title={`Deadline: ${formatDate(deadline)}`} style={labelStyle(deadlineX)}>{shortDate(deadline)}</span>}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span>{points.length === 1 ? `History begins ${shortDate(current.date)}` : `Recorded since ${shortDate(points[0].date)}`}</span>
      <span>Shaded area: future</span>
      {deadline && <span className="text-destructive" title="Red hatching marks time after the deadline">Deadline: {shortDate(deadline)}</span>}
    </div>
    <table className="sr-only"><caption>Progress history</caption><thead><tr><th>Date</th>{series.map(item => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><th scope="row">{shortDate(point.date)}</th><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table>
  </div>;
}

type AreaRow = { id: string; label: string; tasks: Task[]; department?: ProjectDepartment };
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

export function OverviewProgress({ workspace, busy, onSelectProject, onNeedsOrganization, onOpenProject, onCreateProject, onEditDepartment }: {
  workspace: ProjectWorkspace; busy: boolean; onSelectProject: (id: string) => void; onNeedsOrganization: () => void; onOpenProject: (project: Project) => void; onCreateProject: () => void; onEditDepartment: (department: ProjectDepartment) => void;
}) {
  const projects = [...workspace.projects].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name));
  const seasonRange = seasonChartRange(workspace.season);
  const unorganized = workspace.tasks.filter(task => !isOrganized(task, workspace));
  const configured = new Map((workspace.departments ?? []).map(department => [departmentKey(department.name), department]));
  const areaRows: AreaRow[] = ORGANIZATION_DEPARTMENTS.map(name => {
    const key = departmentKey(name);
    const projectIds = new Set(workspace.projects.filter(project => project.departments.some(value => departmentKey(value) === key)).map(project => project.id));
    return { id: `department:${key}`, label: name, department: configured.get(key), tasks: workspace.tasks.filter(task => task.projectId && projectIds.has(task.projectId)) };
  });
  const allocatedProjects = new Set(workspace.projects.filter(project => project.departments.length > 0).map(project => project.id));
  const unallocatedTasks = workspace.tasks.filter(task => !task.projectId || !allocatedProjects.has(task.projectId));
  if (summarize(unallocatedTasks).total > 0) areaRows.push({ id: "unallocated", label: "No department", tasks: unallocatedTasks });
  return <div data-project-progress className="grid w-full grid-cols-1 gap-4">
    <Card className="gap-2 py-3"><CardHeader className="px-4"><CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle></CardHeader><CardContent className="space-y-2 px-4"><ProgressChart workspace={workspace} deadline={seasonRange.endDate} {...seasonRange} showDeadlineTail newYearDate={`${seasonRange.endDate.slice(0, 4)}-01-01`} /><section className="border-t pt-2" aria-labelledby="progress-areas-title"><div className="mb-1 flex items-center justify-between"><h3 id="progress-areas-title" className="text-sm font-medium">Areas</h3></div><ProgressBreakdown rows={areaRows} workspace={workspace} busy={busy} onEdit={onEditDepartment} /></section></CardContent></Card>
    <section aria-labelledby="overview-projects-title" className="space-y-3"><div className="flex items-center justify-between"><h2 id="overview-projects-title" className="text-base font-medium">Projects <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{projects.length}</span></h2>{workspace.canManage && <Button size="icon" variant="ghost" className="-my-2 size-7" disabled={busy} aria-label="Create project" onClick={onCreateProject}><IconPlus aria-hidden="true" className="size-4" /></Button>}</div><Card className="gap-3 py-2"><CardContent className="px-2">
      {projects.map(project => { const progress = summarize(workspace.tasks.filter(task => task.projectId === project.id)); return <div key={project.id} className="group flex items-center gap-1 rounded-md px-2 hover:bg-muted/50"><button className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left" onClick={() => onSelectProject(project.id)} aria-label={`See tasks for project ${project.name}, ${progress.done} of ${progress.total} tasks complete, ${progress.percent}%`}><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{project.name}</span><span className="mt-1 block text-xs text-muted-foreground">{project.departments.join(", ") || "No department"} · {formatDate(project.deadline)}</span></span><ProgressRing {...progress} label={project.name} /></button>{workspace.canManage && <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={busy} aria-label={`Edit project ${project.name}`} onClick={() => onOpenProject(project)}><IconDots aria-hidden="true" className="size-4" /></Button>}</div>; })}
      {!projects.length && <p className="px-3 py-4 text-sm text-muted-foreground">No projects yet. A project and milestone are needed before adding tasks.</p>}
      <button className="mt-1 flex w-full items-center justify-between gap-3 rounded-md border-t px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50" onClick={onNeedsOrganization}><span>Needs organization</span><span className="text-xs tabular-nums">{unorganized.length} item{unorganized.length === 1 ? "" : "s"}</span></button>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Progress uses completed project tasks. Cancelled tasks are excluded.</p>
    </CardContent></Card></section>
  </div>;
}
