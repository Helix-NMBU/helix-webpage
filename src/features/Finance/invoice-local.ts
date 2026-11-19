import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import type { ProjectBudgetDetail } from "./project-budget-types";

/** Local evidence has no provider credentials and never reports a Drive transfer as confirmed. */
export function createLocalInvoiceEvidenceApi(): InvoiceEvidenceActions {
  function guard() {
    if (!isLocalMemberMode() || !localMemberSignedIn())
      throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  }
  function evidence(documentId: string) {
    guard();
    const saved = JSON.parse(
      localStorage.getItem("helix-project-budgets-local-v1") ??
        '{"budgets":[]}',
    ) as { budgets: ProjectBudgetDetail[] };
    const row = saved.budgets
      .flatMap((b) =>
        [
          b.approvedVersion,
          b.pendingVersion,
          ...(b.historyVersions ?? []),
        ].flatMap((v) => v?.entries.flatMap((e) => e.invoices ?? []) ?? []),
      )
      .find((d) => d.documentId === documentId);
    if (!row)
      throw Object.assign(new Error("Invoice access is no longer available."), {
        status: 403,
      });
    return row;
  }
  guard();
  return {
    async open(documentId) {
      evidence(documentId);
      throw new Error(
        "This invoice has no downloadable file. Upload an invoice when registering a purchase.",
      );
    },
    async retry(documentId) {
      evidence(documentId);
      throw new Error(
        "Invoice transfer needs Finance attention. Shared Drive storage is not configured.",
      );
    },
  };
}
