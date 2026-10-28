import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { osloToday } from "./finance-money.js";
import { hashFinancePayload, mapPurchaseError } from "./finance-purchases.js";
import type { FinanceMutationResult } from "./finance-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CONFLICT = "This request ID was already used for a different change.";
const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";

const PROCESSING_ACTIONS = new Set([
  "voidPurchase",
  "markRefundPaid",
  "unmarkRefundPaid",
  "markInvoicePaid",
  "unmarkInvoicePaid",
  "reviewException",
]);

export function isProcessingMutation(action: string): boolean {
  return PROCESSING_ACTIONS.has(action);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizedId(value: unknown): string {
  return text(value).trim().toLowerCase();
}

function settlementSubject(action: string, body: Record<string, unknown>): Record<string, string> {
  if (action === "voidPurchase") {
    return { action, purchaseId: normalizedId(body.purchaseId), reason: text(body.reason).trim() };
  }
  if (action === "markInvoicePaid" || action === "markRefundPaid") {
    return { action, purchaseId: normalizedId(body.purchaseId), paidOn: text(body.paidOn).trim() };
  }
  if (action === "unmarkInvoicePaid" || action === "unmarkRefundPaid") {
    return { action, purchaseId: normalizedId(body.purchaseId) };
  }
  return { action, reviewId: normalizedId(body.reviewId), reason: text(body.reason).trim() };
}

function parseResult(value: unknown): FinanceMutationResult {
  const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value as FinanceMutationResult;
  const viewVersion = Number(parsed?.viewVersion);
  if (!parsed || parsed.ok !== true || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
  return { ok: true, viewVersion, id: parsed.id, warnings: parsed.warnings ?? [], errors: parsed.errors ?? [] };
}

async function storedReplay(
  db: CvDatabase,
  memberId: string,
  requestId: string,
  action: string,
  payloadHashValue: string,
): Promise<FinanceMutationResult | null> {
  const rows = await db.query<{ action: string; payload_hash: string; response: FinanceMutationResult | string | null }>(
    `select action, payload_hash, response
     from finance.idempotency_keys
     where member_id = $1::uuid and request_id = $2::uuid`,
    [memberId, requestId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  if (row.action !== action || row.payload_hash !== payloadHashValue) throw new FinanceError(409, CONFLICT);
  if (row.response === null || row.response === undefined) throw new FinanceError(409, CONFLICT);
  return parseResult(row.response);
}

function fieldError(field: string, message: string): FinanceError {
  return new FinanceError(400, message, [{ field, message }]);
}

function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(404, message);
  return value.toLowerCase();
}

function requirePaidOn(value: unknown): string {
  const paidOn = text(value).trim();
  if (!ISO_DATE.test(paidOn)) throw fieldError("paidOn", "Enter a valid payment date.");
  const parsed = new Date(`${paidOn}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== paidOn) {
    throw fieldError("paidOn", "Enter a valid payment date.");
  }
  if (paidOn > osloToday()) throw fieldError("paidOn", "Payment date cannot be after today.");
  return paidOn;
}

function requireReason(value: unknown, message: string): string {
  const reason = text(value).trim();
  if (reason.length < 3) throw fieldError("reason", message);
  return reason;
}

async function call(db: CvDatabase, sql: string, params: unknown[]): Promise<FinanceMutationResult> {
  try {
    const result = await db.query<{ result: FinanceMutationResult | string }>(sql, params);
    return parseResult(result.rows[0]?.result);
  } catch (error) {
    throw mapPurchaseError(error);
  }
}

export async function performProcessingMutation(
  db: CvDatabase,
  caller: { memberId: string },
  body: Record<string, unknown>,
): Promise<FinanceMutationResult> {
  const action = String(body.action);
  const requestId = String(body.requestId);
  const payloadHash = hashFinancePayload(settlementSubject(action, body));
  const replay = await storedReplay(db, caller.memberId, requestId, action, payloadHash);
  if (replay) return replay;
  const expectedRevision = body.expectedRevision;
  if (action === "voidPurchase") {
    const purchaseId = requireUuid(body.purchaseId, "Purchase was not found.");
    const reason = requireReason(body.reason, "Enter a void reason.");
    return call(
      db,
      "select finance.void_registered_purchase($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::integer) as result",
      [caller.memberId, requestId, payloadHash, purchaseId, reason, expectedRevision],
    );
  }
  if (action === "reviewException") {
    const reviewId = requireUuid(body.reviewId, "Exception was not found.");
    const reason = requireReason(body.reason, "Enter a review reason.");
    return call(
      db,
      "select finance.review_purchase_exception($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::integer) as result",
      [caller.memberId, requestId, payloadHash, reviewId, reason, expectedRevision],
    );
  }
  const purchaseId = requireUuid(body.purchaseId, "Purchase was not found.");
  const paidOn = action === "markInvoicePaid" || action === "markRefundPaid" ? requirePaidOn(body.paidOn) : null;
  return call(
    db,
    "select finance.apply_purchase_settlement($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::integer) as result",
    [caller.memberId, requestId, payloadHash, action, purchaseId, paidOn, expectedRevision],
  );
}
