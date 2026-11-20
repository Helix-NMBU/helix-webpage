import { localInvoiceReference } from "./local-invoice-reference";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { localMemberHasFinancials } from "../MemberPlatform/member-access-api";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import type { ProjectBudgetDetail } from "./project-budget-types";
import type { FinanceInvoiceRecoveryRow } from "./invoice-types";
import type { FinanceMutationResult } from "./types";
const PURCHASES = "helix-project-purchases-local-v1",
  BUDGETS = "helix-project-budgets-local-v1";
export type LocalInvoiceFact = FinanceInvoiceRecoveryRow & {
  projectId: string;
};
type LocalState = {
  evidence?: Record<string, LocalInvoiceFact>;
  invoiceRetries?: Record<
    string,
    {
      documentId: string;
      expectedRevision: number;
      result: FinanceMutationResult;
    }
  >;
  uploads?: Record<
    string,
    { projectId: string; name: string; purchaseId?: string }
  >;
  requests?: Record<string, { result: { id?: string; publicRef?: string } }>;
};
function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}
function guard() {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    fail("Sign in to continue.", 401);
}
function read() {
  guard();
  return JSON.parse(localStorage.getItem(PURCHASES) ?? "{}") as LocalState;
}
function budgets() {
  guard();
  return JSON.parse(
    localStorage.getItem(BUDGETS) ?? '{"version":0,"budgets":[]}',
  ) as { version: number; budgets: ProjectBudgetDetail[] };
}
function facts(state: LocalState) {
  const result = { ...state.evidence };
  for (const budget of budgets().budgets)
    for (const version of [
      budget.approvedVersion,
      budget.pendingVersion,
      ...(budget.historyVersions ?? []),
    ])
      for (const entry of version?.entries ?? [])
        for (const row of entry.invoices ?? []) {
          if (row.backend !== "google_drive" || result[row.documentId])
            continue;
          result[row.documentId] = {
            ...row,
            projectId: budget.projectId,
            transferRevision: row.transferRevision ?? 0,
            attempts: 0,
            updatedAt: "2026-10-01T12:00:00.000Z",
            safeError: "configuration_missing",
            transferStatus: "needs_attention",
            viewerUrl: null,
          };
        }
  return result;
}
async function allowed(row: {projectId:string}, write: boolean) {
  guard();
  if (localMemberHasFinancials()) return;
  const workspace = await createLocalProjectBudgetRepository().load({
    projectId: row.projectId,
  });
  const scope = workspace.scopes.find((s) => s.projectId === row.projectId);
  if (
    !scope ||
    !(write
      ? scope.capabilities.canRegisterPurchase
      : scope.capabilities.canRead)
  )
    fail("Invoice access is no longer available.", 403);
}
/** Honest synthetic attention state, restricted to the signed-in loopback Finance fixture. */
export function localInvoiceRecovery(after?: string) {
  guard();
  if (!localMemberHasFinancials()) fail("Finance access is required.", 403);
  const rows = Object.values(facts(read()))
    .filter(
      (row) =>
        row.transferStatus !== "stored" && (!after || row.documentId > after),
    )
    .sort((a, b) => a.documentId.localeCompare(b.documentId));
  return {
    invoiceTransfers: rows
      .slice(0, 50)
      .map(({ projectId: _projectId, ...row }) => ({ ...row, canRetry: true })),
    invoiceNextCursor: rows.length > 50 ? rows[49].documentId : null,
  };
}
/** This fixture never simulates confirmed Drive storage or invents a viewer URL. */
export function createLocalInvoiceEvidenceApi(): InvoiceEvidenceActions {
  guard();
  return {
    async open(documentId) {
      const row = facts(read())[documentId];
      if (!row) {
        for(const budget of budgets().budgets)for(const version of [budget.approvedVersion,budget.pendingVersion,...(budget.historyVersions??[])])for(const entry of version?.entries??[]) {
          const retained=entry.invoices?.find(reference=>reference.documentId===documentId&&localInvoiceReference(reference,false).backend==="private_storage");
          if(retained){await allowed({projectId:budget.projectId},false);fail("This historical file is unavailable. Ask Finance for the retained invoice.",503);}
        }
        fail("Invoice access is no longer available.",403);
      }
      await allowed(row, false);
      fail(
        "The purchase is saved. Its invoice is not yet confirmed in Drive. Ask Finance to check the transfer.",
        409,
      );
    },
    async retry(documentId, expectedRevision, requestId) {
      const state = read(),
        all = facts(state),
        row = all[documentId];
      if (!row) fail("Invoice access is no longer available.", 403);
      await allowed(row, true);
      state.invoiceRetries ??= {};
      const prior = state.invoiceRetries[requestId];
      if (prior) {
        if (
          prior.documentId !== documentId ||
          prior.expectedRevision !== expectedRevision
        )
          fail("This request ID was already used for a different change.", 409);
        return prior.result;
      }
      if (row.transferRevision !== expectedRevision)
        fail(
          "Invoice transfer changed. Refresh its status and try again.",
          409,
        );
      row.transferRevision += 2;
      row.attempts++;
      row.updatedAt = new Date().toISOString();
      row.safeError = "configuration_missing";
      row.transferStatus = "needs_attention";
      row.viewerUrl = null;
      row.canRetry = true;
      state.evidence = all;
      const value = budgets();
      value.version++;
      for (const budget of value.budgets)
        for (const version of [
          budget.approvedVersion,
          budget.pendingVersion,
          ...(budget.historyVersions ?? []),
        ])
          for (const entry of version?.entries ?? [])
            for (const ref of entry.invoices ?? [])
              if (ref.documentId === documentId) {
                ref.transferRevision = row.transferRevision;
                ref.transferStatus = "needs_attention";
                ref.viewerUrl = null;
                ref.canRetry = true;
              }
      const count = Object.values(all).filter(
        (f) => f.purchaseId === row.purchaseId,
      ).length;
      const result: FinanceMutationResult = {
        ok: true,
        id: documentId,
        purchaseId: row.purchaseId,
        viewVersion: value.version,
        warnings: [],
        errors: [],
        invoiceEvidence: {
          pending: 0,
          transferring: 0,
          stored: 0,
          needsAttention: count,
        },
      };
      state.invoiceRetries[requestId] = {
        documentId,
        expectedRevision,
        result,
      };
      guard();
      localStorage.setItem(PURCHASES, JSON.stringify(state));
      localStorage.setItem(BUDGETS, JSON.stringify(value));
      return result;
    },
  };
}
