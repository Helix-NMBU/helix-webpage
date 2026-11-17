import { useState } from "react";
import { IconCalendar } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { PriorityGlyph } from "./PriorityGlyph";
import { AssigneePicker } from "./TaskAssignees";
import { formatDate, osloDate } from "./model";
import { ProjectCalendar, projectCalendarMonth } from "./ProjectCalendar";
import type { MilestoneChanges, ProjectMember, Task, TaskPriority } from "./types";

export type { MilestoneChanges } from "./types";
export type SaveMilestone = (task: Task, changes: MilestoneChanges) => Promise<boolean>;
const priorities: { value: TaskPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Medium" },
  { value: "low", label: "Low" },
];
const compactDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  const choice = priorities.find(item => item.value === priority)!;
  return <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground [&_svg]:size-3.5" role="img" aria-label={`${choice.label} priority`} title={`${choice.label} priority`}><PriorityGlyph priority={priority} /></span>;
}

export function TargetDate({ deadline }: { deadline: string | null }) {
  return deadline ? <span className="inline-flex items-center gap-2"><IconCalendar aria-hidden="true" className="size-4 text-muted-foreground" /><time dateTime={deadline} title={formatDate(deadline)}>{compactDate.format(dayDate(deadline))}</time></span> : <span>No target date</span>;
}

export function MilestonePriorityControl({ task, busy, onSave, compact = false }: { task: Task; busy: boolean; onSave: SaveMilestone; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <DropdownMenu open={open} onOpenChange={next => { if (!busy) setOpen(next); }}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={compact ? "size-6 rounded-full" : "size-8"} disabled={busy} aria-label={`Change priority for ${task.title}`}><PriorityIndicator priority={task.priority} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-44"><DropdownMenuLabel>Change priority</DropdownMenuLabel><DropdownMenuRadioGroup value={task.priority} onValueChange={value => { if (!busy) void onSave(task, { priority: value as TaskPriority }).then(saved => { if (saved) setOpen(false); }); }}>{priorities.map(choice => <DropdownMenuRadioItem key={choice.value} value={choice.value} disabled={busy} onSelect={event => event.preventDefault()}><PriorityGlyph priority={choice.value} />{choice.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

export function MilestoneLeadsControl({ task, members, busy, onSave }: { task: Task; members: ProjectMember[]; busy: boolean; onSave: SaveMilestone }) {
  const [leads, setLeads] = useState(task.assigneeIds);
  return <AssigneePicker id={`milestone-leads-${task.id}`} inline triggerLabel={`Change leads for ${task.title}`} assignmentRole="lead" value={leads} members={members} disabled={busy} onChange={setLeads} onOpenChange={() => setLeads(task.assigneeIds)} onCommit={assigneeIds => onSave(task, { assigneeIds })} />;
}

export function MilestoneDateControl({ task, busy, onSave, pill = false }: { task: Task; busy: boolean; onSave: SaveMilestone; pill?: boolean }) {
  const initial = task.deadline ?? osloDate();
  const minimum = task.startDate ?? "2000-01-01";
  const maximum = "2100-12-31";
  const initialMonth = projectCalendarMonth(initial, minimum, maximum);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [month, setMonth] = useState(initialMonth);

  function changeOpen(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (next) {
      setDraft(initial);
      setMonth(initialMonth);
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={pill ? "h-6 rounded-full border border-border px-2 text-xs font-normal" : "-mx-2 h-8 px-2 font-normal"} disabled={busy} aria-label={`Change target date for ${task.title}`}>
          <TargetDate deadline={task.deadline} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-3" aria-label={`Target date for ${task.title}`}>
        <Label htmlFor={`milestone-date-${task.id}`} className="text-xs text-muted-foreground">Target date</Label>
        <Input
          id={`milestone-date-${task.id}`}
          aria-label={`Target date for ${task.title}`}
          type="date"
          min={minimum}
          max={maximum}
          value={draft}
          disabled={busy}
          onChange={(event) => {
            const date = event.target.value;
            setDraft(date);
            if (date) setMonth(projectCalendarMonth(date, minimum, maximum));
          }}
        />
        <ProjectCalendar
          value={draft || null}
          onSelect={setDraft}
          month={month}
          onMonthChange={setMonth}
          minimum={minimum}
          maximum={maximum}
          disabled={busy}
          variant="milestone"
        />
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={() => {
            if (!busy) void onSave(task, { deadline: draft || null }).then(saved => { if (saved) setOpen(false); });
          }}>
            Save date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
