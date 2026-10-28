import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import { canManageProject, canManageTask, canUpdateTaskStatus, departmentAccess } from "./permissions";

function workspace(level: "member" | "viewer" | "lead") {
  const data = initialLocalWorkspace();
  data.canManage = false;
  data.taskLeadCategories = ["production", "marketing", "operations", "partnership-deliverables"];
  data.departments = data.departments.map(department => ({ ...department, memberIds: [data.viewerId], viewerIds: level === "viewer" ? [data.viewerId] : [], leadId: level === "lead" && department.name === "Mechanical & Production" ? data.viewerId : null }));
  return data;
}

describe("department work permissions", () => {
  it("allows Members to change only assigned task status", () => {
    const data = workspace("member");
    const assigned = data.tasks.find(task => task.kind === "task" && task.assigneeIds.includes(data.viewerId))!;
    expect(canUpdateTaskStatus(assigned, data)).toBe(true);
    expect(canUpdateTaskStatus({ ...assigned, assigneeIds: [] }, data)).toBe(false);
    expect(canUpdateTaskStatus({ ...assigned, kind: "milestone" }, data)).toBe(false);
    expect(canManageTask(assigned, data)).toBe(false);
    expect(canManageProject(data.projects[0], data)).toBe(false);
  });
  it("keeps assigned Viewers read-only despite legacy category grants", () => {
    const data = workspace("viewer");
    for (const task of data.tasks) {
      expect(canManageTask(task, data)).toBe(false);
      expect(canUpdateTaskStatus(task, data)).toBe(false);
    }
    expect(departmentAccess(data.departments[0], data.viewerId)).toBe("viewer");
  });
  it("limits Leads to their project's departments regardless of work area", () => {
    const data = workspace("lead");
    data.taskLeadCategories = [];
    expect(canManageTask(data.tasks[0], data)).toBe(true);
    const otherProject = data.projects.find(project => !project.departments.includes("Mechanical & Production"))!;
    expect(canManageProject(otherProject, data)).toBe(false);
    const shared = { ...otherProject, departments: ["Mechanical & Production"] };
    expect(canManageProject(shared, data)).toBe(true);
  });
  it("uses the management role override for all departments", () => {
    const data = workspace("viewer");
    data.canManage = true;
    data.taskLeadCategories = [];
    for (const task of data.tasks) {
      expect(canManageTask(task, data)).toBe(true);
      expect(canUpdateTaskStatus(task, data)).toBe(true);
    }
  });
  it("does not treat task assignment or project Lead assignment as department membership", () => {
    const data = workspace("member");
    data.departments = [];
    expect(canUpdateTaskStatus(data.tasks[0], data)).toBe(false);
    expect(canManageProject(data.projects[0], data)).toBe(false);
    expect(canManageTask(data.tasks[0], data)).toBe(false);
  });
});
