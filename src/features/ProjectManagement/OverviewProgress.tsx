import { useId, useState } from "react";
import { IconDiamonds, IconDots, IconPlus } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { addDays, formatDate, isOpen, osloDate, summarize } from "./model";
import { isOrganized } from "./hierarchy";
import { milestoneProgress, progressSeries, progressStepPath } from "./progress";
import { CATEGORY_LABELS, STATUS_LABELS, type ProjectWorkspace, type Task, type TaskCategory } from "./types";

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selected = points.find(point => point.date === selectedDay) ?? current;
  const start = points.length === 1 ? addDays(today, -7) : points[0].date;
  const end = addDays(today, Math.max(3, Math.min(14, dayNumber(today) - dayNumber(start))));
  const maximum = Math.max(1, ...points.map(point => point.scope));
  const x = (date: string) => 22 + (dayNumber(date) - dayNumber(start)) / (dayNumber(end) - dayNumber(start)) * 596;
  const y = (value: number) => 174 - value / maximum * 146;
  const line = (key: typeof series[number]["key"]) => progressStepPath(points, key, x, y);
  return <div className="space-y-1.5">
    <div className="grid grid-cols-3 gap-3" aria-label={`Progress on ${formatDate(selected.date)}`}>
      {series.map(item => <div key={item.key} className="flex items-baseline gap-2"><div title={item.description} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5" style={{ background: item.color }} />{item.label}</div><div className="text-base font-medium tabular-nums">{selected[item.key]}</div></div>)}
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
    <details className="text-[11px] text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm underline-offset-4 hover:underline focus-visible:outline-2">View progress data</summary><div className="mt-2 max-h-40 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-1 font-normal">Date</th>{series.map(item => <th key={item.key} className="font-normal">{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><td><button className="py-1 underline-offset-4 hover:underline" onClick={() => setSelectedDay(point.date)} aria-label={`Show progress on ${formatDate(point.date)}`}>{shortDate(point.date)}</button></td><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function ProgressBreakdown({ rows }: { rows: { id: string; label: string; tasks: Task[] }[] }) {
  return <div className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">{rows.map(row => <div key={row.id} className="flex min-h-7 items-center justify-between gap-3 py-0.5"><span className="min-w-0 truncate text-sm">{row.label}</span><ProgressRing {...summarize(row.tasks)} label={row.label} /></div>)}{!rows.length && <p className="py-3 text-sm text-muted-foreground">No departments yet. Add departments to projects to see their progress.</p>}</div>;
}

export function OverviewProgress({ workspace, busy, onSelectMilestone, onOpen, onCreateMilestone }: {
  workspace: ProjectWorkspace; busy: boolean; onSelectMilestone: (id: string) => void; onOpen: (task: Task) => void; onCreateMilestone: (category: TaskCategory) => void;
}) {
  const milestones = workspace.tasks.filter(task => task.kind === "milestone" && isOrganized(task, workspace)).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.title.localeCompare(b.title));
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
    <Card className="gap-2 py-3"><CardHeader className="px-4"><CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle></CardHeader><CardContent className="space-y-2 px-4"><ProgressChart workspace={workspace} /><section className="border-t pt-2" aria-labelledby="progress-areas-title"><h3 id="progress-areas-title" className="text-sm font-medium">Areas</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Completion by department. Shared projects contribute to each participating department.</p><ProgressBreakdown rows={areaRows} /></section></CardContent></Card>
    <Card className="gap-3 py-5"><CardHeader className="flex flex-row items-center justify-between px-5"><CardTitle className="text-sm font-medium text-muted-foreground">Milestones <span className="ml-1 tabular-nums">{milestones.length}</span></CardTitle>{workspace.taskLeadCategories.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="-my-2 size-7" disabled={busy} aria-label="New milestone"><IconPlus aria-hidden="true" className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{workspace.taskLeadCategories.map(category => <DropdownMenuItem key={category} onSelect={() => onCreateMilestone(category)}>{CATEGORY_LABELS[category]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}</CardHeader><CardContent className="px-2">
      {milestones.map(milestone => { const progress = milestoneProgress(workspace.tasks, milestone.id); return <div key={milestone.id} className="group flex items-center gap-1 rounded-md px-2 hover:bg-muted/50"><button className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left" onClick={() => onSelectMilestone(milestone.id)} aria-label={`See tasks for milestone ${milestone.title}, ${progress.done} of ${progress.total} tasks complete, ${progress.percent}%`}><IconDiamonds aria-hidden="true" className={`size-3.5 shrink-0 ${milestone.status === "done" ? "text-[var(--progress-completed)]" : milestone.status === "cancelled" ? "text-muted-foreground/50" : isOpen(milestone) && milestone.deadline && milestone.deadline < osloDate() ? "text-destructive" : "text-[var(--progress-started)]"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{milestone.title}</span><span className="mt-1 block text-xs text-muted-foreground">{workspace.projects.find(project => project.id === milestone.projectId)?.name} · {formatDate(milestone.deadline)} · {STATUS_LABELS[milestone.status]}</span></span><ProgressRing {...progress} label={milestone.title} /></button><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`View milestone ${milestone.title}`} onClick={() => onOpen(milestone)}><IconDots aria-hidden="true" className="size-4" /></Button></div>; })}
      {!milestones.length && <p className="px-3 py-4 text-sm text-muted-foreground">Create a milestone in a work area, then link its tasks to track progress.</p>}
      <button className="mt-1 flex w-full items-center justify-between gap-3 rounded-md border-t px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50" onClick={() => onSelectMilestone("unorganized")}><span>Needs organization</span><span className="text-xs tabular-nums">{unorganized.length} item{unorganized.length === 1 ? "" : "s"}</span></button>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Progress uses completed linked tasks. Cancelled tasks are excluded.</p>
    </CardContent></Card>
  </div>;
}
