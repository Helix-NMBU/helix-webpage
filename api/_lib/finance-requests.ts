import { createHash } from "node:crypto";
import { FinanceError } from "./finance-error.js";
import { osloToday } from "./finance-money.js";
import { isRequestAction, parseRequestChange, stableJson } from "../../src/features/Finance/requests.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { FinanceMutationResult } from "./finance-types.js";

const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function mapRequestDatabaseError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = messageOf(error);
  const tagged = /FINANCE\|(conflict|denied|invalid|stale|not_found)\|([^|]*)(?:\|([A-Za-z][A-Za-z0-9]*))?/.exec(message);
  if (tagged) {
    const kind = tagged[1];
    const text = tagged[2] || "Could not save the request.";
    const field = tagged[3];
    const status = kind === "denied" ? 403 : kind === "not_found" ? 404 : kind === "invalid" ? 400 : 409;
    return new FinanceError(status, text, field ? [{ field, message: text }] : undefined);
  }
  if (/season is closed/i.test(message)) return new FinanceError(409, "This season is closed.");
  return new FinanceError(503, UNAVAILABLE);
}

function asResult(value: unknown): FinanceMutationResult {
  const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value as FinanceMutationResult;
  const viewVersion = Number(parsed?.viewVersion);
  if (!parsed || parsed.ok !== true || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
  return { ok: true, viewVersion, id: parsed.id, revision: parsed.revision, warnings: parsed.warnings ?? [], errors: parsed.errors ?? [] };
}

export async function applyRequestMutation(db: CvDatabase, actorId: string, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  const action = body.action;
  if (typeof action !== "string" || !isRequestAction(action)) throw new FinanceError(400, "Unknown request.");
  const parsed = parseRequestChange(body, osloToday());
  if (!parsed.ok) {
    const message = parsed.errors.length === 1 ? parsed.errors[0].message : "Check the highlighted fields.";
    throw new FinanceError(400, message, parsed.errors);
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const hash = createHash("sha256").update(stableJson(parsed.change)).digest("hex");
  try {
    const result = await db.query<{ result: unknown }>(
      "select finance.apply_request_change($1::uuid, $2::uuid, $3, $4::jsonb, $5::date) as result",
      [actorId, requestId, hash, JSON.stringify(parsed.change), osloToday()],
    );
    return asResult(result.rows[0]?.result);
  } catch (error) {
    throw mapRequestDatabaseError(error);
  }
}
