// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalDepartmentBudgetRepository,
  loadLocalDepartmentHomeBudget,
} from "./department-budget-local";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import { createLocalProjectPurchaseRepository } from "./project-purchase-local";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import {
  approveLocalDepartmentCandidates,
  selectLocalBudgetRole,
  sendLocalDepartmentCandidates,
} from "./department-budget.test-support";
import { osloToday } from "./money";
const gates = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
  localMemberAccount: { email: "alex@example.invalid" },
}));
const departmentId = "00000000-0000-4000-8000-000000000300",
  electrical = "00000000-0000-4000-8000-000000000301",
  KEY = "helix-project-budgets-local-v1";
const project = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function seed() {
  const workspace = initialLocalWorkspace(),
    base = workspace.projects[0];
  for (const number of [200, 201, 202, 203, 204])
    workspace.projects.push({
      ...base,
      id: project(number),
      name: `Project ${number}`,
      departments:
        number === 201 || number === 202
          ? ["Mechanical & Production"]
          : base.departments,
    });
  localStorage.setItem(
    "helix-member-local-projects-v1",
    JSON.stringify(workspace),
  );
}
async function draft(
  projectId: string,
  amount: string,
  submit = true,
  owner = departmentId,
) {
  selectLocalBudgetRole("project_lead");
  const repo = createLocalProjectBudgetRepository(),
    created = await repo.mutate({
      action: "createProjectBudget",
      requestId: crypto.randomUUID(),
      projectId,
      responsibleDepartmentId: owner,
    }),
    systems = (await repo.load()).systems!;
  await repo.mutate({
    action: "saveProjectBudgetEntry",
    requestId: crypto.randomUUID(),
    projectBudgetId: created.id,
    expectedRevision: created.revision,
    entry: {
      description: `Private proposal ${projectId.slice(-3)}`,
      systemId: systems.find(
        (system) =>
          system.departmentName ===
          (projectId === project(202)
            ? "Mechanical & Production"
            : "Electronics"),
      )!.id,
      category: "component",
      plannedNok: amount,
      ordinaryPriority: "P2",
      reuseStatus: "new",
      status: "planned",
    },
  });
  let detail = await repo.detail(created.id);
  if (submit) {
    await repo.mutate({
      action: "submitProjectBudget",
      projectBudgetId: detail.id,
      expectedRevision: detail.revision,
      requestId: crypto.randomUUID(),
    });
    detail = await repo.detail(detail.id);
  }
  return detail;
}
async function two() {
  seed();
  const a = await draft(project(100), "100.00"),
    b = await draft(project(200), "200.00");
  return { a, b };
}
async function purchase(budgetId: string, amount = "60.00") {
  selectLocalBudgetRole("department_lead");
  const budget = await createLocalProjectBudgetRepository().detail(budgetId),
    repo = createLocalProjectPurchaseRepository(),
    binding = {
      projectId: budget.projectId,
      responsibleDepartmentId: departmentId,
    },
    entry = budget.approvedVersion!.entries[0],
    file = await repo.upload(
      binding,
      new File(["%PDF-1.4"], "Invoice.pdf", { type: "application/pdf" }),
    );
  await repo.mutate({
    action: "registerProjectPurchase",
    ...binding,
    requestId: crypto.randomUUID(),
    purchase: {
      buyerName: "Buyer",
      supplierName: "Supplier",
      paymentMethod: "team_account",
      purchaseDate: osloToday(),
      justification: "Materials for project",
      documentKind: "receipt",
      uploadIds: [file],
      lines: [
        {
          systemId: entry.systemId,
          budgetItemId: entry.entryId,
          description: "Components",
          quantity: "1",
          amountNok: amount,
        },
      ],
    },
  });
}
beforeEach(() => {
  localStorage.clear();
  gates.local = true;
  gates.signedIn = true;
  selectLocalBudgetRole("project_lead");
});
describe("local department budget packages", () => {
  it("previews all associated readiness without Draft entry leakage, and atomically approves two projects once", async () => {
    const { a, b } = await two();
    await draft(project(202), "99999.00", false);
    await draft(project(204), "777.00", false, electrical);
    selectLocalBudgetRole("department_lead");
    const repo = createLocalDepartmentBudgetRepository(),
      preview = await repo.preview(departmentId);
    expect(preview.projects.map((row) => row.readiness)).toEqual([
      "department_pending",
      "department_pending",
      "no_budget",
      "draft",
      "unallocated",
      "other_department",
    ]);
    expect(preview.proposedTotalNok).toBe("300.00");
    expect(JSON.stringify(preview)).not.toContain("99999");
    expect(JSON.stringify(preview)).not.toContain("Private proposal 202");
    expect(
      preview.projects.find((row) => row.projectId === project(203))
        ?.responsibleDepartmentId,
    ).toBeNull();
    const request = {
        action: "sendDepartmentBudgetPackage" as const,
        requestId: crypto.randomUUID(),
        departmentId,
        previewToken: preview.previewToken,
      },
      sent = await repo.mutate(request);
    expect(await repo.mutate(request)).toEqual(sent);
    const packet = await repo.detail(sent.id!);
    expect(packet.snapshot).toMatchObject({
      approvedTotalNok: "0.00",
      proposedTotalNok: "300.00",
    });
    expect(JSON.stringify(packet.snapshot)).not.toContain("actualNok");
    expect(JSON.stringify(packet.snapshot)).not.toContain("invoices");
    selectLocalBudgetRole("finance");
    await expect(
      repo.mutate({
        action: "approveDepartmentBudgetPackage",
        requestId: crypto.randomUUID(),
        packageId: packet.id,
        expectedRevision: packet.revision,
      }),
    ).rejects.toMatchObject({ status: 403 });
    selectLocalBudgetRole("head_of_finance");
    const decision = {
        action: "approveDepartmentBudgetPackage" as const,
        requestId: crypto.randomUUID(),
        packageId: packet.id,
        expectedRevision: packet.revision,
      },
      approved = await repo.mutate(decision);
    expect(await repo.mutate(decision)).toEqual(approved);
    const budgets = createLocalProjectBudgetRepository();
    for (const id of [a.id, b.id])
      expect((await budgets.detail(id)).pendingVersion).toBeNull();
    expect(loadLocalDepartmentHomeBudget(departmentId)).toMatchObject({
      approvedTotalNok: "300.00",
      projects: [
        { approvedTotalNok: "100.00" },
        { approvedTotalNok: "200.00" },
      ],
    });
    expect((await repo.detail(packet.id)).decisions).toHaveLength(2);
  });
  it("uses immutable plan pins across purchase/completion changes and retains every invoice at promotion", async () => {
    const { a, b } = await two();
    await approveLocalDepartmentCandidates(departmentId);
    const budgets = createLocalProjectBudgetRepository();
    await purchase(b.id, "20.00");
    for (const original of [a, b]) {
      selectLocalBudgetRole("project_lead");
      let detail = await budgets.detail(original.id);
      await budgets.mutate({
        action: "requestProjectBudgetChanges",
        requestId: crypto.randomUUID(),
        projectBudgetId: detail.id,
        expectedRevision: detail.revision,
        reason: "Updated plan",
      });
      detail = await budgets.detail(detail.id);
      if (detail.id === a.id)
        await budgets.mutate({
          action: "saveProjectBudgetEntry",
          requestId: crypto.randomUUID(),
          projectBudgetId: detail.id,
          expectedRevision: detail.revision,
          entry: { ...detail.pendingVersion!.entries[0], plannedNok: "125.00" },
        });
      else
        await budgets.mutate({
          action: "removeProjectBudgetEntry",
          requestId: crypto.randomUUID(),
          projectBudgetId: detail.id,
          expectedRevision: detail.revision,
          entryId: detail.pendingVersion!.entries[0].entryId,
        });
      detail = await budgets.detail(detail.id);
      await budgets.mutate({
        action: "submitProjectBudget",
        projectBudgetId: detail.id,
        expectedRevision: detail.revision,
        requestId: crypto.randomUUID(),
      });
    }
    const sent = await sendLocalDepartmentCandidates(departmentId),
      repo = createLocalDepartmentBudgetRepository(),
      before = await repo.detail(sent.id!),
      snapshot = JSON.stringify(before.snapshot);
    await purchase(a.id);
    const current = await budgets.detail(a.id);
    await createLocalProjectPurchaseRepository().complete({
      action: "setProjectBudgetCompletion",
      requestId: crypto.randomUUID(),
      projectBudgetId: a.id,
      expectedRevision: current.revision,
      entryId: current.approvedVersion!.entries[0].entryId,
      complete: true,
      reason: "All components received",
    });
    const refreshed = await repo.detail(before.id);
    expect(JSON.stringify(refreshed.snapshot)).toBe(snapshot);
    expect(refreshed.revision).toBe(before.revision);
    expect(
      refreshed.evidence.find(
        (entry) =>
          entry.entryId === current.approvedVersion!.entries[0].entryId,
      ),
    ).toMatchObject({
      actualNok: "60.00",
      completion: "complete",
      invoices: [{ originalName: "Invoice.pdf" }],
    });
    selectLocalBudgetRole("head_of_finance");
    await repo.mutate({
      action: "approveDepartmentBudgetPackage",
      packageId: before.id,
      expectedRevision: before.revision,
      requestId: crypto.randomUUID(),
    });
    expect(
      (await budgets.detail(a.id)).approvedVersion!.entries[0],
    ).toMatchObject({
      actualNok: "60.00",
      completion: "complete",
      plannedNok: "125.00",
    });
    expect(
      (await budgets.detail(b.id)).approvedVersion!.entries[0],
    ).toMatchObject({
      removed: true,
      actualNok: "20.00",
      invoices: [{ originalName: "Invoice.pdf" }],
    });
  });
  it.each([
    "returnDepartmentBudgetPackage",
    "withdrawDepartmentBudgetPackage",
  ] as const)(
    "invalidates the entire package via %s with history and no partial reset",
    async (action) => {
      const { a, b } = await two(),
        sent = await sendLocalDepartmentCandidates(departmentId),
        repo = createLocalDepartmentBudgetRepository();
      selectLocalBudgetRole(
        action === "returnDepartmentBudgetPackage"
          ? "finance"
          : "department_lead",
      );
      const request = {
          action,
          requestId: crypto.randomUUID(),
          packageId: sent.id!,
          expectedRevision: sent.revision!,
          reason: "Correct project details",
        },
        result = await repo.mutate(request);
      expect(await repo.mutate(request)).toEqual(result);
      for (const budget of [a, b]) {
        selectLocalBudgetRole("project_lead");
        expect(
          (await createLocalProjectBudgetRepository().detail(budget.id))
            .pendingVersion,
        ).toMatchObject({ status: "draft", departmentApprovedAt: null });
      }
      selectLocalBudgetRole("head_of_finance");
      await expect(
        repo.mutate({
          action: "approveDepartmentBudgetPackage",
          packageId: sent.id!,
          expectedRevision: sent.revision!,
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await repo.detail(sent.id!)).decisions).toHaveLength(2);
    },
  );
  it("withdraws one included candidate by invalidating every package member and denies standalone approval", async () => {
    const { a, b } = await two(),
      sent = await sendLocalDepartmentCandidates(departmentId),
      repo = createLocalProjectBudgetRepository();
    selectLocalBudgetRole("project_lead");
    const current = await repo.detail(a.id);
    await repo.mutate({
      action: "withdrawProjectBudget",
      projectBudgetId: a.id,
      expectedRevision: current.revision,
      requestId: crypto.randomUUID(),
      reason: "Supplier changed",
    });
    expect((await repo.detail(b.id)).pendingStage).toBe("draft");
    selectLocalBudgetRole("head_of_finance");
    for (const action of [
      "approveProjectBudget",
      "approveDepartmentBudget",
    ] as const)
      await expect(
        repo.mutate({
          action,
          projectBudgetId: a.id,
          expectedRevision: (await repo.detail(a.id)).revision,
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409 });
    expect(
      (await createLocalDepartmentBudgetRepository().detail(sent.id!)).status,
    ).toBe("withdrawn");
  });
  it("rejects stale previews and changed second candidates without partially approving the first", async () => {
    const { a, b } = await two();
    selectLocalBudgetRole("department_lead");
    const repo = createLocalDepartmentBudgetRepository(),
      preview = await repo.preview(departmentId),
      state = JSON.parse(localStorage.getItem(KEY)!);
    state.budgets.find(
      (budget: { id: string }) => budget.id === b.id,
    ).pendingVersion.entries[0].note = "Changed after preview";
    localStorage.setItem(KEY, JSON.stringify(state));
    await expect(
      repo.mutate({
        action: "sendDepartmentBudgetPackage",
        requestId: crypto.randomUUID(),
        departmentId,
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const sent = await sendLocalDepartmentCandidates(departmentId),
      submitted = JSON.parse(localStorage.getItem(KEY)!);
    submitted.budgets.find(
      (budget: { id: string }) => budget.id === b.id,
    ).pendingVersion.entries[0].plannedNok = "999.00";
    localStorage.setItem(KEY, JSON.stringify(submitted));
    const before = localStorage.getItem(KEY);
    selectLocalBudgetRole("head_of_finance");
    await expect(
      repo.mutate({
        action: "approveDepartmentBudgetPackage",
        requestId: crypto.randomUUID(),
        packageId: sent.id!,
        expectedRevision: sent.revision!,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(
      (await createLocalProjectBudgetRepository().detail(a.id)).approvedVersion,
    ).toBeNull();
  });
  it.each(["retired", "changed"])(
    "rejects a %s legacy transition baseline without approving any included project",
    async (change) => {
      const { a } = await two(),
        system = (
          await createLocalProjectBudgetRepository().load()
        ).systems!.find(
          (system) => system.departmentName === "Mechanical & Production",
        )!,
        legacy = {
          version: 1,
          seasonCode: "S27",
          budgetStatus: "approved",
          approvedOn: "2026-01-01",
          items: [
            {
              id: "legacy",
              publicRef: "BI-legacy",
              systemId: system.id,
              systemCode: system.code,
              description: "Historical approved entry",
              category: "material",
              plannedNok: "50.00",
              effectivePlanNok: "50.00",
              actualNok: "0.00",
              differenceNok: "50.00",
              priority: "P1",
              reuseStatus: "new",
              expectedPurchaseDate: null,
              status: "planned",
              revision: 1,
              earmarked: false,
              earmarkPurpose: null,
              earmarkAmountNok: null,
            },
          ],
        };
      localStorage.setItem(
        "helix-finance-local-ledger-v1",
        JSON.stringify(legacy),
      );
      const sent = await sendLocalDepartmentCandidates(departmentId);
      legacy.version++;
      if (change === "retired") legacy.items = [];
      else legacy.items[0].effectivePlanNok = "75.00";
      localStorage.setItem(
        "helix-finance-local-ledger-v1",
        JSON.stringify(legacy),
      );
      const before = localStorage.getItem(KEY);
      selectLocalBudgetRole("head_of_finance");
      await expect(
        createLocalDepartmentBudgetRepository().mutate({
          action: "approveDepartmentBudgetPackage",
          packageId: sent.id!,
          expectedRevision: sent.revision!,
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(localStorage.getItem(KEY)).toBe(before);
      expect(
        (await createLocalProjectBudgetRepository().detail(a.id))
          .approvedVersion,
      ).toBeNull();
    },
  );

  it("requires a genuine new department send for historical unpacketized Finance-pending versions", async () => {
    seed();
    const original = await draft(project(100), "100.00"),
      state = JSON.parse(localStorage.getItem(KEY)!),
      budget = state.budgets.find(
        (budget: { id: string }) => budget.id === original.id,
      );
    budget.pendingStage = "finance_pending";
    budget.pendingVersion.status = "finance_pending";
    budget.pendingVersion.departmentApprovedAt = "2026-11-01T12:00:00Z";
    budget.pendingVersion.departmentApprovedBy = "historical-department-lead";
    budget.decisions.push({
      id: "historical-decision",
      versionId: budget.pendingVersionId,
      action: "approveDepartmentBudget",
      actorMemberId: "historical-department-lead",
      reason: null,
      createdAt: "2026-11-01T12:00:00Z",
      snapshot: structuredClone(budget.pendingVersion.entries),
    });
    localStorage.setItem(KEY, JSON.stringify(state));
    selectLocalBudgetRole("department_lead");
    const repo = createLocalDepartmentBudgetRepository(),
      preview = await repo.preview(departmentId);
    expect(
      preview.projects.find(
        (project) => project.projectBudgetId === original.id,
      ),
    ).toMatchObject({ readiness: "finance_pending", included: true });
    const sent = await repo.mutate({
      action: "sendDepartmentBudgetPackage",
      departmentId,
      previewToken: preview.previewToken,
      requestId: crypto.randomUUID(),
    });
    expect((await repo.detail(sent.id!)).submittedBy).not.toBe(
      "historical-department-lead",
    );
    selectLocalBudgetRole("head_of_finance");
    await repo.mutate({
      action: "approveDepartmentBudgetPackage",
      packageId: sent.id!,
      expectedRevision: sent.revision!,
      requestId: crypto.randomUUID(),
    });
    expect(
      (await createLocalProjectBudgetRepository().detail(original.id))
        .decisions,
    ).toContainEqual(
      expect.objectContaining({
        id: "historical-decision",
        actorMemberId: "historical-department-lead",
        createdAt: "2026-11-01T12:00:00Z",
      }),
    );
  });

  it("requires current scoped authority and both local gates, including on replay", async () => {
    await two();
    const sent = await sendLocalDepartmentCandidates(departmentId),
      repo = createLocalDepartmentBudgetRepository();
    selectLocalBudgetRole("project_lead");
    await expect(repo.queue(departmentId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.detail(sent.id!)).rejects.toMatchObject({ status: 403 });
    selectLocalBudgetRole("department_lead");
    await expect(repo.preview(electrical)).rejects.toMatchObject({
      status: 403,
    });
    gates.signedIn = false;
    await expect(repo.queue()).rejects.toMatchObject({ status: 401 });
    gates.signedIn = true;
    gates.local = false;
    expect(createLocalDepartmentBudgetRepository).toThrow("Sign in");
  });
});
