import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { AssigneeAvatars } from "./TaskAssignees";
import { Badge } from "@libs/components/ui/badge";
import { CATEGORY_LABELS, type ProjectWorkspace, type Task } from "./types";
import { formatDate, osloDate } from "./model";
import { Choice } from "./TaskEditor";

export function PersonalTasks({ workspace, busy, loading, onRefresh, onOpen, onComplete }: {
  workspace: ProjectWorkspace; busy: boolean; loading: boolean;
  onRefresh: () => void; onOpen: (task: Task) => void; onComplete: (task: Task) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("deadline");
  const [area, setArea] = useState("all");
  const [showCompleted, setShowCompleted] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [showAssignee, setShowAssignee] = useState(true);
  const today = osloDate();
  const assigned = workspace.tasks.filter(task => task.assigneeIds.includes(workspace.viewerId));
  const filtered = assigned.filter(task => (area === "all" || task.category === area) && (!search || [task.title, task.description, task.partnerName, workspace.projects.find(project => project.id === task.projectId)?.name].join(" ").toLowerCase().includes(search.toLowerCase()))).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "created") return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);
    return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.title.localeCompare(b.title);
  });
  const groups = [
    { label: "Overdue", tasks: filtered.filter(task => !["done", "cancelled"].includes(task.status) && task.deadline && task.deadline < today) },
    { label: "Upcoming", tasks: filtered.filter(task => !["done", "cancelled"].includes(task.status) && task.deadline && task.deadline >= today) },
    { label: "No due date", tasks: filtered.filter(task => !["done", "cancelled"].includes(task.status) && !task.deadline) },
    { label: "Completed", tasks: showCompleted ? filtered.filter(task => task.status === "done") : [] },
    { label: "Cancelled", tasks: showCancelled ? filtered.filter(task => task.status === "cancelled") : [] },
  ].filter(group => group.tasks.length);
  const columns = 2 + Number(showContext) + Number(showAssignee);
  return <section className="mx-auto w-full max-w-7xl py-5" aria-labelledby="my-tasks-title" aria-busy={busy || loading}>
    <div className="mb-5 flex items-center justify-between gap-3"><h1 id="my-tasks-title" className="text-2xl font-medium tracking-tight">My tasks</h1><Button variant="ghost" size="sm" disabled={busy || loading} onClick={onRefresh}>Refresh</Button></div>
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm">Sorted by {sort === "deadline" ? "Due date" : sort === "title" ? "Title" : "Newest first"}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={sort} onValueChange={setSort}><DropdownMenuRadioItem value="deadline">Due date</DropdownMenuRadioItem><DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem><DropdownMenuRadioItem value="created">Newest first</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        <Popover><PopoverTrigger asChild><Button variant={area === "all" ? "outline" : "secondary"} size="sm">Filter{area !== "all" ? " · 1" : ""}</Button></PopoverTrigger><PopoverContent align="start" className="w-64 space-y-3"><Label htmlFor="personal-area-filter">Area</Label><Choice id="personal-area-filter" value={area} onChange={setArea} options={[{ value: "all", label: "All areas" }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))]} /></PopoverContent></Popover>
        <Input aria-label="Search my tasks" placeholder="Search tasks…" className="h-8 w-full sm:ml-1 sm:w-60" value={search} onChange={event => setSearch(event.target.value)} />
        <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="sm:ml-auto">View settings</Button></PopoverTrigger><PopoverContent align="end" className="w-64 space-y-4"><p className="text-sm font-medium">Show in this view</p>{[
          { id: "completed", label: "Completed tasks", value: showCompleted, set: setShowCompleted },
          { id: "cancelled", label: "Cancelled tasks", value: showCancelled, set: setShowCancelled },
          { id: "context", label: "Related project or partner", value: showContext, set: setShowContext },
          { id: "assignee", label: "Assigned to", value: showAssignee, set: setShowAssignee },
        ].map(setting => <div key={setting.id} className="flex items-center gap-2"><Checkbox id={`view-${setting.id}`} checked={setting.value} onCheckedChange={value => setting.set(value === true)} /><Label htmlFor={`view-${setting.id}`} className="font-normal">{setting.label}</Label></div>)}</PopoverContent></Popover>
      </div>
      {groups.length ? <Table><TableHeader><TableRow><TableHead className="w-[44%] min-w-72 px-4">Task</TableHead><TableHead className="min-w-40">Due date</TableHead>{showContext && <TableHead className="min-w-48">Related to</TableHead>}{showAssignee && <TableHead className="min-w-40">Assigned to</TableHead>}</TableRow></TableHeader>
        {groups.map(group => <TableBody key={group.label} aria-label={group.label}>
          <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={columns} className="px-4 py-2 text-xs text-muted-foreground">{group.label}<span className="ml-2 rounded bg-muted px-1.5 py-0.5 tabular-nums">{group.tasks.length}</span></TableCell></TableRow>
          {group.tasks.map(task => {
            const closed = task.status === "done" || task.status === "cancelled";
            const context = task.partnerName || workspace.projects.find(project => project.id === task.projectId)?.name || CATEGORY_LABELS[task.category];
            return <TableRow key={task.id} className={closed ? "text-muted-foreground" : ""}>
              <TableCell className="px-4 py-4"><div className="flex items-start gap-3"><Checkbox className="mt-0.5 size-4 rounded-full" checked={task.status === "done"} disabled={busy || loading || task.status === "cancelled"} aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`} onCheckedChange={() => onComplete(task)} /><div className="min-w-0"><button className={`text-left leading-5 underline-offset-4 hover:underline ${closed ? "line-through decoration-muted-foreground/50" : "font-medium"}`} onClick={() => onOpen(task)}>{task.title}</button>{task.status === "blocked" && <div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="text-xs">Blocked</Badge>{task.blockedReason && <span className="text-xs text-muted-foreground">{task.blockedReason}</span>}</div>}{task.kind === "milestone" && <p className="mt-1 text-xs text-muted-foreground">Milestone</p>}</div></div></TableCell>
              <TableCell className={`whitespace-nowrap ${!closed && task.deadline && task.deadline < today ? "text-destructive" : "text-muted-foreground"}`}>{task.deadline ? `Due ${formatDate(task.deadline)}` : "No due date"}</TableCell>
              {showContext && <TableCell><button className="max-w-64 truncate text-left underline-offset-4 hover:underline" title={context} onClick={() => navigate(`/project-management/${task.category}`)}>{context}</button></TableCell>}
              {showAssignee && <TableCell><AssigneeAvatars assigneeIds={task.assigneeIds} members={workspace.members} /></TableCell>}
            </TableRow>;
          })}
        </TableBody>)}</Table> : <Empty className="min-h-64"><EmptyHeader><EmptyTitle>{assigned.length ? "No matching tasks" : "No tasks assigned to you"}</EmptyTitle><EmptyDescription>{assigned.length ? "Adjust the search, filters or view settings." : "Your Department Lead's assignments will appear here."}</EmptyDescription></EmptyHeader></Empty>}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Select a circle to complete or reopen a task for all its assignees. Department Leads create and assign work in Project Management.</p>
  </section>;
}
