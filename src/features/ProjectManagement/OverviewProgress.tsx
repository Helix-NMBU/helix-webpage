import { useId } from "react";
import { IconCube, IconDots, IconPlus } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { addDays, formatDate, osloDate, summarize } from "./model";
import { isOrganized } from "./hierarchy";
import { progressSeries, progressStepPath } from "./progress";
import { type Project, type ProjectWorkspace, type Task } from "./types";

const series = [
  { key: "scope", label: "Scope", description: "All non-cancelled tasks, excluding milestones", color: "var(--muted-foreground)" },
  { key: "started", label: "Started", description: "In progress, blocked and completed tasks", color: "var(--progress-started)" },
  { key: "completed", label: "Completed", description: "Tasks marked Done", color: "var(--progress-completed)" },
] as const;
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;
const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function ProgressRing({ done, total, percent, label }: { done: number; total: number; percent: number; label: string }) {
  return <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground" aria-label={`${label}: ${done} of ${total} tasks complete, ${percent}%`}>
    <svg viewBox="0 0 20 20" className="size-4 -rotate-90" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" /><circle cx="10" cy="10" r="8" fill="none" stroke="var(--progress-completed)" strokeWidth="2" pathLength="100" strokeDasharray={`${percent} 100`} strokeLinecap="round" /></svg><span className="tabular-nums">{percent}% <span className="ml-1">of {total}</span></span>
  </span>;
}

