import { createHash } from "node:crypto";
import { FinanceError } from "./finance-error.js";
import { concurrentFundingRequestMessage, deleteWithOtherChangesMessage, fundingWarnings, parseFundingChange, stableJson } from "../../src/features/Finance/funding.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { FinanceMutationResult } from "./finance-types.js";

const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";

type ChangeResult = {
  id: string;
  revision: number;
  viewVersion: number;
  excessOre: string;
  activeLinkedItems: number;
  warnActiveLinks: boolean;
};

function codeOf(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function mapFundingDatabaseError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = messageOf(error);
  const code = codeOf(error);
  if (message.includes("finance:NO_SEASON")) return new FinanceError(409, "An operator has not configured the current season.");
  if (message.includes("finance:SEASON_CLOSED") || message.includes("This season is closed")) return new FinanceError(403, "This season is closed.");
  if (message.includes("finance:REVISION_CONFLICT")) return new FinanceError(409, "This record was updated by someone else. Reload the page and try again.");
  if (message.includes("finance:FUNDING_NOT_FOUND")) return new FinanceError(404, "Funding was not found.");
  if (message.includes("finance:PART_NOT_FOUND")) return new FinanceError(404, "The earmarked part was not found.");
  if (message.includes("finance:IDEMPOTENCY_CONFLICT")) return new FinanceError(409, concurrentFundingRequestMessage);
  if (message.includes(deleteWithOtherChangesMessage)) {
    return new FinanceError(400, deleteWithOtherChangesMessage, [{ field: "status", message: deleteWithOtherChangesMessage }]);
  }
  if (message.includes("finance:ALREADY_DELETED")) return new FinanceError(409, "This funding is already deleted.");
  if (message.includes("finance:NOT_DELETED")) return new FinanceError(409, "This funding is not deleted.");
  if (message.includes("finance:INVALID") || code === "22007" || code === "22008" || code === "22023" || code === "22P02" || code === "23502" || code === "23514") {
    return new FinanceError(400, "The funding record is not valid.");
  }
  return new FinanceError(503, UNAVAILABLE);
}

function asResult(value: unknown): ChangeResult {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object") throw new FinanceError(503, UNAVAILABLE);
  const row = parsed as Partial<ChangeResult>;
  const viewVersion = Number(row.viewVersion);
  const revision = Number(row.revision);
  if (typeof row.id !== "string" || !Number.isSafeInteger(viewVersion) || !Number.isSafeInteger(revision)) throw new FinanceError(503, UNAVAILABLE);
  if (typeof row.excessOre !== "string" || !/^-?[0-9]+$/.test(row.excessOre)) throw new FinanceError(503, UNAVAILABLE);
  const activeLinkedItems = Number(row.activeLinkedItems);
  if (!Number.isSafeInteger(activeLinkedItems) || activeLinkedItems < 0 || typeof row.warnActiveLinks !== "boolean") throw new FinanceError(503, UNAVAILABLE);
  return { id: row.id, revision, viewVersion, excessOre: row.excessOre, activeLinkedItems, warnActiveLinks: row.warnActiveLinks };
}

export async function applyFundingMutation(db: CvDatabase, actorId: string, body: Record<string, unknown>, includeDraftItems: boolean): Promise<FinanceMutationResult> {
  const parsed = parseFundingChange(body);
  if (!parsed.ok) {
    const message = parsed.errors.length === 1 ? parsed.errors[0].message : "Check the highlighted fields.";
    throw new FinanceError(400, message, parsed.errors);
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const hash = createHash("sha256").update(stableJson(parsed.change)).digest("hex");
  try {
    const result = await db.query<{ result: unknown }>(
      "select finance.apply_funding_change($1::uuid, $2::uuid, $3, $4::jsonb, $5::boolean) as result",
      [actorId, requestId, hash, JSON.stringify(parsed.change), includeDraftItems],
    );
    const saved = asResult(result.rows[0]?.result);
    return {
      ok: true,
      viewVersion: saved.viewVersion,
      id: saved.id,
      revision: saved.revision,
      warnings: fundingWarnings(BigInt(saved.excessOre), saved.warnActiveLinks ? saved.activeLinkedItems : 0),
      errors: [],
    };
  } catch (error) {
    throw mapFundingDatabaseError(error);
  }
}
