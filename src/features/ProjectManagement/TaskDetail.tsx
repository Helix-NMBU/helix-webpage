import { DeleteWorkButton } from "./DeleteWorkButton";
import { canManageTask, canUpdateTaskStatus } from "./permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { TaskDetailSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { projectRepository, ProjectRequestError } from "./repository";
import { CATEGORY_LABELS, type ProjectMutation, type ProjectRepository, type ProjectWorkspace } from "./types";
import { TaskStatusControl } from "./TaskStatus";
import { TaskEditor } from "./TaskEditor";
import { AssigneeAvatars } from "./TaskAssignees";
import { PriorityIndicator, TargetDate } from "./MilestoneTableControls";

export default function TaskDetailPage({ repository }: { repository?: ProjectRepository }) {
  const { taskId = "" } = useParams();
  return <TaskDetail key={taskId} taskId={taskId} repository={repository} />;
}

function TaskDetail({ taskId, repository: supplied }: { taskId: string; repository?: ProjectRepository }) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState(false);
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

  async function save(change: ProjectMutation) {
    if (saving.current || change.id !== taskId || !["save_task", "set_status", "delete_task"].includes(change.action)) return false;
    saving.current = true; setBusy(true); generation.current++;
    try {
      const next = await (await getRepository()).mutate(change);
      if (!alive.current) return false;
      setWorkspace(next); setEditing(false);
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
  const task = access ? workspace?.tasks.find(item => item.id === taskId && item.kind === "task") : undefined;
  if (!task || !workspace) return <Empty className="min-h-64"><EmptyHeader><EmptyTitle>{denied || !access ? "Task access required" : workspace ? "Task not found" : "Could not load task"}</EmptyTitle><EmptyDescription>{denied || !access ? "Ask a platform administrator for project access." : workspace ? "This task may have been removed or is no longer available to you." : "Try loading this task again."}</EmptyDescription></EmptyHeader><div className="flex gap-2"><Button variant="outline" asChild><Link to="/tasks">My tasks</Link></Button>{!denied && !workspace && <Button onClick={() => void load()}>Try again</Button>}</div></Empty>;
  const from = (location.state as { from?: unknown } | null)?.from;
  const personalOrigin = typeof from === "string" && /^\/tasks(?:\?|$)/.test(from);
  const canLead = canManageTask(task, workspace);
  const canUpdate = canUpdateTaskStatus(task, workspace);
  const project = workspace.projects.find(item => item.id === task.projectId);
  const milestone = workspace.tasks.find(item => item.kind === "milestone" && item.id === task.milestoneId && item.projectId === task.projectId);
  const members = directory?.data?.members ?? workspace.members;
  const backTo = typeof from === "string" && /^\/(?:tasks(?:\?|$)|projects(?:\/|\?|$)|season-overview(?:\?|$)|project-management\/)/.test(from) ? from : "/tasks";
  return <section aria-label="Task details" aria-busy={busy} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center justify-between gap-3 pb-4">
      <Button variant="ghost" size="sm" asChild><Link to={backTo}>Back</Link></Button>
      <div className="flex gap-2">{canLead && <DeleteWorkButton kind="task" title={task.title} busy={busy} onDelete={() => save({ action: "delete_task", id: task.id, expectedRevision: task.revision })} />}
      {canUpdate && <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>{canLead && !personalOrigin ? "Edit task" : "Update status"}</Button>}</div>
    </div>
    <div className="grid min-w-0 flex-1 gap-6 md:min-h-0 md:grid-cols-[minmax(0,1fr)_18rem] md:overflow-hidden xl:grid-cols-[minmax(0,1fr)_21rem]">
      <article tabIndex={0} aria-label="Task content" className="min-w-0 space-y-7 px-2 pb-8 pt-4 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:px-6">
        <h1 className="max-w-4xl break-words text-2xl font-semibold tracking-tight">{task.title}</h1>
        <p className="max-w-4xl whitespace-pre-wrap break-words text-base leading-7 text-foreground/90">{task.description || "No description yet."}</p>
      </article>
      <aside tabIndex={0} aria-label="Task properties" className="min-w-0 space-y-6 border-t px-4 pb-8 pt-4 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:border-l md:border-t-0">
        <h2 className="text-sm font-medium text-muted-foreground">Properties</h2>
        <dl className="space-y-6 text-sm [&_dt]:mb-2 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:break-words">
          <div><dt>Status</dt><dd><TaskStatusControl task={task} workspace={workspace} busy={busy} showLabel onSave={(task, status, blockedReason) => save({ action: "set_status", id: task.id, expectedRevision: task.revision, status, blockedReason })} /></dd></div>
          <div><dt>Priority</dt><dd className="flex items-center gap-2"><PriorityIndicator priority={task.priority} />{task.priority === "normal" ? "Medium" : task.priority[0].toUpperCase() + task.priority.slice(1)}</dd></div>
          <div><dt>Assignees</dt><dd><AssigneeAvatars assigneeIds={task.assigneeIds} members={members} showNames /></dd></div>
          <div><dt>Target date</dt><dd><TargetDate deadline={task.deadline} /></dd></div>
          {task.startDate && <div><dt>Start date</dt><dd><TargetDate deadline={task.startDate} /></dd></div>}
          <div><dt>Project</dt><dd>{project ? <Link to={`/projects/${project.id}`} className="inline-flex items-start gap-2 hover:underline"><IconCube aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{project.name}</Link> : "Needs organization"}</dd></div>
          <div><dt>Milestone</dt><dd>{milestone && project ? <Link to={`/projects/${project.id}?milestone=${encodeURIComponent(milestone.id)}`} className="inline-flex items-start gap-2 hover:underline"><IconDiamonds aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{milestone.title}</Link> : "Needs organization"}</dd></div>
          <div><dt>Department</dt><dd>{project?.departments.join(", ") || "No department"}</dd></div>
          <div><dt>Area</dt><dd>{CATEGORY_LABELS[task.category]}</dd></div>
          <div><dt>Season</dt><dd>{task.season}</dd></div>
          {task.partnerName && <div><dt>Sponsor or partner</dt><dd>{task.partnerName}</dd></div>}
          {task.blockedReason && <div><dt>Blocked reason</dt><dd className="whitespace-pre-wrap">{task.blockedReason}</dd></div>}
        </dl>
      </aside>
    </div>
    {editing && canUpdate && <TaskEditor key={`${task.id}-${task.revision}`} task={task} workspace={{ ...workspace, members }} category={task.category} statusOnly={personalOrigin} busy={busy} onSave={save} onClose={() => setEditing(false)} />}
  </section>;
}
