import { approveLocalDepartmentCandidates, sendLocalDepartmentCandidates, approvePendingLocalDepartmentPackage } from "./department-budget.test-support";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBudgetsPanel } from "./ProjectBudgetsPanel";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import type { ProjectBudgetRepository } from "./project-budget-repository";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
const projectId = "00000000-0000-4000-8000-000000000100",
  departmentId = "00000000-0000-4000-8000-000000000300";
let root: Root,
  container: HTMLDivElement,
  repo: ProjectBudgetRepository,
  id: string,
  systemId: string;
const role = (value: string) =>
  window.history.replaceState({}, "", `/?budgetRole=${value}`);
const button = (label: string) => {
  const element = [
    ...document.body.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (item) =>
      item.textContent === label && !item.closest('[aria-hidden="true"]'),
  );
  expect(element, label).toBeTruthy();
  return element!;
};
async function click(label: string) {
  await act(async () => button(label).click());
}
async function render() {
  await act(async () =>
    root.render(
      <ProjectBudgetsPanel
        key={window.location.search}
        repository={repo}
        projectId={projectId}
      />,
    ),
  );
}
async function textarea(elementId: string, value: string) {
  await act(async () => {
    const field = document.getElementById(elementId);
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, value);
    field!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function approveInitial() {
  let budget = await repo.detail(id);
  await repo.mutate({
    action: "submitProjectBudget",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
  });
  await approveLocalDepartmentCandidates(departmentId);
}
async function chooseVersion(text: string) {
  const trigger = document.getElementById("project-budget-version")!;
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === text)!;
  expect(option, text).toBeTruthy();
  await act(async () => option.click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  notify.mockReset();
  role("project_lead");
  repo = createLocalProjectBudgetRepository();
  const budget = await repo.mutate({
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: departmentId,
    requestId: crypto.randomUUID(),
  });
  id = budget.id;
  systemId = (await repo.load()).systems!.find(
    (system) => system.departmentName === "Mechanical & Production",
  )!.id;
  await repo.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
    entry: {
      systemId,
      description: "Frame tubes",
      plannedNok: "10000.00",
      category: "material",
      ordinaryPriority: "P2",
      reuseStatus: "reuse",
      status: "planned",
      note: "Supplier reference",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("reviewing revisions and CSV changes", () => {
  it("requests a revision, imports into its Draft, reviews both versions and promotes only after both decisions", async () => {
    await approveInitial();
    role("finance");
    await render();
    await click("Request changes");
    await click("Request changes");
    expect(notify).toHaveBeenLastCalledWith(
      "Enter a reason",
      expect.any(String),
      expect.anything(),
    );
    await textarea("budget-return-reason", "Update supplier quote");
    await click("Request changes");
    expect(container.textContent).toContain("No entry changes yet");
    expect(container.textContent).not.toContain("Import CSV");
    role("project_lead");
    await render();
    await click("Import CSV");
    await textarea(
      "project-budget-csv",
      `system_id;description;planned_nok;priority\n${systemId};Frame tubes;12500.25;P1\n${systemId};Motor;50.00;P3`,
    );
    await click("Preview import");
    expect(
      document.querySelector('[aria-label="Project budget import preview"]')
        ?.textContent,
    ).toContain("Added 1 · Changed 1");
    expect((await repo.detail(id)).approvedTotalNok).toBe("10000.00");
    await click("Import into Draft");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("NOK 2,550.25");
    expect(
      container.querySelector('[aria-label="Changes from approved budget"]')
        ?.textContent,
    ).toContain("Ordinary priority");
    await chooseVersion("Approved version 1");
    expect(container.textContent).not.toContain("Send to department lead");
    expect(container.textContent).not.toContain("Import CSV");
    await chooseVersion("Proposed version 2");
    await click("Send to department lead");
    role("department_lead");
    await render();
    expect(container.textContent).toContain("Changes from approved version 1");
    expect(container.textContent).toContain("Review department submission");
    await sendLocalDepartmentCandidates(departmentId);
    await render();
    expect((await repo.detail(id)).approvedTotalNok).toBe("10000.00");
    role("finance");
    await render();
    expect(container.textContent).not.toContain("Approve budget");
    role("head_of_finance");
    await render();
    expect(container.textContent).toContain("NOK 2,550.25");
    expect(container.textContent).not.toContain("Approve budget");
    await approvePendingLocalDepartmentPackage(departmentId);
    await render();
    expect((await repo.detail(id)).approvedTotalNok).toBe("12550.25");
    await chooseVersion("Earlier approved version 1");
    expect(container.textContent).toContain("Version 1");
    expect(container.textContent).not.toContain("Import CSV");
  });
  it("retains CSV through a stale preview and refresh, then requires preview again", async () => {
    await render();
    await click("Import CSV");
    const csv = `system_id;description;planned_nok\n${systemId};Frame tubes;12500.25`;
    await textarea("project-budget-csv", csv);
    await click("Preview import");
    const budget = await repo.detail(id);
    await repo.mutate({
      action: "saveProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      entry: {
        ...budget.pendingVersion!.entries[0],
        note: "Changed while previewing",
      },
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      (document.getElementById("project-budget-csv") as HTMLTextAreaElement)
        .value,
    ).toBe(csv);
    await click("Import into Draft");
    expect(notify).toHaveBeenLastCalledWith(
      "Could not import budget entries",
      expect.stringContaining("Your CSV is kept"),
      expect.anything(),
    );
    const action = notify.mock.calls[notify.mock.calls.length - 1][2].action;
    expect(action.label).toBe("Refresh budget");
    await act(async () => action.onClick());
    expect(
      (document.getElementById("project-budget-csv") as HTMLTextAreaElement)
        .value,
    ).toBe(csv);
    expect(button("Import into Draft").disabled).toBe(true);
    await click("Preview import");
    await click("Import into Draft");
    expect((await repo.detail(id)).pendingTotalNok).toBe("12500.25");
  });
  it("clears a private CSV when access ends and ignores its late preview", async () => {
    let end: (() => void) | undefined, finish: (() => void) | undefined;
    const original = repo.mutate;
    repo.watchSession = (callback) => {
      end = callback;
      return () => undefined;
    };
    vi.spyOn(repo, "mutate").mockImplementation(async (change) => {
      if (change.action === "previewProjectBudgetImport")
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return original(change);
    });
    await render();
    await click("Import CSV");
    await textarea(
      "project-budget-csv",
      `system_id;description;planned_nok\n${systemId};Frame tubes;12500.25`,
    );
    await act(async () => button("Preview import").click());
    await act(async () => end!());
    await act(async () => finish!());
    expect(document.getElementById("project-budget-csv")).toBeNull();
    expect(container.textContent).toContain("Budget access required");
    expect(
      notify.mock.calls.some((call) => call[0] === "Budget entries imported"),
    ).toBe(false);
  });
  it("retries an uncertain successful import with the same request and no duplicate entries", async () => {
    const original = repo.mutate;
    let lost = false;
    const mutate = vi
      .spyOn(repo, "mutate")
      .mockImplementation(async (change) => {
        const result = await original(change);
        if (change.action === "importProjectBudgetEntries" && !lost) {
          lost = true;
          throw new Error("Connection interrupted");
        }
        return result;
      });
    await render();
    await click("Import CSV");
    await textarea(
      "project-budget-csv",
      `system_id;description;planned_nok\n${systemId};Frame tubes;12500.25`,
    );
    await click("Preview import");
    await click("Import into Draft");
    const action = notify.mock.calls[notify.mock.calls.length - 1][2].action;
    expect(action.label).toBe("Try again");
    await act(async () => action.onClick());
    const imports = mutate.mock.calls.filter(
      (call) => call[0].action === "importProjectBudgetEntries",
    );
    expect(imports[0][0].requestId).toBe(imports[1][0].requestId);
    expect(
      (await repo.detail(id)).pendingVersion!.entries.filter(
        (entry) => !entry.removed,
      ),
    ).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("allows explicit submission of a revision that removes every entry", async () => {
    await approveInitial();
    role("project_lead");
    const initial = await repo.detail(id);
    await repo.mutate({
      action: "requestProjectBudgetChanges",
      projectBudgetId: id,
      expectedRevision: initial.revision,
      requestId: crypto.randomUUID(),
      reason: "Remove remaining plan",
    });
    await render();
    await click("Remove");
    expect(
      container.querySelector('[aria-label="Changes from approved budget"]')
        ?.textContent,
    ).toContain("Removed 1");
    expect(button("Send to department lead").disabled).toBe(false);
    await click("Send to department lead");
    expect((await repo.detail(id)).pendingTotalNok).toBe("0.00");
    expect((await repo.detail(id)).approvedTotalNok).toBe("10000.00");
  });
  it("renders preview system names and exact NOK values for both versions", async () => {
    await render();
    await click("Import CSV");
    await textarea(
      "project-budget-csv",
      `system_id;description;planned_nok\n${systemId};Frame tubes;999999999999999.99`,
    );
    await click("Preview import");
    const preview = document.querySelector(
      '[aria-label="Project budget import preview"]',
    );
    expect(preview?.textContent).toContain(
      "System: Mechanical & Production (SYS-2)",
    );
    expect(preview?.textContent).not.toContain(systemId);
    expect(preview?.textContent).toContain("Planned amount: NOK 10,000.00");
    expect(preview?.textContent).toContain(
      "Planned amount: NOK 999,999,999,999,999.99",
    );
  });
});
