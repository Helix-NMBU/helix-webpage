import { useId, useState } from "react";
import { Diamond, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { AssigneeAvatars } from "./TaskAssignees";
import { addDays, formatDate, isOpen, osloDate, summarize } from "./model";
import { milestoneProgress, progressSeries, progressStepPath } from "./progress";
import { CATEGORY_LABELS, STATUS_LABELS, TASK_CATEGORIES, type ProjectWorkspace, type Task, type TaskCategory } from "./types";

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
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-3" aria-label={`Progress on ${formatDate(selected.date)}`}>
      {series.map(item => <div key={item.key} className="space-y-1"><div title={item.description} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5" style={{ background: item.color }} />{item.label}</div><div className="pl-3 text-xl font-medium tabular-nums">{selected[item.key]}</div></div>)}
    </div>
    <svg viewBox="0 0 640 202" className="w-full overflow-visible" role="img" aria-label="Task progress over time" aria-describedby={`${patternId}-description`}>
      <desc id={`${patternId}-description`}>Scope is non-cancelled tasks. Started includes in-progress, blocked and completed tasks. Lines show recorded daily states through today; shaded space is the future, without a forecast.</desc>
      <defs><pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeOpacity="0.1" strokeWidth="2" /></pattern></defs>
      {[0, 0.5, 1].map(fraction => <line key={fraction} x1="22" x2="618" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" strokeOpacity="0.07" />)}
      <rect x={x(today)} y="20" width={618 - x(today)} height="154" fill={`url(#${patternId})`} className="text-muted-foreground" />
      <path d={`${line("completed")} L${x(current.date)},174 L${x(points[0].date)},174 Z`} fill="var(--progress-completed)" fillOpacity="0.08" />
      {series.map(item => <g key={item.key}><path d={line(item.key)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeDasharray={item.key === "started" ? "4 3" : undefined} /><circle cx={x(current.date)} cy={y(current[item.key])} r="3.5" fill={item.color} /></g>)}
      <line x1={x(today)} x2={x(today)} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" />
      <text x="22" y="198" fill="currentColor" className="text-[11px] text-muted-foreground">{shortDate(start)}</text><text x={x(today)} y="198" textAnchor="middle" fill="currentColor" className="text-[11px] text-muted-foreground">Today</text><text x="618" y="198" textAnchor="end" fill="currentColor" className="text-[11px] text-muted-foreground">{shortDate(end)}</text>
    </svg>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{points.length === 1 ? `History begins ${shortDate(current.date)}` : `Recorded since ${shortDate(points[0].date)}`}</span><span>Shaded area: future</span></div>
    <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm underline-offset-4 hover:underline focus-visible:outline-2">View progress data</summary><div className="mt-2 max-h-40 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-1 font-normal">Date</th>{series.map(item => <th key={item.key} className="font-normal">{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><td><button className="py-1 underline-offset-4 hover:underline" onClick={() => setSelectedDay(point.date)} aria-label={`Show progress on ${formatDate(point.date)}`}>{shortDate(point.date)}</button></td><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table></div></details>
  </div>;
}

export function OverviewProgress({ workspace, busy, onSelectMilestone, onOpen, onCreateMilestone }: {
  workspace: ProjectWorkspace; busy: boolean; onSelectMilestone: (id: string | null) => void; onOpen: (task: Task) => void; onCreateMilestone: (category: TaskCategory) => void;
}) {
  const [breakdown, setBreakdown] = useState("assignees");
  const milestones = workspace.tasks.filter(task => task.kind === "milestone").sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.title.localeCompare(b.title));
  const assigned = new Set(workspace.tasks.filter(task => task.kind === "task" && task.status !== "cancelled").flatMap(task => task.assigneeIds));
  const rows = breakdown === "assignees" ? [
    ...[...assigned].map(id => ({ id, label: workspace.members.find(member => member.id === id)?.name ?? "Inactive member", tasks: workspace.tasks.filter(task => task.assigneeIds.includes(id)) })),
    { id: "unassigned", label: "No assignee", tasks: workspace.tasks.filter(task => !task.assigneeIds.length) },
  ].filter(row => summarize(row.tasks).total > 0) : TASK_CATEGORIES.map(id => ({ id, label: CATEGORY_LABELS[id], tasks: workspace.tasks.filter(task => task.category === id) }));
  return <div data-project-progress className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(19rem,1fr)]">
    <Card className="gap-5 py-5"><CardHeader className="px-5"><CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle></CardHeader><CardContent className="space-y-5 px-5"><ProgressChart workspace={workspace} /><div className="border-t pt-4"><Tabs value={breakdown} onValueChange={setBreakdown}><TabsList className="w-full"><TabsTrigger className="flex-1" value="assignees">Assignees</TabsTrigger><TabsTrigger className="flex-1" value="areas">Areas</TabsTrigger></TabsList></Tabs><div className="mt-2 max-h-48 space-y-1 overflow-y-auto">{rows.map(row => <div key={row.id} className="flex min-h-10 items-center justify-between gap-3 py-1.5"><div className="flex min-w-0 items-center gap-2">{breakdown === "assignees" && row.id !== "unassigned" && <AssigneeAvatars assigneeIds={[row.id]} members={workspace.members} />}<span className="truncate text-sm">{row.label}</span></div><ProgressRing {...summarize(row.tasks)} label={row.label} /></div>)}{!rows.length && <p className="py-3 text-sm text-muted-foreground">No tasks yet.</p>}</div></div></CardContent></Card>
    <Card className="gap-3 py-5"><CardHeader className="flex flex-row items-center justify-between px-5"><CardTitle className="text-sm font-medium text-muted-foreground">Milestones <span className="ml-1 tabular-nums">{milestones.length}</span></CardTitle>{workspace.taskLeadCategories.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="-my-2 size-7" disabled={busy} aria-label="New milestone"><Plus className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{workspace.taskLeadCategories.map(category => <DropdownMenuItem key={category} onSelect={() => onCreateMilestone(category)}>{CATEGORY_LABELS[category]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}</CardHeader><CardContent className="px-2">
      {milestones.map(milestone => { const progress = milestoneProgress(workspace.tasks, milestone.id); return <div key={milestone.id} className="group flex items-center gap-1 rounded-md px-2 hover:bg-muted/50"><button className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left" onClick={() => onSelectMilestone(milestone.id)} aria-label={`See tasks for milestone ${milestone.title}, ${progress.done} of ${progress.total} tasks complete, ${progress.percent}%`}><Diamond aria-hidden="true" className={`size-3.5 shrink-0 ${milestone.status === "done" ? "text-[var(--progress-completed)]" : milestone.status === "cancelled" ? "text-muted-foreground/50" : isOpen(milestone) && milestone.deadline && milestone.deadline < osloDate() ? "text-destructive" : "text-[var(--progress-started)]"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{milestone.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(milestone.deadline)} · {STATUS_LABELS[milestone.status]}</span></span><ProgressRing {...progress} label={milestone.title} /></button><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`View milestone ${milestone.title}`} onClick={() => onOpen(milestone)}><MoreHorizontal className="size-4" /></Button></div>; })}
      {!milestones.length && <p className="px-3 py-4 text-sm text-muted-foreground">Create a milestone in a work area, then link its tasks to track progress.</p>}
      <button className="mt-1 flex w-full items-center justify-between gap-3 rounded-md border-t px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50" onClick={() => onSelectMilestone(null)}><span>No milestone</span><ProgressRing {...milestoneProgress(workspace.tasks, null)} label="No milestone" /></button>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Progress uses completed linked tasks. Cancelled tasks are excluded.</p>
    </CardContent></Card>
  </div>;
}
