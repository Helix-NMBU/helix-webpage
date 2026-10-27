import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import { projectTaskView, visibleProjectTasks } from "./project-task-view";
const options = (query = "") => projectTaskView(new URLSearchParams(query));
describe("project task filters", () => {
  it("uses List by default and restores Board without losing filter preferences", () => {
    expect(options().view).toBe("list");
    expect(options("view=board&status=blocked&priority=high")).toMatchObject({
      view: "board",
      status: "blocked",
      priority: "high",
    });
    expect(options("view=invalid&status=invalid")).toMatchObject({
      view: "list",
      status: "all",
    });
  });
  it("combines task-only status, assignee, priority and search filters", () => {
    const data = initialLocalWorkspace();
    const task = data.tasks.find((task) => task.status === "blocked")!;
    expect(
      visibleProjectTasks(
        data.tasks,
        options(
          `status=blocked&assignee=${task.assigneeIds[0]}&priority=${task.priority}`,
        ),
        task.title,
      ),
    ).toEqual([task]);
    expect(
      visibleProjectTasks(
        data.tasks,
        options("status=blocked&assignee=none"),
        "",
      ),
    ).toEqual([]);
    expect(
      visibleProjectTasks(data.tasks, options(), "").every(
        (task) => task.kind === "task",
      ),
    ).toBe(true);
  });
  it("retains completion visibility and orders cards within status by priority", () => {
    const data = initialLocalWorkspace();
    const result = visibleProjectTasks(
      data.tasks,
      options("completed=hide&cancelled=hide&sort=priority"),
      "",
    );
    expect(
      result.every((task) => !["done", "cancelled"].includes(task.status)),
    ).toBe(true);
    const ranks = result.map((task) =>
      ["urgent", "high", "normal", "low"].indexOf(task.priority),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
