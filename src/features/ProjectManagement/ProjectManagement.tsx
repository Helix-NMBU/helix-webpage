import { useCallback, useEffect, useRef, useState } from "react";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { CATEGORY_LABELS, STATUS_LABELS, TASK_CATEGORIES, TASK_STATUSES, type Project, type ProjectDepartment, type ProjectMutation, type ProjectRepository, type ProjectWorkspace, type Task, type TaskCategory } from "./types";
import { addDays, formatDate, isOpen, osloDate, summarize, taskUrgency, validateMilestoneChanges } from "./model";
import { projectRepository, ProjectRequestError } from "./repository";
import { Choice, ProjectEditor, TaskEditor } from "./TaskEditor";
import { TaskStatusControl, type SaveTaskStatus } from "./TaskStatus";
import { PersonalTasks } from "./PersonalTasks";
import { AssigneeAvatars } from "./TaskAssignees";
import { TaskComposer } from "./TaskComposer";
import { isOrganized } from "./hierarchy";
import { milestoneProgress } from "./progress";
import { ProgressRing } from "./ProgressRing";
import { ProjectMilestones } from "./ProjectMilestones";
import { DepartmentEditor } from "./DepartmentEditor";
import { OverviewProgress } from "./OverviewProgress";
import { OverviewColumnMenu, OVERVIEW_MILESTONE_COLUMNS, OVERVIEW_PROJECT_COLUMNS, overviewColumns } from "./OverviewColumnMenu";
import { MilestonePriorityControl, MilestoneLeadsControl, MilestoneDateControl, PriorityIndicator, TargetDate, type SaveMilestone, type MilestoneChanges } from "./MilestoneTableControls";

export const PROJECT_SECTIONS = [{ id: "overview", title: "Overview" }, ...TASK_CATEGORIES.map(id => ({ id, title: CATEGORY_LABELS[id] }))];

function ProgressBar({ done, total, percent, label = "Task completion" }: { done: number; total: number; percent: number; label?: string }) {
  return <div className="space-y-2"><div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{done} of {total} tasks complete</span><span className="font-medium tabular-nums">{percent}%</span></div><div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>;
}

function WorkItemStatus({ task, workspace, deliveries = false }: { task: Task; workspace: ProjectWorkspace; deliveries?: boolean }) {
  if (task.kind === "milestone") return <ProgressRing {...milestoneProgress(workspace.tasks, task.id)} label={task.title} showTotal={false} />;
  return <Badge variant={task.status === "blocked" ? "destructive" : task.status === "done" ? "default" : "secondary"}>{deliveries && task.status === "done" ? "Delivered" : STATUS_LABELS[task.status]}</Badge>;
}

