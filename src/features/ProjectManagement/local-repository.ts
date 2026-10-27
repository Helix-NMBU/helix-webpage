import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { addDays, osloDate, validateProject, validateTask, validateMilestoneChanges, validateDepartment } from "./model";
import { canonicalDepartment, fixedDepartmentRecords, fixedProjectDepartments } from "./departments";
import { progressEvent } from "./progress";
import { ProjectRequestError } from "./repository";
import { TASK_CATEGORIES, type ProjectRepository, type ProjectWorkspace, type Task, type TaskCategory } from "./types";

const KEY = "helix-member-local-projects-v1";
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export function initialLocalWorkspace(): ProjectWorkspace {
  const today = osloDate();
  const task = (number: number, title: string, category: TaskCategory, offset: number, extra: Partial<Task> = {}): Task => ({
    id: id(number), season: "S27", title, category, description: "", projectId: category === "production" ? id(100) : category === "marketing" ? id(101) : category === "partnership-deliverables" ? id(102) : id(103), milestoneId: null,
    assigneeIds: [id(1)], deadline: addDays(today, offset), startDate: addDays(today, -7), status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "", revision: 1, createdAt: `${addDays(today, -7)}T10:00:00.000Z`, updatedAt: new Date().toISOString(), completedAt: null, ...extra,
  });
  const tasks = [
      task(10, "Complete chassis design review", "production", -3, { milestoneId: id(13), status: "done", completedAt: `${addDays(today, -3)}T12:00:00.000Z` }),
      task(11, "Confirm material delivery", "production", -1, { milestoneId: id(13), status: "blocked", priority: "high", blockedReason: "Waiting for the supplier to confirm the delivery date." }),
      task(12, "Assemble suspension mounts", "production", 6, { milestoneId: id(13), status: "in_progress", assigneeIds: [id(2)] }),
      task(13, "Chassis ready for assembly", "production", 35, { kind: "milestone", startDate: null }),
      task(14, "Deliver partner team photographs", "partnership-deliverables", 4, { milestoneId: id(17), partnerName: "Example Engineering", assigneeIds: [id(1), id(2)] }),
      task(15, "Publish workshop update", "marketing", 3, { milestoneId: id(18), status: "in_progress" }),
      task(16, "Submit competition registration", "operations", 12, { kind: "milestone", startDate: null, priority: "urgent" }),
      task(17, "Partner launch commitments", "partnership-deliverables", 14, { kind: "milestone", partnerName: "Example Engineering" }),
      task(18, "Campaign launch", "marketing", 14, { kind: "milestone" }),
  ];
  return { season: "S27", viewerId: id(1), canManage: true, taskLeadCategories: [...TASK_CATEGORIES],
    departments: fixedDepartmentRecords([{ id: id(300), season: "S27", revision: 1, name: "Mechanical & Production", memberIds: [id(1), id(2)], leadId: id(1) }, { id: id(301), season: "S27", revision: 1, name: "Electronics", memberIds: [id(2)], leadId: id(2) }]),
    members: [{ id: id(1), name: "Alex Example" }, { id: id(2), name: "Sam Example" }],
    projects: [{ id: id(100), season: "S27", name: "Chassis & assembly", description: "Coordinate fabrication, electronics fit and final assembly.", category: "production", departments: ["Mechanical & Production", "Electronics"], startDate: addDays(today, -7), deadline: addDays(today, 35), revision: 1 },
      ...([['Marketing', 'marketing', 101], ['Partnerships', 'partnership-deliverables', 102], ['Operations', 'operations', 103]] as const).map(([name, category, number]) => ({ id: id(number), season: "S27", name, description: "", category, departments: fixedProjectDepartments([name]), startDate: addDays(today, -7), deadline: addDays(today, 35), revision: 1 })),
    ],
    tasks,
    progressEvents: [
      ...tasks.map(item => progressEvent({ ...item, status: "todo" }, `${addDays(today, -7)}T10:00:00.000Z`)),
      ...tasks.filter(item => item.status !== "todo").map((item, index) => progressEvent(item, `${addDays(today, -3 + index)}T12:00:00.000Z`)),
    ],
  };
}

