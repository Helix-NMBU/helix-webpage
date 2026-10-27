import type { WorkspaceDirectory, WorkspaceProject } from "./types";

export const PROJECT_COLUMNS = [
  ["milestones", "Milestones"], ["department", "Department"], ["priority", "Priority"],
  ["leads", "Leads"], ["deadline", "Target date"], ["tasks", "Tasks"], ["status", "Status"],
] as const;
export type ProjectColumn = typeof PROJECT_COLUMNS[number][0];
export function projectView(params: URLSearchParams) {
  return {
    view: params.get("view") === "timeline" ? "timeline" : "list",
    department: params.get("department") ?? "all",
    lead: params.get("lead") ?? "all",
    priority: params.get("priority") ?? "all",
    completion: params.get("completion") ?? "all",
    sort: params.get("sort") ?? "deadline",
    group: params.get("group") ?? "none",
    scale: params.get("scale") === "month" ? "month" : params.get("scale") === "quarter" ? "quarter" : "year",
    columns: PROJECT_COLUMNS.map(([key]) => key).filter(key => !params.has("columns") || params.get("columns")!.split(",").includes(key)),
  };
}
export type ProjectView = ReturnType<typeof projectView>;
export const projectComplete = (project: WorkspaceProject) => project.total > 0 && project.done >= project.total;
export function visibleProjects(data: WorkspaceDirectory, options: ProjectView, search: string) {
  const department = data.departments.find(item => item.id === options.department);
  const priorityOrder = ["urgent", "high", "normal", "low", "none"];
  return data.projects.filter(project =>
    (options.department === "all" || Boolean(department && project.departments.includes(department.name))) &&
    (options.lead === "all" || (options.lead === "none" ? !project.leadIds?.length : project.leadIds?.includes(options.lead))) &&
    (options.priority === "all" || (project.priority ?? "normal") === options.priority) &&
    (options.completion === "all" || (options.completion === "completed" ? projectComplete(project) : options.completion === "empty" ? project.total === 0 : !projectComplete(project))) &&
    `${project.name} ${project.description} ${project.departments.join(" ")}`.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    const order = options.sort === "name" ? a.name.localeCompare(b.name)
      : options.sort === "priority" ? priorityOrder.indexOf(a.priority ?? "normal") - priorityOrder.indexOf(b.priority ?? "normal")
      : options.sort === "progress" ? (b.total ? b.done / b.total : 0) - (a.total ? a.done / a.total : 0)
      : (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    return order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
export function projectGroups(projects: WorkspaceProject[], data: WorkspaceDirectory, group: string) {
  if (group !== "department" && group !== "lead") return [{ id: "all", name: "", projects }];
  const groups = new Map<string, { id: string; name: string; projects: WorkspaceProject[] }>();
  for (const project of projects) {
    const entries = group === "department"
      ? (project.departments.length ? project.departments : ["No department"]).map(name => ({ id: name, name }))
      : project.leadIds?.length ? project.leadIds.map(id => ({ id, name: data.members.find(member => member.id === id)?.name ?? "Unknown Lead" })) : [{ id: "none", name: "No Lead" }];
    for (const entry of entries) {
      const existing = groups.get(entry.id);
      if (existing) { if (!existing.projects.some(item => item.id === project.id)) existing.projects.push(project); }
      else groups.set(entry.id, { ...entry, projects: [project] });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
