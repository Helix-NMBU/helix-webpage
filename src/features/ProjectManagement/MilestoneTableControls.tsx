import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconAntennaBars2, IconAntennaBars3, IconAntennaBars4, IconCalendar, IconChevronLeft, IconChevronRight, IconExclamationCircle } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { AssigneePicker } from "./TaskAssignees";
import { addDays, formatDate, osloDate } from "./model";
import type { ProjectMember, Task, TaskInput, TaskPriority } from "./types";

export type MilestoneChanges = Partial<Pick<TaskInput, "priority" | "assigneeIds" | "deadline">>;
export type SaveMilestone = (task: Task, changes: MilestoneChanges) => Promise<boolean>;
const priorities: { value: TaskPriority; label: string; icon: typeof IconCalendar }[] = [
  { value: "urgent", label: "Urgent", icon: IconExclamationCircle },
  { value: "high", label: "High", icon: IconAntennaBars4 },
  { value: "normal", label: "Normal", icon: IconAntennaBars3 },
  { value: "low", label: "Low", icon: IconAntennaBars2 },
];
const compactDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  const choice = priorities.find(item => item.value === priority)!;
  return <span className="inline-flex text-muted-foreground" role="img" aria-label={`${choice.label} priority`} title={`${choice.label} priority`}><choice.icon aria-hidden="true" className="size-4" /></span>;
}

export function TargetDate({ deadline }: { deadline: string | null }) {
  return deadline ? <span className="inline-flex items-center gap-2"><IconCalendar aria-hidden="true" className="size-4 text-muted-foreground" /><time dateTime={deadline} title={formatDate(deadline)}>{compactDate.format(dayDate(deadline))}</time></span> : <span>No target date</span>;
}

