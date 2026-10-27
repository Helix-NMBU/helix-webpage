// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "./TaskBoard";
import { initialLocalWorkspace } from "./local-repository";
import type { ProjectWorkspace } from "./types";
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => vi.fn(),
}));
describe("shared task board", () => {
  let root: Root, container: HTMLDivElement;
  const onOpen = vi.fn(),
    onSave = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onOpen.mockClear();
    onSave.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(
    data = initialLocalWorkspace(),
    columns: ("milestone" | "assignee" | "deadline" | "priority")[] = [
      "milestone",
      "assignee",
      "deadline",
      "priority",
    ],
  ) {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBoard
            tasks={data.tasks}
            workspace={data}
            busy={false}
            columns={columns}
            onOpen={onOpen}
            onStatusChange={onSave}
          />
        </MemoryRouter>,
      ),
    );
  }
  it("shows five status columns, empty columns and task cards without milestone cards", async () => {
    const data = initialLocalWorkspace();
    await render(data);
    expect(container.querySelectorAll('[aria-label$=" column"]')).toHaveLength(
      5,
    );
    expect(container.querySelectorAll('[role="article"]')).toHaveLength(
      data.tasks.filter((task) => task.kind === "task").length,
    );
    for (const task of data.tasks.filter((task) => task.kind === "milestone"))
      expect(
        container.querySelector(`[role="article"][aria-label="${task.title}"]`),
      ).toBeNull();
    expect(
      container.querySelector('[aria-label="Backlog cards"]')?.textContent,
    ).toContain("No tasks");
    expect(container.querySelector('a[href*="?milestone="]')).not.toBeNull();
  });
  it("opens a card independently from status controls and honors display properties", async () => {
    const data = initialLocalWorkspace();
    await render(data, []);
    const task = data.tasks.find((task) => task.kind === "task")!;
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector('[aria-label^="Assigned to"]')).toBeNull();
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[role="article"] button',
      ),
    ].find((button) => button.textContent === task.title)!;
    await act(async () => button.click());
    expect(onOpen).toHaveBeenCalledWith(task);
    expect(onSave).not.toHaveBeenCalled();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `[aria-label="Change status for ${task.title}"]`,
        )!
        .click(),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () =>
      document
        .querySelector<HTMLElement>('[role="option"][aria-label="Backlog"]')!
        .click(),
    );
    expect(onSave).toHaveBeenCalledWith(task, "backlog", "");
  });
  it("keeps status updates disabled for readers and preserves legacy cancelled cards", async () => {
    const data: ProjectWorkspace = initialLocalWorkspace();
    data.canManage = false;
    data.taskLeadCategories = [];
    data.viewerId = "reader";
    data.tasks.find((task) => task.kind === "task")!.status = "cancelled";
    await render(data);
    expect(container.querySelectorAll('[aria-label$=" column"]')).toHaveLength(
      6,
    );
    expect(
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          '[aria-label^="Change status for"]',
        ),
      ].every((button) => button.disabled),
    ).toBe(true);
  });
});
