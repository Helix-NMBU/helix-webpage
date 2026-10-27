import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import {
  assignedTasks,
  personalTaskGroups,
  personalTaskView,
} from "./personal-task-view";
const options = (query = "") => personalTaskView(new URLSearchParams(query));
const today = "2026-10-27";

describe("personal task view", () => {
  it("never includes milestones, even when the viewer is their Lead", () => {
    const workspace = initialLocalWorkspace();
    workspace.tasks = workspace.tasks.map((task) => ({
      ...task,
      assigneeIds: [workspace.viewerId],
    }));
    expect(assignedTasks(workspace).every((task) => task.kind === "task")).toBe(
      true,
    );
    const grouped = personalTaskGroups(workspace, options(), today).flatMap(
      (group) => group.tasks,
    );
    expect(grouped).toHaveLength(
      workspace.tasks.filter((task) => task.kind === "task").length,
    );
    expect(grouped.every((task) => task.kind === "task")).toBe(true);
  });
  it("filters linked tasks by milestone without requiring milestone assignment", () => {
    const workspace = initialLocalWorkspace();
    const milestone = workspace.tasks.find(
      (task) => task.kind === "milestone",
    )!;
    milestone.assigneeIds = [];
    const linked = assignedTasks(workspace).filter(
      (task) => task.milestoneId === milestone.id,
    );
    expect(linked.length).toBeGreaterThan(0);
    const grouped = personalTaskGroups(
      workspace,
      options(`milestone=${milestone.id}`),
      today,
    );
    expect(
      grouped
        .flatMap((group) => group.tasks)
        .map((task) => task.id)
        .sort(),
    ).toEqual(linked.map((task) => task.id).sort());
  });
  it("combines status, area, project and completion filters", () => {
    const workspace = initialLocalWorkspace();
    const task = assignedTasks(workspace).find(
      (task) => task.status === "blocked",
    )!;
    const query = `status=blocked&area=${task.category}&project=${task.projectId}`;
    expect(
      personalTaskGroups(workspace, options(query), today).flatMap(
        (group) => group.tasks,
      ),
    ).toEqual([task]);
    expect(
      personalTaskGroups(workspace, options(`${query}&milestone=none`), today),
    ).toEqual([]);
    expect(
      personalTaskGroups(workspace, options("completed=hide"), today)
        .flatMap((group) => group.tasks)
        .some((task) => task.status === "done"),
    ).toBe(false);
  });
  it("supports grouping by status, project or milestone and stable ordering", () => {
    const workspace = initialLocalWorkspace();
    const tasks = assignedTasks(workspace);
    const statusGroups = personalTaskGroups(
      workspace,
      options("group=status"),
      today,
    );
    for (const group of statusGroups)
      expect(group.tasks.every((task) => task.status === group.id)).toBe(true);
    for (const group of personalTaskGroups(
      workspace,
      options("group=project"),
      today,
    ))
      expect(
        group.tasks.every((task) => (task.projectId ?? "none") === group.id),
      ).toBe(true);
    for (const group of personalTaskGroups(
      workspace,
      options("group=milestone"),
      today,
    ))
      expect(
        group.tasks.every((task) => (task.milestoneId ?? "none") === group.id),
      ).toBe(true);
    const ordered = personalTaskGroups(
      workspace,
      options("group=none&sort=title"),
      today,
    );
    expect(ordered).toHaveLength(1);
    expect(ordered[0].tasks.map((task) => task.title)).toEqual(
      tasks
        .filter((task) => task.status !== "cancelled")
        .map((task) => task.title)
        .sort((a, b) => a.localeCompare(b)),
    );
  });
  it("restores explicit properties and safe defaults from URL preferences", () => {
    expect(options().columns).toEqual(["deadline", "project", "assignee"]);
    expect(options("columns=milestone,priority,unknown").columns).toEqual([
      "milestone",
      "priority",
    ]);
    expect(options("columns=").columns).toEqual([]);
    expect(options("group=invalid&sort=invalid&status=invalid")).toMatchObject({
      group: "due",
      sort: "deadline",
      status: "all",
    });
  });
  it("keeps unorganized legacy tasks visible and ignores removed cancelled preferences", () => {
    const workspace = initialLocalWorkspace();
    const task = assignedTasks(workspace)[0];
    task.projectId = null;
    task.milestoneId = null;
    task.status = "cancelled";
    expect(
      personalTaskGroups(
        workspace,
        options("cancelled=show&project=none&milestone=none"),
        today,
      ).flatMap((group) => group.tasks),
    ).toEqual([task]);
    expect(
      personalTaskGroups(
        workspace,
        options("cancelled=hide&project=none&milestone=none"),
        today,
      ).flatMap((group) => group.tasks),
    ).toEqual([task]);
  });
});

it("defaults board cards to priority and milestone while respecting display preferences", () => {
  expect(personalTaskView(new URLSearchParams("view=board")).columns).toEqual([
    "deadline",
    "milestone",
    "assignee",
    "priority",
  ]);
  expect(
    personalTaskView(new URLSearchParams("view=board&columns=project,assignee"))
      .columns,
  ).toEqual(["milestone", "assignee"]);
  expect(
    personalTaskView(new URLSearchParams("view=board&columns=")).columns,
  ).toEqual([]);
});
