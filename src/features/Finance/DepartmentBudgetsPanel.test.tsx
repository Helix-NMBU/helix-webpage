// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepartmentBudgetsPanel } from "./DepartmentBudgetsPanel";
import type { DepartmentBudgetRepository } from "./department-budget-repository";
import type {
  DepartmentBudgetPackageDetail,
  DepartmentBudgetPreview,
  DepartmentBudgetSnapshot,
} from "./department-budget-types";
import type { FinanceMutationResult } from "./types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("./InvoiceEvidence", () => ({
  InvoiceLinks: ({ invoices }: { invoices: { originalName: string; documentId: string }[] }) => <>{invoices.map(invoice => <button key={invoice.documentId}>{invoice.originalName}</button>)}</>,
  InvoiceEvidence: ({ invoice }: { invoice: { originalName: string } }) => (
    <button>{invoice.originalName}</button>
  ),
}));
const caps = {
  canSubmit: true,
  canApproveFinance: true,
  canReturn: true,
  canWithdraw: true,
};
const snapshot = (): DepartmentBudgetSnapshot => ({
  departmentId: "dep",
  departmentName: "Mechanical",
  departmentKey: "mechanical",
  seasonId: "season",
  seasonCode: "S27",
  approvedTotalNok: "100.00",
  proposedTotalNok: "120.00",
  deltaNok: "20.00",
  legacyTotalNok: "0.00",
  proposedLegacyTotalNok: "0.00",
  legacyEntries: [],
  projects: [
    {
      projectId: "p",
      projectName: "Frame project",
      projectLeadIds: ["lead"],
      projectBudgetId: "header",
      responsibleDepartmentId: "dep",
      responsibleDepartmentName: "Mechanical",
      readiness: "department_pending",
      included: true,
      approvedVersion: {
        id: "v1",
        versionNumber: 1,
        revision: 1,
        status: "approved",
        submittedAt: null,
        departmentApprovedBy: null,
        departmentApprovedAt: null,
        approvedBy: null,
        approvedAt: null,
        totalNok: "100.00",
        entries: [
          {
            entryId: "entry",
            budgetItemId: "entry",
            publicRef: "BI",
            systemId: "sys",
            description: "Frame",
            plannedNok: "100.00",
            ordinaryPriority: "P1",
            priority: "P1",
            category: "material",
            reuseStatus: "new",
            status: "planned",
          },
        ],
      },
      proposedVersion: {
        id: "v2",
        versionNumber: 2,
        revision: 1,
        status: "department_pending",
        submittedAt: null,
        departmentApprovedBy: null,
        departmentApprovedAt: null,
        approvedBy: null,
        approvedAt: null,
        totalNok: "120.00",
        entries: [
          {
            entryId: "entry",
            budgetItemId: "entry",
            publicRef: "BI",
            systemId: "sys",
            description: "Frame",
            plannedNok: "120.00",
            ordinaryPriority: "P1",
            priority: "P1",
            category: "material",
            reuseStatus: "new",
            status: "planned",
          },
        ],
      },
      approvedTotalNok: "100.00",
      proposedTotalNok: "120.00",
      deltaNok: "20.00",
    },
    {
      projectId: "not-started",
      projectName: "Not started project",
      projectLeadIds: [],
      projectBudgetId: null,
      responsibleDepartmentId: "dep",
      responsibleDepartmentName: "Mechanical",
      readiness: "no_budget",
      included: false,
      approvedVersion: null,
      proposedVersion: null,
      approvedTotalNok: "0.00",
      proposedTotalNok: "0.00",
      deltaNok: "0.00",
    },
  ],
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
let container: HTMLDivElement,
  root: Root,
  detail: DepartmentBudgetPackageDetail,
  preview: DepartmentBudgetPreview,
  repo: DepartmentBudgetRepository,
  sessionEnd: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  sessionEnd = undefined;
  detail = {
    id: "packet",
    revision: 4,
    status: "finance_pending",
    submittedBy: "department-lead",
    submittedAt: "2026-11-20T12:00:00Z",
    decidedBy: null,
    decidedAt: null,
    reason: null,
    snapshot: snapshot(),
    viewVersion: 12,
    capabilities: { ...caps },
    decisions: [],
    evidence: [
      {
        ...snapshot().projects[0].approvedVersion!.entries[0],
        actualNok: "60.00",
        completion: "partial",
        invoices: [
          {
            documentId: "doc",
            purchaseId: "purchase",
            purchaseRef: "2026-1",
            originalName: "Invoice.pdf",
            backend: "private_storage",
            transferStatus: "stored",
            viewerUrl: null,
          },
        ],
      },
    ],
  };
  preview = {
    ...snapshot(),
    viewVersion: 12,
    previewToken: "fixed-preview",
    activePackageId: null,
    capabilities: { ...caps },
  };
  repo = {
    queue: vi.fn(async () => ({
      viewVersion: 12,
      departments: [
        {
          id: "dep",
          name: "Mechanical",
          seasonId: "season",
          seasonCode: "S27",
          canSubmit: true,
        },
      ],
      packages: [structuredClone(detail)],
    })),
    preview: vi.fn(async () => structuredClone(preview)),
    detail: vi.fn(async () => structuredClone(detail)),
    mutate: vi.fn(async () => ({
      ok: true as const,
      id: "packet",
      viewVersion: 13,
      revision: 5,
      warnings: [],
      errors: [],
    })),
    watchSession: (onEnd) => {
      sessionEnd = onEnd;
      return () => {
        sessionEnd = undefined;
      };
    },
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function show(departmentId = "dep") {
  await act(async () =>
    root.render(
      <DepartmentBudgetsPanel
        departmentId={departmentId}
        repository={repo}
        systems={[
          {
            id: "sys",
            name: "Electronics system",
            code: "SYS",
            departmentName: "Electronics",
          },
        ]}
      />,
    ),
  );
}
async function click(text: string) {
  await act(async () => {
    const button = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    );
    if (!button) throw new Error(`Missing ${text}`);
    button.click();
  });
}
function reason(value: string) {
  const input = document.querySelector(
    "#department-package-reason",
  ) as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
describe("department package interface", () => {
  it("shows complete readiness, fixed project/department totals and grouped old/new values", async () => {
    await show();
    await click("Review package");
    for (const text of [
      "Frame project",
      "Not started project",
      "No budget",
      "Changes included",
      "Project subtotal NOK 120.00",
      "Changed",
      "NOK 100.00",
      "NOK 120.00",
      "Previous amount",
      "Amount change",
      "+ NOK 20.00",
      "NOK 60.00",
      "Invoice.pdf",
    ])
      expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain("Approve budget");
    expect(
      [...container.querySelectorAll("button")].filter(
        (button) => button.textContent === "Approve whole department budget",
      ),
    ).toHaveLength(1);
  });
  it("shows pending packages from every department by default in Finance", async () => {
    vi.mocked(repo.queue).mockResolvedValue({
      viewVersion: 12,
      departments: [
        {
          id: "a",
          name: "Alphabetical first",
          seasonId: "season",
          seasonCode: "S27",
          canSubmit: false,
        },
        {
          id: "dep",
          name: "Mechanical",
          seasonId: "season",
          seasonCode: "S27",
          canSubmit: false,
        },
      ],
      packages: [
        {
          ...detail,
          id: "other",
          snapshot: {
            ...detail.snapshot,
            departmentId: "a",
            departmentName: "Alphabetical first",
          },
        },
        detail,
      ],
    });
    await act(async () =>
      root.render(<DepartmentBudgetsPanel repository={repo} />),
    );
    expect(
      [...container.querySelectorAll("button")].filter(
        (button) => button.textContent === "Review package",
      ),
    ).toHaveLength(2);
    expect(document.querySelector("#package-department")?.textContent).toBe(
      "All departments",
    );
  });

  it("sends one fixed preview, deduplicates rapid clicks and preserves the request ID after a lost response", async () => {
    await show();
    await click("Preview department submission");
    const pending = deferred<FinanceMutationResult>();
    vi.mocked(repo.mutate).mockReturnValueOnce(pending.promise);
    const send = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Send department budget to Finance",
    )!;
    await act(async () => {
      send.click();
      send.click();
    });
    expect(repo.mutate).toHaveBeenCalledTimes(1);
    const first = vi.mocked(repo.mutate).mock.calls[0][0];
    expect(first).toMatchObject({
      action: "sendDepartmentBudgetPackage",
      departmentId: "dep",
      previewToken: "fixed-preview",
    });
    await act(async () => {
      pending.reject(new Error("Response lost"));
      await pending.promise.catch(() => undefined);
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click("Send department budget to Finance");
    expect(vi.mocked(repo.mutate).mock.calls[1][0]).toEqual(first);
    expect(notify).toHaveBeenCalledWith(
      "Department budget sent",
      expect.any(String),
      expect.any(Object),
    );
  });
  it("uses package revision for one Head of Finance decision and removes the action for ordinary Finance", async () => {
    await show();
    await click("Review package");
    await click("Approve whole department budget");
    expect(repo.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approveDepartmentBudgetPackage",
        packageId: "packet",
        expectedRevision: 4,
      }),
    );
    detail.capabilities.canApproveFinance = false;
    detail.capabilities.canReturn = false;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).not.toContain(
      "Approve whole department budget",
    );
    expect(container.textContent).not.toContain("Return department package");
  });
  it("keeps dirty return input and its original revision while live actuals refresh", async () => {
    await show();
    await click("Review package");
    await click("Return department package");
    await act(async () => reason("Keep this supplier explanation"));
    detail.revision = 5;
    detail.evidence[0].actualNok = "85.00";
    detail.snapshot.projects[0].proposedVersion!.entries[0].plannedNok =
      "9999.00";
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      (
        document.querySelector(
          "#department-package-reason",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Keep this supplier explanation");
    expect(container.textContent).toContain("NOK 85.00");
    expect(container.textContent).not.toContain("9,999");
    vi.mocked(repo.mutate).mockRejectedValue(
      Object.assign(new Error("Load latest package"), { status: 409 }),
    );
    await click("Return to Draft");
    expect(repo.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "returnDepartmentBudgetPackage",
        expectedRevision: 4,
        reason: "Keep this supplier explanation",
      }),
    );
    expect(
      (
        document.querySelector(
          "#department-package-reason",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Keep this supplier explanation");
  });
  it.each(["focus", "helix-member-access-changed"])(
    "clears private package, preview and reason after %s denial and ignores a concurrent late preview",
    async (eventName) => {
      await show();
      await click("Review package");
      const pending = deferred<DepartmentBudgetPreview>();
      vi.mocked(repo.preview).mockReturnValueOnce(pending.promise);
      await click("Preview department submission");
      vi.mocked(repo.queue).mockRejectedValue(
        Object.assign(new Error("Revoked"), { status: 403 }),
      );
      await act(async () => window.dispatchEvent(new Event(eventName)));
      expect(container.textContent).not.toContain("Frame project");
      await act(async () => {
        pending.resolve(preview);
        await pending.promise;
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(container.textContent).not.toContain("Frame project");
      const calls = vi.mocked(repo.queue).mock.calls.length;
      await act(async () => window.dispatchEvent(new Event(eventName)));
      expect(repo.queue).toHaveBeenCalledTimes(calls);
    },
  );
  it("clears revoked private data during an outstanding decision and ignores its late success", async () => {
    await show();
    await click("Review package");
    const pending = deferred<FinanceMutationResult>();
    vi.mocked(repo.mutate).mockReturnValueOnce(pending.promise);
    await click("Approve whole department budget");
    vi.mocked(repo.queue).mockRejectedValue(
      Object.assign(new Error("Revoked"), { status: 403 }),
    );
    await act(async () =>
      window.dispatchEvent(new Event("helix-member-access-changed")),
    );
    expect(container.textContent).not.toContain("Frame project");
    await act(async () => {
      pending.resolve({
        ok: true,
        id: "packet",
        viewVersion: 13,
        warnings: [],
        errors: [],
      });
      await pending.promise;
    });
    expect(container.textContent).toBe("");
    expect(
      notify.mock.calls.some(
        ([title]) => title === "Department budget approved",
      ),
    ).toBe(false);
  });

  it("invalidates late writes and recovery closures after the department or session changes", async () => {
    await show();
    await click("Review package");
    const pending = deferred<FinanceMutationResult>();
    vi.mocked(repo.mutate).mockReturnValueOnce(pending.promise);
    await click("Approve whole department budget");
    await show("other-department");
    await act(async () => {
      pending.resolve({
        ok: true,
        id: "packet",
        viewVersion: 13,
        warnings: [],
        errors: [],
      });
      await pending.promise;
    });
    expect(
      notify.mock.calls.some(
        ([title]) => title === "Department budget approved",
      ),
    ).toBe(false);
    await act(async () => sessionEnd?.());
    expect(container.textContent).toBe("");
  });
  it("returns focus to the invoked reason action when both return and withdraw are authorized", async () => {
    await show();
    await click("Review package");
    const trigger = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Return department package",
    )!;
    trigger.focus();
    await click("Return department package");
    await act(async () => {
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("uses Radix dismissal and returns focus to the preview trigger", async () => {
    await show();
    const trigger = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Preview department submission",
    )!;
    trigger.focus();
    await click("Preview department submission");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(repo.mutate).not.toHaveBeenCalled();
  });
});

describe("department page decision dialog", () => {
  const showDecision = async (onDecided = vi.fn()) => {
    await act(async () => root.render(<DepartmentBudgetsPanel departmentId="dep" reviewPackageId="packet" repository={repo} onDecided={onDecided} />));
    return onDecided;
  };
  it("loads the pinned submission directly and approves it with its current revision", async () => {
    const onDecided = await showDecision();
    expect(repo.detail).toHaveBeenCalledWith("packet");
    expect(container.textContent).toContain("Approve budget"); expect(container.textContent).toContain("Decline budget");
    expect(container.textContent).not.toContain("Refresh submissions"); expect(container.textContent).not.toContain("All associated projects");
    expect(container.textContent).not.toContain("Review package");
    await click("Approve budget");
    expect(repo.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "approveDepartmentBudgetPackage", packageId: "packet", expectedRevision: 4 }));
    expect(onDecided).toHaveBeenCalledTimes(1);
  });
  it("requires a comment to decline and returns the fixed whole package to Draft", async () => {
    const onDecided = await showDecision();
    await click("Decline budget");
    const form = document.querySelector("[role=dialog] form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(repo.mutate).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledWith("Enter a reason", expect.any(String), expect.any(Object));
    await act(async () => reason("  Update supplier quotes  "));
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(repo.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "returnDepartmentBudgetPackage", packageId: "packet", expectedRevision: 4, reason: "Update supplier quotes" }));
    expect(onDecided).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary Finance read-only and clears the decision after access ends", async () => {
    detail.capabilities = { canSubmit: false, canApproveFinance: false, canReturn: false, canWithdraw: false };
    await showDecision();
    expect(container.textContent).toContain("Only Head of Finance can approve or decline");
    expect(container.textContent).not.toContain("Approve budget"); expect(container.textContent).not.toContain("Decline budget");
    expect(repo.mutate).not.toHaveBeenCalled();
    await act(async () => sessionEnd?.());
    expect(container.textContent).toBe("");
  });
});
