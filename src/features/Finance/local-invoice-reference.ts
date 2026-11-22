import type { ProjectBudgetInvoiceReference } from "./project-budget-types";

/** Older synthetic references predate Drive jobs. Preserve their private provider and document identity. */
export function localInvoiceReference(
  reference: ProjectBudgetInvoiceReference,
  canRetry: boolean,
): ProjectBudgetInvoiceReference {
  if (reference.backend !== "google_drive")
    return {
      ...reference,
      backend: "private_storage",
      transferStatus: "stored",
      transferRevision: null,
      viewerUrl: null,
      canRetry: false,
    };
  return {
    ...reference,
    transferStatus: reference.transferStatus ?? "needs_attention",
    viewerUrl:
      reference.transferStatus === "stored" ? reference.viewerUrl : null,
    canRetry:
      canRetry &&
      (reference.transferStatus === "pending" ||
        reference.transferStatus === "needs_attention" ||
        !reference.transferStatus ||
        (reference.transferStatus === "transferring" &&
          reference.canRetry === true)),
  };
}
