import { sendLocalDepartmentCandidates, approvePendingLocalDepartmentPackage } from "./department-budget.test-support";
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import type { ProjectBudgetMutation } from "./project-budget-types";
const gates = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
}));
const projectId = "00000000-0000-4000-8000-000000000100";
const departmentId = "00000000-0000-4000-8000-000000000300";
function role(value: string) {
  window.history.replaceState({}, "", `/?budgetRole=${value}`);
}
async function draft() {
  const repo = createLocalProjectBudgetRepository();
  const created = await repo.mutate({
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: departmentId,
    requestId: crypto.randomUUID(),
  });
  const workspace = await repo.load({ projectId });
  const result = await repo.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: created.id,
    expectedRevision: created.revision,
    requestId: crypto.randomUUID(),
    entry: {
      systemId: workspace.systems!.find(
        (system) => system.departmentName === "Mechanical & Production",
      )!.id,
      description: "Frame tubes",
      plannedNok: "12000.25",
      ordinaryPriority: "P2",
      category: "material",
      reuseStatus: "new",
      status: "planned",
    },
  });
  return { repo, id: created.id, revision: result.revision };
}
async function transition(
  id: string,
  action:
    | "submitProjectBudget"
    | "approveDepartmentBudget"
    | "approveProjectBudget",
) {
  const repo = createLocalProjectBudgetRepository(),
    budget = await repo.detail(id);
  return repo.mutate({
    action,
    projectBudgetId: id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
  });
}
beforeEach(() => {
  localStorage.clear();
  gates.local = true;
  gates.signedIn = true;
  role("project_lead");
});
describe("local initial project budget approvals", () => {
  it("retains the same project and immutable entries across four roles and both approvals", async () => {
    const { repo, id } = await draft();
    const before = (await repo.detail(id)).pendingVersion!.entries;
    await transition(id, "submitProjectBudget");
    role("finance");
    expect((await repo.load()).budgets[0].pendingStage).toBe(
      "department_pending",
    );
    await expect(transition(id, "approveProjectBudget")).rejects.toMatchObject({
      status: 409,
    });
    role("department_lead");
    expect((await repo.load({ departmentId })).budgets[0].id).toBe(id);
    await sendLocalDepartmentCandidates(departmentId);
    role("finance");
    await expect(transition(id, "approveProjectBudget")).rejects.toMatchObject({
      status: 409,
    });
    role("head_of_finance");
    await approvePendingLocalDepartmentPackage(departmentId);
    const approved = await createLocalProjectBudgetRepository().detail(id);
    expect(approved.pendingVersion).toBeNull();
    expect(approved.approvedVersion!.status).toBe("approved");
    expect(approved.approvedTotalNok).toBe("12000.25");
    expect(approved.approvedVersion!.entries[0]).toMatchObject({
      ...before[0],
      budgetItemId: before[0].entryId,
      publicRef: expect.stringMatching(/^BI-S27-/),
    });
    expect(approved.decisions.map((decision) => decision.action)).toEqual([
      "submitProjectBudget",
      "sendDepartmentBudgetPackage",
      "approveDepartmentBudgetPackage",
    ]);
    expect(approved.decisions[0].snapshot).toEqual({});
    role("project_lead");
    expect((await repo.detail(id)).decisions[0].snapshot).toEqual(before);
  });
  it("forbids editing submitted contents and requires the responsible department before Finance", async () => {
    const { repo, id } = await draft();
    await transition(id, "submitProjectBudget");
    const budget = await repo.detail(id);
    const entry = budget.pendingVersion!.entries[0];
    await expect(
      repo.mutate({
        action: "saveProjectBudgetEntry",
        projectBudgetId: id,
        expectedRevision: budget.revision,
        requestId: crypto.randomUUID(),
        entry: { ...entry, plannedNok: "1.00" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    role("head_of_finance");
    await expect(transition(id, "approveProjectBudget")).rejects.toMatchObject({
      status: 409,
    });
    role("department_lead");
    await sendLocalDepartmentCandidates(departmentId);
    await expect(
      transition(id, "approveDepartmentBudget"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("requires a return reason and clears approvals when a submitted version returns to Draft", async () => {
    const { repo, id } = await draft();
    await transition(id, "submitProjectBudget");
    role("department_lead");
    await sendLocalDepartmentCandidates(departmentId);
    role("head_of_finance");
    const budget = await repo.detail(id);
    const change: ProjectBudgetMutation = {
      action: "returnProjectBudget",
      projectBudgetId: id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
      reason: "",
    };
    await expect(repo.mutate(change)).rejects.toMatchObject({ status: 400 });
    await repo.mutate({ ...change, reason: "Include the supplier quote" });
    expect((await repo.detail(id)).pendingVersion).toBeNull();
    role("project_lead");
    const returned = await repo.detail(id);
    expect(returned.pendingVersion).toMatchObject({
      status: "draft",
      submittedAt: null,
      departmentApprovedAt: null,
      departmentApprovedBy: null,
      approvedAt: null,
    });
    expect(returned.decisions[returned.decisions.length - 1]?.reason).toBe(
      "Include the supplier quote",
    );
    role("project_lead");
    await transition(id, "submitProjectBudget");
    role("head_of_finance");
    await expect(transition(id, "approveProjectBudget")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("retains totals on stale writes and deduplicates exact request retries", async () => {
    const { repo, id, revision } = await draft();
    const change: ProjectBudgetMutation = {
      action: "submitProjectBudget",
      projectBudgetId: id,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
    };
    const result = await repo.mutate(change);
    expect(await repo.mutate(change)).toEqual(result);
    await expect(
      repo.mutate({ ...change, requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await repo.detail(id)).pendingTotalNok).toBe("12000.25");
    expect((await repo.detail(id)).decisions).toHaveLength(1);
  });
  it("uses actual existing project IDs and prevents all local storage access outside both gates", async () => {
    const { repo, id } = await draft();
    expect((await repo.load({ projectId })).budgets[0].projectId).toBe(
      projectId,
    );
    expect((await repo.load({ projectId: "another-project" })).budgets).toEqual(
      [],
    );
    gates.local = false;
    expect(createLocalProjectBudgetRepository).toThrow("Sign in");
    await expect(repo.detail(id)).rejects.toMatchObject({ status: 401 });
    gates.local = true;
    gates.signedIn = false;
    expect(createLocalProjectBudgetRepository).toThrow("Sign in");
    await expect(repo.load()).rejects.toMatchObject({ status: 401 });
  });
  it("retains the selected role after navigation and a repository reload", async () => {
    const { repo, id } = await draft();
    await transition(id, "submitProjectBudget");
    role("department_lead");
    await repo.load();
    window.history.replaceState({}, "", "/?tab=budgets");
    const reloaded = await createLocalProjectBudgetRepository().detail(id);
    expect(reloaded.capabilities.canReviewDepartment).toBe(true);
    expect(reloaded.capabilities.canDraft).toBe(false);
  });
});
