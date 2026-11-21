// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBudgetPurchases } from "./ProjectBudgetPurchases";
import type { ProjectPurchaseContext } from "./project-purchase-types";
import type { ProjectPurchaseRepository } from "./project-purchase-repository";
import type { ProjectBudgetDetail } from "./project-budget-types";
import { projectBudgetDevelopmentFixture } from "./project-budget-fixtures";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
let root: Root,
  container: HTMLDivElement,
  repository: ProjectPurchaseRepository,
  context: ProjectPurchaseContext,
  budget: ProjectBudgetDetail;
const onChanged = vi.fn();
const onAccessLost = vi.fn();
const onDirtyChange = vi.fn();
let endSession: (() => void) | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const saved = {
  ok: true as const,
  id: "71111111-1111-4111-8111-111111111111",
  publicRef: "2026-0001",
  viewVersion: 2,
  warnings: [],
  errors: [],
};
function button(text: string) {
  const found = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  expect(found, text).toBeTruthy();
  return found!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
function input(id: string, value: string) {
  const element = document.getElementById(id)!;
  const prototype =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
    element,
    value,
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
async function render(
  detail: ProjectBudgetDetail | null = budget,
  projectId = context.scope.projectId,
) {
  await act(async () =>
    root.render(
      <ProjectBudgetPurchases
        budget={detail ?? undefined}
        projectId={projectId}
        responsibleDepartmentId={context.scope.responsibleDepartmentId!}
        repository={repository}
        onChanged={onChanged}
        onAccessLost={onAccessLost}
        onDirtyChange={onDirtyChange}
      />,
    ),
  );
}
async function submitTwice() {
  const form = document.querySelector('[role="dialog"] form')!;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  onChanged.mockReset();
  onAccessLost.mockReset();
  onDirtyChange.mockReset();
  endSession = undefined;
  window.history.replaceState({}, "", "/");
  const scope = projectBudgetDevelopmentFixture("department_lead")!.scopes[0];
  context = {
    scope,
    viewVersion: 1,
    systems: [
      {
        id: "d1111111-1111-4111-8111-111111111111",
        name: "Frame",
        code: "SYS-FR",
      },
    ],
    entries: [],
  };
  budget = {
    id: "e1111111-1111-4111-8111-111111111111",
    projectId: scope.projectId,
    projectName: scope.projectName,
    seasonId: scope.seasonId,
    seasonCode: scope.seasonCode,
    responsibleDepartmentId: scope.responsibleDepartmentId!,
    responsibleDepartmentName: "Mechanical & Production",
    revision: 10,
    approvedVersionId: "a2222222-2222-4222-8222-222222222222",
    pendingVersionId: null,
    pendingStage: null,
    approvedTotalNok: "100",
    pendingTotalNok: null,
    capabilities: scope.capabilities,
    pendingVersion: null,
    decisions: [],
    approvedVersion: {
      id: "a2222222-2222-4222-8222-222222222222",
      versionNumber: 1,
      revision: 1,
      status: "approved",
      submittedAt: null,
      departmentApprovedBy: null,
      departmentApprovedAt: null,
      approvedBy: null,
      approvedAt: null,
      totalNok: "100",
      entries: [
        {
          entryId: "f1111111-1111-4111-8111-111111111111",
          budgetItemId: "f1111111-1111-4111-8111-111111111111",
          publicRef: "BI-S27-001",
          systemId: context.systems[0].id,
          description: "Frame tubes",
          category: "material",
          plannedNok: "100.00",
          actualNok: "10.00",
          ordinaryPriority: "P2",
          priority: "P2",
          reuseStatus: "new",
          status: "planned",
          completion: "partial",
        },
      ],
    },
  };
  repository = {
    load: vi.fn(async () => context),
    mutate: vi.fn(async () => saved),
    upload: vi.fn(async () => crypto.randomUUID()),
    complete: vi.fn(async () => ({ ...saved, revision: 11 })),
    watchSession: (fn) => {
      endSession = fn;
      return () => undefined;
    },
  };
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
describe("project purchase controls", () => {
  it("lists the explicit prepared invoice and submits it through ordinary upload/check/register handlers only after submit", async () => {
    window.history.replaceState({}, "", "/departments/management/purchases?invoiceFixture=prepared");
    await render(); await click("Register a purchase");
    expect(document.body.textContent).toContain("purchase-order-3.pdf");
    expect(repository.upload).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
    await submitTwice();
    expect(repository.upload).toHaveBeenCalledOnce();
    expect(vi.mocked(repository.upload).mock.calls[0][1]).toMatchObject({ name: "purchase-order-3.pdf", type: "application/pdf", size: 620 });
    expect(vi.mocked(repository.mutate).mock.calls.map(([change]) => change.action)).toEqual(["checkProjectPurchase", "registerProjectPurchase"]);
    const registered = vi.mocked(repository.mutate).mock.calls[1][0];
    expect(registered.action).toBe("registerProjectPurchase");
    if (registered.action === "registerProjectPurchase") expect(registered.purchase.uploadIds).toHaveLength(1);
  });
  it("removes the prepared file normally and still accepts a manually selected attachment", async () => {
    window.history.replaceState({}, "", "/departments/management/purchases?invoiceFixture=prepared");
    await render(); await click("Register a purchase");
    await act(async () => (document.querySelector('button[aria-label="Remove purchase-order-3.pdf"]') as HTMLButtonElement).click());
    expect(document.body.textContent).not.toContain("purchase-order-3.pdf");
    await render({ ...budget, revision: 11 });
    expect(document.body.textContent).not.toContain("purchase-order-3.pdf");
    await act(async () => {
      const files = document.getElementById("project-purchase-files") as HTMLInputElement;
      Object.defineProperty(files, "files", { value: [new File(["%PDF-1.4"], "manual.pdf", { type: "application/pdf" })] });
      files.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("manual.pdf");
    expect(repository.upload).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
  });
  it.each([401, 403].flatMap(status => ["upload", "check", "register"].map(phase => ({ status, phase }))))(
    "clears private registration state on $phase denial $status and restores a usable focus target",
    async ({ status, phase }) => {
      const denied = Object.assign(new Error("Purchase access revoked"), { status });
      repository.upload = vi.fn(async () => {
        if (phase === "upload") throw denied;
        return crypto.randomUUID();
      });
      repository.mutate = vi.fn(async change => {
        if ((phase === "check" && change.action === "checkProjectPurchase") ||
          (phase === "register" && change.action === "registerProjectPurchase")) throw denied;
        return saved;
      });
      await render();
      await click("Register a purchase");
      await act(async () => {
        input("project-purchase-supplier", "Private supplier");
        const files = document.getElementById("project-purchase-files") as HTMLInputElement;
        Object.defineProperty(files, "files", { value: [new File(["invoice"], "private-invoice.pdf", { type: "application/pdf" })] });
        files.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await submitTwice();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(container.textContent).not.toContain("Frame tubes");
      expect(document.body.textContent).not.toContain("private-invoice.pdf");
      expect(onAccessLost).toHaveBeenCalledOnce();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(onChanged).not.toHaveBeenCalled();
      const fallback = button("Refresh purchase access");
      await vi.waitFor(() => expect(document.activeElement).toBe(fallback));
      repository.upload = vi.fn(async () => crypto.randomUUID());
      repository.mutate = vi.fn(async () => saved);
      await click("Refresh purchase access");
      await click("Register a purchase");
      expect((document.getElementById("project-purchase-supplier") as HTMLInputElement).value).toBe("");
      expect(document.body.textContent).not.toContain("private-invoice.pdf");
      expect(button("Register purchase").disabled).toBe(false);
    },
  );
  it.each([401, 403])("clears completion context, reason and uncertain lock on mutation denial %s", async status => {
    repository.complete = vi.fn(async () => { throw Object.assign(new Error("Completion access revoked"), { status }); });
    await render();
    await click("Mark complete");
    await act(async () => input("project-purchase-completion-reason", "Private delivery details"));
    await submitTwice();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Frame tubes");
    expect(onAccessLost).toHaveBeenCalledOnce();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onChanged).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.activeElement).toBe(button("Refresh purchase access")));
    repository.complete = vi.fn(async () => ({ ...saved, revision: 11 }));
    await click("Refresh purchase access");
    await click("Mark complete");
    expect((document.getElementById("project-purchase-completion-reason") as HTMLTextAreaElement).value).toBe("");
    await act(async () => input("project-purchase-completion-reason", "Delivered"));
    await submitTwice();
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledOnce();
  });
  it("invalidates an overlapping private context response when a registration mutation denies access", async () => {
    const stale = deferred<ProjectPurchaseContext>();
    await render();
    await click("Register a purchase");
    repository.load = vi.fn(async () => stale.promise);
    await render({ ...budget, revision: 11 });
    repository.mutate = vi.fn(async change => {
      if (change.action === "registerProjectPurchase") throw Object.assign(new Error("Revoked"), { status: 403 });
      return saved;
    });
    await submitTwice();
    await act(async () => stale.resolve(context));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Frame tubes");
    expect(container.textContent).not.toContain("Register a purchase");
    expect(onChanged).not.toHaveBeenCalled();
    expect(onAccessLost).toHaveBeenCalledOnce();
  });
  it.each(["upload", "completion"])("ignores a late %s success after authority clearing", async phase => {
    const upload = deferred<string>();
    const complete = deferred<{ ok: true; id: string; publicRef: string; viewVersion: number; warnings: never[]; errors: never[]; revision: number }>();
    repository.upload = vi.fn(async () => upload.promise);
    repository.complete = vi.fn(async () => complete.promise);
    await render();
    await click(phase === "upload" ? "Register a purchase" : "Mark complete");
    await act(async () => {
      if (phase === "upload") {
        const files = document.getElementById("project-purchase-files") as HTMLInputElement;
        Object.defineProperty(files, "files", { value: [new File(["invoice"], "private.pdf", { type: "application/pdf" })] });
        files.dispatchEvent(new Event("change", { bubbles: true }));
      } else input("project-purchase-completion-reason", "Delivery details");
    });
    await submitTwice();
    await act(async () => endSession?.());
    await act(async () => {
      upload.resolve(crypto.randomUUID());
      complete.resolve({ ...saved, revision: 11 });
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("Entry updated", expect.anything(), expect.anything());
    expect(notify).not.toHaveBeenCalledWith("Purchase registered", expect.anything(), expect.anything());
    expect(onAccessLost).toHaveBeenCalledOnce();
  });
  it.each([400, 409, null])("retains recoverable registration and completion input on %s errors", async status => {
    const error = Object.assign(new Error("Try again"), status ? { status } : {});
    repository.mutate = vi.fn(async () => { throw error; });
    repository.complete = vi.fn(async () => { throw error; });
    await render();
    await click("Register a purchase");
    await act(async () => input("project-purchase-supplier", "Retained supplier"));
    await submitTwice();
    expect((document.getElementById("project-purchase-supplier") as HTMLInputElement).value).toBe("Retained supplier");
    expect(onAccessLost).not.toHaveBeenCalled();
    await click("Cancel");
    await click("Mark complete");
    await act(async () => input("project-purchase-completion-reason", "Retained reason"));
    await submitTwice();
    expect((document.getElementById("project-purchase-completion-reason") as HTMLTextAreaElement).value).toBe("Retained reason");
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it("exposes incurred-cost registration without a budget header and restores Radix opener focus", async () => {
    await render(null);
    const opener = button("Register a purchase");
    opener.focus();
    await click("Register a purchase");
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector("#project-purchase-entry-0")).toBeTruthy();
    await click("Cancel");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("preserves dirty purchase and completion input when the same project revision refreshes", async () => {
    await render();
    await click("Register a purchase");
    await act(async () => input("project-purchase-supplier", "Still editing"));
    await render({ ...budget, revision: 11 });
    expect(
      (document.getElementById("project-purchase-supplier") as HTMLInputElement)
        .value,
    ).toBe("Still editing");
    await click("Cancel");
    await click("Mark complete");
    await act(async () =>
      input("project-purchase-completion-reason", "Everything delivered"),
    );
    await render({ ...budget, revision: 12 });
    expect(
      (
        document.getElementById(
          "project-purchase-completion-reason",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Everything delivered");
  });
  it("deduplicates rapid registration submits and retries an ambiguous write with the same ID and snapshot", async () => {
    const pending = deferred<typeof saved>();
    let registrations = 0;
    repository.mutate = vi.fn(async (change) => {
      if (change.action !== "registerProjectPurchase") return saved;
      registrations++;
      if (registrations === 1) throw new Error("Response lost");
      return pending.promise;
    });
    await render();
    await click("Register a purchase");
    await submitTwice();
    expect(repository.mutate).toHaveBeenCalledTimes(2);
    const first = vi
      .mocked(repository.mutate)
      .mock.calls.find(
        ([change]) => change.action === "registerProjectPurchase",
      )![0];
    expect(button("Retry saving purchase")).toBeTruthy();
    await submitTwice();
    const calls = vi
      .mocked(repository.mutate)
      .mock.calls.filter(
        ([change]) => change.action === "registerProjectPurchase",
      );
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toEqual(first);
    await act(async () => pending.resolve(saved));
    expect(onChanged).toHaveBeenCalledOnce();
  });
  it("retries completion with a stable ID after refresh and prevents rapid duplicate writes", async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValue({ ...saved, revision: 11 });
    repository.complete = complete;
    await render();
    await click("Mark complete");
    await act(async () =>
      input("project-purchase-completion-reason", "Everything delivered"),
    );
    await submitTwice();
    expect(complete).toHaveBeenCalledOnce();
    await render({ ...budget, revision: 11 });
    await click("Retry completion");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]);
    expect(onChanged).toHaveBeenCalledOnce();
  });
  it("clears private input on session end and ignores a late save after project change", async () => {
    const pending = deferred<typeof saved>();
    repository.mutate = vi.fn(async (change) =>
      change.action === "registerProjectPurchase" ? pending.promise : saved,
    );
    await render();
    await click("Register a purchase");
    await submitTwice();
    await render(null, "b2222222-2222-4222-8222-222222222222");
    await act(async () => pending.resolve(saved));
    expect(onChanged).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(
      "Purchase registered",
      expect.anything(),
      expect.anything(),
    );
    await click("Register a purchase");
    await act(async () =>
      input("project-purchase-supplier", "Private supplier"),
    );
    await act(async () => endSession?.());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Private supplier");
  });
});
