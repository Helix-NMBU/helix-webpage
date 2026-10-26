import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { addDays, osloDate, validateProject, validateTask } from "./model";
import { ProjectRequestError } from "./repository";
import type { ProjectRepository, ProjectWorkspace, Task, TaskCategory } from "./types";

const KEY = "helix-member-local-projects-v1";
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export function initialLocalWorkspace(): ProjectWorkspace {
  const today = osloDate();
  const task = (number: number, title: string, category: TaskCategory, offset: number, extra: Partial<Task> = {}): Task => ({
    id: id(number), season: "S27", title, category, description: "", projectId: category === "production" ? id(100) : null,
    assigneeId: id(1), deadline: addDays(today, offset), startDate: addDays(today, -7), status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "", revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, ...extra,
  });
  return { season: "S27", viewerId: id(1), canManage: true,
    members: [{ id: id(1), name: "Alex Example" }, { id: id(2), name: "Sam Example" }],
    projects: [{ id: id(100), season: "S27", name: "Chassis & assembly", description: "Coordinate fabrication, electronics fit and final assembly.", category: "production", departments: ["Mechanical", "Electrical"], deadline: addDays(today, 35), revision: 1 }],
    tasks: [
      task(10, "Complete chassis design review", "production", -3, { status: "done", completedAt: new Date().toISOString() }),
      task(11, "Confirm material delivery", "production", -1, { status: "blocked", priority: "high", blockedReason: "Waiting for the supplier to confirm the delivery date." }),
      task(12, "Assemble suspension mounts", "production", 6, { status: "in_progress", assigneeId: id(2) }),
      task(13, "Chassis ready for assembly", "production", 35, { kind: "milestone", startDate: null }),
      task(14, "Deliver partner team photographs", "partnership-deliverables", 4, { partnerName: "Example Engineering" }),
      task(15, "Publish workshop update", "marketing", 3, { status: "in_progress" }),
      task(16, "Submit competition registration", "operations", 12, { kind: "milestone", startDate: null, priority: "urgent" }),
    ],
  };
}

export function createLocalProjectRepository(): ProjectRepository {
  if (!isLocalMemberMode()) throw new Error("Local project data requires member-local development mode on loopback.");
  function read(): ProjectWorkspace {
    const saved = localStorage.getItem(KEY);
    return saved ? JSON.parse(saved) as ProjectWorkspace : initialLocalWorkspace();
  }
  return {
    async load() { const workspace = read(); localStorage.setItem(KEY, JSON.stringify(workspace)); return workspace; },
    async mutate(mutation) {
      const workspace = read();
      const collection = mutation.action === "save_project" ? workspace.projects : workspace.tasks;
      const current = collection.find(item => item.id === mutation.id);
      if ((current?.revision ?? 0) !== mutation.expectedRevision) throw new ProjectRequestError("This item changed in another session. Reload before saving again.", 409);
      const now = new Date().toISOString();
      if (mutation.action === "save_project") {
        const project = validateProject(mutation.project);
        if (workspace.tasks.some(task => task.projectId === mutation.id && task.category !== project.category)) throw new Error("Move the project's tasks before changing its category.");
        workspace.projects = [...workspace.projects.filter(item => item.id !== mutation.id), { ...project, id: mutation.id, season: workspace.season, revision: mutation.expectedRevision + 1 }];
      } else {
        const previous = workspace.tasks.find(item => item.id === mutation.id);
        if (mutation.action === "set_status" && !previous) throw new ProjectRequestError("Task not found.", 404);
        const task = validateTask(mutation.action === "save_task" ? mutation.task : { ...previous!, status: mutation.status, blockedReason: mutation.blockedReason });
        if (task.assigneeId && !workspace.members.some(member => member.id === task.assigneeId)) throw new Error("Choose an active member.");
        if (task.projectId && !workspace.projects.some(project => project.id === task.projectId && project.category === task.category)) throw new Error("Choose a project in the same area.");
        workspace.tasks = [...workspace.tasks.filter(item => item.id !== mutation.id), { ...task, id: mutation.id, season: workspace.season, revision: mutation.expectedRevision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, completedAt: task.status === "done" ? previous?.completedAt ?? now : null }];
      }
      localStorage.setItem(KEY, JSON.stringify(workspace));
      return workspace;
    },
  };
}
