// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fundingFixture, fundingRole } from "./funding-application.test-support";
import { localBudgetWorkspace } from "./project-budget-local";
import { approveLocalDepartmentCandidates } from "./department-budget.test-support";
const key = "helix-project-budgets-local-v1";
const workspaceKey = "helix-member-local-projects-v1";
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true, localMemberSignedIn: () => true,
  localMemberAccount: { email: "alex@example.invalid" },
}));
beforeEach(() => { localStorage.clear(); });
async function privateRevision() {
  const fixture = await fundingFixture();
  const { budgets, budget } = fixture;
  fundingRole("project_lead");
  let result = await budgets.mutate({ action: "requestProjectBudgetChanges", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: crypto.randomUUID(), reason: "Revise quote" });
  let detail = await budgets.detail(budget.id);
  result = await budgets.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID(), entry: { ...detail.pendingVersion!.entries[0], plannedNok: "99999.00", note: "Private supplier negotiation" } });
  // Produce genuine immutable decision snapshots containing the former submitted candidate.
  result = await budgets.mutate({ action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID() });
  fundingRole("finance");
  await budgets.mutate({ action: "requestProjectBudgetChanges", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID(), reason: "Revise again" });
  fundingRole("project_lead");
  detail = await budgets.detail(budget.id);
  expect(JSON.stringify(detail.decisions)).toContain("Private supplier negotiation");
  return { ...fixture, detail };
}
describe("local project Draft privacy", () => {
  it("redacts workspace, detail and all raw decision snapshots without mutating stored plans", async () => {
    const { budgets, budget, detail } = await privateRevision();
    for (const role of ["finance", "head_of_finance"]) {
      fundingRole(role);
      const stored = localStorage.getItem(key);
      const workspace = await budgets.load(), summary = workspace.budgets.find(item => item.id === budget.id)!;
      expect(summary.pendingTotalNok).toBeNull();
      for (const field of ["pendingVersion", "approvedVersion", "historyVersions", "decisions"]) expect(summary).not.toHaveProperty(field);
      const projected = await budgets.detail(budget.id);
      expect(projected.pendingVersion).toBeNull();
      expect(projected.pendingTotalNok).toBeNull();
      expect(projected.approvedTotalNok).toBe("1000.00");
      expect(projected.approvedVersion).toEqual(detail.approvedVersion);
      expect(projected.decisions.map(({ snapshot: _snapshot, ...metadata }) => metadata)).toEqual(detail.decisions.map(({ snapshot: _snapshot, ...metadata }) => metadata));
      expect(projected.decisions.every(item => JSON.stringify(item.snapshot) === "{}")).toBe(true);
      expect(JSON.stringify({ workspace, projected })).not.toContain("Private supplier negotiation");
      expect(localStorage.getItem(key)).toBe(stored);
    }
    for (const role of ["project_lead", "department_lead"]) {
      fundingRole(role);
      expect((await budgets.detail(budget.id)).pendingVersion!.entries[0].note).toBe("Private supplier negotiation");
    }
    fundingRole("project_lead");
    await budgets.mutate({ action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: detail.revision, requestId: crypto.randomUUID() });
    fundingRole("head_of_finance");
    expect((await budgets.detail(budget.id)).pendingVersion!.entries[0].plannedNok).toBe("99999.00");
    expect((await budgets.load()).budgets[0].pendingTotalNok).toBe("99999.00");
    await approveLocalDepartmentCandidates(budget.responsibleDepartmentId);
    fundingRole("finance");
    const approved = await budgets.detail(budget.id);
    expect(approved.approvedTotalNok).toBe("99999.00");
    expect(approved.historyVersions).toHaveLength(1);
    expect(approved.decisions.every(item => JSON.stringify(item.snapshot) === "{}")).toBe(true);
  });
  it.each(["finance", "head_of_finance"])("uses current explicit lead assignments for overlapping %s authority", async role => {
    const { budgets, budget } = await privateRevision();
    const workspace = localBudgetWorkspace(), actor = role === "finance" ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444";
    const project = workspace.projects.find(item => item.id === budget.projectId)!;
    project.leadIds = [...(project.leadIds ?? []), actor];
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    fundingRole(role);
    expect((await budgets.detail(budget.id)).capabilities.canDraft).toBe(true);
    expect((await budgets.detail(budget.id)).pendingVersion!.totalNok).toBe("99999.00");
    project.leadIds = (project.leadIds ?? []).filter(id => id !== actor);
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    expect((await budgets.detail(budget.id)).pendingVersion).toBeNull();
    const department = workspace.departments.find(item => item.id === budget.responsibleDepartmentId)!;
    department.leadIds = [...(department.leadIds ?? []), actor];
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    expect((await budgets.detail(budget.id)).capabilities.canReviewDepartment).toBe(true);
    expect((await budgets.detail(budget.id)).pendingVersion!.totalNok).toBe("99999.00");
    department.leadIds = department.leadIds.filter(id => id !== actor);
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    expect((await budgets.detail(budget.id)).pendingVersion).toBeNull();
  });
  it("keeps approved choices authoritative while exposing only newly submitted revision entries", async () => {
    const { repository, budgets, app, budget, system } = await fundingFixture();
    fundingRole("project_lead");
    let result = await budgets.mutate({ action: "requestProjectBudgetChanges", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: crypto.randomUUID(), reason: "Add tooling" });
    const current = await budgets.detail(budget.id);
    result = await budgets.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID(), entry: { ...current.pendingVersion!.entries[0], plannedNok: "99999.00", note: "Unsubmitted replacement quote" } });
    result = await budgets.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID(), entry: { systemId: system.id, description: "Additional tooling", plannedNok: "50.00", ordinaryPriority: "P3", category: "tooling", reuseStatus: "new", status: "planned" } });
    const addition = (await budgets.detail(budget.id)).pendingVersion!.entries.find(entry => entry.description === "Additional tooling")!;
    fundingRole("head_of_finance");
    let context = await repository.context(app.id);
    expect(context.entries).toHaveLength(1);
    expect(context.entries[0]).toMatchObject({ plannedNok: "1000.00", approved: true });
    await expect(repository.mutate({ action: "linkFundingApplicationEntry", applicationId: app.id, expectedRevision: app.revision, expectedBudgetRevision: result.revision, entryId: addition.entryId, requestId: crypto.randomUUID() })).rejects.toMatchObject({ status: 400 });
    fundingRole("project_lead");
    result = await budgets.mutate({ action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: result.revision, requestId: crypto.randomUUID() });
    fundingRole("head_of_finance");
    context = await repository.context(app.id);
    expect(context.entries).toHaveLength(2);
    expect(context.entries.find(entry => entry.entryId === budget.approvedVersion!.entries[0].entryId)).toMatchObject({ plannedNok: "1000.00", approved: true });
    expect(context.entries.find(entry => entry.entryId === addition.entryId)).toMatchObject({ plannedNok: "50.00", approved: false, effectivePriority: "Pending approval" });
    await expect(repository.mutate({ action: "linkFundingApplicationEntry", applicationId: app.id, expectedRevision: app.revision, expectedBudgetRevision: result.revision, entryId: addition.entryId, requestId: crypto.randomUUID() })).resolves.toMatchObject({ revision: app.revision + 1 });
  });
  it("rejects first unsubmitted Draft funding links while preserving submitted choices and Head proposals", async () => {
    const { repository, budgets, app, budget, system } = await fundingFixture();
    const proposal = await repository.mutate({ action: "proposeFundingBudgetEntry", requestId: crypto.randomUUID(), applicationId: app.id, expectedRevision: app.revision, projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, entry: { systemId: system.id, description: "Head-owned proposal", plannedNok: "25.00", ordinaryPriority: "P1", category: "tooling", reuseStatus: "new", status: "planned" }, note: "Head rationale" });
    fundingRole("project_lead");
    const workspace = localBudgetWorkspace(), project = { ...workspace.projects[0], id: crypto.randomUUID(), name: "New project" };
    workspace.projects.push(project);
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    let result = await budgets.mutate({ action: "createProjectBudget", projectId: project.id, responsibleDepartmentId: budget.responsibleDepartmentId, requestId: crypto.randomUUID() });
    result = await budgets.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: result.id, expectedRevision: result.revision, requestId: crypto.randomUUID(), entry: { ...budget.approvedVersion!.entries[0], entryId: undefined, description: "Unsubmitted confidential entry", note: "Private first quote" } });
    const draft = await budgets.detail(result.id), entry = draft.pendingVersion!.entries[0];
    fundingRole("head_of_finance");
    const stored = localStorage.getItem(key);
    expect(JSON.stringify(await repository.context(app.id))).not.toContain("Private first quote");
    expect((await repository.context(app.id)).entries.some(item => item.entryId === entry.entryId)).toBe(false);
    const link = { action: "linkFundingApplicationEntry" as const, requestId: crypto.randomUUID(), applicationId: app.id, expectedRevision: proposal.revision, entryId: entry.entryId, expectedBudgetRevision: draft.revision };
    await expect(repository.mutate(link)).rejects.toMatchObject({ status: 400 });
    expect(localStorage.getItem(key)).toBe(stored);
    expect((await repository.detail(app.id)).proposals[0].desiredEntry.description).toBe("Head-owned proposal");
    fundingRole("project_lead");
    result = await budgets.mutate({ action: "submitProjectBudget", projectBudgetId: draft.id, expectedRevision: draft.revision, requestId: crypto.randomUUID() });
    fundingRole("head_of_finance");
    expect((await repository.context(app.id)).entries.find(item => item.entryId === entry.entryId)?.approved).toBe(false);
    await expect(repository.mutate({ ...link, requestId: crypto.randomUUID(), expectedBudgetRevision: result.revision })).resolves.toMatchObject({ revision: proposal.revision + 1 });
  });
});
