import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { CATEGORY_LABELS, STATUS_LABELS, TASK_CATEGORIES, TASK_STATUSES, type Project, type ProjectMutation, type ProjectRepository, type ProjectWorkspace, type Task, type TaskCategory } from "./types";
import { formatDate, isOpen, osloDate, summarize, taskUrgency } from "./model";
import { projectRepository, ProjectRequestError } from "./repository";
import { Choice, ProjectEditor, TaskEditor } from "./TaskEditor";

export const PROJECT_SECTIONS = [{ id: "overview", title: "Overview" }, ...TASK_CATEGORIES.map(id => ({ id, title: CATEGORY_LABELS[id] }))];

function ProgressBar({ done, total, percent }: { done: number; total: number; percent: number }) {
  return <div className="space-y-2"><div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{done} of {total} tasks complete</span><span className="font-medium tabular-nums">{percent}%</span></div><div role="progressbar" aria-label="Task completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>;
}

function TaskTable({ tasks, workspace, deliveries, onOpen }: { tasks: Task[]; workspace: ProjectWorkspace; deliveries: boolean; onOpen: (task: Task) => void }) {
  const today = osloDate();
  return <Table><TableHeader><TableRow><TableHead className="min-w-64">Task</TableHead>{deliveries && <TableHead>Partner</TableHead>}<TableHead>Status</TableHead><TableHead>Assignee</TableHead><TableHead>Deadline</TableHead><TableHead>Priority</TableHead></TableRow></TableHeader>
    <TableBody>{tasks.map(task => <TableRow key={task.id}>
      <TableCell className="max-w-md whitespace-normal py-4"><button className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline" onClick={() => onOpen(task)}>{task.title}</button><div className="mt-1 text-xs text-muted-foreground">{task.kind === "milestone" ? "Milestone · " : ""}{workspace.projects.find(project => project.id === task.projectId)?.name ?? CATEGORY_LABELS[task.category]}</div>{task.status === "blocked" && task.blockedReason && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{task.blockedReason}</p>}</TableCell>
      {deliveries && <TableCell>{task.partnerName}</TableCell>}
      <TableCell><Badge variant={task.status === "blocked" ? "destructive" : task.status === "done" ? "default" : "secondary"}>{deliveries && task.status === "done" ? "Delivered" : STATUS_LABELS[task.status]}</Badge></TableCell>
      <TableCell>{workspace.members.find(member => member.id === task.assigneeId)?.name ?? (task.assigneeId ? "Inactive member" : "Unassigned")}</TableCell>
      <TableCell className="whitespace-nowrap"><span className={taskUrgency(task, today) === "overdue" ? "text-destructive" : ""}>{formatDate(task.deadline)}</span>{taskUrgency(task, today) && <div className="mt-1 text-xs text-muted-foreground">{taskUrgency(task, today) === "overdue" ? "Overdue" : "Due within 7 days"}</div>}</TableCell>
      <TableCell className="capitalize">{task.priority}</TableCell>
    </TableRow>)}</TableBody></Table>;
}

