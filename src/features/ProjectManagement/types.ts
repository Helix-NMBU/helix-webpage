export const TASK_CATEGORIES = ["production", "partnership-deliverables", "marketing", "operations"] as const;
export type TaskCategory = typeof TASK_CATEGORIES[number];
export const TASK_WORKFLOW_STATUSES = ["backlog", "todo", "in_progress", "done", "blocked"] as const;
// Retain legacy cancelled records and their immutable history. New workflow menus use the five active choices.
export const TASK_STATUSES = [...TASK_WORKFLOW_STATUSES, "cancelled"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];
export const MAX_TASK_ASSIGNEES = 20;
export const MAX_PROJECT_MILESTONES = 20;
export const MAX_DEPARTMENT_MEMBERS = 500;
export const ORGANIZATION_DEPARTMENTS = ["Management", "Mechanical & Production", "Electronics", "Software & Autonomous", "Business & Marketing", "Logistics", "Finance"] as const;
export type OrganizationDepartment = typeof ORGANIZATION_DEPARTMENTS[number];
export const CATEGORY_LABELS: Record<TaskCategory, string> = { production: "Production", "partnership-deliverables": "Partnership deliverables", marketing: "Marketing", operations: "Operations" };
export const STATUS_LABELS: Record<TaskStatus, string> = { backlog: "Backlog", todo: "Todo", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };

export interface ProjectInput {
  startDate?: string | null;
  priority?: TaskPriority;
  leadIds?: string[];
  name: string;
  description: string;
  category: TaskCategory;
  departments: string[];
  deadline: string | null;
}
export interface ProjectMilestoneInput { id: string; title: string; description: string; deadline: string | null; partnerName: string; }
export interface Project extends ProjectInput { id: string; season: string; revision: number; }
export interface TaskInput {
  title: string;
  description: string;
  category: TaskCategory;
  projectId: string | null;
  milestoneId: string | null;
  assigneeIds: string[];
  deadline: string | null;
  startDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: "task" | "milestone";
  partnerName: string;
  blockedReason: string;
}
export interface Task extends TaskInput {
  id: string;
  season: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface TaskProgressEvent {
  taskId: string;
  recordedAt: string;
  category: TaskCategory;
  kind: "task" | "milestone";
  status: TaskStatus;
}
export interface ProjectMember { id: string; name: string; avatarUrl?: string | null; }
export interface DepartmentInput { name: string; memberIds: string[]; leadId: string | null; }
export interface ProjectDepartment extends DepartmentInput { id: string; season: string; revision: number; }
export interface ProjectWorkspace {
  season: string;
  viewerId: string;
  canManage: boolean;
  taskLeadCategories: TaskCategory[];
  projects: Project[];
  tasks: Task[];
  progressEvents: TaskProgressEvent[];
  members: ProjectMember[];
  departments: ProjectDepartment[];
}
export type MilestoneChanges = Partial<Pick<TaskInput, "priority" | "assigneeIds" | "deadline">>;
export type ProjectMutation =
  | { action: "save_department"; id: string; expectedRevision: number; department: DepartmentInput }
  | { action: "update_milestone"; id: string; expectedRevision: number; changes: MilestoneChanges }
  | { action: "save_task"; id: string; expectedRevision: number; task: TaskInput }
  | { action: "save_project"; id: string; expectedRevision: number; project: ProjectInput; milestones?: ProjectMilestoneInput[] }
  | { action: "set_status"; id: string; expectedRevision: number; status: TaskStatus; blockedReason: string };

export interface ProjectRepository {
  load(): Promise<ProjectWorkspace>;
  mutate(mutation: ProjectMutation): Promise<ProjectWorkspace>;
}
