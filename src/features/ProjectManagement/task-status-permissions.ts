import type { ProjectWorkspace, Task } from "./types";

export function canChangeTaskStatus(task: Task, workspace: ProjectWorkspace) {
  return (
    workspace.canManage ||
    workspace.taskLeadCategories.includes(task.category) ||
    task.assigneeIds.includes(workspace.viewerId)
  );
}
