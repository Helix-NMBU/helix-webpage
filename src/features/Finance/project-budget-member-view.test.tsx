// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import { approveLocalDepartmentCandidates, sendLocalDepartmentCandidates } from "./department-budget.test-support";
import { memberApprovedBudgetDetail } from "./project-budget-member-view";
import { ProjectBudgetsPanel } from "./ProjectBudgetsPanel";

const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("./FundingBudgetProposals", () => ({ FundingBudgetProposals: () => <span>Private funding proposals</span> }));
vi.mock("./InvoiceEvidence", () => ({ InvoiceEvidence: () => <span>Private invoice evidence</span> }));
vi.mock("./ProjectBudgetPurchases", () => ({ ProjectBudgetPurchases: ({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) => {
  useEffect(() => { onDirtyChange(true); return () => onDirtyChange(false); }, [onDirtyChange]);
  return <input aria-label="Private purchase reason" defaultValue="Private unfinished invoice input" />;
} }));
const projectId = "00000000-0000-4000-8000-000000000100";
const departmentId = "00000000-0000-4000-8000-000000000300";
const budgetKey = "helix-project-budgets-local-v1";
const projectKey = "helix-member-local-projects-v1";
let root: Root | undefined, container: HTMLDivElement | undefined;
beforeEach(() => {
  vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); role("project_lead");
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); container = undefined; localStorage.clear(); window.history.replaceState({}, "", "/"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function role(value: string) { window.history.replaceState({}, "", `/?memberRole=default&budgetRole=${value}`); }
function member() { window.history.replaceState({}, "", "/?memberRole=project_member"); }
async function plan(approved = true) {
  const repo = createLocalProjectBudgetRepository();
  const created = await repo.mutate({ action: "createProjectBudget", projectId, responsibleDepartmentId: departmentId, requestId: crypto.randomUUID() });
  let budget = await repo.detail(created.id!);
  const workspace = await repo.load({ projectId });
  await repo.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: crypto.randomUUID(), entry: { description: "Allocated frame material", systemId: workspace.systems!.find(system => system.departmentName === "Mechanical & Production")!.id, category: "material", plannedNok: "100.25", ordinaryPriority: "P1", reuseStatus: "new", status: "planned", note: "Private author note", ownerEmail: "private-owner@example.invalid" } });
  if (approved) {
    budget = await repo.detail(budget.id);
    await repo.mutate({ action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: crypto.randomUUID() });
    await approveLocalDepartmentCandidates(departmentId);
  }
  role("project_lead");
  return { repo, id: budget.id };
}
async function revision(id: string) {
  const repo = createLocalProjectBudgetRepository();
  let budget = await repo.detail(id);
  await repo.mutate({ action: "requestProjectBudgetChanges", projectBudgetId: id, expectedRevision: budget.revision, reason: "Private revision reason", requestId: crypto.randomUUID() });
  budget = await repo.detail(id);
  const old = budget.pendingVersion!.entries[0];
  await repo.mutate({ action: "saveProjectBudgetEntry", projectBudgetId: id, expectedRevision: budget.revision, requestId: crypto.randomUUID(), entry: { ...old, description: "Private pending supplier quote", plannedNok: "99999.00" } });
  return repo.detail(id);
}
async function render(repo: ReturnType<typeof createLocalProjectBudgetRepository>) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<ProjectBudgetsPanel projectId={projectId} repository={repo} />));
}
it("reads only the current approved allocation while Draft and submitted revisions stay private, and denies every authoring action", async () => {
  const { repo, id } = await plan();
  let budget = await revision(id);
  const original = localStorage.getItem(budgetKey);
  member();
  const view = await repo.load({ projectId }), detail = await repo.detail(id);
  expect(view.budgets[0]).toMatchObject({ approvedTotalNok: "100.25", pendingVersionId: null, pendingStage: null, pendingTotalNok: null, capabilities: { approvedOnly: true, canRequestChanges: false, canDraft: false, canRegisterPurchase: false } });
  expect(detail.approvedVersion!.entries[0].description).toBe("Allocated frame material");
  expect(detail.pendingVersion).toBeNull(); expect(detail.historyVersions).toEqual([]); expect(detail.decisions).toEqual([]);
  expect(JSON.stringify(detail)).not.toMatch(/Private|private-owner|99999/);
  for (const action of ["requestProjectBudgetChanges", "submitProjectBudget", "removeProjectBudgetEntry"] as const) {
    await expect(repo.mutate({ action, projectBudgetId: id, expectedRevision: budget.revision, requestId: crypto.randomUUID(), reason: "Cannot change", entryId: detail.approvedVersion!.entries[0].entryId } as Parameters<typeof repo.mutate>[0])).rejects.toMatchObject({ status: 403 });
  }
  expect(localStorage.getItem(budgetKey)).toBe(original);
  role("project_lead"); budget = await repo.detail(id);
  await repo.mutate({ action: "submitProjectBudget", projectBudgetId: id, expectedRevision: budget.revision, requestId: crypto.randomUUID() });
  await sendLocalDepartmentCandidates(departmentId);
  member();
  expect((await repo.detail(id)).pendingVersion).toBeNull();
  expect(JSON.stringify(await repo.detail(id))).not.toContain("Private pending supplier quote");
});
it("does not publish a first Draft and rechecks task assignment and department membership on every read", async () => {
  const { repo, id } = await plan(false);
  member();
  expect((await repo.load({ projectId })).scopes[0].capabilities.approvedOnly).toBe(true);
  expect((await repo.load({ projectId })).budgets).toEqual([]);
  await expect(repo.detail(id)).rejects.toMatchObject({ status: 404 });
  role("project_lead");
  const budget = await repo.detail(id);
  await repo.mutate({ action: "submitProjectBudget", projectBudgetId: id, expectedRevision: budget.revision, requestId: crypto.randomUUID() });
  await approveLocalDepartmentCandidates(departmentId);
  member();
  expect((await repo.detail(id)).approvedTotalNok).toBe("100.25");
  const source = (await import("../ProjectManagement/local-repository")).initialLocalWorkspace();
  source.tasks = source.tasks.map(task => ({ ...task, assigneeIds: task.assigneeIds.filter(actor => actor !== source.viewerId) }));
  localStorage.setItem(projectKey, JSON.stringify(source));
  expect((await repo.load({ projectId })).budgets).toEqual([]);
  await expect(repo.detail(id)).rejects.toMatchObject({ status: 403 });
  const restored = (await import("../ProjectManagement/local-repository")).initialLocalWorkspace();
  restored.departments = restored.departments.map(department => ({ ...department, memberIds: department.memberIds.filter(actor => actor !== restored.viewerId) }));
  localStorage.setItem(projectKey, JSON.stringify(restored));
  await expect(repo.detail(id)).rejects.toMatchObject({ status: 403 });
});
it("renders allocated entries without any request, review, evidence, funding or version controls", async () => {
  const { repo, id } = await plan(); await revision(id); member();
  await render(repo);
  expect(container!.textContent).toContain("Allocated frame material");
  expect(container!.textContent).toContain("NOK 100.25");
  expect(container!.textContent).not.toMatch(/Request changes|More actions|Add entry|Private|Review changes|Budget version|Approval history/);
  expect(container!.querySelector('[aria-label="Private purchase reason"]')).toBeNull();
});
it("clears dirty privileged purchase input immediately when the reader becomes an approved-only member", async () => {
  const { repo } = await plan(); role("finance");
  await render(repo);
  expect(container!.querySelector('[aria-label="Private purchase reason"]')).not.toBeNull();
  member();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container!.querySelector('[aria-label="Private purchase reason"]')).toBeNull();
  expect(container!.textContent).toContain("Allocated frame material");
  expect(container!.textContent).not.toContain("Private funding proposals");
});
it("allowlists member entry data even if privileged source data contains invoices, owners, funding links and audit snapshots", async () => {
  const { repo, id } = await plan(); await revision(id);
  const source = await repo.detail(id), entry = source.approvedVersion!.entries[0];
  entry.invoices = [{ documentId: "secret-document", purchaseId: "secret-purchase", purchaseRef: "secret-ref", originalName: "secret-invoice.pdf", backend: "google_drive", transferStatus: "stored", viewerUrl: "https://example.invalid/secret-document" }];
  entry.earmarkId = "secret-funding-link";
  const before = JSON.stringify(source), projected = memberApprovedBudgetDetail(source);
  expect(JSON.stringify(projected)).not.toMatch(/secret-|Private|private-owner|99999/);
  expect(projected.capabilities).toMatchObject({ approvedOnly: true, canRead: true, canRequestChanges: false });
  expect(JSON.stringify(source)).toBe(before);
});
