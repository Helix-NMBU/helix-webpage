import { osloDate, summarize } from "./model";
import type { Task, TaskInput, TaskProgressEvent } from "./types";

export function progressCounts(tasks: Pick<TaskInput, "kind" | "status">[]) {
  const scope = tasks.filter(task => task.kind === "task" && task.status !== "cancelled");
  return { scope: scope.length, started: scope.filter(task => task.status !== "todo").length, completed: scope.filter(task => task.status === "done").length };
}

// End-of-day states, carried forward only after the first recorded observation.
export function progressSeries(events: TaskProgressEvent[], tasks: Task[], today = osloDate()) {
  const states = new Map<string, TaskProgressEvent>();
  const days = new Map<string, ReturnType<typeof progressCounts>>();
  let counts = progressCounts([]);
  for (const event of [...events].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))) {
    const day = osloDate(new Date(event.recordedAt));
    if (day > today) continue;
    const previous = states.get(event.taskId);
    const before = progressCounts(previous ? [previous] : []);
    const after = progressCounts([event]);
    counts = { scope: counts.scope - before.scope + after.scope, started: counts.started - before.started + after.started, completed: counts.completed - before.completed + after.completed };
    states.set(event.taskId, event);
    days.set(day, counts);
  }
  days.set(today, progressCounts(tasks));
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts }));
}

export function milestoneTasks(tasks: Task[], milestoneId: string | null) {
  return tasks.filter(task => task.kind === "task" && task.milestoneId === milestoneId);
}

export function milestoneProgress(tasks: Task[], milestoneId: string | null) {
  return summarize(milestoneTasks(tasks, milestoneId));
}

export function compatibleMilestones(tasks: Task[], draft: TaskInput, taskId?: string) {
  return tasks.filter(item => item.kind === "milestone" && item.id !== taskId && item.category === draft.category &&
    (Boolean(item.projectId) && item.projectId === draft.projectId) && (item.status !== "cancelled" || item.id === draft.milestoneId));
}

export function progressEvent(task: Task, recordedAt = new Date().toISOString()): TaskProgressEvent {
  return { taskId: task.id, recordedAt, category: task.category, kind: task.kind, status: task.status };
}

export function updateTaskDraft<K extends keyof TaskInput>(draft: TaskInput, key: K, value: TaskInput[K], tasks: Task[]): TaskInput {
  const next = { ...draft, [key]: value };
  if (key === "milestoneId" && value) {
    const milestone = tasks.find(item => item.id === value && item.kind === "milestone" && item.category === draft.category);
    if (milestone) next.projectId = milestone.projectId;
  }
  if (next.kind === "milestone" || ((key === "projectId" || key === "kind") && next.milestoneId && !compatibleMilestones(tasks, next).some(item => item.id === next.milestoneId))) next.milestoneId = null;
  return next;
}

export function progressStepPath(points: ReturnType<typeof progressSeries>, key: "scope" | "started" | "completed", x: (date: string) => number, y: (value: number) => number): string {
  return points.map((point, index) => index ? `H${x(point.date)} V${y(point[key])}` : `M${x(point.date)},${y(point[key])}`).join(" ");
}
