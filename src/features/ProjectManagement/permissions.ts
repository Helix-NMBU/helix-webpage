import type { DepartmentAccess, Project, ProjectDepartment, ProjectWorkspace, Task } from "./types";

export function departmentAccess(department: ProjectDepartment, memberId: string): DepartmentAccess | null {
  if ((department.leadIds ?? (department.leadId ? [department.leadId] : [])).includes(memberId)) return "lead";
  if (!department.memberIds.includes(memberId)) return null;
  return department.viewerIds?.includes(memberId) ? "viewer" : "member";
}

export function canManageProject(project: Pick<Project, "departments">, workspace: Pick<ProjectWorkspace, "canManage" | "departments" | "viewerId">) {
  return workspace.canManage || workspace.departments.some(department => project.departments.includes(department.name) && departmentAccess(department, workspace.viewerId) === "lead");
}

export function canManageTask(task: Pick<Task, "projectId">, workspace: ProjectWorkspace) {
  const project = workspace.projects.find(project => project.id === task.projectId);
  return workspace.canManage || !!project && canManageProject(project, workspace);
}

export function canUpdateTaskStatus(task: Task, workspace: ProjectWorkspace) {
  if (canManageTask(task, workspace)) return true;
  const project = workspace.projects.find(project => project.id === task.projectId);
  return task.kind === "task" && task.assigneeIds.includes(workspace.viewerId) && !!project && workspace.departments.some(department => project.departments.includes(department.name) && departmentAccess(department, workspace.viewerId) === "member");
}

export function canManageArea(category: Task["category"], workspace: ProjectWorkspace) {
  return workspace.canManage || workspace.projects.some(project => project.category === category && canManageProject(project, workspace));
}