function Timeline({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const dated = tasks.filter(task => task.deadline && task.status !== "cancelled").sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.title.localeCompare(b.title));
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Scheduled dates come from task deadlines. Undated work is excluded from this timeline.</p>{dated.length ? <Table><TableHeader><TableRow><TableHead>Work item</TableHead><TableHead>Start</TableHead><TableHead>Deadline</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{dated.map(task => <TableRow key={task.id}><TableCell className="min-w-56"><button className="text-left font-medium hover:underline" onClick={() => onOpen(task)}>{task.title}</button>{task.kind === "milestone" && <div className="mt-1 text-xs text-muted-foreground">Milestone</div>}</TableCell><TableCell className="whitespace-nowrap">{task.startDate ? formatDate(task.startDate) : "Not set"}</TableCell><TableCell className="whitespace-nowrap">{formatDate(task.deadline)}</TableCell><TableCell>{STATUS_LABELS[task.status]}</TableCell></TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyTitle>No scheduled tasks</EmptyTitle><EmptyDescription>Add task deadlines to build the timeline.</EmptyDescription></EmptyHeader></Empty>}</div>;
}

function PartnerDeliverables({ tasks, onSelect }: { tasks: Task[]; onSelect: (partner: string) => void }) {
  const partners = [...new Set(tasks.map(task => task.partnerName).filter(Boolean))].sort();
  if (!partners.length) return null;
  return <div className="space-y-3"><h2 className="text-lg font-medium">Partner commitments</h2><div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Recorded</TableHead><TableHead>Delivered</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader><TableBody>{partners.map(partner => {
    const obligations = tasks.filter(task => task.partnerName === partner && task.status !== "cancelled");
    return <TableRow key={partner}><TableCell><button className="font-medium hover:underline" onClick={() => onSelect(partner)}>{partner}</button></TableCell><TableCell>{obligations.length}</TableCell><TableCell>{obligations.filter(task => task.status === "done").length}</TableCell><TableCell>{obligations.filter(isOpen).length}</TableCell></TableRow>;
  })}</TableBody></Table></div></div>;
}

export default function ProjectManagement({ personal = false, repository: supplied }: { personal?: boolean; repository?: ProjectRepository }) {
  const { section = "overview" } = useParams();
  const valid = personal || PROJECT_SECTIONS.some(item => item.id === section);
  const category = TASK_CATEGORIES.includes(section as TaskCategory) ? section as TaskCategory : null;
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(personal || section === "partnership-deliverables" ? "all" : "open");
  const [projectId, setProjectId] = useState("all");
  const [view, setView] = useState("tasks");
  const [taskEditor, setTaskEditor] = useState<{ task: Task | null } | null>(null);
  const [projectEditor, setProjectEditor] = useState<{ project: Project | null } | null>(null);
  const repository = useRef<Promise<ProjectRepository> | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const notify = useNotify();
  const navigate = useNavigate();
  const getRepository = useCallback(() => repository.current ??= supplied ? Promise.resolve(supplied) : projectRepository(), [supplied]);
  const report = useCallback((error: unknown, retry: () => void) => {
    const denied = error instanceof ProjectRequestError && (error.status === 401 || error.status === 403);
    if (denied) setWorkspace(null);
    notify(denied ? "Project access unavailable" : "Could not load project management", error instanceof Error ? error.message : "Please try again.", { id: "project-management-load", variant: "error", href: null, action: error instanceof ProjectRequestError && error.status === 401 ? { label: "Sign in", onClick: () => navigate("/login") } : { label: "Try again", onClick: retry } });
  }, [navigate, notify]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try { const next = await (await getRepository()).load(); if (active.current && request === generation.current) setWorkspace(next); }
    catch (error) { if (active.current && request === generation.current) report(error, () => void load()); }
    finally { if (active.current && request === generation.current) setLoading(false); }
  }, [getRepository, report]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; generation.current++; }; }, [load]);
  useEffect(() => { setSearch(""); setStatus(personal || section === "partnership-deliverables" ? "all" : "open"); setProjectId("all"); setView("tasks"); setTaskEditor(null); setProjectEditor(null); }, [section, personal]);
  async function save(mutation: ProjectMutation) {
    if (busy) return;
    setBusy(true);
    generation.current++;
    try {
      const next = await (await getRepository()).mutate(mutation);
      if (!active.current) return;
      setWorkspace(next); setTaskEditor(null); setProjectEditor(null);
      notify(mutation.action === "save_project" ? "Project saved" : "Task saved", mutation.action === "save_project" ? "The project is ready to manage." : "Progress and assignments have been updated.", { variant: "success", href: null });
    } catch (error) {
      if (!active.current) return;
      if (error instanceof ProjectRequestError && [401, 403].includes(error.status)) { setWorkspace(null); setTaskEditor(null); setProjectEditor(null); }
      notify("Could not save changes", `${error instanceof Error ? error.message : "Please try again."} Your input has been kept where access allows.`, { id: "project-management-save", variant: "error", href: null, action: { label: "Reload tasks", onClick: () => void load() } });
    } finally { if (active.current) setBusy(false); }
  }
  if (!valid) return <Navigate to="/project-management/overview" replace />;
  if (!workspace) return loading ? <div role="status" aria-label="Loading project management" className="space-y-6 py-8"><Skeleton className="h-10 w-64" /><div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28" />)}</div><Skeleton className="h-80 w-full" /></div> : <div className="py-8"><Button variant="outline" onClick={() => void load()}>Try again</Button></div>;
  const scope = workspace.tasks.filter(task => personal ? task.assigneeId === workspace.viewerId : !category || task.category === category);
  const projects = workspace.projects.filter(project => !category || project.category === category);
  const stats = summarize(scope);
  const title = personal ? "My tasks" : category ? CATEGORY_LABELS[category] : "Overview";
  const descriptions: Record<string, string> = { overview: "A shared view of the season, its progress, and the work ahead.", production: "From design to assembly. Track production work and upcoming milestones.", "partnership-deliverables": "Track recorded commitments to this season's sponsors and partners.", marketing: "Plan campaigns, content, and the Helix story.", operations: "Competition deadlines and the work that keeps the team running." };
  const filtered = scope.filter(task => (status === "all" || (status === "open" ? isOpen(task) : task.status === status)) && (projectId === "all" || task.projectId === projectId) && (!search || [task.title, task.description, task.partnerName, workspace.members.find(member => member.id === task.assigneeId)?.name].join(" ").toLowerCase().includes(search.toLowerCase()))).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.title.localeCompare(b.title));
  const departmentNames = [...new Set(projects.flatMap(project => project.departments))].sort();
  return <section className="mx-auto w-full max-w-7xl space-y-7 py-6" aria-labelledby="project-page-title" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{workspace.season} · Project management</p><h1 id="project-page-title" className="text-3xl font-medium tracking-tight">{title}</h1><p className="max-w-2xl text-sm text-muted-foreground">{personal ? "All work assigned to you, across projects and departments." : descriptions[section]}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>Refresh</Button>{workspace.canManage && <><Button variant="outline" disabled={busy} onClick={() => setProjectEditor({ project: null })}>New project</Button><Button disabled={busy} onClick={() => setTaskEditor({ task: null })}>New task</Button></>}</div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Task completion", value: `${stats.percent}%`, detail: `${stats.done} of ${stats.total} tasks complete` }, { label: "Overdue", value: stats.overdue, detail: "Open tasks and milestones past deadline" }, { label: "Due within 7 days", value: stats.upcoming, detail: "Including today's deadlines" }, { label: "Blocked", value: stats.blocked, detail: "Work that needs a next step" }].map(item => <Card key={item.label} className="gap-3 py-5"><CardHeader className="px-5"><CardDescription>{item.label}</CardDescription><CardTitle className="text-3xl font-medium tabular-nums">{item.value}</CardTitle></CardHeader><CardContent className="px-5 text-xs text-muted-foreground">{item.detail}</CardContent></Card>)}</div>
    <p className="text-sm text-muted-foreground">Latest open task or milestone deadline: {formatDate(stats.lastDeadline)}. {stats.unscheduled > 0 ? `${stats.unscheduled} open item${stats.unscheduled === 1 ? " has" : "s have"} no deadline.` : "All open work has a deadline."}</p>
    {category === "partnership-deliverables" && <PartnerDeliverables tasks={scope} onSelect={partner => { setSearch(partner); setStatus("all"); setProjectId("all"); }} />}
    {!personal && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Projects</h2><span className="text-sm text-muted-foreground">{projects.length} in {workspace.season}</span></div>{projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => {
      const projectTasks = scope.filter(task => task.projectId === project.id);
      const progress = summarize(projectTasks);
      const activeWork = projectTasks.some(isOpen);
      return <Card key={project.id} className="gap-4 py-5"><CardHeader className="px-5"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base font-medium">{project.name}</CardTitle>{workspace.canManage && <Button size="sm" variant="ghost" className="-mt-1 h-7" onClick={() => setProjectEditor({ project })} aria-label={`Edit project ${project.name}`}>Edit</Button>}</div><CardDescription>{project.departments.join(" · ") || CATEGORY_LABELS[project.category]}</CardDescription></CardHeader><CardContent className="space-y-4 px-5">{project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}<ProgressBar {...progress} /><div className="space-y-1 text-xs text-muted-foreground"><p>Project deadline: {formatDate(project.deadline)}{activeWork && project.deadline && project.deadline < osloDate() ? " · Overdue" : ""}</p><p>Last open task deadline: {formatDate(progress.lastDeadline)}</p>{progress.unscheduled > 0 && <p>{progress.unscheduled} open item{progress.unscheduled === 1 ? " has" : "s have"} no deadline</p>}{project.deadline && progress.lastDeadline && progress.lastDeadline > project.deadline && <p className="text-destructive">Tasks extend beyond the project deadline.</p>}</div><Button variant="outline" size="sm" onClick={() => { setProjectId(project.id); setStatus("all"); }}>View tasks</Button></CardContent></Card>;
    })}</div> : <p className="text-sm text-muted-foreground">No projects yet. Tasks can also belong directly to the season.</p>}</div>}
    {!personal && section === "overview" && departmentNames.length > 0 && <div className="space-y-3"><h2 className="text-lg font-medium">Department progress</h2><p className="text-sm text-muted-foreground">Each department includes all tasks from its projects. Shared projects appear in each participating department.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{departmentNames.map(name => { const ids = new Set(projects.filter(project => project.departments.includes(name)).map(project => project.id)); return <Card key={name} className="gap-3 py-4"><CardHeader className="px-5"><CardTitle className="text-sm font-medium">{name}</CardTitle></CardHeader><CardContent className="px-5"><ProgressBar {...summarize(scope.filter(task => task.projectId && ids.has(task.projectId)))} /></CardContent></Card>; })}</div></div>}
    <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">{category === "partnership-deliverables" ? "Deliverables" : "Tasks & milestones"} <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></h2><Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="tasks">List</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger></TabsList></Tabs></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_12rem_14rem]"><Input aria-label="Search tasks" placeholder={category === "partnership-deliverables" ? "Search deliverables or partners…" : "Search tasks…"} value={search} onChange={event => setSearch(event.target.value)} /><Choice ariaLabel="Filter tasks by status" id="task-status-filter" value={status} onChange={setStatus} options={[{ value: "open", label: "Open work" }, { value: "all", label: "All statuses" }, ...TASK_STATUSES.map(value => ({ value, label: value === "done" && category === "partnership-deliverables" ? "Delivered" : STATUS_LABELS[value] }))]} /><Choice ariaLabel="Filter tasks by project" id="task-project-filter" value={projectId} onChange={setProjectId} options={[{ value: "all", label: "All projects" }, ...projects.map(project => ({ value: project.id, label: project.name }))]} /></div>
      {filtered.length ? <div className="overflow-hidden rounded-xl border">{view === "timeline" ? <div className="p-4"><Timeline tasks={filtered} onOpen={task => setTaskEditor({ task })} /></div> : <TaskTable tasks={filtered} workspace={workspace} deliveries={category === "partnership-deliverables"} onOpen={task => setTaskEditor({ task })} />}</div> : <Empty className="min-h-56 border border-solid"><EmptyHeader><EmptyTitle>{scope.length ? "No matching tasks" : personal ? "No tasks assigned to you" : "No tasks yet"}</EmptyTitle><EmptyDescription>{scope.length ? "Try another search or status filter." : personal ? "Tasks appear here when a project manager assigns them to you." : "Add tasks to start tracking work in this area."}</EmptyDescription></EmptyHeader></Empty>}
      <p className="text-xs leading-relaxed text-muted-foreground">Completion uses recorded task status and excludes cancelled work and milestones. Milestones are tracked by status and deadline. {category === "partnership-deliverables" ? "This list contains recorded obligations for S27." : "Scheduled deadlines do not account for effort, dependencies, or team capacity."}</p>
    </div>
    {taskEditor && <TaskEditor key={taskEditor.task?.id ?? "new-task"} task={taskEditor.task} workspace={workspace} category={category ?? "production"} busy={busy} onSave={save} onClose={() => setTaskEditor(null)} />}
    {projectEditor && <ProjectEditor key={projectEditor.project?.id ?? "new-project"} project={projectEditor.project} category={category ?? "production"} busy={busy} onSave={save} onClose={() => setProjectEditor(null)} />}
  </section>;
}
