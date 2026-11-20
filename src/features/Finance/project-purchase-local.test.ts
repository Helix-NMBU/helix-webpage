// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import { createLocalProjectPurchaseRepository } from "./project-purchase-local";
import type { PurchaseInput } from "./types";
import { osloToday } from "./money";
const gate = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gate.local,
  localMemberSignedIn: () => gate.signedIn,
}));
const projectId = "00000000-0000-4000-8000-000000000100",
  responsibleDepartmentId = "00000000-0000-4000-8000-000000000300";
const binding = { projectId, responsibleDepartmentId };
const role = (value: string) =>
  window.history.replaceState({}, "", `/?budgetRole=${value}`);
async function approved() {
  role("project_lead");
  const repo = createLocalProjectBudgetRepository();
  const created = await repo.mutate({
    action: "createProjectBudget",
    ...binding,
    requestId: crypto.randomUUID(),
  });
  let budget = await repo.detail(created.id);
  const workspace = await repo.load();
  await repo.mutate({
    action: "saveProjectBudgetEntry",
    requestId: crypto.randomUUID(),
    projectBudgetId: budget.id,
    expectedRevision: budget.revision,
    entry: {
      systemId: workspace.systems!.find(
        (s) => s.departmentName === "Mechanical & Production",
      )!.id,
      description: "Frame tubes",
      category: "material",
      plannedNok: "100.00",
      ordinaryPriority: "P2",
      reuseStatus: "new",
      status: "planned",
    },
  });
  for (const [profile, action] of [
    ["project_lead", "submitProjectBudget"],
    ["department_lead", "approveDepartmentBudget"],
    ["head_of_finance", "approveProjectBudget"],
  ] as const) {
    role(profile);
    budget = await repo.detail(budget.id);
    await repo.mutate({
      action,
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      requestId: crypto.randomUUID(),
    });
  }
  role("department_lead");
  return repo.detail(budget.id);
}
async function input(item: string | null): Promise<PurchaseInput> {
  const repo = createLocalProjectPurchaseRepository(),
    context = await repo.load(binding);
  return {
    buyerName: "Buyer",
    supplierName: "Supplier",
    paymentMethod: "team_account",
    purchaseDate: osloToday(),
    justification: "Materials for frame",
    documentKind: "receipt",
    uploadIds: [
      await repo.upload(
        binding,
        new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" }),
      ),
    ],
    lines: [
      {
        systemId: context.systems[0].id,
        budgetItemId: item,
        unbudgeted: !item,
        description: "Frame material",
        quantity: "3",
        amountNok: "60.00",
      },
    ],
  };
}
beforeEach(() => {
  localStorage.clear();
  gate.local = true;
  gate.signedIn = true;
  role("department_lead");
});
describe("dedicated local project purchase fixtures", () => {
  it("records incurred unbudgeted costs before a header exists and preserves request IDs", async () => {
    const repo = createLocalProjectPurchaseRepository();
    expect((await repo.load(binding)).entries).toEqual([]);
    const change = {
      action: "registerProjectPurchase" as const,
      ...binding,
      requestId: crypto.randomUUID(),
      purchase: await input(null),
    };
    const result = await repo.mutate(change);
    expect(await repo.mutate(change)).toEqual(result);
    expect((await createLocalProjectBudgetRepository().load()).budgets).toEqual(
      [],
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("retains partial orders and evidence by stable ID, completes explicitly and reopens on another purchase", async () => {
    let budget = await approved();
    const repo = createLocalProjectPurchaseRepository();
    const entryId = budget.approvedVersion!.entries[0].entryId;
    await repo.mutate({
      action: "registerProjectPurchase",
      ...binding,
      requestId: crypto.randomUUID(),
      purchase: await input(entryId),
    });
    budget = await createLocalProjectBudgetRepository().detail(budget.id);
    expect(budget.approvedVersion!.entries[0]).toMatchObject({
      actualNok: "60.00",
      completion: "partial",
      invoices: [{ originalName: "invoice.pdf" }],
    });
    await repo.complete({
      action: "setProjectBudgetCompletion",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      entryId,
      complete: true,
      reason: "All materials received",
    });
    await repo.mutate({
      action: "registerProjectPurchase",
      ...binding,
      requestId: crypto.randomUUID(),
      purchase: await input(entryId),
    });
    budget = await createLocalProjectBudgetRepository().detail(budget.id);
    expect(budget.approvedVersion!.entries[0]).toMatchObject({
      actualNok: "120.00",
      completion: "partial",
    });
    expect(budget.approvedVersion!.entries[0].invoices).toHaveLength(2);
  });
  it("projects invoice retry controls from the current local budget scope",async()=>{
    const budget=await approved(),repo=createLocalProjectPurchaseRepository();await repo.mutate({action:"registerProjectPurchase",...binding,requestId:crypto.randomUUID(),purchase:await input(budget.approvedVersion!.entries[0].entryId)});
    const budgets=createLocalProjectBudgetRepository();expect((await budgets.detail(budget.id)).approvedVersion!.entries[0].invoices?.[0].canRetry).toBe(true);
    role("project_lead");const read=await budgets.detail(budget.id);expect(read.approvedVersion!.entries[0].invoices?.[0]).toMatchObject({transferStatus:"needs_attention",canRetry:false,viewerUrl:null});
  });
  it("rejects unauthorized profiles, forged entries and files already consumed by another purchase", async () => {
    await approved();
    const repo = createLocalProjectPurchaseRepository(),
      purchase = await input(null);
    await repo.mutate({
      action: "registerProjectPurchase",
      ...binding,
      requestId: crypto.randomUUID(),
      purchase,
    });
    await expect(
      repo.mutate({
        action: "registerProjectPurchase",
        ...binding,
        requestId: crypto.randomUUID(),
        purchase,
      }),
    ).rejects.toMatchObject({ status: 400 });
    role("project_lead");
    await expect(repo.load(binding)).rejects.toMatchObject({ status: 403 });
    role("department_lead");
    const forged = await input(crypto.randomUUID());
    await expect(
      repo.mutate({
        action: "registerProjectPurchase",
        ...binding,
        requestId: crypto.randomUUID(),
        purchase: forged,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("never makes local test data available outside signed-in loopback development mode", async () => {
    const repo = createLocalProjectPurchaseRepository();
    gate.signedIn = false;
    await expect(repo.load(binding)).rejects.toMatchObject({ status: 401 });
    gate.signedIn = true;
    gate.local = false;
    expect(() => createLocalProjectPurchaseRepository()).toThrow();
  });
  it("normalizes pre-Drive private invoice facts without inventing confirmed Drive evidence",async()=>{
    const budget=await approved();const key="helix-project-budgets-local-v1",state=JSON.parse(localStorage.getItem(key)!);state.budgets[0].approvedVersion.entries[0].invoices=[{documentId:"old-private",purchaseId:"purchase",purchaseRef:"2026-0001",originalName:"Older invoice.pdf",backend:"private_storage",transferStatus:"pending",viewerUrl:null}];localStorage.setItem(key,JSON.stringify(state));
    const loaded=await createLocalProjectBudgetRepository().detail(budget.id);expect(loaded.approvedVersion!.entries[0].invoices?.[0]).toMatchObject({documentId:"old-private",backend:"private_storage",transferStatus:"stored",viewerUrl:null,canRetry:false});
    expect(JSON.parse(localStorage.getItem(key)!).budgets[0].approvedVersion.entries[0].invoices[0].transferStatus).toBe("pending");
  });

  it("recomputes recoverable invoice capability when the authorized fixture role changes",async()=>{
    const budget=await approved(),key="helix-project-budgets-local-v1",state=JSON.parse(localStorage.getItem(key)!);state.budgets[0].approvedVersion.entries[0].invoices=[{documentId:"attention",purchaseId:"purchase",purchaseRef:"2026-0001",originalName:"Invoice.pdf",backend:"google_drive",transferStatus:"needs_attention",transferRevision:4,canRetry:false,viewerUrl:null}];localStorage.setItem(key,JSON.stringify(state));
    role("project_lead");expect((await createLocalProjectBudgetRepository().detail(budget.id)).approvedVersion!.entries[0].invoices?.[0].canRetry).toBe(false);
    role("finance");expect((await createLocalProjectBudgetRepository().detail(budget.id)).approvedVersion!.entries[0].invoices?.[0].canRetry).toBe(true);
  });

});