export function MilestonePriorityControl({ task, busy, onSave }: { task: Task; busy: boolean; onSave: SaveMilestone }) {
  const [open, setOpen] = useState(false);
  return <DropdownMenu open={open} onOpenChange={next => { if (!busy) setOpen(next); }}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mx-2 size-8" disabled={busy} aria-label={`Change priority for ${task.title}`}><PriorityIndicator priority={task.priority} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-56"><DropdownMenuLabel>Change priority</DropdownMenuLabel><DropdownMenuRadioGroup value={task.priority} onValueChange={value => { if (!busy) void onSave(task, { priority: value as TaskPriority }).then(saved => { if (saved) setOpen(false); }); }}>{priorities.map(choice => <DropdownMenuRadioItem key={choice.value} value={choice.value} disabled={busy} onSelect={event => event.preventDefault()}><choice.icon className="size-4 text-muted-foreground" aria-hidden="true" />{choice.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

export function MilestoneLeadsControl({ task, members, busy, onSave }: { task: Task; members: ProjectMember[]; busy: boolean; onSave: SaveMilestone }) {
  const [leads, setLeads] = useState(task.assigneeIds);
  return <AssigneePicker id={`milestone-leads-${task.id}`} inline triggerLabel={`Change leads for ${task.title}`} assignmentRole="lead" value={leads} members={members} disabled={busy} onChange={setLeads} onOpenChange={() => setLeads(task.assigneeIds)} onCommit={assigneeIds => onSave(task, { assigneeIds })} />;
}

function shiftMonth(date: string, offset: number): string {
  const value = dayDate(date);
  const day = value.getUTCDate();
  value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + offset);
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString().slice(0, 10);
}

export function MilestoneDateControl({ task, busy, onSave }: { task: Task; busy: boolean; onSave: SaveMilestone }) {
  const initial = task.deadline ?? osloDate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [month, setMonth] = useState(`${initial.slice(0, 7)}-01`);
  const [focusedDay, setFocusedDay] = useState(initial);
  const grid = useRef<HTMLTableElement>(null);
  const focusCalendar = useRef(false);
  const minimum = task.startDate ?? "2000-01-01";
  const maximum = "2100-12-31";
  const today = osloDate();
  const start = addDays(month, -dayDate(month).getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  useEffect(() => { if (focusCalendar.current) { grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusedDay}"]`)?.focus(); focusCalendar.current = false; } }, [focusedDay]);
  function changeOpen(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (next) { setDraft(initial); setMonth(`${initial.slice(0, 7)}-01`); setFocusedDay(initial); }
  }
  function navigate(date: string, focus = false) {
    const next = date < minimum ? minimum : date > maximum ? maximum : date;
    focusCalendar.current = focus; setFocusedDay(next); setMonth(`${next.slice(0, 7)}-01`);
  }
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    let next: string;
    if (offset !== undefined) next = addDays(date, offset);
    else if (event.key === "Home") next = addDays(date, -dayDate(date).getUTCDay());
    else if (event.key === "End") next = addDays(date, 6 - dayDate(date).getUTCDay());
    else if (event.key === "PageUp" || event.key === "PageDown") next = shiftMonth(date, event.key === "PageUp" ? -1 : 1);
    else return;
    event.preventDefault(); navigate(next, true);
  }
  return <Popover open={open} onOpenChange={changeOpen}><PopoverTrigger asChild><Button variant="ghost" className="-mx-2 h-8 px-2 font-normal" disabled={busy} aria-label={`Change target date for ${task.title}`}><TargetDate deadline={task.deadline} /></Button></PopoverTrigger><PopoverContent align="start" className="w-80 gap-3 p-3" aria-label={`Target date for ${task.title}`}>
    <Label htmlFor={`milestone-date-${task.id}`} className="text-xs text-muted-foreground">Target date</Label>
    <Input id={`milestone-date-${task.id}`} aria-label={`Target date for ${task.title}`} type="date" min={minimum} max={maximum} value={draft} disabled={busy} onChange={event => { const value = event.target.value; setDraft(value); if (/^\d{4}-\d{2}-\d{2}$/.test(value)) navigate(value); }} />
    <div className="flex items-center justify-between"><span className="text-sm" aria-live="polite">{monthLabel.format(dayDate(month))}</span><div className="flex"><Button variant="ghost" size="icon" className="size-7" aria-label="Previous month" disabled={busy || month.slice(0, 7) <= minimum.slice(0, 7)} onClick={() => navigate(shiftMonth(month, -1))}><IconChevronLeft className="size-4" aria-hidden="true" /></Button><Button variant="ghost" size="icon" className="size-7" aria-label="Next month" disabled={busy || month.slice(0, 7) >= maximum.slice(0, 7)} onClick={() => navigate(shiftMonth(month, 1))}><IconChevronRight className="size-4" aria-hidden="true" /></Button></div></div>
    <table ref={grid} role="grid" aria-label={monthLabel.format(dayDate(month))} className="w-full table-fixed text-center text-xs"><thead><tr>{weekdays.map(day => <th key={day} scope="col" abbr={day} className="pb-2 font-normal text-muted-foreground">{day.slice(0, 2)}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(date => <td key={date} role="gridcell" aria-selected={draft === date} className="p-0.5"><Button variant={draft === date ? "default" : "ghost"} size="icon" data-day={date} className={`size-8 rounded-full text-xs ${date.slice(0, 7) !== month.slice(0, 7) ? "text-muted-foreground" : ""} ${date === today && draft !== date ? "ring-1 ring-border" : ""}`} aria-label={formatDate(date)} aria-current={date === today ? "date" : undefined} disabled={busy || date < minimum || date > maximum} tabIndex={date === focusedDay ? 0 : -1} onKeyDown={event => dayKey(event, date)} onClick={() => { setDraft(date); navigate(date); }}>{dayDate(date).getUTCDate()}</Button></td>)}</tr>)}</tbody></table>
    <div className="flex justify-end gap-2 border-t pt-3"><Button variant="ghost" size="sm" disabled={busy} onClick={() => changeOpen(false)}>Cancel</Button><Button size="sm" disabled={busy} onClick={() => { if (!busy) void onSave(task, { deadline: draft || null }).then(saved => { if (saved) setOpen(false); }); }}>Save date</Button></div>
  </PopoverContent></Popover>;
}
