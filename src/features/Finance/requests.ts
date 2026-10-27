import { parseNokToOre } from "./money.js";
import type { FinanceAction, FinanceFieldError, FinanceMutation, RequestInput } from "./types.js";
import { normalizeRequestInput, type NormalizedRequest, type NormalizedRequestLine } from "./request-domain.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REQUEST_ACTIONS = new Set<FinanceAction>([
  "saveRequest",
  "submitRequest",
  "withdrawRequest",
  "cancelRequest",
  "reviseRequest",
  "decideRequest",
  "closeRequest",
]);

export function isRequestAction(action: string): boolean {
  return REQUEST_ACTIONS.has(action as FinanceAction);
}

export function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseRequestBody(value: unknown): RequestInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.lines)) return null;
  return {
    supplierName: typeof row.supplierName === "string" ? row.supplierName : "",
    justification: typeof row.justification === "string" ? row.justification : "",
    plannedDate: typeof row.plannedDate === "string" ? row.plannedDate : "",
    lateReason: typeof row.lateReason === "string" ? row.lateReason : null,
    lines: row.lines.map((line) => {
      const entry = line as Record<string, unknown>;
      return {
        budgetItemId: typeof entry.budgetItemId === "string" ? entry.budgetItemId : "",
        description: typeof entry.description === "string" ? entry.description : "",
        estimatedNok: typeof entry.estimatedNok === "string" ? entry.estimatedNok : "",
      };
    }),
  };
}

export type ParsedRequestChange =
  | { ok: true; change: Record<string, unknown>; normalized?: NormalizedRequest }
  | { ok: false; errors: FinanceFieldError[] };

export function parseRequestChange(body: Record<string, unknown>, todayOslo: string): ParsedRequestChange {
  const action = body.action;
  if (typeof action !== "string" || !isRequestAction(action)) {
    return { ok: false, errors: [{ field: "action", message: "Unknown request." }] };
  }
  const recordId = typeof body.requestRecordId === "string" && UUID.test(body.requestRecordId) ? body.requestRecordId : undefined;
  const revisionId = typeof body.revisionId === "string" && UUID.test(body.revisionId) ? body.revisionId : undefined;
  const expectedRevision = body.expectedRevision;

  if (action === "saveRequest" || action === "submitRequest" || action === "reviseRequest") {
    const request = parseRequestBody(body.request);
    if (!request) return { ok: false, errors: [{ field: "request", message: "Enter request details." }] };
    const normalized = normalizeRequestInput(request, todayOslo);
    if (!normalized.ok) return normalized;
    const lines = normalized.value.lines.map((line: NormalizedRequestLine) => ({
      budgetItemId: line.budgetItemId,
      description: line.description,
      estimatedOre: line.estimatedOre.toString(),
    }));
    return {
      ok: true,
      normalized: normalized.value,
      change: {
        action,
        requestRecordId: recordId,
        expectedRevision,
        request: {
          supplierName: normalized.value.supplierName,
          justification: normalized.value.justification,
          plannedDate: normalized.value.plannedDate,
          lateReason: normalized.value.lateReason,
          lines,
        },
      },
    };
  }

  if (action === "withdrawRequest" || action === "cancelRequest") {
    if (!recordId) return { ok: false, errors: [{ field: "requestRecordId", message: "Choose a request." }] };
    return { ok: true, change: { action, requestRecordId: recordId, expectedRevision } };
  }

  if (action === "decideRequest") {
    if (!recordId || !revisionId) return { ok: false, errors: [{ field: "requestRecordId", message: "Choose a request." }] };
    const decision = body.decision;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (decision !== "approved" && decision !== "rejected") {
      return { ok: false, errors: [{ field: "decision", message: "Choose approve or reject." }] };
    }
    if (reason.length < 3) return { ok: false, errors: [{ field: "reason", message: "Enter a decision reason." }] };
    const approvedOreByLine: Record<string, string> = {};
    if (decision === "approved" && body.approvedOreByLine !== undefined) {
      if (!body.approvedOreByLine || typeof body.approvedOreByLine !== "object" || Array.isArray(body.approvedOreByLine)) {
        return { ok: false, errors: [{ field: "approvedOreByLine", message: "Enter valid approved amounts." }] };
      }
      for (const [key, value] of Object.entries(body.approvedOreByLine as Record<string, unknown>)) {
        if (!UUID.test(key) || typeof value !== "string" || value.length > 19 || !/^[0-9]+$/.test(value) || BigInt(value) > 9223372036854775807n) {
          return { ok: false, errors: [{ field: "approvedOreByLine", message: "Enter valid approved amounts." }] };
        }
        approvedOreByLine[key] = value;
      }
    }
    return {
      ok: true,
      change: { action, requestRecordId: recordId, revisionId, decision, reason, approvedOreByLine },
    };
  }

  if (action === "closeRequest") {
    if (!recordId) return { ok: false, errors: [{ field: "requestRecordId", message: "Choose a request." }] };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const releasedNok = typeof body.releasedNok === "string" ? body.releasedNok : "";
    let releasedOre: bigint;
    try {
      const parsed = parseNokToOre(releasedNok);
      if (parsed === null || parsed < 0n) throw new Error("invalid");
      releasedOre = parsed;
    } catch {
      return { ok: false, errors: [{ field: "releasedNok", message: "Enter a valid released amount." }] };
    }
    if (reason.length < 3) return { ok: false, errors: [{ field: "reason", message: "Enter a closure reason." }] };
    return {
      ok: true,
      change: { action, requestRecordId: recordId, expectedRevision, reason, releasedOre: releasedOre.toString() },
    };
  }

  return { ok: false, errors: [{ field: "action", message: "Unknown request." }] };
}

export function serializeRequestMutation(mutation: FinanceMutation): Record<string, unknown> {
  return mutation as Record<string, unknown>;
}
