import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import type { FinanceMutationResult } from "./finance-types.js";
import { FinanceError } from "./finance-error.js";
import { hashFinancePayload, mapPurchaseError } from "./finance-purchases.js";
import { normalizeInvoiceDriveUrl } from "../../src/features/Finance/invoice-link.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function linkPurchaseInvoice(db: CvDatabase, identity: WorkspaceIdentity, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  if (typeof body.purchaseId !== "string" || !uuid.test(body.purchaseId) || typeof body.requestId !== "string" || !uuid.test(body.requestId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision)<0 || typeof body.viewerUrl !== "string") throw new FinanceError(400,"Choose a valid purchase and invoice link.");
  let viewerUrl: string;
  try { viewerUrl=normalizeInvoiceDriveUrl(body.viewerUrl); } catch(error) { throw new FinanceError(400,(error as Error).message); }
  const payload = { action: "linkPurchaseInvoice", purchaseId: body.purchaseId, expectedRevision: body.expectedRevision, viewerUrl };
  try {
    const result=await db.query<{value:FinanceMutationResult}>("select finance.link_purchase_invoice($1::uuid,$2,$3,$4::uuid,$5::integer,$6::uuid,$7,$8) as value",[identity.userId,identity.googleSub,identity.email,body.purchaseId,body.expectedRevision,body.requestId,hashFinancePayload(payload),viewerUrl]);
    if (!result.rows[0]?.value) throw new Error("Missing invoice-link result");
    return result.rows[0].value;
  } catch(error) { throw mapPurchaseError(error); }
}
