export const TASK_CATEGORIES = ["production", "partnership-deliverables", "marketing", "operations"] as const;
export type TaskCategory = typeof TASK_CATEGORIES[number];
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];
export const MAX_TASK_ASSIGNEES = 20;
export const CATEGORY_LABELS: Record<TaskCategory, string> = { production: "Production", "partnership-deliverables": "Partnership deliverables", marketing: "Marketing", operations: "Operations" };
export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };

export interface ProjectInput {
  name: string;
  description: string;
  category: TaskCategory;
  departments: string[];
  deadline: string | null;
}
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
export interface ProjectWorkspace {
  season: string;
  viewerId: string;
  canManage: boolean;
  taskLeadCategories: TaskCategory[];
  projects: Project[];
  tasks: Task[];
  progressEvents: TaskProgressEvent[];
  members: ProjectMember[];
}
export type MilestoneChanges = Partial<Pick<TaskInput, "priority" | "assigneeIds" | "deadline">>;
export type ProjectMutation =
  | { action: "update_milestone"; id: string; expectedRevision: number; changes: MilestoneChanges }
  | { action: "save_task"; id: string; expectedRevision: number; task: TaskInput }
  | { action: "save_project"; id: string; expectedRevision: number; project: ProjectInput }
  | { action: "set_status"; id: string; expectedRevision: number; status: TaskStatus; blockedReason: string };

export interface ProjectRepository {
  load(): Promise<ProjectWorkspace>;
  mutate(mutation: ProjectMutation): Promise<ProjectWorkspace>;
}
