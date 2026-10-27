// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "./TaskBoard";
import { initialLocalWorkspace } from "./local-repository";
import type { ProjectWorkspace } from "./types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
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
    onSave.mockReset().mockResolvedValue(true);
    notify.mockReset();
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
    busy = false,
    kind: "task" | "milestone" = "task",
  ) {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBoard
            tasks={data.tasks}
            kind={kind}
            workspace={data}
            busy={busy}
            columns={columns}
            onOpen={onOpen}
            onStatusChange={onSave}
          />
        </MemoryRouter>,
      ),
    );
  }
  async function dragEvent(
    target: Element,
    type: string,
    transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() },
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    await act(async () => target.dispatchEvent(event));
    return event;
  }
  async function dropTask(title: string, status: string) {
    const card = container.querySelector(
      `[role="article"][aria-label="${title}"]`,
    )!;
    const target = container.querySelector(`[aria-label="${status} column"]`)!;
    const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    await dragEvent(card, "dragstart", transfer);
    await dragEvent(target, "dragover", transfer);
    await dragEvent(target, "drop", transfer);
    await dragEvent(card, "dragend", transfer);
  }
  async function fillReason(value: string) {
    const field = document.querySelector<HTMLTextAreaElement>(
      '[aria-label="Blocked reason"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submitReason() {
    await act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  }
  it("changes a dragged task through the existing save and clears its previous blocking reason", async () => {
    const data = initialLocalWorkspace();
    await render(data);
    const task = data.tasks.find((task) => task.status === "blocked")!;
    expect(
      container
        .querySelector(`[role="article"][aria-label="${task.title}"]`)
        ?.getAttribute("draggable"),
    ).toBe("true");
    await dropTask(task.title, "In progress");
    expect(onSave).toHaveBeenCalledWith(task, "in_progress", "");
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("requires a blocked reason, retains it after failure and saves only after confirmation", async () => {
    const data = initialLocalWorkspace();
    await render(data);
    const task = data.tasks.find(
      (task) => task.kind === "task" && task.status === "todo",
    )!;
    onSave.mockResolvedValueOnce(false);
    await dropTask(task.title, "Blocked");
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Move task to Blocked",
    );
    expect(
      container.querySelector(
        `[aria-label="Todo column"] [role="article"][aria-label="${task.title}"]`,
      ),
    ).not.toBeNull();
    await fillReason("  ");
    await submitReason();
    expect(onSave).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
    await fillReason("  Waiting for material approval  ");
    await submitReason();
    expect(onSave).toHaveBeenLastCalledWith(
      task,
      "blocked",
      "Waiting for material approval",
    );
    expect(
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Blocked reason"]',
      )?.value,
    ).toBe("  Waiting for material approval  ");
    await submitReason();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("cancels a blocked drop without changing the task", async () => {
    const data = initialLocalWorkspace();
    await render(data);
    const task = data.tasks.find(
      (task) => task.kind === "task" && task.status === "todo",
    )!;
    await dropTask(task.title, "Blocked");
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === "Cancel")!
        .click(),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("ignores external drops, same-column moves and drops into legacy Cancelled", async () => {
    const data = initialLocalWorkspace();
    const task = data.tasks.find(
      (task) => task.kind === "task" && task.status === "todo",
    )!;
    data.tasks.find(
      (task) => task.kind === "task" && task.status === "done",
    )!.status = "cancelled";
    await render(data);
    await dragEvent(
      container.querySelector('[aria-label="Done column"]')!,
      "drop",
    );
    await dropTask(task.title, "Todo");
    await dropTask(task.title, "Cancelled");
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("prevents duplicate drops while saving and suppresses clicks after a drag", async () => {
    let finish!: (value: boolean) => void;
    onSave.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const data = initialLocalWorkspace();
    await render(data);
    const task = data.tasks.find(
      (task) => task.kind === "task" && task.status === "todo",
    )!;
    await dropTask(task.title, "Done");
    await dropTask(task.title, "In progress");
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () =>
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          '[role="article"] button',
        ),
      ]
        .find((button) => button.textContent === task.title)!
        .click(),
    );
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => finish(false));
    expect(
      container.querySelector(
        `[aria-label="Todo column"] [role="article"][aria-label="${task.title}"]`,
      ),
    ).not.toBeNull();
  });
  it("does not start drags for readers or while loading", async () => {
    const data = initialLocalWorkspace();
    const task = data.tasks.find((task) => task.kind === "task")!;
    data.canManage = false;
    data.taskLeadCategories = [];
    data.viewerId = "reader";
    await render(data);
    expect(
      container
        .querySelector(`[role="article"][aria-label="${task.title}"]`)
        ?.getAttribute("draggable"),
    ).toBe("false");
    await dropTask(task.title, "Backlog");
    expect(onSave).not.toHaveBeenCalled();
    data.canManage = true;
    await render(data, [], true);
    await dropTask(task.title, "Backlog");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("keeps the reason when an unexpected save throws", async () => {
    const data = initialLocalWorkspace();
    await render(data);
    const task = data.tasks.find(
      (task) => task.kind === "task" && task.status === "todo",
    )!;
    onSave.mockRejectedValueOnce(new Error("Connection lost"));
    await dropTask(task.title, "Blocked");
    await fillReason("Supplier is delayed");
    await submitReason();
    expect(
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Blocked reason"]',
      )?.value,
    ).toBe("Supplier is delayed");
    expect(notify).toHaveBeenCalledWith(
      "Could not change status",
      "Connection lost",
      expect.objectContaining({ variant: "error" }),
    );
  });
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
  it("shows milestone cards with linked task progress and their own editable status", async () => {
    const data = initialLocalWorkspace();
    const milestone = data.tasks.find(
      (item) => item.kind === "milestone" && item.category === "production",
    )!;
    const child = data.tasks.find(
      (item) => item.kind === "task" && item.milestoneId === milestone.id,
    )!;
    child.status = "done";
    // A malformed cross-project link must not inflate this milestone's count.
    data.tasks.push({
      ...child,
      id: "foreign-task",
      projectId: "another-project",
    });
    const linked = data.tasks.filter(
      (item) =>
        item.kind === "task" &&
        item.milestoneId === milestone.id &&
        item.projectId === milestone.projectId &&
        item.status !== "cancelled",
    );
    await render(data, ["assignee", "deadline"], false, "milestone");
    const card = container.querySelector(
      `[role="article"][aria-label="${milestone.title}"]`,
    )!;
    expect(
      container.querySelector('[aria-label="Milestone board"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('[role="article"]')).toHaveLength(
      data.tasks.filter((item) => item.kind === "milestone").length,
    );
    expect(
      container.querySelector(`[role="article"][aria-label="${child.title}"]`),
    ).toBeNull();
    const progress = card.querySelector('[role="progressbar"]')!;
    expect(progress.textContent).toBe(
      `${linked.filter((item) => item.status === "done").length}/${linked.length}`,
    );
    expect(progress.getAttribute("aria-valuetext")).toContain(
      `${linked.length} tasks complete`,
    );
    const empty = data.tasks.find(
      (item) =>
        item.kind === "milestone" &&
        !data.tasks.some(
          (child) => child.kind === "task" && child.milestoneId === item.id,
        ),
    )!;
    expect(
      container.querySelector(
        `[role="article"][aria-label="${empty.title}"] [role="progressbar"]`,
      )?.textContent,
    ).toBe("0/0");
    await dropTask(milestone.title, "In progress");
    expect(onSave).toHaveBeenCalledWith(milestone, "in_progress", "");
  });
  it("shows selected priority and milestone badges instead of a project badge", async () => {
    const data = initialLocalWorkspace();
    await render(data, ["priority", "milestone"]);
    const child = data.tasks.find(
      (item) => item.kind === "task" && item.milestoneId,
    )!;
    const card = container.querySelector(
      `[role="article"][aria-label="${child.title}"]`,
    )!;
    expect(card.querySelector("a")?.getAttribute("href")).toContain(
      `?milestone=${child.milestoneId}`,
    );
    expect(card.querySelector("a")?.textContent).toBe(
      data.tasks.find((item) => item.id === child.milestoneId)!.title,
    );
    expect(card.querySelector('[aria-label$=" priority"]')).not.toBeNull();
    expect(
      container.querySelector(
        'a[href="/projects/00000000-0000-4000-8000-000000000100"]',
      ),
    ).toBeNull();
  });
  it("opens a card independently from status controls and honors display properties", async () => {
    const data = initialLocalWorkspace();
    await render(data, []);
    const task = data.tasks.find((task) => task.kind === "task")!;
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector('[aria-label$=" priority"]')).toBeNull();
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
