import type { ProjectBudgetScope } from "./project-budget-types.js";
import type { FinanceMutationResult, PurchaseInput } from "./types.js";

export type ProjectPurchaseContext = {
  scope: ProjectBudgetScope;
  viewVersion: number;
  systems: Array<{ id: string; name: string; code: string }>;
  entries: Array<{
    entryId: string;
    budgetItemId: string;
    approvedVersionId: string | null;
    systemId: string;
    description: string;
    publicRef: string;
    plannedNok: string;
    actualNok: string;
  }>;
};
export type ProjectPurchaseBinding = {
  projectId: string;
  responsibleDepartmentId: string;
};
export type ProjectPurchaseChange = ProjectPurchaseBinding &
  (
    | { action: "checkProjectPurchase"; purchase: PurchaseInput }
    | {
        action: "registerProjectPurchase";
        requestId: string;
        purchase: PurchaseInput;
      }
    | {
        action: "authorizeProjectPurchaseUpload";
        fileName: string;
        contentType: string;
        byteSize: number;
      }
    | { action: "finalizeProjectPurchaseUpload"; uploadId: string }
  );
export type ProjectPurchaseResult = FinanceMutationResult & {
  uploadUrl?: string;
  expiresAt?: string;
};
