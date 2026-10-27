import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import { isOrganized } from "./hierarchy";
import { updateTaskDraft } from "./progress";
import { validateTask } from "./model";

describe("season project milestone task hierarchy", () => {
  const workspace = initialLocalWorkspace();
  const task = workspace.tasks[0];
  it("requires the complete project and milestone chain for organized tasks", () => {
    expect(isOrganized(task, workspace)).toBe(true);
    expect(isOrganized({ ...task, milestoneId: null }, workspace)).toBe(false);
    expect(isOrganized({ ...task, projectId: null }, workspace)).toBe(false);
    expect(isOrganized(task, { ...workspace, tasks: workspace.tasks.map(item => item.id === task.milestoneId ? { ...item, projectId: null } : item) })).toBe(false);
    expect(isOrganized({ ...task, season: "S26" }, workspace)).toBe(false);
  });
  it("requires placement on full saves while retaining legacy status validation", () => {
    expect(() => validateTask({ ...task, projectId: null })).toThrow("project");
    expect(() => validateTask({ ...task, milestoneId: null })).toThrow("milestone");
    expect(validateTask({ ...task, projectId: null, milestoneId: null }, { allowUnorganized: true }).status).toBe("done");
  });
  it("inherits the project when a milestone is selected", () => {
    const milestone = workspace.tasks.find(item => item.kind === "milestone" && item.category === "marketing")!;
    const draft = { ...workspace.tasks.find(item => item.category === "marketing" && item.kind === "task")!, projectId: null, milestoneId: null };
    expect(updateTaskDraft(draft, "milestoneId", milestone.id, workspace.tasks)).toMatchObject({ projectId: milestone.projectId, milestoneId: milestone.id });
  });
});
