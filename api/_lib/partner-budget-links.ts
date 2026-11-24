import { createHash } from "node:crypto";
import { MemberCvError } from "./member-cv-error.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import type {
  DealBudgetLinks,
  SaveDealBudgetLinks,
} from "../../src/features/PartnerDeals/deal-budget-links-types.js";
const uuid = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new MemberCvError(400, "Choose a valid deal or budgeted purchase.");
  return value.toLowerCase();
};
const revision = (value: unknown) => {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > 2147483647
  )
    throw new MemberCvError(
      400,
      "Reload the deal and budgeted purchases before saving.",
    );
  return Number(value);
};
function failure(error: unknown): never {
  if (error instanceof MemberCvError) throw error;
  const source = error as { code?: string; message?: string };
  if (source.code === "42501")
    throw new MemberCvError(
      403,
      "Pipeline access is required to select budgeted purchases.",
    );
  if (source.code === "P0002")
    throw new MemberCvError(
      404,
      "This deal or budgeted purchase is no longer available.",
    );
  if (source.code === "40001" || source.code === "23505")
    throw new MemberCvError(
      409,
      "The deal or budget changed. Refresh the purchase selection before saving again.",
    );
  if (source.message?.includes("deal_won_locked"))
    throw new MemberCvError(
      409,
      "Review the agreement before changing purchases tied to a won deal or awarded grant.",
    );
  if (["22023", "22P02", "23514", "23503"].includes(source.code ?? ""))
    throw new MemberCvError(
      400,
      "Choose available budgeted purchases from an open season.",
    );
  throw new MemberCvError(
    503,
    "Budgeted purchases are temporarily unavailable. Please try again.",
  );
}
export async function loadDealBudgetLinks(
  db: CvDatabase,
  actor: WorkspaceIdentity,
  dealId: unknown,
): Promise<DealBudgetLinks> {
  try {
    const result = await db.query<{ value: DealBudgetLinks }>(
      "select partner_deals.budget_links($1::uuid,$2,$3,$4::uuid) as value",
      [actor.userId, actor.googleSub, actor.email, uuid(dealId)],
    );
    if (!result.rows[0]?.value) throw new Error("Missing choices");
    return result.rows[0].value;
  } catch (error) {
    return failure(error);
  }
}
export async function saveDealBudgetLinks(
  db: CvDatabase,
  actor: WorkspaceIdentity,
  body: Record<string, unknown>,
): Promise<{ ok: true; dealRevision: number; applicationRevision: number }> {
  if (!Array.isArray(body.entries) || body.entries.length > 200)
    throw new MemberCvError(400, "Choose up to 200 budgeted purchases.");
  const entries = body.entries
    .map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new MemberCvError(400, "Choose valid budgeted purchases.");
      const item = value as Record<string, unknown>;
      return {
        entryId: uuid(item.entryId),
        budgetRevision: revision(item.budgetRevision),
      };
    })
    .sort((a, b) => a.entryId.localeCompare(b.entryId));
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length)
    throw new MemberCvError(400, "Choose each budgeted purchase only once.");
  const input: SaveDealBudgetLinks = {
    action: "saveDealBudgetLinks",
    requestId: uuid(body.requestId),
    dealId: uuid(body.dealId),
    dealExpectedRevision: revision(body.dealExpectedRevision),
    applicationExpectedRevision: revision(body.applicationExpectedRevision),
    entries,
  };
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    const result = await db.query<{
      value: { ok: true; dealRevision: number; applicationRevision: number };
    }>(
      "select partner_deals.save_budget_links($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as value",
      [
        actor.userId,
        actor.googleSub,
        actor.email,
        input.requestId,
        hash,
        JSON.stringify(input),
      ],
    );
    if (!result.rows[0]?.value) throw new Error("Missing result");
    return result.rows[0].value;
  } catch (error) {
    return failure(error);
  }
}
