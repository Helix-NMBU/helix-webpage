// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import { TaskStatusControl, TaskStatusIcon, type SaveTaskStatus } from "./TaskStatus";
import { STATUS_LABELS, type ProjectWorkspace, type Task, type TaskStatus } from "./types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));

describe("task status menu", () => {
  let root: Root, container: HTMLDivElement;
  const save = vi.fn<SaveTaskStatus>();
  function Harness({ initial, workspace }: { initial: Task; workspace: ProjectWorkspace }) {
    const [task, setTask] = useState(initial);
    return (
      <TaskStatusControl
        task={task}
        workspace={workspace}
        busy={false}
        onSave={async (item, status, blockedReason) => {
          const result = await save(item, status, blockedReason);
          if (result) setTask({ ...item, status, blockedReason, revision: item.revision + 1 });
          return result;
        }}
      />
    );
  }
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    notify.mockReset();
    save.mockReset().mockResolvedValue(true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function open(status: TaskStatus = "todo", workspace = initialLocalWorkspace()) {
    const task = {
      ...workspace.tasks[1],
      status,
      blockedReason: status === "blocked" ? "Supplier confirmation needed" : "",
    };
    await act(async () => root.render(<Harness initial={task} workspace={workspace} />));
    return task;
  }
  async function menu() {
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  }
  async function choose(label: string) {
    await act(async () =>
      document.querySelector<HTMLElement>(`[role="option"][aria-label="${label}"]`)!.click(),
    );
  }
  async function reason(value: string) {
    const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Blocked reason"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        field,
        value,
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () =>
      document
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  }
  it("offers exactly the five workflow statuses with the current one checked", async () => {
    await open();
    await menu();
    expect(
      [...document.querySelectorAll('[role="option"]')].map((item) =>
        item.getAttribute("aria-label"),
      ),
    ).toEqual(["Backlog", "Todo", "In progress", "Done", "Blocked"]);
    expect(
      document.querySelector('[role="option"][aria-label="Todo"] .tabler-icon-check'),
    ).not.toBeNull();
    expect(document.querySelector('[role="option"][aria-label="Cancelled"]')).toBeNull();
  });
  it.each(["backlog", "todo", "in_progress", "done"] as const)(
    "changes a task to %s and clears a previous blocking reason",
    async (status) => {
      const task = await open("blocked");
      await menu();
      await choose(STATUS_LABELS[status]);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ id: task.id, revision: 1 }),
        status,
        "",
      );
      expect(container.querySelector(`[data-task-status="${status}"]`)).not.toBeNull();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    },
  );
  it("requires a blocking reason and retains it after a failed save for retry", async () => {
    save.mockResolvedValueOnce(false);
    await open();
    await menu();
    await choose("Blocked");
    await submit();
    expect(save).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
    await reason("  Waiting for material delivery  ");
    await submit();
    expect(save).toHaveBeenLastCalledWith(
      expect.anything(),
      "blocked",
      "Waiting for material delivery",
    );
    expect(
      document.querySelector<HTMLTextAreaElement>('[aria-label="Blocked reason"]')?.value,
    ).toBe("  Waiting for material delivery  ");
    await submit();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].revision).toBe(1);
    expect(container.querySelector('[data-task-status="blocked"]')).not.toBeNull();
  });
  it("does not send another write when the current status is selected", async () => {
    await open("in_progress");
    await menu();
    await choose("In progress");
    expect(save).not.toHaveBeenCalled();
  });
  it("filters statuses through the search field", async () => {
    await open();
    await menu();
    const field = document.querySelector<HTMLInputElement>('[aria-label="Find task status"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        field,
        "back",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      [...document.querySelectorAll('[role="option"]')].map((item) =>
        item.getAttribute("aria-label"),
      ),
    ).toEqual(["Backlog"]);
    await choose("Backlog");
    expect(save).toHaveBeenCalledWith(expect.anything(), "backlog", "");
  });
  it("disables edits without management, area Lead or assignment permissions", async () => {
    const data = initialLocalWorkspace();
    data.canManage = false;
    data.taskLeadCategories = [];
    data.viewerId = "someone-else";
    await open("todo", data);
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps the menu pending and prevents duplicate writes", async () => {
    let resolve!: (saved: boolean) => void;
    save.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    await open();
    await menu();
    await choose("Done");
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    await choose("Done");
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve(true));
    expect(container.querySelector('[data-task-status="done"]')).not.toBeNull();
  });
  it("uses the requested icon families and fills the right half of In progress", async () => {
    await act(async () =>
      root.render(
        <>
          {(["backlog", "todo", "in_progress", "done", "blocked"] as const).map((status) => (
            <TaskStatusIcon key={status} status={status} />
          ))}
        </>,
      ),
    );
    const classes = ["circle-dotted", "circle", "circle-half", "circle-check", "circle-minus"];
    expect(
      [...container.querySelectorAll("svg")].map((icon, index) =>
        icon.classList.contains(`tabler-icon-${classes[index]}`),
      ),
    ).toEqual(Array(5).fill(true));
    expect(
      container
        .querySelector('[data-task-status="in_progress"] path[fill="currentColor"]')
        ?.getAttribute("d"),
    ).toBe("M12 3a9 9 0 0 1 0 18Z");
  });
});