export function createLocalProjectRepository(): ProjectRepository {
  if (!isLocalMemberMode()) throw new Error("Local project data requires member-local development mode on loopback.");
  function read(): ProjectWorkspace {
    const saved = localStorage.getItem(KEY);
    const workspace = saved ? JSON.parse(saved) as ProjectWorkspace : initialLocalWorkspace();
    // Upgrade permissions and older single-person assignments only in dedicated local fixtures.
    const tasks = workspace.tasks.map(item => {
      const { assigneeId: legacy, ...task } = item as Task & { assigneeId?: string | null };
      return { ...task, milestoneId: task.milestoneId ?? null, assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds : legacy ? [legacy] : [] };
    });
    const previousDepartments = workspace.departments ?? [];
    if (previousDepartments.some(department => canonicalDepartment(department.name) !== department.name) && !localStorage.getItem("helix-member-local-department-archive-v1")) localStorage.setItem("helix-member-local-department-archive-v1", JSON.stringify(previousDepartments));
    return { ...workspace, tasks, projects: workspace.projects.map(project => ({ ...project, departments: fixedProjectDepartments(project.departments) })), departments: fixedDepartmentRecords(previousDepartments), progressEvents: workspace.progressEvents ?? tasks.map(item => progressEvent(item)), taskLeadCategories: workspace.taskLeadCategories ?? [...TASK_CATEGORIES] };
  }
  return {
    async load() { const workspace = read(); localStorage.setItem(KEY, JSON.stringify(workspace)); return workspace; },
    async mutate(mutation) {
      const workspace = read();
      const collection = mutation.action === "save_department" ? workspace.departments : mutation.action === "save_project" ? workspace.projects : workspace.tasks;
      const current = collection.find(item => item.id === mutation.id);
      if ((current?.revision ?? 0) !== mutation.expectedRevision) throw new ProjectRequestError("This item changed in another session. Reload before saving again.", 409);
      const now = new Date().toISOString();
      if (mutation.action === "save_department") {
        if (!workspace.canManage) throw new ProjectRequestError("Project management access is required to manage departments.", 403);
        if (mutation.expectedRevision < 1) throw new Error("Organization departments are fixed.");
        const department = validateDepartment(mutation.department);
        const previous = workspace.departments.find(item => item.id === mutation.id);
        if (previous && previous.name !== department.name) throw new Error("Department names cannot be changed after creation.");
        if (workspace.departments.some(item => item.id !== mutation.id && item.name.toLowerCase() === department.name.toLowerCase())) throw new Error("A department with this name already exists.");
        if (department.memberIds.some(id => !workspace.members.some(member => member.id === id))) throw new Error("Choose active platform members for this department.");
        workspace.departments = [...workspace.departments.filter(item => item.id !== mutation.id), { ...department, id: mutation.id, season: workspace.season, revision: mutation.expectedRevision + 1 }];
      } else if (mutation.action === "save_project") {
        const previousStart = workspace.projects.find(project => project.id === mutation.id)?.startDate ?? null;
        const project = validateProject({ ...mutation.project, startDate: mutation.project.startDate === undefined ? previousStart : mutation.project.startDate });
        const ledDepartments = workspace.departments.filter(d => d.leadId === workspace.viewerId).map(d => d.name);
        const previousProject = workspace.projects.find(p => p.id === mutation.id);
        if (!workspace.canManage && (!project.departments.some(d => ledDepartments.includes(d)) || (previousProject && !previousProject.departments.some(d => ledDepartments.includes(d))))) throw new ProjectRequestError("Only project managers or a Lead for this department can manage projects.", 403);
        if (project.leadIds?.some(id => !workspace.members.some(member => member.id === id))) throw new Error("Choose active members for all project Leads.");
        if (workspace.tasks.some(task => task.projectId === mutation.id && task.category !== project.category)) throw new Error("Move the project's tasks before changing its category.");
        workspace.projects = [...workspace.projects.filter(item => item.id !== mutation.id), { ...project, id: mutation.id, season: workspace.season, revision: mutation.expectedRevision + 1 }];
      } else if (mutation.action === "update_milestone") {
        const previous = workspace.tasks.find(item => item.id === mutation.id);
        if (!previous || previous.kind !== "milestone") throw new ProjectRequestError("Milestone not found.", 404);
        if (!workspace.taskLeadCategories.includes(previous.category)) throw new ProjectRequestError("A Department Lead grant for this area is required to edit milestones.", 403);
        const changes = validateMilestoneChanges(mutation.changes);
        if (changes.deadline && previous.startDate && previous.startDate > changes.deadline) throw new Error("The start date must be on or before the deadline.");
        if (changes.assigneeIds?.some(id => !workspace.members.some(member => member.id === id))) throw new Error("Choose active members for all Leads.");
        workspace.tasks = workspace.tasks.map(item => item.id === previous.id ? { ...previous, ...changes, revision: previous.revision + 1, updatedAt: now } : item);
      } else {
        const previous = workspace.tasks.find(item => item.id === mutation.id);
        if (mutation.action === "save_task" && (!workspace.taskLeadCategories.includes(mutation.task.category) || (previous && !workspace.taskLeadCategories.includes(previous.category)))) throw new ProjectRequestError("A Department Lead grant for this area is required to create, edit or assign tasks.", 403);
        if (mutation.action === "set_status" && !previous) throw new ProjectRequestError("Task not found.", 404);
        if (mutation.action === "set_status" && previous && !workspace.canManage && !previous.assigneeIds.includes(workspace.viewerId) && !workspace.taskLeadCategories.includes(previous.category)) throw new ProjectRequestError("You can update only your assigned tasks.", 403);
        const task = validateTask(mutation.action === "save_task" ? mutation.task : { ...previous!, status: mutation.status, blockedReason: mutation.blockedReason }, { allowUnorganized: mutation.action === "set_status" });
        if (mutation.action === "save_task") {
          if (task.assigneeIds.some(id => !workspace.members.some(member => member.id === id))) throw new Error("Choose active members for all assignments.");
          if (task.projectId && !workspace.projects.some(project => project.id === task.projectId && project.category === task.category)) throw new Error("Choose a project in the same area.");
          const milestone = workspace.tasks.find(item => item.id === task.milestoneId);
          if (task.milestoneId && (task.kind !== "task" || task.milestoneId === mutation.id || !milestone || milestone.kind !== "milestone" || milestone.category !== task.category || (!milestone.projectId || milestone.projectId !== task.projectId) || (milestone.status === "cancelled" && previous?.milestoneId !== milestone.id))) throw new Error("Choose an available milestone in the same area and project.");
          if (workspace.tasks.some(item => item.milestoneId === mutation.id && (task.kind !== "milestone" || item.category !== task.category || (task.projectId && task.projectId !== item.projectId)))) throw new Error("Unlink this milestone's tasks before changing its type, area or project.");
        }
        workspace.tasks = [...workspace.tasks.filter(item => item.id !== mutation.id), { ...task, id: mutation.id, season: workspace.season, revision: mutation.expectedRevision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, completedAt: task.status === "done" ? previous?.completedAt ?? now : null }];
      }
      if (mutation.action !== "save_project" && mutation.action !== "save_department") {
        const saved = workspace.tasks.find(item => item.id === mutation.id)!;
        const previous = current as Task | undefined;
        if (!previous || previous.status !== saved.status || previous.kind !== saved.kind || previous.category !== saved.category) workspace.progressEvents.push(progressEvent(saved, now));
      }
      localStorage.setItem(KEY, JSON.stringify(workspace));
      return workspace;
    },
  };
}
