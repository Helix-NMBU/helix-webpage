// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBudgetsPanel } from "./ProjectBudgetsPanel";
import {
  createLocalFundingApplicationRepository,
  ensureLocalFundingFixtures,
} from "./funding-application-local";
import { readLocalPartnerState } from "../PartnerDeals/local-fixture";
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
const projectId = "00000000-0000-4000-8000-000000000100";
const departmentId = "00000000-0000-4000-8000-000000000300";
let container: HTMLDivElement,
  root: Root,
  repo: ProjectBudgetRepository,
  id: string;
function role(value: string) {
  window.history.replaceState({}, "", `/?budgetRole=${value}`);
}
function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  expect(found, label).toBeTruthy();
  return found!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
function input(id: string, value: string) {
  const element = document.getElementById(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
async function render(repository = repo) {
  await act(async () =>
    root.render(
      <ProjectBudgetsPanel
        key={window.location.search}
        projectId={projectId}
        repository={repository}
      />,
    ),
  );
}
async function submit() {
  const budget = await repo.detail(id);
  await repo.mutate({
    action: "submitProjectBudget",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
  });
}
async function removedBeforeAward() {
  await submit();
  role("department_lead");
  let budget = await repo.detail(id);
  await repo.mutate({
    action: "approveDepartmentBudget",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
  });
  role("head_of_finance");
  budget = await repo.detail(id);
  await repo.mutate({
    action: "approveProjectBudget",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
  });
  role("project_lead");
  budget = await repo.detail(id);
  await repo.mutate({
    action: "requestProjectBudgetChanges",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
    reason: "Revise the purchase plan",
  });
  budget = await repo.detail(id);
  const retained = budget.pendingVersion!.entries[0];
  await repo.mutate({
    action: "removeProjectBudgetEntry",
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
    entryId: retained.entryId,
  });
  const stored = JSON.parse(
    localStorage.getItem("helix-project-budgets-local-v1")!,
  );
  const record = stored.budgets.find((item: { id: string }) => item.id === id);
  for (const version of [record.approvedVersion, record.pendingVersion]) {
    version.entries[0].actualNok = "300.25";
    version.entries[0].invoices = [
      {
        documentId: "retained-invoice",
        purchaseId: "retained-purchase",
        purchaseRef: "PUR-001",
        originalName: "Invoice.pdf",
        backend: "private_storage",
        transferStatus: "stored",
        viewerUrl: null,
      },
    ];
  }
  localStorage.setItem(
    "helix-project-budgets-local-v1",
    JSON.stringify(stored),
  );
  window.history.replaceState({}, "", "/?fundingRole=marketing");
  ensureLocalFundingFixtures();
  const funding = createLocalFundingApplicationRepository(),
    deal = readLocalPartnerState().deals[0];
  let result = await funding.mutate({
    action: "saveFundingApplication",
    requestId: crypto.randomUUID(),
    dealId: deal.id,
    dealExpectedRevision: deal.revision,
    expectedRevision: 0,
    seasonId: "s27",
    purchaseConditions: "Purchase the required frame tubes",
  });
  role("head_of_finance");
  budget = await repo.detail(id);
  result = await funding.mutate({
    action: "linkFundingApplicationEntry",
    requestId: crypto.randomUUID(),
    applicationId: result.id,
    expectedRevision: result.revision,
    entryId: retained.entryId,
    expectedBudgetRevision: budget.revision,
  });
  await funding.mutate({
    action: "recordFundingAward",
    requestId: crypto.randomUUID(),
    applicationId: result.id,
    expectedRevision: result.revision,
    awardDate: "2026-11-19",
    awardReference: "Award after removal",
  });
  role("project_lead");
  return retained;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  notify.mockReset();
  role("project_lead");
  repo = createLocalProjectBudgetRepository();
  const created = await repo.mutate({
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: departmentId,
    requestId: crypto.randomUUID(),
  });
  id = created.id;
  const workspace = await repo.load();
  await repo.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: id,
    expectedRevision: created.revision,
    requestId: crypto.randomUUID(),
    entry: {
      systemId: workspace.systems!.find(
        (system) => system.departmentName === "Mechanical & Production",
      )!.id,
      description: "Frame tubes",
      plannedNok: "10000.00",
      ordinaryPriority: "P1",
      category: "material",
      reuseStatus: "new",
      status: "planned",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("project budget controls", () => {
  it("runs the immutable two-step approval flow with role-appropriate controls", async () => {
    await render();
    expect(container.textContent).toContain("Draft");
    await click("Send to department lead");
    expect(container.textContent).toContain(
      "Sent to approval (Department lead)",
    );
    expect(container.textContent).not.toContain("Add entry");
    role("finance");
    await render();
    expect(container.textContent).not.toContain("Approve budget");
    expect(container.textContent).not.toContain("Approve and send to Finance");
    role("department_lead");
    await render();
    await click("Approve and send to Finance");
    expect(container.textContent).toContain("Sent to approval (Finance)");
    role("finance");
    await render();
    expect(container.textContent).not.toContain("Approve budget");
    role("head_of_finance");
    await render();
    await click("Approve budget");
    expect(container.textContent).toContain("Approved");
    expect(container.textContent).toContain("Head of Finance approved");
    expect((await repo.detail(id)).approvedTotalNok).toBe("10000.00");
  });
  it("keeps dirty entry input across focus refresh, stale saves and explicit reload", async () => {
    const mutate = vi.spyOn(repo, "mutate");
    await render();
    await click("Edit");
    await act(async () =>
      input("budget-entry-description", "Keep this supplier change"),
    );
    const current = await repo.detail(id);
    await repo.mutate({
      action: "saveProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: current.revision,
      requestId: crypto.randomUUID(),
      entry: { ...current.pendingVersion!.entries[0], plannedNok: "12000.00" },
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      (document.getElementById("budget-entry-description") as HTMLInputElement)
        .value,
    ).toBe("Keep this supplier change");
    expect(notify).toHaveBeenCalledWith(
      "Budget updated",
      expect.any(String),
      expect.objectContaining({
        action: expect.objectContaining({ label: "Load latest" }),
      }),
    );
    await click("Save entry");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(notify).toHaveBeenLastCalledWith(
      "Could not save the budget",
      expect.stringContaining("Your form is kept"),
      expect.anything(),
    );
    const recovery =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    await act(async () => recovery());
    expect(
      (document.getElementById("budget-entry-description") as HTMLInputElement)
        .value,
    ).toBe("Keep this supplier change");
    await click("Save entry");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Keep this supplier change");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Edit Keep this supplier change",
    );
    expect(mutate.mock.calls[mutate.mock.calls.length - 1][0]).toMatchObject({
      expectedRevision: current.revision + 1,
    });
  });
  it("uses Radix dismissal and preserves a failed reason form until correction", async () => {
    await submit();
    role("department_lead");
    await render();
    await click("Return for correction");
    await click("Return to Draft");
    expect(notify).toHaveBeenLastCalledWith(
      "Enter a reason",
      expect.any(String),
      expect.anything(),
    );
    const textarea = document.getElementById(
      "budget-return-reason",
    ) as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(textarea, "Add supplier quote");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Return to Draft");
    expect(container.textContent).toContain("Add supplier quote");
    expect((await repo.detail(id)).pendingStage).toBe("draft");
    role("project_lead");
    await render();
    await click("Add entry");
    expect(document.activeElement?.id).toBe("budget-entry-description");
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Add entry"),
    );
  });
  it("deduplicates rapid actions and clears private inputs when access expires", async () => {
    const base = repo.mutate;
    let release: (() => void) | undefined;
    const mutation = vi
      .spyOn(repo, "mutate")
      .mockImplementation(async (change) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return base(change);
      });
    await render();
    await act(async () => {
      button("Send to department lead").click();
      button("Send to department lead").click();
    });
    expect(mutation).toHaveBeenCalledTimes(1);
    await act(async () => release!());
    mutation.mockRestore();
    role("project_lead");
    const budget = await repo.detail(id);
    await repo.mutate({
      action: "withdrawProjectBudget",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      reason: "Revise quote",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    await click("Edit");
    vi.spyOn(repo, "load").mockRejectedValue(
      Object.assign(new Error("Assignment ended"), { status: 403 }),
    );
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Frame tubes");
    expect(container.textContent).toContain("Budget access required");
  });
  it("ignores a mutation response after its session has ended", async () => {
    let endSession: (() => void) | undefined;
    let finish: (() => void) | undefined;
    repo.watchSession = (callback) => {
      endSession = callback;
      return () => undefined;
    };
    const base = repo.mutate;
    vi.spyOn(repo, "mutate").mockImplementation(async (change) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return base(change);
    });
    const load = vi.spyOn(repo, "load");
    await render();
    await act(async () => button("Send to department lead").click());
    await act(async () => endSession!());
    const count = load.mock.calls.length;
    await act(async () => finish!());
    expect(load).toHaveBeenCalledTimes(count);
    expect(container.textContent).toContain("Budget access required");
    expect(container.textContent).not.toContain("Frame tubes");
    expect(notify.mock.calls.some((call) => call[0] === "Budget saved")).toBe(
      false,
    );
  });
  it("matches legacy Electrical systems to the Electronics project department", async () => {
    const load = repo.load;
    vi.spyOn(repo, "load").mockImplementation(async (filters) => {
      const workspace = await load(filters);
      return {
        ...workspace,
        systems: workspace
          .systems!.filter((system) => system.departmentName === "Electronics")
          .map((system) => ({
            ...system,
            departmentName: "Electrical",
            name: "Control electronics",
          })),
      };
    });
    await render();
    await click("Add entry");
    expect(
      document.getElementById("budget-entry-system")?.textContent,
    ).toContain("Control electronics");
    expect(
      document.getElementById("budget-entry-system")?.getAttribute("disabled"),
    ).toBeNull();
  });
  it("loads a changed repository during a pending save and isolates obsolete finally handlers", async () => {
    let finishOld: (() => void) | undefined;
    const budget = await repo.detail(id);
    const old: ProjectBudgetRepository = {
      ...repo,
      mutate: async () => {
        await new Promise<void>((resolve) => {
          finishOld = resolve;
        });
        return {
          ok: true,
          id,
          revision: budget.revision + 1,
          viewVersion: 3,
          warnings: [],
          errors: [],
        };
      },
    };
    await render(old);
    await act(async () => button("Send to department lead").click());
    let finishNew: (() => void) | undefined;
    const load = vi.fn(repo.load);
    const next: ProjectBudgetRepository = {
      ...repo,
      load,
      mutate: async (change) => {
        await new Promise<void>((resolve) => {
          finishNew = resolve;
        });
        return repo.mutate(change);
      },
    };
    await render(next);
    expect(load).toHaveBeenCalledOnce();
    expect(button("Send to department lead").disabled).toBe(false);
    await act(async () => button("Send to department lead").click());
    await act(async () => finishOld!());
    expect(button("Send to department lead").disabled).toBe(true);
    expect(notify.mock.calls.some((call) => call[0] === "Budget saved")).toBe(
      false,
    );
    await act(async () => finishNew!());
    expect(container.textContent).toContain(
      "Sent to approval (Department lead)",
    );
  });
  it("renders exact large NOK amounts without losing ore", async () => {
    const budget = await repo.detail(id);
    await repo.mutate({
      action: "saveProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      entry: {
        ...budget.pendingVersion!.entries[0],
        plannedNok: "999999999999999.99",
      },
    });
    await render();
    expect(container.textContent).toContain("NOK 999,999,999,999,999.99");
  });
  it("uses plain English for backend audit actions", async () => {
    const detail = repo.detail;
    vi.spyOn(repo, "detail").mockImplementation(async (budgetId) => ({
      ...(await detail(budgetId)),
      decisions: [
        "createProjectBudget",
        "saveProjectBudgetEntry",
        "removeProjectBudgetEntry",
        "futureAction",
      ].map((action, index) => ({
        id: `decision-${index}`,
        versionId: "version",
        action,
        actorMemberId: "author",
        reason: null,
        createdAt: "2026-11-19T12:00:00Z",
        snapshot: {},
      })),
    }));
    await render();
    expect(container.textContent).toContain("Budget created");
    expect(container.textContent).toContain("Entry saved");
    expect(container.textContent).toContain("Entry removed");
    expect(container.textContent).toContain("Budget updated");
    expect(container.textContent).not.toContain("createProjectBudget");
    expect(container.textContent).not.toContain("futureAction");
  });
  it("retries an ambiguous successful write with the same durable request ID", async () => {
    const original = repo.mutate;
    let failResponse = true;
    const mutate = vi
      .spyOn(repo, "mutate")
      .mockImplementation(async (change) => {
        const result = await original(change);
        if (failResponse) {
          failResponse = false;
          throw new Error("Connection interrupted");
        }
        return result;
      });
    await render();
    await click("Send to department lead");
    const recovery = notify.mock.calls[notify.mock.calls.length - 1][2].action;
    expect(recovery.label).toBe("Try again");
    await act(async () => recovery.onClick());
    expect(mutate.mock.calls[0][0].requestId).toBe(
      mutate.mock.calls[1][0].requestId,
    );
    expect(
      (await repo.detail(id)).decisions.filter(
        (decision) => decision.action === "submitProjectBudget",
      ),
    ).toHaveLength(1);
    expect(container.textContent).toContain(
      "Sent to approval (Department lead)",
    );
  });
  it("invalidates notification recovery actions after context changes and session end", async () => {
    const oldLoad = vi.fn(repo.load),
      oldMutation = vi.fn(async () => {
        throw new Error("Connection interrupted");
      });
    const old = { ...repo, load: oldLoad, mutate: oldMutation };
    await render(old);
    await click("Send to department lead");
    const oldRetry =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    let endSession: (() => void) | undefined;
    const nextLoad = vi.fn(repo.load),
      nextMutation = vi.fn(async () => {
        throw new Error("Connection interrupted");
      });
    const next: ProjectBudgetRepository = {
      ...repo,
      load: nextLoad,
      mutate: nextMutation,
      watchSession: (callback) => {
        endSession = callback;
        return () => undefined;
      },
    };
    await render(next);
    const oldCount = oldLoad.mock.calls.length;
    await act(async () => oldRetry());
    expect(oldMutation).toHaveBeenCalledOnce();
    expect(oldLoad).toHaveBeenCalledTimes(oldCount);
    await click("Send to department lead");
    const currentRetry =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    await act(async () => endSession!());
    const nextCount = nextLoad.mock.calls.length;
    await act(async () => currentRetry());
    expect(nextMutation).toHaveBeenCalledOnce();
    expect(nextLoad).toHaveBeenCalledTimes(nextCount);
    expect(container.textContent).toContain("Budget access required");
  });
  it("restores a removed-before-award entry with its stable identity and purchase evidence", async () => {
    const retained = await removedBeforeAward();
    const mutate = vi.spyOn(repo, "mutate");
    await render();
    const removed = container.querySelector('[aria-label="Removed entries"]');
    expect(removed?.textContent).toContain("Frame tubes");
    expect(removed?.textContent).toContain("P0");
    await click("Restore entry");
    expect(
      (document.getElementById("budget-entry-description") as HTMLInputElement)
        .value,
    ).toBe("Frame tubes");
    await act(async () => input("budget-entry-amount", "10100.00"));
    await click("Save entry");
    expect(mutate.mock.calls[0][0]).toMatchObject({
      action: "saveProjectBudgetEntry",
      entry: {
        entryId: retained.entryId,
        removed: false,
        plannedNok: "10100.00",
      },
    });
    const restored = (await repo.detail(id)).pendingVersion!.entries;
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      entryId: retained.entryId,
      budgetItemId: retained.budgetItemId,
      publicRef: retained.publicRef,
      removed: false,
      priority: "P0",
      actualNok: "300.25",
      invoices: [{ documentId: "retained-invoice" }],
    });
    expect(
      container.querySelector('[aria-label="Removed entries"]'),
    ).toBeNull();
    expect(container.textContent).toContain("NOK 10,100.00");
    await vi.waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Refresh budgets"),
    );
  });
  it.each(["stale", "protected"])(
    "retains the restoration form after a %s save",
    async (failure) => {
      const retained = await removedBeforeAward();
      if (failure === "stale")
        vi.spyOn(repo, "mutate").mockRejectedValueOnce(
          Object.assign(
            new Error("The budget changed. Refresh before saving."),
            { status: 409 },
          ),
        );
      await render();
      await click("Restore entry");
      const amount = failure === "protected" ? "1.00" : "10100.00";
      await act(async () => input("budget-entry-amount", amount));
      await click("Save entry");
      expect(
        (document.getElementById("budget-entry-amount") as HTMLInputElement)
          .value,
      ).toBe(amount);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect((await repo.detail(id)).pendingVersion!.entries[0].removed).toBe(
        true,
      );
      expect(notify).toHaveBeenLastCalledWith(
        "Could not save the budget",
        expect.stringContaining("Your form is kept"),
        expect.anything(),
      );
      await act(async () => input("budget-entry-amount", "10100.00"));
      await click("Save entry");
      expect((await repo.detail(id)).pendingVersion!.entries[0]).toMatchObject({
        entryId: retained.entryId,
        removed: false,
        priority: "P0",
      });
    },
  );
});
