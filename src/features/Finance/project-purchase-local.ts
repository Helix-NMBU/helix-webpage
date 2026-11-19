import type { LocalInvoiceFact } from "./invoice-local";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import type { ProjectPurchaseRepository } from "./project-purchase-repository";
import type {
  ProjectPurchaseBinding,
  ProjectPurchaseContext,
  ProjectPurchaseResult,
} from "./project-purchase-types";
import type {
  ProjectBudgetDetail,
  ProjectBudgetMutationResult,
} from "./project-budget-types";
import { formatOre, parseNokToOre, osloToday } from "./money";
import {
  allowedUpload,
  MAX_PURCHASE_FILE_BYTES,
  normalizePurchaseInput,
  validatePurchaseRelationships,
} from "./purchase-domain";
const KEY = "helix-project-budgets-local-v1";
const PURCHASE_KEY = "helix-project-purchases-local-v1";
type State = {
  version: number;
  budgets: ProjectBudgetDetail[];
  requests: Record<string, unknown>;
};
type LocalPurchases = {
  evidence?: Record<string, LocalInvoiceFact>;
  uploads: Record<
    string,
    { projectId: string; name: string; purchaseId?: string }
  >;
  requests: Record<
    string,
    {
      fingerprint: string;
      result: ProjectPurchaseResult | ProjectBudgetMutationResult;
    }
  >;
  audit: Array<{ action: string; entryId?: string; reason?: string }>;
};
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function guard() {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    fail("Sign in to continue.", 401);
}
function read(): LocalPurchases {
  guard();
  const saved = localStorage.getItem(PURCHASE_KEY);
  return saved
    ? (JSON.parse(saved) as LocalPurchases)
    : { uploads: {}, requests: {}, audit: [] };
}
function state(): State {
  guard();
  return JSON.parse(
    localStorage.getItem(KEY) ?? '{"version":0,"budgets":[],"requests":{}}',
  ) as State;
}
function save(value: State, purchases: LocalPurchases) {
  guard();
  localStorage.setItem(KEY, JSON.stringify(value));
  localStorage.setItem(PURCHASE_KEY, JSON.stringify(purchases));
}
export function createLocalProjectPurchaseRepository(): ProjectPurchaseRepository {
  guard();
  const budgets = createLocalProjectBudgetRepository();
  async function load(
    binding: ProjectPurchaseBinding,
  ): Promise<ProjectPurchaseContext> {
    guard();
    const workspace = await budgets.load({ projectId: binding.projectId });
    const scope = workspace.scopes.find(
      (s) =>
        s.projectId === binding.projectId &&
        s.responsibleDepartmentId === binding.responsibleDepartmentId,
    );
    if (!scope?.capabilities.canRegisterPurchase)
      fail(
        "Only the responsible department lead or Finance can register project purchases.",
        403,
      );
    const header = workspace.budgets.find(
      (b) => b.projectId === binding.projectId,
    );
    const detail = header ? await budgets.detail(header.id) : null;
    return {
      scope,
      viewVersion: workspace.viewVersion,
      systems: (workspace.systems ?? []).filter((s) =>
        scope.departments.some((d) => d.name === s.departmentName),
      ),
      entries: (detail?.approvedVersion?.entries ?? [])
        .filter((e) => !e.removed && e.status !== "cancelled" && e.budgetItemId)
        .map((e) => ({
          entryId: e.entryId,
          budgetItemId: e.budgetItemId!,
          approvedVersionId: detail!.approvedVersionId!,
          systemId: e.systemId,
          description: e.description,
          publicRef: e.publicRef ?? "",
          plannedNok: e.plannedNok,
          actualNok: e.actualNok,
        })),
    };
  }
  return {
    load,
    async upload(binding, file) {
      await load(binding);
      if (
        !allowedUpload(file.name, file.type) ||
        file.size <= 0 ||
        file.size > MAX_PURCHASE_FILE_BYTES
      )
        fail("Choose a supported file of up to 10 MB.");
      const purchases = read(),
        id = crypto.randomUUID();
      purchases.uploads[id] = { projectId: binding.projectId, name: file.name };
      save(state(), purchases);
      return id;
    },
    async mutate(change) {
      const context = await load(change),
        purchases = read();
      if (
        change.action !== "checkProjectPurchase" &&
        change.action !== "registerProjectPurchase"
      )
        fail("Use the file upload control.");
      const fingerprint = JSON.stringify(change),
        actor = context.scope.memberId;
      const key =
        change.action === "registerProjectPurchase"
          ? `${actor}:${change.requestId}`
          : "";
      const previous = purchases.requests[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail("This request ID was already used for a different change.", 409);
        return previous.result;
      }
      const normalized = normalizePurchaseInput(change.purchase);
      if (!normalized.purchase || normalized.errors.length)
        fail(normalized.errors[0]?.message ?? "Check the purchase.");
      const purchase = normalized.purchase;
      const checked = await validatePurchaseRelationships(purchase, {
        today: osloToday(),
        choices: {
          systems: context.systems.map((s) => ({
            id: s.id,
            active: true,
            unbudgetedItemId: null,
          })),
          items: context.entries.map((e) => ({
            id: e.budgetItemId,
            systemId: e.systemId,
            status: "active",
          })),
        },
        itemActualOre: async (id) =>
          parseNokToOre(
            context.entries.find((e) => e.budgetItemId === id)?.actualNok ??
              "0",
          ) ?? 0n,
        itemPlannedOre: async (id) =>
          parseNokToOre(
            context.entries.find((e) => e.budgetItemId === id)?.plannedNok ??
              "0",
          ) ?? 0n,
      });
      if (checked.errors.length) fail(checked.errors[0].message);
      if (
        purchase.uploadIds.some(
          (id) =>
            purchases.uploads[id]?.projectId !== change.projectId ||
            !!purchases.uploads[id]?.purchaseId,
        )
      )
        fail("Upload the supporting files for this project.");
      if (change.action === "checkProjectPurchase")
        return {
          ok: true,
          viewVersion: context.viewVersion,
          warnings: checked.warnings,
          errors: [],
        };
      const value = state(),
        id = crypto.randomUUID(),
        publicRef = `2026-${String(Object.keys(purchases.requests).length + 1).padStart(4, "0")}`;
      const budget = value.budgets.find(
        (b) => b.projectId === change.projectId,
      );
      if (budget?.approvedVersion) {
        for (const entry of budget.approvedVersion.entries) {
          const lines = purchase.lines.filter(
            (l) => l.budgetItemId === entry.budgetItemId,
          );
          if (!lines.length) continue;
          entry.actualNok = formatOre(
            (parseNokToOre(entry.actualNok) ?? 0n) +
              lines.reduce((sum, line) => sum + line.amountOre, 0n),
          );
          entry.completion = "partial";
          entry.invoices = [
            ...(entry.invoices ?? []),
            ...purchase.uploadIds.map((documentId) => ({
              documentId,
              purchaseId: id,
              purchaseRef: publicRef,
              originalName: purchases.uploads[documentId].name,
              backend: "google_drive" as const,
              transferStatus: "needs_attention" as const,
              transferRevision: 0,
              canRetry: true,
              viewerUrl: null,
            })),
          ];
          purchases.audit.push({
            action: "purchase_registered",
            entryId: entry.entryId,
            reason: "Further purchase registered",
          });
        }
        budget.revision++;
      }
      value.version++;
      const result: ProjectPurchaseResult = {
        ok: true,
        id,
        publicRef,
        viewVersion: value.version,
        warnings: checked.warnings,
        errors: [],
      };
      purchases.evidence ??= {};
      result.invoiceEvidence = {pending:0,transferring:0,stored:0,needsAttention:purchase.uploadIds.length};
      purchase.uploadIds.forEach((uploadId) => {
        purchases.evidence![uploadId] = {documentId:uploadId,purchaseId:id,purchaseRef:publicRef,originalName:purchases.uploads[uploadId].name,projectId:change.projectId,backend:"google_drive",transferStatus:"needs_attention",transferRevision:0,canRetry:true,viewerUrl:null,attempts:0,updatedAt:new Date().toISOString(),safeError:"configuration_missing"};
        purchases.uploads[uploadId].purchaseId = id;
      });
      purchases.requests[key] = { fingerprint, result };
      save(value, purchases);
      return result;
    },
    async complete(change) {
      const current = await budgets.detail(change.projectBudgetId);
      const context = await load({
        projectId: current.projectId,
        responsibleDepartmentId: current.responsibleDepartmentId,
      });
      const value = state(),
        purchases = read(),
        key = `${context.scope.memberId}:${change.requestId}`,
        fingerprint = JSON.stringify(change);
      if (purchases.requests[key]) {
        if (purchases.requests[key].fingerprint !== fingerprint)
          fail("This request ID was already used for a different change.", 409);
        return purchases.requests[key].result as ProjectBudgetMutationResult;
      }
      if (current.revision !== change.expectedRevision)
        fail("The project budget changed. Reload it before saving again.", 409);
      if (!change.reason?.trim() || change.reason.length > 500)
        fail("Enter a reason of up to 500 characters.");
      const budget = value.budgets.find(
          (b) => b.id === change.projectBudgetId,
        )!,
        entry = budget.approvedVersion?.entries.find(
          (e) =>
            e.entryId === change.entryId &&
            !e.removed &&
            e.status !== "cancelled",
        );
      if (!entry || (change.complete && entry.completion === "not_purchased"))
        fail("Register a purchase against an approved entry first.");
      entry.completion = change.complete ? "complete" : "partial";
      budget.revision++;
      value.version++;
      purchases.audit.push({
        action: change.complete ? "completed" : "completion_reopened",
        entryId: change.entryId,
        reason: change.reason,
      });
      const result: ProjectBudgetMutationResult = {
        ok: true,
        id: budget.id,
        revision: budget.revision,
        viewVersion: value.version,
        warnings: [],
        errors: [],
      };
      purchases.requests[key] = { fingerprint, result };
      save(value, purchases);
      return result;
    },
  };
}
