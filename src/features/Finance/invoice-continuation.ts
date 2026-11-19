import type { FinanceMutationResult } from "./types";

/** Signed-in callers resume bounded batches; departure leaves durable pending evidence for recovery. */
export async function continueRegisteredInvoices<
  T extends FinanceMutationResult,
>(
  result: T,
  request: (change: Record<string, unknown>) => Promise<FinanceMutationResult>,
): Promise<T> {
  if (!result.id || !result.invoiceEvidence) return result;
  let latest: FinanceMutationResult = result;
  for (
    let attempt = 0;
    attempt < 5 &&
    latest.invoiceEvidence &&
    (latest.invoiceEvidence.pending > 0 ||
      latest.invoiceEvidence.transferring > 0);
    attempt++
  ) {
    try {
      latest = await request({
        action: "continueInvoiceTransfers",
        purchaseId: result.id,
        requestId: crypto.randomUUID(),
      });
    } catch {
      return {
        ...result,
        invoiceEvidence: latest.invoiceEvidence,
        warnings: [
          ...result.warnings,
          {
            message:
              "The purchase is saved. Check invoice transfer status in Finance Recovery.",
          },
        ],
      };
    }
  }
  return { ...result, invoiceEvidence: latest.invoiceEvidence };
}
