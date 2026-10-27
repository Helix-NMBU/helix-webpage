import { TASK_STATUSES, type Task } from "../ProjectManagement/types";
export function projectTaskView(params: URLSearchParams) {
  const status = params.get("status") ?? "all";
  return {
    view: params.get("view") === "board" ? "board" : "list",
    status:
      status === "all" || TASK_STATUSES.includes(status as Task["status"])
        ? status
        : "all",
    assignee: params.get("assignee") ?? "all",
    priority: params.get("priority") ?? "all",
    sort: params.get("sort") ?? "deadline",
    completed: params.get("completed") !== "hide",
    cancelled: params.get("cancelled") !== "hide",
  };
}
export type ProjectTaskView = ReturnType<typeof projectTaskView>;
export function visibleProjectTasks(
  tasks: Task[],
  options: ProjectTaskView,
  search: string,
  kind: Task["kind"] = "task",
) {
  const priorities = ["urgent", "high", "normal", "low"];
  return tasks
    .filter(
      (task) =>
        task.kind === kind &&
        (options.status === "all" || task.status === options.status) &&
        (options.priority === "all" || task.priority === options.priority) &&
        (options.assignee === "all" ||
          (options.assignee === "none"
            ? !task.assigneeIds.length
            : task.assigneeIds.includes(options.assignee))) &&
        (options.completed || task.status !== "done") &&
        (options.cancelled || task.status !== "cancelled") &&
        `${task.title} ${task.description} ${task.partnerName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (options.sort === "title"
          ? a.title.localeCompare(b.title)
          : options.sort === "priority"
            ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
            : options.sort === "created"
              ? b.createdAt.localeCompare(a.createdAt)
              : (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
}
