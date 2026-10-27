import { MAX_TASK_ASSIGNEES, MAX_PROJECT_MILESTONES, MAX_DEPARTMENT_MEMBERS, ORGANIZATION_DEPARTMENTS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, type MilestoneChanges, type ProjectInput, type ProjectMutation, type TaskInput } from "../../src/features/ProjectManagement/types.js";
import { MemberCvError } from "./member-cv-error.js";

function invalid(message = "Invalid project management request."): never { throw new MemberCvError(400, message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) return invalid(`Enter a valid ${label}.`);
  return value.trim();
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) return invalid();
  return value as T;
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid("Choose a valid project or member.");
  return value.toLowerCase();
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31") return invalid("Enter a valid date between 2000 and 2100.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid("Enter a valid calendar date.");
  return value;
}
function task(value: unknown): TaskInput {
  const body = object(value);
  if (!Array.isArray(body.assigneeIds) || body.assigneeIds.length > MAX_TASK_ASSIGNEES) return invalid(`Choose up to ${MAX_TASK_ASSIGNEES} assignees.`);
  const input: TaskInput = {
    title: text(body.title, "title", 200, true), description: text(body.description, "description", 2000),
    category: oneOf(body.category, TASK_CATEGORIES), projectId: body.projectId === null ? null : uuid(body.projectId),
    milestoneId: body.milestoneId === null ? null : uuid(body.milestoneId),
    assigneeIds: [...new Set(body.assigneeIds.map(uuid))], deadline: date(body.deadline), startDate: date(body.startDate),
    status: oneOf(body.status, TASK_STATUSES), priority: oneOf(body.priority, TASK_PRIORITIES), kind: oneOf(body.kind, ["task", "milestone"]),
    partnerName: text(body.partnerName, "partner name", 200), blockedReason: text(body.blockedReason, "blocked reason", 500),
  };
  if (input.startDate && input.deadline && input.startDate > input.deadline) return invalid("The start date must be on or before the deadline.");
  if (!input.projectId) return invalid("Choose a project before saving this item.");
  if (input.kind === "task" && !input.milestoneId) return invalid("Choose a milestone before saving this task.");
  if (input.kind === "milestone" && input.milestoneId) return invalid("A milestone cannot belong to another milestone.");
  if (input.kind === "milestone" && !input.deadline) return invalid("A milestone needs a deadline.");
  if (input.category === "partnership-deliverables" && !input.partnerName) return invalid("Enter the partner this deliverable belongs to.");
  if (input.status === "blocked" && !input.blockedReason) return invalid("Explain what is blocking this task.");
  return input;
}
function project(value: unknown): ProjectInput {
  const body = object(value);
  if (!Array.isArray(body.departments) || body.departments.length > 10) return invalid("Choose at most 10 departments.");
  if (body.departments.some(name => typeof name !== "string" || !ORGANIZATION_DEPARTMENTS.includes(name.trim() as typeof ORGANIZATION_DEPARTMENTS[number]))) return invalid("Choose departments from the organization list.");
  if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) return invalid("Assign at least one project Lead.");
  if (body.leadIds.length > MAX_TASK_ASSIGNEES) return invalid("Choose up to 20 project Leads.");
  const startDate = body.startDate === undefined ? undefined : date(body.startDate);
  const deadline = date(body.deadline);
  if (startDate && deadline && startDate > deadline) return invalid("The start date must be on or before the deadline.");
  return { ...(startDate !== undefined ? { startDate } : {}), priority: body.priority === undefined ? "normal" : oneOf(body.priority, TASK_PRIORITIES), leadIds: body.leadIds === undefined ? [] : [...new Set((body.leadIds as unknown[]).map(uuid))], name: text(body.name, "project name", 200, true), description: text(body.description, "description", 2000),
    category: oneOf(body.category, TASK_CATEGORIES), departments: [...new Set(body.departments.map(value => text(value, "department", 100, true)))], deadline };
}
export function parseProjectMutation(value: unknown): ProjectMutation {
  const body = object(value);
  if (JSON.stringify(body).length > (body.action === "save_project" ? 64000 : 20000)) return invalid("This request is too large.");
  const id = uuid(body.id);
  const expectedRevision = body.expectedRevision;
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 2147483646) return invalid("A valid saved revision is required.");
  if (body.action === "save_department") {
    if (expectedRevision < 1) return invalid("Organization departments are fixed.");
    const input = object(body.department);
    if (!Array.isArray(input.memberIds) || input.memberIds.length > MAX_DEPARTMENT_MEMBERS) return invalid(`Choose up to ${MAX_DEPARTMENT_MEMBERS} department members.`);
    const memberIds = [...new Set(input.memberIds.map(uuid))];
    const leadId = input.leadId === null ? null : uuid(input.leadId);
    if (leadId && !memberIds.includes(leadId)) return invalid("The department Lead must be a member of the department.");
    const name = text(input.name, "department name", 100, true);
    if (!ORGANIZATION_DEPARTMENTS.includes(name as typeof ORGANIZATION_DEPARTMENTS[number])) return invalid("Choose an organization department.");
    return { action: body.action, id, expectedRevision, department: { name, memberIds, leadId } };
  }
  if (body.action === "update_milestone") {
    if (expectedRevision < 1) return invalid("A saved milestone revision is required.");
    const input = object(body.changes);
    if (!Object.keys(input).length || Object.keys(input).some(key => !["priority", "assigneeIds", "deadline"].includes(key))) return invalid("Choose priority, Leads or target date to update.");
    const changes: MilestoneChanges = {};
    if ("priority" in input) changes.priority = oneOf(input.priority, TASK_PRIORITIES);
    if ("deadline" in input) { changes.deadline = date(input.deadline); if (!changes.deadline) return invalid("A milestone needs a deadline."); }
    if ("assigneeIds" in input) {
      if (!Array.isArray(input.assigneeIds) || input.assigneeIds.length > MAX_TASK_ASSIGNEES) return invalid(`Choose up to ${MAX_TASK_ASSIGNEES} Leads.`);
      changes.assigneeIds = [...new Set(input.assigneeIds.map(uuid))];
    }
    return { action: body.action, id, expectedRevision, changes };
  }
  if (body.action === "save_task") return { action: body.action, id, expectedRevision, task: task(body.task) };
  if (body.action === "save_project") {
    const input = project(body.project);
    if (body.milestones === undefined) return { action: body.action, id, expectedRevision, project: input };
    if (expectedRevision !== 0 || !Array.isArray(body.milestones) || body.milestones.length > MAX_PROJECT_MILESTONES) return invalid("Initial milestones can only be added when creating a project (up to 20).");
    const ids = new Set<string>();
    const milestones = body.milestones.map(value => {
      const draft = object(value);
      if (Object.keys(draft).some(key => !["id", "title", "description", "deadline", "partnerName"].includes(key))) return invalid();
      const milestoneId = uuid(draft.id);
      if (ids.has(milestoneId)) return invalid("Each milestone must have a unique ID.");
      ids.add(milestoneId);
      const parsed = task({ ...draft, projectId: id, category: input.category, milestoneId: null, assigneeIds: [], startDate: null, status: "todo", priority: "normal", kind: "milestone", blockedReason: "" });
      return { id: milestoneId, title: parsed.title, description: parsed.description, deadline: parsed.deadline, partnerName: parsed.partnerName };
    });
    return { action: body.action, id, expectedRevision, project: input, milestones };
  }
  if (body.action === "set_status") {
    const status = oneOf(body.status, TASK_STATUSES);
    const blockedReason = text(body.blockedReason, "blocked reason", 500);
    if (status === "blocked" && !blockedReason) return invalid("Explain what is blocking this task.");
    return { action: body.action, id, expectedRevision, status, blockedReason };
  }
  return invalid();
}
