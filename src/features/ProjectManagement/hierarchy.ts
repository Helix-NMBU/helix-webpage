import type { ProjectWorkspace, Task } from "./types";

export function isOrganized(task: Task, workspace: Pick<ProjectWorkspace, "tasks" | "projects">): boolean {
  const project = workspace.projects.find(item => item.id === task.projectId && item.category === task.category && item.season === task.season);
  if (!project) return false;
  if (task.kind === "milestone") return task.milestoneId === null;
  const milestone = workspace.tasks.find(item => item.id === task.milestoneId && item.kind === "milestone");
  return Boolean(milestone && milestone.projectId === project.id && milestone.category === task.category && milestone.season === task.season);
}