function ProgressChart({ workspace }: { workspace: ProjectWorkspace }) {
  const patternId = useId().replace(/:/g, "");
  const today = osloDate();
  const points = progressSeries(workspace.progressEvents, workspace.tasks, today);
  const current = points[points.length - 1];
  const start = points.length === 1 ? addDays(today, -7) : points[0].date;
  const end = addDays(today, Math.max(3, Math.min(14, dayNumber(today) - dayNumber(start))));
  const maximum = Math.max(1, ...points.map(point => point.scope));
  const x = (date: string) => 22 + (dayNumber(date) - dayNumber(start)) / (dayNumber(end) - dayNumber(start)) * 596;
  const y = (value: number) => 174 - value / maximum * 146;
  const line = (key: typeof series[number]["key"]) => progressStepPath(points, key, x, y);
  return <div className="space-y-1.5">
    <div className="grid grid-cols-3 gap-3" aria-label={`Progress on ${formatDate(current.date)}`}>
      {series.map(item => <div key={item.key} className="flex items-baseline gap-2"><div title={item.description} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5" style={{ background: item.color }} />{item.label}</div><div className="text-base font-medium tabular-nums">{current[item.key]}</div></div>)}
    </div>
    <div>
    <div className="relative h-20">
      <svg viewBox="0 0 640 180" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Task progress over time" aria-describedby={`${patternId}-description`}>
        <desc id={`${patternId}-description`}>Scope is non-cancelled tasks. Started includes in-progress, blocked and completed tasks. Lines show recorded daily states through today; shaded space is the future, without a forecast.</desc>
        <defs><pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeOpacity="0.1" strokeWidth="2" /></pattern></defs>
        {[0, 0.5, 1].map(fraction => <line key={fraction} x1="22" x2="618" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />)}
        <rect x={x(today)} y="20" width={618 - x(today)} height="154" fill={`url(#${patternId})`} className="text-muted-foreground" />
        <path d={`${line("completed")} L${x(current.date)},174 L${x(points[0].date)},174 Z`} fill="var(--progress-completed)" fillOpacity="0.08" />
        {series.map(item => <g key={item.key}><path d={line(item.key)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={item.key === "started" ? "4 3" : undefined} /></g>)}
        <line x1={x(today)} x2={x(today)} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>
      {series.map(item => <span key={item.key} aria-hidden="true" className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(current.date) / 640 * 100}%`, top: `${y(current[item.key]) / 180 * 100}%`, background: item.color }} />)}
    </div>
    <div className="relative mt-1 h-4 text-[11px] text-muted-foreground"><span className="absolute" style={{ left: `${22 / 640 * 100}%` }}>{shortDate(start)}</span><span className="absolute -translate-x-1/2" style={{ left: `${x(today) / 640 * 100}%` }}>Today</span><span className="absolute -translate-x-full" style={{ left: `${618 / 640 * 100}%` }}>{shortDate(end)}</span></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span>{points.length === 1 ? `History begins ${shortDate(current.date)}` : `Recorded since ${shortDate(points[0].date)}`}</span><span>Shaded area: future</span></div>
    <table className="sr-only"><caption>Progress history</caption><thead><tr><th>Date</th>{series.map(item => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><th scope="row">{shortDate(point.date)}</th><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table>
  </div>;
}

function ProgressBreakdown({ rows }: { rows: { id: string; label: string; tasks: Task[] }[] }) {
  return <div className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">{rows.map(row => <div key={row.id} className="flex min-h-7 items-center justify-between gap-3 py-0.5"><span className="min-w-0 truncate text-sm">{row.label}</span><ProgressRing {...summarize(row.tasks)} label={row.label} /></div>)}{!rows.length && <p className="py-3 text-sm text-muted-foreground">No departments yet. Add departments to projects to see their progress.</p>}</div>;
}

export function OverviewProgress({ workspace, busy, onSelectProject, onNeedsOrganization, onOpenProject, onCreateProject }: {
  workspace: ProjectWorkspace; busy: boolean; onSelectProject: (id: string) => void; onNeedsOrganization: () => void; onOpenProject: (project: Project) => void; onCreateProject: () => void;
}) {
  const projects = [...workspace.projects].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name));
  const unorganized = workspace.tasks.filter(task => !isOrganized(task, workspace));
  const departments = [...new Set(workspace.projects.flatMap(project => project.departments))].sort((a, b) => a.localeCompare(b));
  const areaRows = departments.map(name => {
    const projectIds = new Set(workspace.projects.filter(project => project.departments.includes(name)).map(project => project.id));
    return { id: `department:${name}`, label: name, tasks: workspace.tasks.filter(task => task.projectId && projectIds.has(task.projectId)) };
  });
  const allocatedProjects = new Set(workspace.projects.filter(project => project.departments.length > 0).map(project => project.id));
  const unallocatedTasks = workspace.tasks.filter(task => !task.projectId || !allocatedProjects.has(task.projectId));
  if (summarize(unallocatedTasks).total > 0) areaRows.push({ id: "unallocated", label: "No department", tasks: unallocatedTasks });
  return <div data-project-progress className="grid w-full grid-cols-1 gap-4">
    <Card className="gap-2 py-3"><CardHeader className="px-4"><CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle></CardHeader><CardContent className="space-y-2 px-4"><ProgressChart workspace={workspace} /><section className="border-t pt-2" aria-labelledby="progress-areas-title"><h3 id="progress-areas-title" className="text-sm font-medium">Areas</h3><ProgressBreakdown rows={areaRows} /></section></CardContent></Card>
    <Card className="gap-3 py-5"><CardHeader className="flex flex-row items-center justify-between px-5"><CardTitle className="text-sm font-medium text-muted-foreground">Projects <span className="ml-1 tabular-nums">{projects.length}</span></CardTitle>{workspace.canManage && <Button size="icon" variant="ghost" className="-my-2 size-7" disabled={busy} aria-label="Create project" onClick={onCreateProject}><IconPlus aria-hidden="true" className="size-4" /></Button>}</CardHeader><CardContent className="px-2">
      {projects.map(project => { const progress = summarize(workspace.tasks.filter(task => task.projectId === project.id)); return <div key={project.id} className="group flex items-center gap-1 rounded-md px-2 hover:bg-muted/50"><button className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left" onClick={() => onSelectProject(project.id)} aria-label={`See tasks for project ${project.name}, ${progress.done} of ${progress.total} tasks complete, ${progress.percent}%`}><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{project.name}</span><span className="mt-1 block text-xs text-muted-foreground">{project.departments.join(", ") || "No department"} · {formatDate(project.deadline)}</span></span><ProgressRing {...progress} label={project.name} /></button>{workspace.canManage && <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={busy} aria-label={`Edit project ${project.name}`} onClick={() => onOpenProject(project)}><IconDots aria-hidden="true" className="size-4" /></Button>}</div>; })}
      {!projects.length && <p className="px-3 py-4 text-sm text-muted-foreground">No projects yet. Add a project to track its milestones and tasks.</p>}
      <button className="mt-1 flex w-full items-center justify-between gap-3 rounded-md border-t px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50" onClick={onNeedsOrganization}><span>Needs organization</span><span className="text-xs tabular-nums">{unorganized.length} item{unorganized.length === 1 ? "" : "s"}</span></button>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Progress uses completed project tasks. Cancelled tasks are excluded.</p>
    </CardContent></Card>
  </div>;
}
