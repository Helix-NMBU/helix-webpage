import { canManageTask, canUpdateTaskStatus } from "./permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { TaskDetailSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { PropertyWidget } from "../MemberPlatform/PropertyWidget";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { projectRepository, ProjectRequestError } from "./repository";
import { CATEGORY_LABELS, TASK_PRIORITIES, type ProjectMutation, type ProjectRepository, type ProjectWorkspace, type TaskInput } from "./types";
import { TaskStatusControl } from "./TaskStatus";
import { TaskEditor } from "./TaskEditor";
import { AssigneeAvatars, AssigneePicker } from "./TaskAssignees";
import { PriorityIndicator, TargetDate } from "./MilestoneTableControls";
import { PriorityGlyph } from "./PriorityGlyph";
import { ProjectDatePicker } from "./ProjectDatePicker";
import { TaskMilestoneControl } from "./TaskBoard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Textarea } from "@libs/components/ui/textarea";
import { Label } from "@libs/components/ui/label";
import { formatDate, osloDate } from "./model";
import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { localTaskDealId } from "../PartnerDeals/local-fixture";

async function lookupTaskDeal(taskId: string, owner: { current: string | null }): Promise<string | null> {
  if (isLocalMemberMode()) return localTaskDealId(taskId);
  const token = await memberSessionToken(owner);
  const query = new URLSearchParams({ view: "taskDeal", taskId });
  const response = await fetch(`/api/partner-deals?${query}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const value = await response.json() as { dealId?: unknown };
  return typeof value.dealId === "string" && /^[0-9a-f-]{36}$/i.test(value.dealId) ? value.dealId : null;
}

export default function TaskDetailPage({ repository, loadPartnerDeal }: { repository?: ProjectRepository; loadPartnerDeal?: (taskId: string) => Promise<string | null> }) {
  const { taskId = "" } = useParams();
  return <TaskDetail key={taskId} taskId={taskId} repository={repository} loadPartnerDeal={loadPartnerDeal} />;
}

function TaskDetail({ taskId, repository: supplied, loadPartnerDeal }: { taskId: string; repository?: ProjectRepository; loadPartnerDeal?: (taskId: string) => Promise<string | null> }) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [partnerDealId, setPartnerDealId] = useState<string | null>(null);
  const dealOwner = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState<string[] | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimatedCreated, setEstimatedCreated] = useState("");
  const [estimatedCompleted, setEstimatedCompleted] = useState("");
  const [estimateBasis, setEstimateBasis] = useState("");
  const repository = useRef<Promise<ProjectRepository> | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const saving = useRef(false);
  const directory = useWorkspace();
  const ready = !directory || Boolean(directory.data);
  const access = !directory || Boolean(directory.data?.projectAccess);
  const notify = useNotify();
  const location = useLocation();
  const navigate = useNavigate();
  const getRepository = useCallback(() => repository.current ??= supplied ? Promise.resolve(supplied) : projectRepository(), [supplied]);
  const load = useCallback(async () => {
    if (!ready || saving.current) return;
    const current = ++generation.current;
    if (!access) { setWorkspace(null); setDenied(true); setLoading(false); setEditing(false); return; }
    setLoading(true);
    try {
      const next = await (await getRepository()).load();
      if (alive.current && current === generation.current) { setWorkspace(next); setDenied(false); }
    } catch (error) {
      if (!alive.current || current !== generation.current) return;
      const forbidden = error instanceof ProjectRequestError && [401, 403].includes(error.status);
      setWorkspace(null); setDenied(forbidden); setEditing(false);
      notify("Could not load task", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null,
        action: error instanceof ProjectRequestError && error.status === 401
          ? { label: "Sign in", onClick: () => navigate("/login") }
          : { label: "Try again", onClick: () => void load() },
      });
    } finally { if (alive.current && current === generation.current) setLoading(false); }
  }, [ready, access, getRepository, notify, navigate]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; generation.current++; };
  }, [load]);

  const visibleTask = access ? workspace?.tasks.find(item => item.id === taskId && item.kind === "task") : undefined;
  useEffect(() => {
    let active = true;
    setPartnerDealId(null);
    dealOwner.current = null;
    if (visibleTask) {
      const request = loadPartnerDeal ? loadPartnerDeal(taskId) : lookupTaskDeal(taskId, dealOwner);
      void request.then(dealId => { if (active) setPartnerDealId(dealId); }).catch(() => { if (active) setPartnerDealId(null); });
    }
    return () => { active = false; };
  }, [taskId, visibleTask?.id, workspace?.viewerId, access, loadPartnerDeal]);

  async function save(change: ProjectMutation) {
    if (saving.current || change.id !== taskId || !["save_task", "set_status", "delete_task", "estimate_history"].includes(change.action)) return false;
    saving.current = true; setBusy(true); generation.current++;
    try {
      const next = await (await getRepository()).mutate(change);
      if (!alive.current) return false;
      setWorkspace(next); setEditing(false); setEstimating(false);
      window.dispatchEvent(new Event("helix-workspace-updated"));
      if (change.action === "delete_task") {
        notify("Task deleted", "The task has been removed.", { variant: "success", href: null });
        navigate("/tasks", { replace: true });
        return true;
      }
      notify("Task saved", "Task details and project progress have been updated.", { variant: "success", href: null });
      return true;
    } catch (error) {
      if (!alive.current) return false;
      const forbidden = error instanceof ProjectRequestError && [401, 403].includes(error.status);
      if (forbidden) { setWorkspace(null); setDenied(true); setEditing(false); }
      notify("Could not save task", `${error instanceof Error ? error.message : "Please try again."}${forbidden ? "" : " Your input has been kept."}`, {
        variant: "error", href: null,
        action: error instanceof ProjectRequestError && error.status === 401
          ? { label: "Sign in", onClick: () => navigate("/login") }
          : { label: "Reload task", onClick: () => void load() },
      });
      return false;
    } finally { saving.current = false; if (alive.current) setBusy(false); }
  }

  if (loading && !workspace) return <TaskDetailSkeleton />;
  const task = visibleTask;
  if (!task || !workspace) return <Empty className="min-h-64"><EmptyHeader><EmptyTitle>{denied || !access ? "Task access required" : workspace ? "Task not found" : "Could not load task"}</EmptyTitle><EmptyDescription>{denied || !access ? "Ask a platform administrator for project access." : workspace ? "This task may have been removed or is no longer available to you." : "Try loading this task again."}</EmptyDescription></EmptyHeader><div className="flex gap-2"><Button variant="outline" asChild><Link to="/tasks">My tasks</Link></Button>{!denied && !workspace && <Button onClick={() => void load()}>Try again</Button>}</div></Empty>;
  const canLead = canManageTask(task, workspace);
  const canUpdate = canUpdateTaskStatus(task, workspace);
  const from = (location.state as { from?: unknown } | null)?.from;
  const personalOrigin = typeof from === "string" && /^\/tasks(?:\?|$)/.test(from);
  const project = workspace.projects.find(item => item.id === task.projectId);
  const milestone = workspace.tasks.find(item => item.kind === "milestone" && item.id === task.milestoneId && item.projectId === task.projectId);
  const members = directory?.data?.members ?? workspace.members;
  const saveProperties = (changes: Partial<TaskInput>) => save({ action: "save_task", id: task.id, expectedRevision: task.revision, task: { ...task, ...changes } });
  return <section aria-label="Task details" aria-busy={busy} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="grid min-w-0 flex-1 gap-6 md:min-h-0 md:grid-cols-[minmax(0,1fr)_18rem] md:overflow-hidden xl:grid-cols-[minmax(0,1fr)_21rem]">
      <article tabIndex={0} aria-label="Task content" className="min-w-0 space-y-7 px-2 pb-8 pt-4 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:px-6">
        <h1 className="max-w-4xl break-words text-2xl font-semibold tracking-tight">{canUpdate ? <button type="button" className="rounded text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Edit task details" onClick={() => setEditing(true)}>{task.title}</button> : task.title}</h1>
        <p className="max-w-4xl whitespace-pre-wrap break-words text-base leading-7 text-foreground/90">{task.description || "No description yet."}</p>
      </article>
      <aside tabIndex={0} aria-label="Task properties" className="min-w-0 space-y-3 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:pb-2 md:pr-2">
        <PropertyWidget title="Properties">
        <dl className="space-y-2 text-sm [&_dt]:text-muted-foreground [&_dd]:min-w-0 [&_dd]:break-words [&_dd>div]:max-w-full">
          <div><dt className="sr-only">Status</dt><dd><TaskStatusControl task={task} workspace={workspace} busy={busy} showLabel onSave={(task, status, blockedReason) => save({ action: "set_status", id: task.id, expectedRevision: task.revision, status, blockedReason })} /></dd></div>
          <div><dt className="sr-only">Priority</dt><dd>{canLead ? <Select value={task.priority} disabled={busy} onValueChange={priority => void saveProperties({ priority: priority as TaskInput["priority"] })}>
            <SelectTrigger aria-label="Task priority" className="-mx-2 h-8 w-auto gap-2 border-transparent bg-transparent px-2 shadow-none hover:bg-muted focus-visible:bg-muted dark:bg-transparent dark:hover:bg-muted [&>svg:last-child]:opacity-0"><PriorityIndicator priority={task.priority} /><SelectValue>{task.priority === "normal" ? "Medium" : task.priority[0].toUpperCase() + task.priority.slice(1)}</SelectValue></SelectTrigger>
            <SelectContent position="popper" align="start">{TASK_PRIORITIES.map(priority => <SelectItem key={priority} value={priority}><span className="flex items-center gap-2"><PriorityGlyph priority={priority} />{priority === "normal" ? "Medium" : priority[0].toUpperCase() + priority.slice(1)}</span></SelectItem>)}</SelectContent>
          </Select> : <span className="inline-flex items-center gap-2"><PriorityIndicator priority={task.priority} />{task.priority === "normal" ? "Medium" : task.priority[0].toUpperCase() + task.priority.slice(1)}</span>}</dd></div>
          <div><dt className="sr-only">Assignees</dt><dd>{canLead ? <div className="min-w-0 [&>button]:max-w-full [&>button]:overflow-hidden"><AssigneePicker id={`task-detail-assignees-${task.id}`} members={members} value={assigneeDraft ?? task.assigneeIds} onChange={setAssigneeDraft} disabled={busy} inline triggerLabel="Edit task assignees" onOpenChange={open => setAssigneeDraft(open ? task.assigneeIds : null)} onCommit={assigneeIds => saveProperties({ assigneeIds })} /></div> : <AssigneeAvatars assigneeIds={task.assigneeIds} members={members} showNames />}</dd></div>
        </dl>
        </PropertyWidget>
        <PropertyWidget title="Project">
          {project ? <div className="space-y-1 text-sm">
            <Link to={`/projects/${project.id}`} className="inline-flex max-w-full items-center gap-2 rounded px-1 py-1 hover:bg-muted"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{project.name}</span></Link>
            <div className="ml-2 border-l pl-4">{canLead ? <TaskMilestoneControl task={task} workspace={workspace} busy={busy} property onSave={(_task, changes) => saveProperties(changes)} /> : milestone ? <Link to={`/projects/${project.id}?milestone=${encodeURIComponent(milestone.id)}`} className="inline-flex items-center gap-2 rounded px-1 py-1 hover:bg-muted"><IconDiamonds aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />{milestone.title}</Link> : <span className="text-muted-foreground">No milestone</span>}</div>
          </div> : <p className="text-sm text-muted-foreground">Needs organization</p>}
        </PropertyWidget>
        <PropertyWidget title="Details">
        <dl className="space-y-4 text-sm [&>div]:grid [&>div]:grid-cols-[5.5rem_minmax(0,1fr)] [&>div]:items-start [&>div]:gap-3 [&_dt]:text-muted-foreground [&_dd]:min-w-0 [&_dd]:break-words">
          <div><dt>Start date</dt><dd>{canLead ? <ProjectDatePicker id={`task-start-${task.id}`} label="Set task start date" value={task.startDate} maximum={task.deadline ?? "2100-12-31"} disabled={busy} inline onChange={startDate => void saveProperties({ startDate })} /> : task.startDate ? <TargetDate deadline={task.startDate} /> : <span className="text-muted-foreground">Not set</span>}</dd></div>
          <div><dt>Target date</dt><dd>{canLead ? <ProjectDatePicker id={`task-deadline-${task.id}`} label="Set task target date" value={task.deadline} minimum={task.startDate ?? "2000-01-01"} disabled={busy} inline onChange={deadline => void saveProperties({ deadline })} /> : <TargetDate deadline={task.deadline} />}</dd></div>
          {task.historicalEstimate && <div><dt>Estimated historical dates</dt><dd>Created {formatDate(task.historicalEstimate.createdDate)} · Completed {formatDate(task.historicalEstimate.completedDate)}<p className="mt-2 whitespace-pre-wrap">{task.historicalEstimate.basis}</p></dd></div>}
          <div><dt>Department</dt><dd>{project?.departments.join(", ") || "No department"}</dd></div>
          <div><dt>Area</dt><dd>{CATEGORY_LABELS[task.category]}</dd></div>
          <div><dt>Season</dt><dd>{task.season}</dd></div>
          {task.partnerName && <div><dt>Sponsor or partner</dt><dd>{task.partnerName}</dd></div>}
          {partnerDealId && <div><dt>Agreement</dt><dd><Link to={`/partner-deals?deal=${encodeURIComponent(partnerDealId)}`} className="underline">View partner agreement</Link></dd></div>}
          {task.blockedReason && <div><dt>Blocked reason</dt><dd className="whitespace-pre-wrap">{task.blockedReason}</dd></div>}
        </dl>
        </PropertyWidget>
      </aside>
    </div>
    {canLead && <div className="px-2 pb-4"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setEstimatedCreated(task.historicalEstimate?.createdDate ?? ""); setEstimatedCompleted(task.historicalEstimate?.completedDate ?? ""); setEstimateBasis(task.historicalEstimate?.basis ?? ""); setEstimating(true); }}>Set estimated historical dates</Button></div>}
    {estimating && <Dialog open onOpenChange={open => { if (!open && !busy) setEstimating(false); }}><DialogContent><DialogHeader><DialogTitle>Estimated historical dates</DialogTitle><DialogDescription>Use estimates for work completed before it was recorded. The original event history remains unchanged. Saving marks this task done and displays estimates in progress.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); void save({ action: "estimate_history", id: task.id, expectedRevision: task.revision, createdDate: estimatedCreated, completedDate: estimatedCompleted, basis: estimateBasis }); }}><div className="space-y-2"><Label htmlFor="estimated-created">Estimated creation date</Label><Input id="estimated-created" type="date" required min="2000-01-01" max={estimatedCompleted || osloDate()} value={estimatedCreated} onChange={event => setEstimatedCreated(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="estimated-completed">Estimated completion date</Label><Input id="estimated-completed" type="date" required min={estimatedCreated || "2000-01-01"} max={osloDate()} value={estimatedCompleted} onChange={event => setEstimatedCompleted(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="estimate-basis">Basis for estimate</Label><Textarea id="estimate-basis" required maxLength={1000} value={estimateBasis} onChange={event => setEstimateBasis(event.target.value)} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setEstimating(false)}>Cancel</Button><Button type="submit" disabled={busy}>Save estimates</Button></DialogFooter></form></DialogContent></Dialog>}
    {editing && canUpdate && <TaskEditor key={`${task.id}-${task.revision}`} task={task} workspace={{ ...workspace, members }} category={task.category} statusOnly={personalOrigin} busy={busy} onSave={save} onClose={() => setEditing(false)} />}
  </section>;
}