function TaskTable({ tasks, workspace, deliveries = false, milestonesOnly = false, milestoneColumns = [], busy = false, onSaveMilestone, onStatusChange, onOpen, onOrganize }: { tasks: Task[]; workspace: ProjectWorkspace; deliveries?: boolean; milestonesOnly?: boolean; milestoneColumns?: string[]; busy?: boolean; onSaveMilestone?: SaveMilestone; onStatusChange?: SaveTaskStatus; onOpen: (task: Task) => void; onOrganize: (task: Task) => void }) {
  const today = osloDate();
  const milestoneColumn = (key: string) => milestoneColumns.includes(key);
  return <Table><TableHeader><TableRow><TableHead className="min-w-64">{milestonesOnly ? "Milestone" : "Task"}</TableHead>{milestonesOnly ? <>{milestoneColumn("department") && <TableHead>Project</TableHead>}{milestoneColumn("priority") && <TableHead>Priority</TableHead>}{milestoneColumn("leads") && <TableHead>Leads</TableHead>}{milestoneColumn("deadline") && <TableHead aria-sort="ascending">Target date</TableHead>}{milestoneColumn("tasks") && <TableHead>Tasks</TableHead>}{milestoneColumn("status") && <TableHead>Status</TableHead>}</> : <>{deliveries && <TableHead>Partner</TableHead>}<TableHead>Priority</TableHead><TableHead>Leads / Assignees</TableHead><TableHead aria-sort="ascending">Target date</TableHead><TableHead>Tasks</TableHead><TableHead>Status</TableHead></>}</TableRow></TableHeader>
    <TableBody>{tasks.map(task => { const progress = task.kind === "milestone" ? milestoneProgress(workspace.tasks, task.id) : null; const project = workspace.projects.find(item => item.id === task.projectId); const editable = milestonesOnly && !!onSaveMilestone && workspace.taskLeadCategories.includes(task.category); return <TableRow key={`${task.id}-${task.revision}`}>
      <TableCell className="max-w-md whitespace-normal py-4"><button className="inline-flex items-center gap-2 text-left font-medium underline-offset-4 hover:underline focus-visible:underline" onClick={() => onOpen(task)}>{task.kind === "milestone" && <IconDiamonds className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}{task.title}</button>{!milestonesOnly && <><div className="mt-1 text-xs text-muted-foreground">{!milestonesOnly && task.kind === "milestone" ? "Milestone · " : ""}{workspace.projects.find(project => project.id === task.projectId)?.name ?? CATEGORY_LABELS[task.category]}{task.kind === "task" && task.milestoneId && ` · ${workspace.tasks.find(item => item.id === task.milestoneId)?.title ?? "Milestone"}`}</div>{!isOrganized(task, workspace) && <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Needs organization</span>{workspace.taskLeadCategories.includes(task.category) && <button type="button" className="underline underline-offset-4" aria-label={`Organize ${task.title}`} onClick={() => onOrganize(task)}>Organize</button>}</div>}{task.status === "blocked" && task.blockedReason && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{task.blockedReason}</p>}</>}</TableCell>
      {milestonesOnly && milestoneColumn("department") && <TableCell className="max-w-48"><span className="inline-flex max-w-full items-center gap-2 text-muted-foreground" title={project?.name}>{project && <IconCube aria-hidden="true" className="size-4 shrink-0" />}<span className="truncate">{project?.name ?? "—"}</span></span></TableCell>}
      {deliveries && <TableCell>{task.partnerName}</TableCell>}
      {(!milestonesOnly || milestoneColumn("priority")) && <TableCell className="capitalize">{editable ? <MilestonePriorityControl task={task} busy={busy} onSave={onSaveMilestone!} /> : milestonesOnly ? <PriorityIndicator priority={task.priority} /> : task.priority}</TableCell>}
      {(!milestonesOnly || milestoneColumn("leads")) && <TableCell>{editable ? <MilestoneLeadsControl task={task} members={workspace.members} busy={busy} onSave={onSaveMilestone!} /> : <AssigneeAvatars assigneeIds={task.assigneeIds} members={workspace.members} assignmentRole={task.kind === "milestone" ? "lead" : "assignee"} showNames={!milestonesOnly} />}</TableCell>}
      {(!milestonesOnly || milestoneColumn("deadline")) && <TableCell className="whitespace-nowrap">{editable ? <MilestoneDateControl task={task} busy={busy} onSave={onSaveMilestone!} /> : milestonesOnly ? <TargetDate deadline={task.deadline} /> : <><span className={taskUrgency(task, today) === "overdue" ? "text-[oklch(0.577_0.245_27.325)] dark:text-[#D18A8A]" : ""}>{formatDate(task.deadline)}</span>{taskUrgency(task, today) && <div className="mt-1 text-xs text-muted-foreground">{taskUrgency(task, today) === "overdue" ? "Overdue" : "Due within 7 days"}</div>}</>}</TableCell>}
      {(!milestonesOnly || milestoneColumn("tasks")) && <TableCell className="tabular-nums">{progress ? <span aria-label={`${progress.done} of ${progress.total} tasks complete`}>{progress.done} / {progress.total}</span> : <span className="text-muted-foreground">—</span>}</TableCell>}
      {(!milestonesOnly || milestoneColumn("status")) && <TableCell>{task.kind === "task" && onStatusChange ? <TaskStatusControl task={task} workspace={workspace} busy={busy} onSave={onStatusChange} showLabel /> : <WorkItemStatus task={task} workspace={workspace} deliveries={deliveries} />}</TableCell>}
    </TableRow>; })}</TableBody></Table>;
}

