import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
  type Task,
} from "./types";

export const PERSONAL_TASK_COLUMNS = [
  ["deadline", "Due date"],
  ["project", "Project"],
  ["milestone", "Milestone"],
  ["assignee", "Assignee"],
  ["priority", "Priority"],
  ["partner", "Partner"],
] as const;
export type PersonalTaskColumn = (typeof PERSONAL_TASK_COLUMNS)[number][0];
const defaults: PersonalTaskColumn[] = ["deadline", "project", "assignee"];
const choice = (
  params: URLSearchParams,
  key: string,
  choices: string[],
  fallback: string,
) => {
  const value = params.get(key);
  return value && choices.includes(value) ? value : fallback;
};
export function personalTaskView(params: URLSearchParams) {
  return {
    search: params.get("search") ?? "",
    area: params.get("area") ?? "all",
    status: choice(params, "status", ["all", ...TASK_STATUSES], "all"),
    project: params.get("project") ?? "all",
    milestone: params.get("milestone") ?? "all",
    sort: choice(
      params,
      "sort",
      ["deadline", "title", "created", "priority"],
      "deadline",
    ),
    group: choice(
      params,
      "group",
      ["due", "status", "project", "milestone", "none"],
      "due",
    ),
    completed: params.get("completed") !== "hide",
    cancelled: params.get("cancelled") === "show",
    columns: PERSONAL_TASK_COLUMNS.map(([key]) => key).filter((key) =>
      params.has("columns")
        ? params.get("columns")!.split(",").includes(key)
        : defaults.includes(key),
    ),
  };
}
export type PersonalTaskView = ReturnType<typeof personalTaskView>;
export function assignedTasks(workspace: ProjectWorkspace) {
  return workspace.tasks.filter(
    (task) =>
      task.kind === "task" && task.assigneeIds.includes(workspace.viewerId),
  );
}
export function personalTaskGroups(
  workspace: ProjectWorkspace,
  options: PersonalTaskView,
  today: string,
) {
  const projects = new Map(
    workspace.projects.map((project) => [project.id, project]),
  );
  const milestones = new Map(
    workspace.tasks
      .filter((task) => task.kind === "milestone")
      .map((task) => [task.id, task]),
  );
  const priorityOrder = ["urgent", "high", "normal", "low"];
  const tasks = assignedTasks(workspace)
    .filter(
      (task) =>
        (options.area === "all" || task.category === options.area) &&
        (options.status === "all" || task.status === options.status) &&
        (options.project === "all" ||
          (options.project === "none"
            ? !task.projectId
            : task.projectId === options.project)) &&
        (options.milestone === "all" ||
          (options.milestone === "none"
            ? !task.milestoneId
            : task.milestoneId === options.milestone)) &&
        (options.completed || task.status !== "done") &&
        (options.cancelled || task.status !== "cancelled") &&
        [
          task.title,
          task.description,
          task.partnerName,
          projects.get(task.projectId ?? "")?.name,
          milestones.get(task.milestoneId ?? "")?.title,
          CATEGORY_LABELS[task.category],
        ]
          .join(" ")
          .toLowerCase()
          .includes(options.search.toLowerCase()),
    )
    .sort((a, b) => {
      const order =
        options.sort === "title"
          ? a.title.localeCompare(b.title)
          : options.sort === "created"
            ? b.createdAt.localeCompare(a.createdAt)
            : options.sort === "priority"
              ? priorityOrder.indexOf(a.priority) -
                priorityOrder.indexOf(b.priority)
              : (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
      return (
        order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
      );
    });
  const groups = new Map<
    string,
    { id: string; label: string; tasks: Task[] }
  >();
  for (const task of tasks) {
    let id = "all",
      label = "";
    if (options.group === "due") {
      label =
        task.status === "done"
          ? "Completed"
          : task.status === "cancelled"
            ? "Cancelled"
            : !task.deadline
              ? "No due date"
              : task.deadline < today
                ? "Overdue"
                : "Upcoming";
      id = label;
    } else if (options.group === "status") {
      id = task.status;
      label = STATUS_LABELS[task.status];
    } else if (options.group === "project") {
      id = task.projectId ?? "none";
      label = projects.get(id)?.name ?? "No project";
    } else if (options.group === "milestone") {
      id = task.milestoneId ?? "none";
      label = milestones.get(id)?.title ?? "No milestone";
    }
    const group = groups.get(id);
    if (group) group.tasks.push(task);
    else groups.set(id, { id, label, tasks: [task] });
  }
  const order: readonly string[] =
    options.group === "due"
      ? ["Overdue", "Upcoming", "No due date", "Completed", "Cancelled"]
      : TASK_STATUSES;
  return [...groups.values()].sort((a, b) =>
    options.group === "due" || options.group === "status"
      ? order.indexOf(a.id) - order.indexOf(b.id)
      : a.label.localeCompare(b.label),
  );
}
