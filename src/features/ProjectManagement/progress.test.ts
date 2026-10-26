import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import { compatibleMilestones, milestoneProgress, progressCounts, progressEvent, progressSeries, updateTaskDraft } from "./progress";

describe("observed task progress", () => {
  const task = initialLocalWorkspace().tasks[0];
  it("counts started work inclusively without milestones or cancelled tasks", () => {
    expect(progressCounts([task, { ...task, status: "blocked" }, { ...task, status: "in_progress" }, { ...task, status: "todo" }, { ...task, status: "cancelled" }, { ...task, kind: "milestone" }])).toEqual({ scope: 4, started: 3, completed: 1 });
  });
  it("uses each task's latest observed state per Oslo date, including reopening and cancelled scope", () => {
    const other = { ...task, id: "other", status: "todo" as const };
    const events = [
      progressEvent({ ...task, status: "todo" }, "2026-10-24T10:00:00Z"),
      progressEvent(other, "2026-10-24T10:00:00Z"),
      progressEvent(task, "2026-10-25T10:00:00Z"),
      progressEvent({ ...task, status: "todo" }, "2026-10-25T23:30:00Z"),
      progressEvent({ ...other, status: "cancelled" }, "2026-10-26T10:00:00Z"),
    ];
    expect(progressSeries(events, [{ ...task, status: "todo" }, { ...other, status: "cancelled" }], "2026-10-26")).toEqual([
      { date: "2026-10-24", scope: 2, started: 0, completed: 0 },
      { date: "2026-10-25", scope: 2, started: 1, completed: 1 },
      { date: "2026-10-26", scope: 1, started: 0, completed: 0 },
    ]);
  });
  it("does not infer history from scheduled dates or draw future observations", () => {
    const current = { ...task, startDate: "2026-09-01", deadline: "2026-12-01" };
    expect(progressSeries([], [current], "2026-10-26")).toEqual([{ date: "2026-10-26", scope: 1, started: 1, completed: 1 }]);
    expect(progressSeries([progressEvent(current, "2026-10-27T12:00:00Z")], [current], "2026-10-26")).toHaveLength(1);
  });
  it("keeps completed tasks carried forward when there are days without activity", () => {
    expect(progressSeries([progressEvent(task, "2026-10-23T12:00:00Z")], [task], "2026-10-26")).toEqual([
      { date: "2026-10-23", scope: 1, started: 1, completed: 1 }, { date: "2026-10-26", scope: 1, started: 1, completed: 1 },
    ]);
  });
});

describe("milestone membership", () => {
  const workspace = initialLocalWorkspace();
  const milestone = workspace.tasks.find(task => task.kind === "milestone")!;
  it("calculates completion only from linked active tasks, independently of milestone status", () => {
    const extra = { ...workspace.tasks[0], id: "cancelled", status: "cancelled" as const };
    expect(milestoneProgress([...workspace.tasks, extra, { ...milestone, id: "nested", milestoneId: milestone.id }], milestone.id)).toMatchObject({ total: 3, done: 1, percent: 33 });
    expect(milestoneProgress([milestone], milestone.id)).toMatchObject({ total: 0, percent: 0 });
    expect(milestoneProgress(workspace.tasks, null)).toMatchObject({ total: 2 });
  });
  it("offers compatible area and project goals and retains a task's existing cancelled goal", () => {
    const task = workspace.tasks[0];
    const cancelled = { ...milestone, status: "cancelled" as const };
    const otherArea = { ...milestone, id: "marketing", category: "marketing" as const };
    const otherProject = { ...milestone, id: "other-project", projectId: "another" };
    const season = { ...milestone, id: "season", projectId: null };
    expect(compatibleMilestones([cancelled, otherArea, otherProject, season], task).map(item => item.id)).toEqual([milestone.id, "season"]);
    expect(compatibleMilestones([cancelled], { ...task, milestoneId: null })).toEqual([]);
  });
  it("clears an incompatible link when changing project or converting a task into a milestone", () => {
    const task = workspace.tasks[0];
    expect(updateTaskDraft(task, "projectId", null, workspace.tasks).milestoneId).toBeNull();
    expect(updateTaskDraft(task, "kind", "milestone", workspace.tasks).milestoneId).toBeNull();
    expect(updateTaskDraft(task, "title", "Renamed task", workspace.tasks).milestoneId).toBe(task.milestoneId);
  });

});