function OrganizationQueue({ workspace, onOpen, onOrganize, onClose }: { workspace: ProjectWorkspace; onOpen: (task: Task) => void; onOrganize: (task: Task) => void; onClose: () => void }) {
  const tasks = workspace.tasks.filter(task => !isOrganized(task, workspace));
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Needs organization</DialogTitle><DialogDescription>Work waiting for a project or milestone. Department Leads can place items in their work areas.</DialogDescription></DialogHeader>{tasks.length ? <ul className="divide-y">{tasks.map(task => <li key={task.id} className="flex items-center justify-between gap-3 py-3"><div><button className="text-left text-sm font-medium hover:underline" onClick={() => onOpen(task)}>{task.title}</button><p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[task.category]} · {task.kind === "milestone" ? "Milestone" : "Task"}</p></div>{workspace.taskLeadCategories.includes(task.category) && <Button variant="outline" size="sm" aria-label={`Organize ${task.title}`} onClick={() => onOrganize(task)}>Organize</Button>}</li>)}</ul> : <p className="text-sm text-muted-foreground">All work is organized.</p>}</DialogContent></Dialog>;
}

function Timeline({ tasks, workspace, onOpen }: { tasks: Task[]; workspace: ProjectWorkspace; onOpen: (task: Task) => void }) {
  const dated = tasks.filter(task => task.deadline && task.status !== "cancelled").sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.title.localeCompare(b.title));
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Scheduled dates come from task deadlines. Undated work is excluded from this timeline.</p>{dated.length ? <Table><TableHeader><TableRow><TableHead>Work item</TableHead><TableHead>Start</TableHead><TableHead>Deadline</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{dated.map(task => <TableRow key={task.id}><TableCell className="min-w-56"><button className="text-left font-medium hover:underline" onClick={() => onOpen(task)}>{task.title}</button>{task.kind === "milestone" && <div className="mt-1 text-xs text-muted-foreground">Milestone</div>}</TableCell><TableCell className="whitespace-nowrap">{task.startDate ? formatDate(task.startDate) : "Not set"}</TableCell><TableCell className="whitespace-nowrap">{formatDate(task.deadline)}</TableCell><TableCell><WorkItemStatus task={task} workspace={workspace} /></TableCell></TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyTitle>No scheduled tasks</EmptyTitle><EmptyDescription>Add task deadlines to build the timeline.</EmptyDescription></EmptyHeader></Empty>}</div>;
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
  const [departmentEditor, setDepartmentEditor] = useState<ProjectDepartment | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"task" | "milestone">("task");
  const [milestoneId, setMilestoneId] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProject = searchParams.get("project");
  const requestedCreation = searchParams.get("create");
  const requestedOrganization = searchParams.get("organize");
  const projectColumns = overviewColumns(searchParams, "overviewProjectColumns", OVERVIEW_PROJECT_COLUMNS);
  const milestoneColumns = overviewColumns(searchParams, "overviewMilestoneColumns", OVERVIEW_MILESTONE_COLUMNS);
  const workItems = useRef<HTMLDivElement>(null);
  const repository = useRef<Promise<ProjectRepository> | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const directory = useWorkspace()?.data;
  const notify = useNotify();
  const navigate = useNavigate();
  const location = useLocation();
  function toggleOverviewColumn(param: string, key: string, columns: readonly (readonly [string, string])[]) {
    setSearchParams(current => {
      const nextParams = new URLSearchParams(current);
      const selected = overviewColumns(nextParams, param, columns);
      const next = selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
      if (next.length === columns.length) nextParams.delete(param);
      else nextParams.set(param, next.join(","));
      return nextParams;
    });
  }
  const openTask = (task: Task) => task.kind === "task" ? navigate(`/tasks/${task.id}`, { state: { from: `${location.pathname}${location.search}` } }) : setTaskEditor({ task });
  const getRepository = useCallback(() => repository.current ??= supplied ? Promise.resolve(supplied) : projectRepository(), [supplied]);
  const report = useCallback((error: unknown, retry: () => void) => {
    const denied = error instanceof ProjectRequestError && (error.status === 401 || error.status === 403);
    if (denied) setWorkspace(null);
    notify(denied ? "Project access unavailable" : personal ? "Could not load tasks" : "Could not load season overview", error instanceof Error ? error.message : "Please try again.", { id: "project-management-load", variant: "error", href: null, action: error instanceof ProjectRequestError && error.status === 401 ? { label: "Sign in", onClick: () => navigate("/login") } : { label: "Try again", onClick: retry } });
  }, [navigate, notify]);
  const load = useCallback(async () => {
    if (saving.current) return;
    const request = ++generation.current;
    setLoading(true);
    try { const next = await (await getRepository()).load(); if (active.current && request === generation.current) setWorkspace(next); }
    catch (error) { if (active.current && request === generation.current) report(error, () => void load()); }
    finally { if (active.current && request === generation.current) setLoading(false); }
  }, [getRepository, report]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; generation.current++; }; }, [load, section, personal]);
  useEffect(() => { setSearch(""); setStatus(personal || section === "partnership-deliverables" ? "all" : "open"); setProjectId("all"); setMilestoneId("all"); setView("tasks"); setTaskEditor(null); setProjectEditor(null); setDepartmentEditor(null); setComposerOpen(false); setOrganizationOpen(false); }, [section, personal]);
  useEffect(() => {
    if (!requestedProject || !category || !workspace) return;
    if (workspace.projects.some(project => project.id === requestedProject && project.category === category)) { setProjectId(requestedProject); setMilestoneId("all"); setStatus("all"); setSearch(""); setView("tasks"); workItems.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("project"); return next; }, { replace: true });
  }, [requestedProject, category, workspace, setSearchParams]);
  useEffect(() => {
    if (requestedCreation !== "milestone" || !category || !workspace) return;
    if (workspace.taskLeadCategories.includes(category)) { setComposerKind("milestone"); setComposerOpen(true); }
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("create"); return next; }, { replace: true });
  }, [requestedCreation, category, workspace, setSearchParams]);
  useEffect(() => {
    if (!requestedOrganization || !category || !workspace) return;
    const task = workspace.tasks.find(item => item.id === requestedOrganization && item.category === category);
    if (task && workspace.taskLeadCategories.includes(category)) setTaskEditor({ task });
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("organize"); return next; }, { replace: true });
  }, [requestedOrganization, category, workspace, setSearchParams]);
  async function save(mutation: ProjectMutation): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    generation.current++;
    setLoading(false);
    try {
      const next = await (await getRepository()).mutate(mutation);
      if (!active.current) return false;
      setWorkspace(next); window.dispatchEvent(new Event("helix-workspace-updated")); setTaskEditor(null); setProjectEditor(null); setDepartmentEditor(null);
      notify(mutation.action === "save_department" ? "Department saved" : mutation.action === "save_project" ? "Project saved" : "Task saved", mutation.action === "save_department" ? "Members and department Lead have been updated." : mutation.action === "save_project" ? "The project is ready to manage." : "Progress and assignments have been updated.", { variant: "success", href: null });
      return true;
    } catch (error) {
      if (!active.current) return false;
      const denied = error instanceof ProjectRequestError && [401, 403].includes(error.status);
      const expired = error instanceof ProjectRequestError && error.status === 401;
      if (denied) { setWorkspace(null); setTaskEditor(null); setProjectEditor(null); setDepartmentEditor(null); setComposerOpen(false); }
      notify(expired ? "Sign-in required" : "Could not save changes", `${error instanceof Error ? error.message : "Please try again."}${denied ? "" : " Your input has been kept."}`, { id: "project-management-save", variant: "error", href: null, action: expired ? { label: "Sign in", onClick: () => navigate("/login") } : { label: mutation.action === "save_department" ? "Reload departments" : "Reload tasks", onClick: () => void load() } });
      return false;
    } finally { saving.current = false; if (active.current) setBusy(false); }
  }
  async function updateMilestone(task: Task, changes: MilestoneChanges): Promise<boolean> {
    if (!workspace || task.kind !== "milestone" || !workspace.taskLeadCategories.includes(task.category)) return false;
    try { return await save({ action: "update_milestone", id: task.id, expectedRevision: task.revision, changes: validateMilestoneChanges(changes) }); }
    catch (error) { notify("Could not update milestone", error instanceof Error ? error.message : "Check the milestone details and try again.", { variant: "error", href: null }); return false; }
  }
  const changeStatus: SaveTaskStatus = (task, status, blockedReason) => save({ action: "set_status", id: task.id, expectedRevision: task.revision, status, blockedReason });
  if (!valid) return <Navigate to="/season-overview" replace />;
  if (!workspace) return loading ? <div role="status" aria-label={personal ? "Loading tasks" : "Loading Season Overview"} className="space-y-6 py-8"><Skeleton className="h-10 w-64" /><div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28" />)}</div><Skeleton className="h-80 w-full" /></div> : <div className="py-8"><Button variant="outline" onClick={() => void load()}>Try again</Button></div>;
  const scope = workspace.tasks.filter(task => personal ? task.assigneeIds.includes(workspace.viewerId) : !category || task.category === category);
  const projects = workspace.projects.filter(project => !category || project.category === category);
  const stats = summarize(scope);
  const today = osloDate();
  const upcomingMilestones = scope.filter(task => task.kind === "milestone" && isOpen(task) && task.deadline && task.deadline >= today && task.deadline <= addDays(today, 30)).sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.title.localeCompare(b.title));
  const title = personal ? "My tasks" : category ? CATEGORY_LABELS[category] : `${workspace.season} Overview`;
  const descriptions: Record<string, string> = { overview: "A shared view of the season, its progress, and the work ahead.", production: "From design to assembly. Track production work and upcoming milestones.", "partnership-deliverables": "Track recorded commitments to this season's sponsors and partners.", marketing: "Plan campaigns, content, and the Helix story.", operations: "Competition deadlines and the work that keeps the team running." };
  const filtered = scope.filter(task => (status === "all" || (status === "open" ? isOpen(task) : task.status === status)) && (projectId === "all" || task.projectId === projectId) && (milestoneId === "all" || (milestoneId === "unorganized" ? !isOrganized(task, workspace) : task.kind === "task" && task.milestoneId === milestoneId)) && (!search || [task.title, task.description, task.partnerName, workspace.members.filter(member => task.assigneeIds.includes(member.id)).map(member => member.name).join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()))).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.title.localeCompare(b.title));
  if (personal) return <>
    <PersonalTasks workspace={workspace} busy={busy} loading={loading} onRefresh={() => void load()} onOpen={openTask} onStatusChange={changeStatus} />
    {taskEditor?.task && <TaskEditor key={taskEditor.task.id} task={taskEditor.task} workspace={workspace} category={taskEditor.task.category} statusOnly busy={busy} onSave={save} onClose={() => setTaskEditor(null)} />}
  </>;
  return <section className="mx-auto w-full max-w-7xl space-y-10 py-6" aria-labelledby="project-page-title" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2">{category && <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{workspace.season} · Project management</p>}<h1 id="project-page-title" className="text-3xl font-medium tracking-tight">{title}</h1><p className="max-w-2xl text-sm text-muted-foreground">{descriptions[section]}</p></div><div className="flex flex-wrap gap-2">{category && <Button variant="outline" disabled={loading || busy} onClick={() => void load()}>Refresh</Button>}{category && workspace.canManage && <Button variant="outline" disabled={busy} onClick={() => setProjectEditor({ project: null })}>New project</Button>}{category && workspace.taskLeadCategories.includes(category) && <Button disabled={busy || loading} onClick={() => { setComposerKind("task"); setComposerOpen(true); }}>New task</Button>}{category && workspace.taskLeadCategories.includes(category) && <Button variant="outline" disabled={busy || loading} onClick={() => { setComposerKind("milestone"); setComposerOpen(true); }}>New milestone</Button>}</div></div>
    {!category && <OverviewProgress workspace={directory ? { ...workspace, members: directory.members } : workspace} busy={busy || loading} projectColumns={projectColumns} onToggleProjectColumn={key => toggleOverviewColumn("overviewProjectColumns", key, OVERVIEW_PROJECT_COLUMNS)} onSelectProject={id => navigate(`/projects/${id}`)} onEditDepartment={setDepartmentEditor} />}
    {category && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Task completion", value: `${stats.percent}%`, detail: `${stats.done} of ${stats.total} tasks complete` }, { label: "Overdue", value: stats.overdue, detail: "Open tasks and milestones past deadline" }, { label: "Due within 7 days", value: stats.upcoming, detail: "Including today's deadlines" }, { label: "Blocked", value: stats.blocked, detail: "Work that needs a next step" }].map(item => <Card key={item.label} className="gap-3 py-5"><CardHeader className="px-5"><CardDescription>{item.label}</CardDescription><CardTitle className="text-3xl font-medium tabular-nums">{item.value}</CardTitle></CardHeader><CardContent className="px-5 text-xs text-muted-foreground">{item.detail}</CardContent></Card>)}</div>}
    {category && <p className="text-sm text-muted-foreground">{scope.some(isOpen) ? <>Latest open task or milestone deadline: {formatDate(stats.lastDeadline)}. {stats.unscheduled > 0 ? `${stats.unscheduled} open item${stats.unscheduled === 1 ? " has" : "s have"} no deadline.` : "All open work has a deadline."}</> : "No open tasks or milestones."}</p>}
    {category === "partnership-deliverables" && <PartnerDeliverables tasks={scope} onSelect={partner => { setSearch(partner); setStatus("all"); setProjectId("all"); }} />}
    {category && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Projects in {workspace.season}</h2><span className="text-sm text-muted-foreground">{projects.length} in {workspace.season}</span></div>{projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => {
      const projectTasks = scope.filter(task => task.projectId === project.id);
      const progress = summarize(projectTasks);
      const activeWork = projectTasks.some(isOpen);
      return <Card key={project.id} className="gap-4 py-5"><CardHeader className="px-5"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base font-medium">{project.name}</CardTitle>{workspace.canManage && <Button size="sm" variant="ghost" className="-mt-1 h-7" onClick={() => setProjectEditor({ project })} aria-label={`Edit project ${project.name}`}>Edit</Button>}</div><CardDescription>{project.departments.join(" · ") || CATEGORY_LABELS[project.category]}</CardDescription></CardHeader><CardContent className="space-y-4 px-5">{project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}<ProgressBar {...progress} /><ProjectMilestones busy={busy || loading} onStatusChange={changeStatus} project={project} workspace={workspace} onOpen={openTask} onSelect={id => { setMilestoneId(id); setProjectId(project.id); setStatus("all"); setSearch(""); setView("tasks"); workItems.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }} /><div className="space-y-1 text-xs text-muted-foreground"><p>Project deadline: {formatDate(project.deadline)}{activeWork && project.deadline && project.deadline < osloDate() ? " · Overdue" : ""}</p><p>Last open task deadline: {formatDate(progress.lastDeadline)}</p>{progress.unscheduled > 0 && <p>{progress.unscheduled} open item{progress.unscheduled === 1 ? " has" : "s have"} no deadline</p>}{project.deadline && progress.lastDeadline && progress.lastDeadline > project.deadline && <p className="text-destructive">Tasks extend beyond the project deadline.</p>}</div><Button variant="outline" size="sm" onClick={() => { setProjectId(project.id); setMilestoneId("all"); setStatus("all"); }}>View tasks</Button></CardContent></Card>;
    })}</div> : <p className="text-sm text-muted-foreground">No projects yet. A project and milestone are needed before adding tasks.</p>}</div>}
    {!category && <div ref={workItems} role="region" aria-labelledby="upcoming-milestones-title" className="space-y-3"><div className="flex items-center justify-between gap-4"><div><h2 id="upcoming-milestones-title" className="text-base font-medium">Upcoming Milestones <span className="ml-1 text-sm font-normal text-muted-foreground">{upcomingMilestones.length}</span></h2><p className="mt-1 text-sm text-muted-foreground">Open milestones due in the next 30 days, nearest deadline first.</p></div><OverviewColumnMenu label="Upcoming Milestones" columns={OVERVIEW_MILESTONE_COLUMNS} visible={milestoneColumns} onToggle={key => toggleOverviewColumn("overviewMilestoneColumns", key, OVERVIEW_MILESTONE_COLUMNS)} /></div><Card className="gap-0 py-0"><CardContent className="overflow-x-auto px-0">{upcomingMilestones.length ? <TaskTable onStatusChange={changeStatus} tasks={upcomingMilestones} workspace={workspace} milestonesOnly milestoneColumns={milestoneColumns} busy={busy || loading} onSaveMilestone={updateMilestone} onOpen={openTask} onOrganize={task => setTaskEditor({ task })} /> : <Empty className="min-h-36"><EmptyHeader><EmptyTitle>No upcoming milestones</EmptyTitle><EmptyDescription>Open milestones with a target date in the next 30 days will appear here.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>}
    {category && <div ref={workItems} className="scroll-mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-medium">{category === "partnership-deliverables" ? "Deliverables" : "Tasks & milestones"} <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></h2><p className="mt-1 text-xs text-muted-foreground">Nearest deadline first · Undated work last</p></div><Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="tasks">List</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger></TabsList></Tabs></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_11rem_12rem_12rem]"><Input aria-label="Search tasks" placeholder={category === "partnership-deliverables" ? "Search deliverables or partners…" : "Search tasks…"} value={search} onChange={event => setSearch(event.target.value)} /><Choice ariaLabel="Filter tasks by status" id="task-status-filter" value={status} onChange={setStatus} options={[{ value: "open", label: "Open work" }, { value: "all", label: "All statuses" }, ...TASK_STATUSES.map(value => ({ value, label: value === "done" && category === "partnership-deliverables" ? "Delivered" : STATUS_LABELS[value] }))]} /><Choice ariaLabel="Filter tasks by project" id="task-project-filter" value={projectId} onChange={setProjectId} options={[{ value: "all", label: "All projects" }, ...projects.map(project => ({ value: project.id, label: project.name }))]} /><Choice ariaLabel="Filter tasks by milestone" id="task-milestone-filter" value={milestoneId} onChange={value => { setMilestoneId(value); if (value !== "all") setStatus("all"); }} options={[{ value: "all", label: "All milestones" }, { value: "unorganized", label: "Needs organization" }, ...scope.filter(task => task.kind === "milestone" && isOrganized(task, workspace)).map(task => ({ value: task.id, label: task.title }))]} /></div>
      {filtered.length ? <div className="overflow-hidden rounded-xl border">{view === "timeline" ? <div className="p-4"><Timeline tasks={filtered} workspace={workspace} onOpen={openTask} /></div> : <TaskTable busy={busy || loading} onStatusChange={changeStatus} tasks={filtered} workspace={workspace} deliveries={category === "partnership-deliverables"} onOpen={openTask} onOrganize={task => setTaskEditor({ task })} />}</div> : <Empty className="min-h-56 border border-solid"><EmptyHeader><EmptyTitle>{scope.length ? "No matching tasks" : personal ? "No tasks assigned to you" : "No tasks yet"}</EmptyTitle><EmptyDescription>{scope.length ? "Try another search or status filter." : personal ? "Tasks appear here when a project manager assigns them to you." : "A project and milestone are needed before adding tasks."}</EmptyDescription></EmptyHeader></Empty>}
      <p className="text-xs leading-relaxed text-muted-foreground">Completion uses recorded task status and excludes cancelled work and milestones. Milestone progress uses completed linked tasks; milestone status and deadline are tracked separately. {category === "partnership-deliverables" ? "This list contains recorded obligations for S27." : "Scheduled deadlines do not account for effort, dependencies, or team capacity."}</p>
    </div>}
    {organizationOpen && <OrganizationQueue workspace={workspace} onClose={() => setOrganizationOpen(false)} onOpen={task => { setOrganizationOpen(false); openTask(task); }} onOrganize={task => { setOrganizationOpen(false); setTaskEditor({ task }); }} />}
    {departmentEditor && <DepartmentEditor key={departmentEditor.id} department={departmentEditor} workspace={directory ? { ...workspace, members: directory.members } : workspace} busy={busy} onSave={save} onClose={() => setDepartmentEditor(null)} />}
    {taskEditor && <TaskEditor key={taskEditor.task?.id ?? "new-task"} task={taskEditor.task} workspace={workspace} category={category ?? "production"} statusOnly={!category} busy={busy} onSave={save} onClose={() => setTaskEditor(null)} />}
    {projectEditor && <ProjectEditor taskLeadCategories={workspace.taskLeadCategories} members={workspace.members} key={projectEditor.project?.id ?? "new-project"} project={projectEditor.project} category={category ?? "production"} busy={busy} onSave={save} onClose={() => setProjectEditor(null)} />}
    {composerOpen && category && workspace.taskLeadCategories.includes(category) && <TaskComposer key={`${category}-${composerKind}`} initialKind={composerKind} workspace={workspace} category={category} projectId={projects.some(project => project.id === projectId) ? projectId : null} busy={busy} onSave={save} onClose={() => setComposerOpen(false)} />}
  </section>;
}
