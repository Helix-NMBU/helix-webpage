import { TaskEditor } from "../ProjectManagement/TaskEditor";
import { DeleteWorkButton } from "../ProjectManagement/DeleteWorkButton";
import { canManageProject } from "../ProjectManagement/permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { TaskListSkeleton, ActivitySkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@libs/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@libs/components/ui/empty";
import { Badge } from "@libs/components/ui/badge";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  projectRepository,
  ProjectRequestError,
} from "../ProjectManagement/repository";
import type {
  ProjectMutation,
  ProjectRepository,
  ProjectWorkspace,
  ProjectInput,
  Task,
  TaskInput,
} from "../ProjectManagement/types";
import { STATUS_LABELS } from "../ProjectManagement/types";
import { TaskComposer } from "../ProjectManagement/TaskComposer";
import { summarize, validateProject } from "../ProjectManagement/model";
import { useWorkspace } from "./WorkspaceContext";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";
import { type TaskStatus } from "../ProjectManagement/types";
import { ProjectTaskList } from "./ProjectTaskList";
import { boardAssignmentMutation } from "../ProjectManagement/TaskBoard";
import { ProjectSidebar } from "./ProjectSidebar";

function InlineProjectField({
  label,
  value,
  placeholder,
  multiline = false,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  disabled: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        aria-label={`Edit project ${label.toLowerCase()}`}
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }

  const Field = multiline ? Textarea : Input;
  return (
    <div className="space-y-2">
      <Field
        autoFocus
        aria-label={`Project ${label.toLowerCase()}`}
        value={draft}
        maxLength={multiline ? 2000 : 200}
        rows={multiline ? 3 : undefined}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || (!multiline && !draft.trim()) || draft === value}
          onClick={() => void onSave(draft).then(saved => { if (saved) setEditing(false); })}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => { setDraft(value); setEditing(false); }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ProjectDetail({
  project,
  directory,
}: {
  project: WorkspaceProject;
  directory: WorkspaceDirectory;
}) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(directory.projectAccess);
  const [denied, setDenied] = useState(!directory.projectAccess);
  const [busy, setBusy] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Task | null>(null);
  const [composer, setComposer] = useState<TaskInput["kind"] | null>(null);
  const repository = useRef<Promise<ProjectRepository> | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const saving = useRef(false);
  const [params, setParams] = useSearchParams();
  const selectedTab = params.get("tab");
  const tab =
    selectedTab === "overview" || selectedTab === "activity"
      ? selectedTab
      : "tasks";
  const directorySession = useWorkspace();
  const notify = useNotify();
  const navigate = useNavigate();
  const location = useLocation();
  const getRepository = useCallback(
    () => (repository.current ??= projectRepository()),
    [],
  );
  const load = useCallback(async () => {
    if (saving.current) return;
    const current = ++generation.current;
    if (!directory.projectAccess) {
      setWorkspace(null);
      setDenied(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await (await getRepository()).load();
      if (alive.current && current === generation.current) {
        setWorkspace(next);
        setDenied(false);
      }
    } catch (error) {
      if (!alive.current || current !== generation.current) return;
      setWorkspace(null);
      const forbidden =
        error instanceof ProjectRequestError &&
        [401, 403].includes(error.status);
      setDenied(forbidden);
      notify(
        "Could not load project tasks",
        error instanceof Error ? error.message : "Try again.",
        {
          variant: "error",
          href: null,
          ...(!forbidden
            ? { action: { label: "Try again", onClick: () => void load() } }
            : {}),
        },
      );
      if (error instanceof ProjectRequestError && error.status === 401)
        navigate("/login", { replace: true });
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [directory.projectAccess, getRepository, notify, navigate]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [load, project.id]);
  const tasks = (workspace?.tasks ?? [])
    .filter((item) => item.projectId === project.id && item.kind === "task")
    .sort(
      (a, b) =>
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.title.localeCompare(b.title),
    );
  const milestones = (workspace?.tasks ?? [])
    .filter(
      (item) => item.projectId === project.id && item.kind === "milestone",
    )
    .sort(
      (a, b) =>
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.title.localeCompare(b.title),
    );
  const requestedMilestone = params.get("milestone");
  const selectedMilestone =
    requestedMilestone === "none" ||
    milestones.some((item) => item.id === requestedMilestone)
      ? requestedMilestone
      : null;
  const selected = milestones.find((item) => item.id === selectedMilestone);
  const filtered = tasks.filter(
    (item) =>
      !selectedMilestone ||
      (selectedMilestone === "none"
        ? !item.milestoneId
        : item.milestoneId === selectedMilestone),
  );
  const canCreate = !!workspace && canManageProject(project, workspace);
  const canEdit =
    directory.canAdmin ||
    directory.canManageProjects ||
    directory.departments.some(
      (department) =>
        (department.leadIds ?? (department.leadId ? [department.leadId] : [])).includes(directory.viewerId) &&
        project.departments.includes(department.name),
    );
  const counts = workspace
    ? summarize(tasks)
    : {
        done: project.done,
        total: project.total,
        percent: project.total
          ? Math.round((project.done / project.total) * 100)
          : 0,
      };
  function selectTab(value: string) {
    const next = new URLSearchParams(params);
    if (value === "tasks") next.delete("tab");
    else next.set("tab", value);
    setParams(next);
  }
  function selectMilestone(id: string) {
    const next = new URLSearchParams(params);
    if (selectedMilestone === id) next.delete("milestone");
    else next.set("milestone", id);
    next.delete("tab");
    setParams(next);
  }
  function clearMilestone() {
    const next = new URLSearchParams(params);
    next.delete("milestone");
    setParams(next);
  }
  async function save(change: ProjectMutation): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    const current = ++generation.current;
    try {
      if (change.action === "save_project") {
        if (!directorySession) return false;
        const next = await directorySession.saveProject(change);
        if (!alive.current || generation.current !== current) return false;
        setWorkspace((value) =>
          value ? { ...value, projects: next.projects } : value,
        );
      } else {
        const next = await (await getRepository()).mutate(change);
        if (!alive.current || generation.current !== current) return false;
        setWorkspace(next);
        void directorySession?.refresh();
      }
      if (change.action === "delete_project") {
        notify("Project deleted", "The project and its work have been removed.", { variant: "success", href: null });
        void directorySession?.refresh();
        navigate("/projects", { replace: true });
        return true;
      }
      if (change.action === "delete_task") {
        notify("Milestone deleted", "The milestone and its tasks have been removed.", { variant: "success", href: null });
        return true;
      }
      notify(
        change.action === "save_project" ? "Project saved" : "Task saved",
        change.action === "save_project"
          ? "Project properties have been updated."
          : "Tasks, milestones and project progress have been updated.",
        { variant: "success", href: null },
      );
      return true;
    } catch (error) {
      if (alive.current) {
        notify(
          change.action === "save_project"
            ? "Could not save project"
            : "Could not save task",
          error instanceof Error
            ? error.message
            : "Your input has been kept. Try again.",
          { variant: "error", href: null },
        );
        if (
          error instanceof ProjectRequestError &&
          [401, 403].includes(error.status)
        ) {
          setWorkspace(null);
          setDenied(true);
          setComposer(null);
          if (error.status === 401) navigate("/login", { replace: true });
        }
      }
      return false;
    } finally {
      saving.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }
  async function saveProjectProperties(changes: Partial<ProjectInput>) {
    try {
      return await save({
        action: "save_project",
        id: project.id,
        expectedRevision: project.revision,
        project: validateProject({ ...project, ...changes }),
      });
    } catch (error) {
      notify(
        "Could not save project",
        error instanceof Error
          ? error.message
          : "Check the project details and try again.",
        { variant: "error", href: null },
      );
      return false;
    }
  }
  function openTask(id: string) {
    navigate(`/tasks/${id}`, { state: { from: `${location.pathname}${location.search}` } });
  }
  function changeStatus(task: Task, status: TaskStatus, blockedReason: string) {
    return save({
      action: "set_status",
      id: task.id,
      expectedRevision: task.revision,
      status,
      blockedReason,
    });
  }
  const taskIds = new Set(tasks.map((task) => task.id));
  const events = (workspace?.progressEvents ?? [])
    .filter((event) => taskIds.has(event.taskId))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 50);
  const accessState = (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyTitle>
          {denied
            ? "Project task access required"
            : "Could not load project tasks"}
        </EmptyTitle>
        <EmptyDescription>
          {denied
            ? "Contact a Helix administrator to request project management access."
            : "Try loading this project again."}
        </EmptyDescription>
      </EmptyHeader>
      {!denied && (
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      )}
    </Empty>
  );
  return (
    <section
      aria-label={`${project.name} project`}
      data-project-progress
      aria-busy={busy || loading}
      className="flex min-h-0 flex-1 flex-col pb-8 md:overflow-hidden md:pb-0"
    >
      <h1 className="sr-only">{project.name}</h1>
      <Tabs value={tab} onValueChange={selectTab} className="min-h-0 flex-1 flex-col">
        <TabsList
          aria-label="Project views"
          className="h-auto shrink-0 gap-2 rounded-none bg-transparent p-0"
        >
          {[
            ["overview", "Overview"],
            ["activity", "Activity"],
            ["tasks", "Tasks"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-full border bg-muted/40 px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4 md:min-h-0 md:overflow-hidden">
          <div className="grid min-w-0 gap-6 md:h-full md:min-h-0 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div
              tabIndex={0}
              role="region"
              aria-label="Project content"
              className={`min-w-0 md:min-h-0 md:overscroll-y-contain md:pb-2 md:pr-2 ${tab === "tasks" && params.get("view") === "board" ? "md:flex md:flex-col md:overflow-hidden" : "md:overflow-y-auto"}`}
            >
              {tab === "overview" ? (
                <section
                  aria-label="Project overview"
                  className="space-y-6 py-2"
                >
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {canEdit ? <InlineProjectField label="name" value={project.name} placeholder="Project name" disabled={busy} onSave={value => saveProjectProperties({ name: value })} /> : project.name}
                  </h2>
                  <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {canEdit ? <InlineProjectField label="description" value={project.description} placeholder="Add a project description…" multiline disabled={busy} onSave={value => saveProjectProperties({ description: value })} /> : <p className="whitespace-pre-wrap">{project.description || "No project description yet."}</p>}
                  </div>
                  <dl className="grid max-w-2xl grid-cols-3 gap-5 border-y py-5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Tasks</dt>
                      <dd className="mt-2 text-xl font-medium tabular-nums">
                        {counts.total}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Completed
                      </dt>
                      <dd className="mt-2 text-xl font-medium tabular-nums">
                        {counts.done}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Milestones
                      </dt>
                      <dd className="mt-2 text-xl font-medium tabular-nums">
                        {workspace
                          ? milestones.length
                          : project.milestones.length}
                      </dd>
                    </div>
                  </dl>
                  <Button variant="outline" onClick={() => selectTab("tasks")}>
                    View tasks
                  </Button>
                </section>
              ) : loading && !workspace ? (
                tab === "activity" ? <ActivitySkeleton /> : <TaskListSkeleton label="Loading project tasks" board={params.get("view") === "board"} />
              ) : !workspace ? (
                accessState
              ) : tab === "activity" ? (
                <section aria-label="Project activity" className="space-y-4">
                  <h2 className="text-xl font-medium">Activity</h2>
                  <p className="text-xs text-muted-foreground">
                    Recorded status history for the project’s current tasks.
                  </p>
                  {events.length ? (
                    <ul className="divide-y rounded-xl border px-4">
                      {events.map((event, index) => (
                        <li
                          key={`${event.taskId}-${event.recordedAt}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <button type="button" className="text-left hover:underline" onClick={() => openTask(event.taskId)}>
                              {tasks.find((task) => task.id === event.taskId)?.title}
                            </button>
                            <span className="ml-2 text-muted-foreground">
                              Recorded
                            </span>{" "}
                            <Badge variant="secondary">
                              {STATUS_LABELS[event.status]}
                            </Badge>
                          </span>
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={event.recordedAt}
                          >
                            {new Intl.DateTimeFormat("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Europe/Oslo",
                            }).format(new Date(event.recordedAt))}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty className="min-h-48 border">
                      <EmptyHeader>
                        <EmptyTitle>No recorded activity yet</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                </section>
              ) : (
                <div className={params.get("view") === "board" ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
                {selected && canCreate && <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditingMilestone(selected)}>Edit milestone</Button><DeleteWorkButton kind="milestone" title={selected.title} busy={busy} onDelete={() => save({ action: "delete_task", id: selected.id, expectedRevision: selected.revision })} /></div>}
                <ProjectTaskList
                  key={project.id}
                  tasks={filtered}
                  allTasks={tasks}
                  milestones={milestones}
                  selectedMilestone={selectedMilestone}
                  onOpenMilestone={item => {
                    const next = new URLSearchParams(params);
                    next.set("milestone", item.id);
                    next.set("view", "list");
                    for (const key of ["status", "priority", "assignee"]) next.delete(key);
                    setParams(next);
                  }}
                  onCreateMilestone={() => setComposer("milestone")}
                  workspace={workspace}
                  busy={busy}
                  canCreate={canCreate}
                  filterLabel={
                    selectedMilestone === "none"
                      ? "No milestone"
                      : (selected?.title ?? null)
                  }
                  onClear={clearMilestone}
                  onOpen={item => openTask(item.id)}
                  onStatusChange={changeStatus}
                  onSaveAssignees={(task, assigneeIds) => save(boardAssignmentMutation(task, assigneeIds))}
                  onCreate={() => setComposer("task")}
                />
                </div>
              )}
            </div>
            <ProjectSidebar
              project={project}
              directory={directory}
              workspace={workspace}
              tasks={tasks}
              milestones={milestones}
              selectedMilestone={selectedMilestone}
              onSelect={selectMilestone}
              onSaveProject={saveProjectProperties}
              canEdit={canEdit}
              canCreate={canCreate}
              busy={busy}
              onCreateMilestone={() => setComposer("milestone")}
            />
          </div>
        </TabsContent>
      </Tabs>
      {canEdit && workspace && <div className="pt-4"><DeleteWorkButton kind="project" title={project.name} busy={busy} onDelete={() => save({ action: "delete_project", id: project.id, expectedRevision: project.revision })} /></div>}
      {editingMilestone && workspace && canCreate && <TaskEditor task={editingMilestone} workspace={workspace} category={project.category} busy={busy} onSave={async change => { const saved = await save(change); if (saved) setEditingMilestone(null); return saved; }} onClose={() => setEditingMilestone(null)} />}
      {composer && workspace && canCreate && (
        <TaskComposer
          initialKind={composer}
          initialMilestoneId={selected?.id ?? null}
          workspace={workspace}
          category={project.category}
          projectId={project.id}
          busy={busy}
          onSave={save}
          onClose={() => setComposer(null)}
        />
      )}
    </section>
  );
}
