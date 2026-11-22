import type { ProjectBudgetInvoiceReference } from "./project-budget-types.js";

/** Safe app metadata only. Storage keys, provider IDs, sessions and credentials stay server-side. */
export interface FinanceInvoiceRecoveryRow extends ProjectBudgetInvoiceReference {
  transferRevision: number;
  attempts: number;
  updatedAt: string;
  safeError: string | null;
}
export interface InvoiceEvidenceSummary {
  pending: number;
  transferring: number;
  stored: number;
  needsAttention: number;
}
