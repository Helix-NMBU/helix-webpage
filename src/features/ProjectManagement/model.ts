import { MAX_TASK_ASSIGNEES, MAX_DEPARTMENT_MEMBERS, ORGANIZATION_DEPARTMENTS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, type DepartmentInput, type MilestoneChanges, type ProjectInput, type Task, type TaskInput } from "./types";

export function osloDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isOpen(task: Task): boolean { return task.status !== "done" && task.status !== "cancelled"; }
export function taskUrgency(task: Task, today = osloDate()): "overdue" | "soon" | null {
  if (!isOpen(task) || !task.deadline) return null;
  if (task.deadline < today) return "overdue";
  return task.deadline <= addDays(today, 7) ? "soon" : null;
}

export function summarize(tasks: Task[], today = osloDate()) {
  // Milestones are tracked separately so they do not double-count task progress.
  const work = tasks.filter(task => task.status !== "cancelled" && task.kind === "task");
  const done = work.filter(task => task.status === "done").length;
  const scheduled = tasks.filter(task => isOpen(task) && task.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  return {
    total: work.length, done, percent: work.length ? Math.round(done / work.length * 100) : 0,
    overdue: tasks.filter(task => taskUrgency(task, today) === "overdue").length,
    upcoming: tasks.filter(task => taskUrgency(task, today) === "soon").length,
    blocked: tasks.filter(task => task.status === "blocked").length,
    lastDeadline: scheduled[scheduled.length - 1]?.deadline ?? null,
    unscheduled: tasks.filter(task => isOpen(task) && !task.deadline).length,
  };
}

export function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "No deadline";
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new Error(`${label} ${required ? `must contain 1–${max}` : `must contain at most ${max}`} characters.`);
  return value.trim();
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100 || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Enter a valid date between 2000 and 2100.");
  return value;
}
function uuidOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Choose a valid member or project.");
  return value;
}
export function validateDepartment(input: DepartmentInput): DepartmentInput {
  if (!Array.isArray(input.memberIds) || input.memberIds.length > MAX_DEPARTMENT_MEMBERS) throw new Error(`Choose up to ${MAX_DEPARTMENT_MEMBERS} department members.`);
  const memberIds = [...new Set(input.memberIds.map(id => {
    if (typeof id !== "string" || !id) throw new Error("Choose a valid member.");
    return uuidOrNull(id)!.toLowerCase();
  }))];
  const leadId = uuidOrNull(input.leadId)?.toLowerCase() ?? null;
  if (leadId && !memberIds.includes(leadId)) throw new Error("The department Lead must be a member of the department.");
  const name = text(input.name, "Department name", 100, true);
  if (!ORGANIZATION_DEPARTMENTS.includes(name as typeof ORGANIZATION_DEPARTMENTS[number])) throw new Error("Choose an organization department.");
  return { name, memberIds, leadId };
}

export function validateMilestoneChanges(input: MilestoneChanges): MilestoneChanges {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Object.keys(input).length || Object.keys(input).some(key => !["priority", "assigneeIds", "deadline"].includes(key))) throw new Error("Choose priority, Leads or target date to update.");
  const changes: MilestoneChanges = {};
  if ("priority" in input) {
    if (!TASK_PRIORITIES.includes(input.priority!)) throw new Error("Choose a valid priority.");
    changes.priority = input.priority;
  }
  if ("deadline" in input) {
    changes.deadline = date(input.deadline);
    if (!changes.deadline) throw new Error("Set a deadline for this milestone.");
  }
  if ("assigneeIds" in input) {
    if (!Array.isArray(input.assigneeIds) || input.assigneeIds.length > MAX_TASK_ASSIGNEES) throw new Error(`Choose up to ${MAX_TASK_ASSIGNEES} Leads.`);
    changes.assigneeIds = [...new Set(input.assigneeIds.map(id => {
      if (typeof id !== "string" || !id) throw new Error("Choose a valid member.");
      return uuidOrNull(id)!.toLowerCase();
    }))];
  }
  return changes;
}

export function validateTask(input: TaskInput, { allowUnorganized = false }: { allowUnorganized?: boolean } = {}): TaskInput {
  if (!Array.isArray(input.assigneeIds) || input.assigneeIds.length > MAX_TASK_ASSIGNEES) throw new Error(`Choose up to ${MAX_TASK_ASSIGNEES} assignees.`);
  const assigneeIds = [...new Set(input.assigneeIds.map(id => {
    if (typeof id !== "string") throw new Error("Choose a valid member.");
    return uuidOrNull(id)!.toLowerCase();
  }))];
  if (!TASK_CATEGORIES.includes(input.category) || !TASK_STATUSES.includes(input.status) || !TASK_PRIORITIES.includes(input.priority) || !["task", "milestone"].includes(input.kind)) throw new Error("Choose a valid category, status, priority and task type.");
  const value = { ...input, title: text(input.title, "Title", 200, true), description: text(input.description, "Description", 2000), partnerName: text(input.partnerName, "Partner name", 200), blockedReason: text(input.blockedReason, "Blocked reason", 500), assigneeIds, milestoneId: uuidOrNull(input.milestoneId), projectId: uuidOrNull(input.projectId), deadline: date(input.deadline), startDate: date(input.startDate) };
  if (!allowUnorganized && !value.projectId) throw new Error("Choose a project for this work.");
  if (!allowUnorganized && value.kind === "task" && !value.milestoneId) throw new Error("Choose a milestone for this task.");
  if (value.category === "partnership-deliverables" && !value.partnerName) throw new Error("Enter the sponsor or partner name for this deliverable.");
  if (value.status === "blocked" && !value.blockedReason) throw new Error("Describe what is blocking this task.");
  if (value.kind === "milestone" && value.milestoneId) throw new Error("A milestone cannot belong to another milestone.");
  if (value.kind === "milestone" && !value.deadline) throw new Error("Set a deadline for this milestone.");
  if (value.startDate && value.deadline && value.startDate > value.deadline) throw new Error("The start date must be on or before the deadline.");
  return value;
}
export function validateProject(input: ProjectInput): ProjectInput {
  if (!TASK_CATEGORIES.includes(input.category) || !Array.isArray(input.departments) || input.departments.length > 10) throw new Error("Choose a category and up to ten departments.");
  if (input.departments.some(name => !ORGANIZATION_DEPARTMENTS.includes(name.trim() as typeof ORGANIZATION_DEPARTMENTS[number]))) throw new Error("Choose departments from the organization list.");
  if (input.priority !== undefined && !TASK_PRIORITIES.includes(input.priority)) throw new Error("Choose a valid priority.");
  if (input.leadIds !== undefined && (!Array.isArray(input.leadIds) || input.leadIds.length > MAX_TASK_ASSIGNEES || input.leadIds.some(id => typeof id !== "string" || !id))) throw new Error("Choose up to 20 project Leads.");
  const startDate = date(input.startDate ?? null);
  const deadline = date(input.deadline);
  if (startDate && deadline && startDate > deadline) throw new Error("The start date must be on or before the deadline.");
  return { startDate, priority: input.priority ?? "normal", leadIds: [...new Set(input.leadIds ?? [])], name: text(input.name, "Project name", 200, true), description: text(input.description, "Description", 2000), category: input.category, departments: [...new Set(input.departments.map(item => text(item, "Department", 100, true)))], deadline };
}
