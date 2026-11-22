import { sendLocalDepartmentCandidates, approvePendingLocalDepartmentPackage } from "./department-budget.test-support";
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import type {
  ProjectBudgetMutation,
  ProjectBudgetEntryInput,
} from "./project-budget-types";
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
const projectId = "00000000-0000-4000-8000-000000000100",
  departmentId = "00000000-0000-4000-8000-000000000300";
function role(value: string) {
  window.history.replaceState({}, "", `/?budgetRole=${value}`);
}
const repository = () => createLocalProjectBudgetRepository();
async function write(
  id: string,
  change:
    | {
        action:
          | "submitProjectBudget"
          | "approveDepartmentBudget"
          | "approveProjectBudget";
      }
    | { action: "requestProjectBudgetChanges"; reason: string },
) {
  if(change.action==="approveDepartmentBudget")return sendLocalDepartmentCandidates(departmentId);
  if(change.action==="approveProjectBudget")return approvePendingLocalDepartmentPackage(departmentId);
  return repository().mutate({
    ...change,
    projectBudgetId: id,
    expectedRevision: (await repository().detail(id)).revision,
    requestId: crypto.randomUUID(),
  } as ProjectBudgetMutation);
}
async function approved() {
  const repo = repository(),
    created = await repo.mutate({
      action: "createProjectBudget",
      projectId,
      responsibleDepartmentId: departmentId,
      requestId: crypto.randomUUID(),
    });
  const systems = (await repo.load()).systems!,
    systemId = systems.find(
      (system) => system.departmentName === "Mechanical & Production",
    )!.id;
  const input: ProjectBudgetEntryInput = {
    systemId,
    description: "Frame tubes",
    category: "material",
    plannedNok: "100.00",
    ordinaryPriority: "P2",
    reuseStatus: "reuse",
    status: "planned",
    note: "Keep supplier reference",
  };
  await repo.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: created.id,
    expectedRevision: created.revision,
    requestId: crypto.randomUUID(),
    entry: input,
  });
  await write(created.id, { action: "submitProjectBudget" });
  role("department_lead");
  await write(created.id, { action: "approveDepartmentBudget" });
  role("head_of_finance");
  await write(created.id, { action: "approveProjectBudget" });
  role("project_lead");
  return { repo, id: created.id, systemId, input };
}
beforeEach(() => {
  localStorage.clear();
  role("project_lead");
});
describe("project revision and candidate CSV fixtures", () => {
  it("reuses one candidate, resets both approvals, and retains the old approval until promotion", async () => {
    const { repo, id } = await approved();
    const initial = await repo.detail(id);
    role("finance");
    await write(id, {
      action: "requestProjectBudgetChanges",
      reason: "Update supplier quote",
    });
    expect((await repo.detail(id)).pendingVersion).toBeNull();
    role("project_lead");
    const candidate = (await repo.detail(id)).pendingVersion!;
    expect(candidate.entries[0].entryId).toBe(
      initial.approvedVersion!.entries[0].entryId,
    );
    role("project_lead");
    await write(id, { action: "submitProjectBudget" });
    role("department_lead");
    await write(id, { action: "approveDepartmentBudget" });
    role("finance");
    await write(id, {
      action: "requestProjectBudgetChanges",
      reason: "Correct category",
    });
    expect((await repo.detail(id)).pendingVersion).toBeNull();
    role("project_lead");
    const changed = await repo.detail(id);
    expect(changed.pendingVersion).toMatchObject({
      id: candidate.id,
      status: "draft",
      departmentApprovedAt: null,
      approvedAt: null,
    });
    expect(changed.approvedVersion).toEqual(initial.approvedVersion);
    role("project_lead");
    const entry = changed.pendingVersion!.entries[0];
    await repo.mutate({
      action: "saveProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: changed.revision,
      requestId: crypto.randomUUID(),
      entry: { ...entry, plannedNok: "125.00" },
    });
    expect((await repo.detail(id)).approvedTotalNok).toBe("100.00");
    await write(id, { action: "submitProjectBudget" });
    role("department_lead");
    await write(id, { action: "approveDepartmentBudget" });
    role("head_of_finance");
    await write(id, { action: "approveProjectBudget" });
    const promoted = await repo.detail(id);
    expect(promoted.approvedTotalNok).toBe("125.00");
    expect(promoted.approvedVersion!.entries[0].budgetItemId).toBe(
      entry.entryId,
    );
    expect(promoted.historyVersions![0]).toEqual(initial.approvedVersion);
  });
  it("previews and reimports the target candidate, preserving identities and omitted optional values", async () => {
    const { repo, id, systemId } = await approved();
    await write(id, {
      action: "requestProjectBudgetChanges",
      reason: "CSV revision",
    });
    let budget = await repo.detail(id);
    const original = budget.pendingVersion!.entries[0];
    const csv = `system_id;description;planned_nok\n${systemId};  FRAME  tubes  ;125.25`;
    const preview = await repo.mutate({
      action: "previewProjectBudgetImport",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      csv,
    });
    expect(preview.importPreview!.counts.changed).toBe(1);
    expect((await repo.detail(id)).pendingTotalNok).toBe("100.00");
    await repo.mutate({
      action: "importProjectBudgetEntries",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      csv,
      previewToken: preview.importPreview!.previewToken,
    });
    budget = await repo.detail(id);
    expect(budget.pendingVersion!.entries[0]).toMatchObject({
      entryId: original.entryId,
      budgetItemId: original.budgetItemId,
      plannedNok: "125.25",
      note: "Keep supplier reference",
      ordinaryPriority: "P2",
      reuseStatus: "reuse",
    });
    expect(budget.approvedTotalNok).toBe("100.00");
    const unchanged = await repo.mutate({
      action: "previewProjectBudgetImport",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      csv,
    });
    expect(unchanged.importPreview!.counts.unchanged).toBe(1);
  });
  it("rejects stale previews, changed CSV and non-project systems without altering approved contents", async () => {
    const { repo, id, systemId } = await approved();
    await write(id, {
      action: "requestProjectBudgetChanges",
      reason: "CSV revision",
    });
    const budget = await repo.detail(id),
      csv = `system_id;description;planned_nok\n${systemId};Frame tubes;200.00`;
    const preview = (
      await repo.mutate({
        action: "previewProjectBudgetImport",
        projectBudgetId: id,
        expectedRevision: budget.revision,
        requestId: crypto.randomUUID(),
        csv,
      })
    ).importPreview!;
    await expect(
      repo.mutate({
        action: "importProjectBudgetEntries",
        projectBudgetId: id,
        expectedRevision: budget.revision,
        requestId: crypto.randomUUID(),
        csv: csv + "0",
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await repo.mutate({
      action: "saveProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      entry: {
        ...budget.pendingVersion!.entries[0],
        note: "Changed after preview",
      },
    });
    await expect(
      repo.mutate({
        action: "importProjectBudgetEntries",
        projectBudgetId: id,
        expectedRevision: budget.revision + 1,
        requestId: crypto.randomUUID(),
        csv,
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const invalid = await repo.mutate({
      action: "previewProjectBudgetImport",
      projectBudgetId: id,
      expectedRevision: budget.revision + 1,
      requestId: crypto.randomUUID(),
      csv: "system_id;description;planned_nok;priority\nforeign;Other;1.00;P0",
    });
    expect(invalid.importPreview!.errors.length).toBeGreaterThan(0);
    expect((await repo.detail(id)).approvedTotalNok).toBe("100.00");
    role("finance");
    await expect(
      repo.mutate({
        action: "previewProjectBudgetImport",
        projectBudgetId: id,
        expectedRevision: budget.revision + 1,
        requestId: crypto.randomUUID(),
        csv,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("reviews a zero-plan revision and retains purchased removed-entry evidence through promotion", async () => {
    const { repo, id } = await approved();
    const readState = () =>
      JSON.parse(localStorage.getItem("helix-project-budgets-local-v1")!);
    let state = readState(),
      budget = state.budgets.find((item: { id: string }) => item.id === id);
    budget.approvedVersion.entries[0].actualNok = "25.00";
    budget.approvedVersion.entries[0].invoices = [
      {
        documentId: "invoice-one",
        purchaseId: "purchase-one",
        purchaseRef: "PUR-001",
        originalName: "Invoice.pdf",
        backend: "private_storage",
        transferStatus: "stored",
        viewerUrl: null,
      },
    ];
    localStorage.setItem(
      "helix-project-budgets-local-v1",
      JSON.stringify(state),
    );
    await write(id, {
      action: "requestProjectBudgetChanges",
      reason: "Remove remaining plan",
    });
    const candidate = await repo.detail(id),
      entry = candidate.pendingVersion!.entries[0];
    state = readState();
    budget = state.budgets.find((item: { id: string }) => item.id === id);
    budget.approvedVersion.entries[0].actualNok = "75.00";
    budget.approvedVersion.entries[0].invoices.push({
      ...budget.approvedVersion.entries[0].invoices[0],
      documentId: "invoice-two",
      purchaseId: "purchase-two",
      purchaseRef: "PUR-002",
    });
    localStorage.setItem(
      "helix-project-budgets-local-v1",
      JSON.stringify(state),
    );
    await repo.mutate({
      action: "removeProjectBudgetEntry",
      projectBudgetId: id,
      expectedRevision: candidate.revision,
      requestId: crypto.randomUUID(),
      entryId: entry.entryId,
    });
    expect((await repo.detail(id)).approvedTotalNok).toBe("100.00");
    await write(id, { action: "submitProjectBudget" });
    role("department_lead");
    await write(id, { action: "approveDepartmentBudget" });
    role("head_of_finance");
    await write(id, { action: "approveProjectBudget" });
    const promoted = await repo.detail(id);
    expect(promoted.approvedTotalNok).toBe("0.00");
    expect(promoted.approvedVersion!.entries[0]).toMatchObject({
      entryId: entry.entryId,
      budgetItemId: entry.budgetItemId,
      removed: true,
      actualNok: "75.00",
    });
    expect(promoted.approvedVersion!.entries[0].invoices).toHaveLength(2);
    expect(promoted.historyVersions![0].entries[0]).toMatchObject({
      plannedNok: "100.00",
      actualNok: "75.00",
      removed: false,
    });
  });
  it.each(["project_lead", "department_lead", "finance"])(
    "allows %s to request a revision with a reason",
    async (requester) => {
      const { repo, id } = await approved();
      role(requester);
      const budget = await repo.detail(id);
      await expect(
        repo.mutate({
          action: "requestProjectBudgetChanges",
          projectBudgetId: id,
          expectedRevision: budget.revision,
          requestId: crypto.randomUUID(),
          reason: "",
        }),
      ).rejects.toMatchObject({ status: 400 });
      await write(id, {
        action: "requestProjectBudgetChanges",
        reason: "Update plan",
      });
      expect((await repo.detail(id)).pendingStage).toBe("draft");
      expect((await repo.detail(id)).approvedTotalNok).toBe("100.00");
    },
  );
});
