// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFinanceApi } from "./repository";
import { createLocalProjectPurchaseRepository } from "./project-purchase-local";
import { loadLocalSeasonFinancialSummary } from "../ProjectManagement/season-financials-local";
import {
  fundingFixture,
  fundingRole,
} from "./funding-application.test-support";
import { osloToday } from "./money";
import type { PurchaseInput } from "./types";
const gates = vi.hoisted(() => ({
  local: true,
  signedIn: true,
  finance: true,
  season: true,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
  localMemberAccount: { email: "alex@example.invalid" },
}));
vi.mock("../MemberPlatform/member-access-api", () => ({
  localMemberHasFinancials: () => gates.finance,
  localMemberHasSeasonOverview: () => gates.season,
  localMemberHasPartnerSpace: () => true,
}));
const binding = {
  projectId: "00000000-0000-4000-8000-000000000100",
  responsibleDepartmentId: "00000000-0000-4000-8000-000000000300",
};
async function registration(
  itemId: string | null,
  amountNok = "60.00",
  paymentMethod: PurchaseInput["paymentMethod"] = "team_account",
) {
  const repo = createLocalProjectPurchaseRepository(),
    context = await repo.load(binding),
    uploadId = await repo.upload(
      binding,
      new File(["%PDF-1.4"], "Invoice.pdf", { type: "application/pdf" }),
    );
  return repo.mutate({
    action: "registerProjectPurchase",
    ...binding,
    requestId: crypto.randomUUID(),
    purchase: {
      buyerName: "Buyer",
      supplierName: "Supplier",
      paymentMethod,
      refundPhone: paymentMethod === "outlay" ? "12345678" : null,
      purchaseDate: osloToday(),
      invoiceDueDate: paymentMethod === "invoice" ? osloToday() : null,
      justification: "Materials for the project",
      documentKind: paymentMethod === "invoice" ? "invoice" : "receipt",
      uploadIds: [uploadId],
      lines: [
        {
          systemId: context.systems[0].id,
          budgetItemId: itemId,
          unbudgeted: !itemId,
          description: "Frame materials",
          quantity: "3",
          amountNok,
        },
      ],
    },
  });
}
beforeEach(() => {
  localStorage.clear();
  Object.assign(gates, {
    local: true,
    signedIn: true,
    finance: true,
    season: true,
  });
  window.history.replaceState(
    {},
    "",
    "/?budgetRole=head_of_finance&financeRole=head_of_finance",
  );
});
const api = () => createFinanceApi({ current: null });
async function consistentVersion() {
  const client = api(),
    version = (await client.version()).viewVersion;
  expect((await client.capabilities()).viewVersion).toBe(version);
  expect((await client.overview()).viewVersion).toBe(version);
  expect((await client.budgets()).viewVersion).toBe(version);
  expect((await client.purchases()).viewVersion).toBe(version);
  expect((await client.financing()).viewVersion).toBe(version);
  expect(loadLocalSeasonFinancialSummary().viewVersion).toBe(version);
  return version;
}
describe("canonical local Finance repository", () => {
  it("refreshes all consumers on approval, award, release, purchase, completion and evidence retry without moving bank cash", async () => {
    const client = api();
    await client.mutate({
      action: "setBankSnapshot",
      requestId: crypto.randomUUID(),
      expectedRevision: 0,
      amountNok: "987.65",
      asOfDate: osloToday(),
    });
    const bank = await client.bankSnapshot();
    const before = await consistentVersion();
    const { repository, budgets, app, budget } = await fundingFixture();
    fundingRole("head_of_finance");
    const afterApproval = await consistentVersion();
    expect(afterApproval).toBeGreaterThan(before);
    let result = await repository.mutate({
      action: "linkFundingApplicationEntry",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: app.revision,
      entryId: budget.approvedVersion!.entries[0].entryId,
      expectedBudgetRevision: budget.revision,
    });
    result = await repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      awardDate: osloToday(),
      awardReference: "AWARD",
    });
    const afterAward = await consistentVersion();
    expect(afterAward).toBeGreaterThan(afterApproval);
    expect(
      (await client.budgets()).departments.flatMap((d) =>
        d.systems.flatMap((s) => s.items),
      )[0].priority,
    ).toBe("P0");
    const awarded = await repository.detail(app.id);
    await repository.mutate({
      action: "releaseFundingObligation",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      obligationId: awarded.links[0].id,
      reason: "Funding conditions changed",
    });
    expect(await consistentVersion()).toBeGreaterThan(afterAward);
    const registered = await registration(
      budget.approvedVersion!.entries[0].entryId,
    );
    const afterPurchase = await consistentVersion();
    expect(
      (await client.budgets()).departments.flatMap((d) =>
        d.systems.flatMap((s) => s.items),
      )[0],
    ).toMatchObject({ actualNok: "60.00", completion: "partial" });
    const current = await budgets.detail(budget.id);
    await createLocalProjectPurchaseRepository().complete({
      action: "setProjectBudgetCompletion",
      requestId: crypto.randomUUID(),
      projectBudgetId: current.id,
      expectedRevision: current.revision,
      entryId: current.approvedVersion!.entries[0].entryId,
      complete: true,
      reason: "All materials received",
    });
    expect(await consistentVersion()).toBeGreaterThan(afterPurchase);
    const recovery = await client.recovery(),
      evidence = recovery.invoiceTransfers![0];
    const beforeRetry = await consistentVersion();
    await client.mutate({
      action: "retryInvoiceTransfer",
      requestId: crypto.randomUUID(),
      documentId: evidence.documentId,
      expectedRevision: evidence.transferRevision,
    });
    expect(await consistentVersion()).toBeGreaterThan(beforeRetry);
    expect((await client.purchases()).register?.[0]).toMatchObject({
      id: registered.id,
      totalNok: "60.00",
    });
    expect(await client.bankSnapshot()).toEqual(bank);
  });
  it("exposes actual-only registration before any header and strips private purchase/funding details from Season Overview", async () => {
    fundingRole("head_of_finance");
    await registration(null, "85.25");
    const view = await api().overview();
    expect(view).toMatchObject({
      budgetStatus: "draft",
      approvedOn: null,
      approvedPresence: { projectBudgets: false, legacyBudget: false },
      hasRecordedActuals: true,
    });
    expect((await api().budgets()).choices.items).toEqual([]);
    gates.finance = false;
    const summary = loadLocalSeasonFinancialSummary();
    expect(summary).toMatchObject({
      budgetStatus: "draft",
      actualNok: "85.25",
      plannedNok: "0.00",
      canOpenFinancials: false,
    });
    const text = JSON.stringify(summary);
    for (const secret of [
      "Invoice.pdf",
      "Buyer",
      "Supplier",
      "documentId",
      "uploadIds",
      "refundAccount",
      "earmarkSources",
      "applicationId",
    ])
      expect(text).not.toContain(secret);
    await expect(api().overview()).rejects.toMatchObject({ status: 403 });
    gates.season = false;
    expect(() => loadLocalSeasonFinancialSummary()).toThrow();
  });
  it("settles, reverses and voids once, keeping evidence/payment history independent of explicit completion", async () => {
    const { budgets, budget } = await fundingFixture();
    fundingRole("head_of_finance");
    const entryId = budget.approvedVersion!.entries[0].entryId,
      registered = await registration(entryId, "60.00", "invoice"),
      client = api();
    let row = (await client.purchases()).register![0];
    expect(row.unpaid).toBe(true);
    const paid = {
      action: "markInvoicePaid",
      requestId: crypto.randomUUID(),
      purchaseId: row.id,
      expectedRevision: row.revision,
      paidOn: osloToday(),
    };
    const paidResult = await client.mutate(paid);
    expect(await client.mutate(paid)).toEqual(paidResult);
    expect((await client.purchases(undefined, true)).register).toEqual([]);
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].actualNok,
    ).toBe("60.00");
    row = (await client.purchases()).register![0];
    await client.mutate({
      action: "unmarkInvoicePaid",
      requestId: crypto.randomUUID(),
      purchaseId: row.id,
      expectedRevision: row.revision,
    });
    expect((await client.purchases()).unpaidCount).toBe(1);
    let current = await budgets.detail(budget.id);
    await createLocalProjectPurchaseRepository().complete({
      action: "setProjectBudgetCompletion",
      requestId: crypto.randomUUID(),
      projectBudgetId: current.id,
      expectedRevision: current.revision,
      entryId,
      complete: true,
      reason: "Complete",
    });
    row = (await client.purchases()).register![0];
    const before = await consistentVersion(),
      voidAction = {
        action: "voidPurchase",
        requestId: crypto.randomUUID(),
        purchaseId: registered.id,
        expectedRevision: row.revision,
        reason: "Duplicate registration",
      };
    const result = await client.mutate(voidAction);
    expect(await client.mutate(voidAction)).toEqual(result);
    expect(await consistentVersion()).toBe(before + 1);
    current = await budgets.detail(budget.id);
    expect(current.approvedVersion!.entries[0]).toMatchObject({
      actualNok: "0.00",
      completion: "not_purchased",
    });
    row = (await client.purchases()).register![0];
    expect(row).toMatchObject({
      status: "voided",
      unpaid: false,
      invoice: { paid: false },
      documents: [{ originalName: "Invoice.pdf" }],
    });
    expect((await client.purchases(undefined, true)).register).toEqual([]);
  });
  it("reviews original discrepancy facts independently of refunds, with recoverable validation and stale-revision errors", async () => {
    fundingRole("head_of_finance");
    await registration(null, "25.00", "outlay");
    const client = api();
    let row = (await client.purchases()).register![0];
    const before = await consistentVersion();
    const invalid = {
      action: "markRefundPaid",
      requestId: crypto.randomUUID(),
      purchaseId: row.id,
      expectedRevision: row.revision,
      paidOn: "invalid",
    };
    await expect(client.mutate(invalid)).rejects.toMatchObject({ status: 400 });
    expect(await consistentVersion()).toBe(before);
    const mark = {
      ...invalid,
      requestId: crypto.randomUUID(),
      paidOn: osloToday(),
    };
    await client.mutate(mark);
    await expect(
      client.mutate({ ...mark, requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    row = (await client.purchases()).register![0];
    expect(row.reimbursement?.paid).toBe(true);
    expect(row.exceptions[0].reviewStatus).toBe("open");
    const review = {
      action: "reviewException",
      requestId: crypto.randomUUID(),
      reviewId: row.exceptions[0].id,
      reason: "Incurred emergency repair recorded",
    };
    const reviewed = await client.mutate(review);
    expect(await client.mutate(review)).toEqual(reviewed);
    const next = (await client.purchases()).register![0];
    expect(next.exceptions[0]).toMatchObject({
      reviewStatus: "reviewed",
      reason: review.reason,
      facts: row.exceptions[0].facts,
    });
    expect(next.revision).toBe(row.revision);
    expect(next.totalNok).toBe("25.00");
    await client.mutate({
      action: "unmarkRefundPaid",
      requestId: crypto.randomUUID(),
      purchaseId: next.id,
      expectedRevision: next.revision,
    });
    expect((await client.purchases()).register![0].unpaid).toBe(true);
    gates.finance = false;
    await expect(client.mutate(review)).rejects.toMatchObject({ status: 403 });
  });

  it("retains an editor's original revision when global evidence freshness advances", async () => {
    const { budgets, budget } = await fundingFixture();
    fundingRole("head_of_finance");
    await registration(budget.approvedVersion!.entries[0].entryId);
    let current = await budgets.detail(budget.id);
    await budgets.mutate({
      action: "requestProjectBudgetChanges",
      requestId: crypto.randomUUID(),
      projectBudgetId: current.id,
      expectedRevision: current.revision,
      reason: "New quote",
    });
    fundingRole("project_lead");
    const editor = await budgets.detail(budget.id),
      original = editor.revision;
    fundingRole("head_of_finance");
    const doc = (await api().recovery()).invoiceTransfers![0];
    await api().mutate({
      action: "retryInvoiceTransfer",
      requestId: crypto.randomUUID(),
      documentId: doc.documentId,
      expectedRevision: doc.transferRevision,
    });
    expect((await budgets.detail(budget.id)).revision).toBe(original);
    fundingRole("project_lead");
    const entry = editor.pendingVersion!.entries[0];
    await budgets.mutate({
      action: "saveProjectBudgetEntry",
      requestId: crypto.randomUUID(),
      projectBudgetId: editor.id,
      expectedRevision: original,
      entry: { ...entry, plannedNok: "1100.00" },
    });
    await expect(
      budgets.mutate({
        action: "saveProjectBudgetEntry",
        requestId: crypto.randomUUID(),
        projectBudgetId: editor.id,
        expectedRevision: original,
        entry: { ...entry, plannedNok: "1200.00" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refuses reads, processing and local data access after either dedicated-mode gate is lost", async () => {
    const client = api();
    gates.finance = false;
    await expect(
      client.mutate({
        action: "voidPurchase",
        requestId: crypto.randomUUID(),
        purchaseId: "any",
        expectedRevision: 0,
        reason: "x",
      }),
    ).rejects.toMatchObject({ status: 403 });
    gates.finance = true;
    gates.signedIn = false;
    expect(() => loadLocalSeasonFinancialSummary()).toThrow();
    gates.signedIn = true;
    gates.local = false;
    expect(() => loadLocalSeasonFinancialSummary()).toThrow();
  });
});
