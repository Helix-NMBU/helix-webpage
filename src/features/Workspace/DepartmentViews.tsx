import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TaskListSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Button } from "@libs/components/ui/button";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { projectRepository, ProjectRequestError } from "../ProjectManagement/repository";
import type { ProjectMutation, ProjectWorkspace, Task } from "../ProjectManagement/types";
import type { SaveTaskStatus } from "../ProjectManagement/TaskStatus";
import { ProjectTaskList } from "./ProjectTaskList";
import { boardAssignmentMutation, boardPropertyMutation } from "../ProjectManagement/TaskBoard";
import { ProjectsPage } from "./ProjectsPage";
import { useWorkspace } from "./WorkspaceContext";
import { LoadDirectory } from "./DirectoryComponents";
import { departmentPath } from "./types";

function useDepartmentAccess() {
  const directory = useWorkspace()?.data;
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const department = directory?.departments.find(
    (item) => departmentPath(item.name) === `/departments/${departmentId}`,
  );
  const denied = Boolean(
    directory && (!department || (!directory.canManageProjects && !department.memberIds.includes(directory.viewerId))),
  );
  useEffect(() => {
    if (denied) {
      notify("Department access required", "You can open department pages only for departments you belong to.", {
        variant: "error",
        href: null,
      });
      navigate("/departments", { replace: true });
    }
  }, [denied, navigate, notify]);
  return { directory, department, denied };
}

export function DepartmentProjectsPage() {
  const { department, denied } = useDepartmentAccess();
  if (!department) return denied ? null : <LoadDirectory title="Projects" columns={5} />;
  return <ProjectsPage departmentIdScope={department.id} />;
}

export function DepartmentTasksPage() {
  const { directory, department, denied } = useDepartmentAccess();
  const directorySession = useWorkspace();
  const [params] = useSearchParams();
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const repository = useRef<ReturnType<typeof projectRepository> | null>(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const navigate = useNavigate();
  const notify = useNotify();

  const getRepository = useCallback(
    () => (repository.current ??= projectRepository()),
    [],
  );
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await (await getRepository()).load();
      if (alive.current && generation.current === current) setWorkspace(next);
    } catch (error) {
      if (!alive.current || generation.current !== current) return;
      notify("Could not load department tasks", error instanceof Error ? error.message : "Try again.", {
        variant: "error",
        href: null,
        action: { label: "Try again", onClick: () => void load() },
      });
      if (error instanceof ProjectRequestError && [401, 403].includes(error.status)) {
        navigate(error.status === 401 ? "/login" : "/departments", { replace: true });
      }
    } finally {
      if (alive.current && generation.current === current) setLoading(false);
    }
  }, [getRepository, navigate, notify]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [load]);

  const save = async (mutation: ProjectMutation) => {
    if (saving.current || !workspace) return false;
    saving.current = true;
    setBusy(true);
    try {
      const next = await (await getRepository()).mutate(mutation);
      if (alive.current) setWorkspace(next);
      if (mutation.action !== "set_status") notify("Assignments saved", "The task assignments have been updated.", { variant: "success", href: null });
      return true;
    } catch (error) {
      notify("Could not update task", error instanceof Error ? error.message : "Try again.", {
        variant: "error",
        href: null,
      });
      return false;
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const saveStatus: SaveTaskStatus = (task, status, blockedReason) => save({ action: "set_status", id: task.id, expectedRevision: task.revision, status, blockedReason });

  if (!directory) return directorySession?.loading ? <TaskListSkeleton label="Loading department tasks" board={params.get("view") === "board"} /> : <Button variant="outline" onClick={() => void directorySession?.refresh()}>Try again</Button>;
  if (denied || !department) return null;
  if (!workspace) return loading ? <TaskListSkeleton label="Loading department tasks" board={params.get("view") === "board"} /> : <Button variant="outline" onClick={() => void load()}>Try again</Button>;

  const projectIds = new Set(
    directory.projects
      .filter((project) => project.departments.includes(department.name))
      .map((project) => project.id),
  );
  const tasks = workspace.tasks.filter((task) => task.projectId && projectIds.has(task.projectId));
  const taskOnly = tasks.filter((task) => task.kind === "task");
  const milestones = tasks.filter((task) => task.kind === "milestone");
  const departmentWorkspace: ProjectWorkspace = {
    ...workspace,
    projects: workspace.projects.filter((project) => projectIds.has(project.id)),
    tasks,
  };
  return (
    <ProjectTaskList
      tasks={taskOnly}
      allTasks={tasks}
      milestones={milestones}
      selectedMilestone={null}
      onOpenMilestone={() => undefined}
      onCreateMilestone={() => undefined}
      workspace={departmentWorkspace}
      busy={busy || loading}
      canCreate={false}
      filterLabel={null}
      onClear={() => undefined}
      onOpen={(task: Task) => navigate(`/tasks/${task.id}`)}
      onStatusChange={saveStatus}
      onSaveAssignees={(task, assigneeIds) => save(boardAssignmentMutation(task, assigneeIds))}
      onSaveProperties={(task, changes) => save(boardPropertyMutation(task, changes))}
      onCreate={() => undefined}
      boardKind="task"
      heading="Tasks"
    />
  );
}
