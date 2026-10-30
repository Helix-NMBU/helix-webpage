import { createHash } from "node:crypto";
import { FinanceError } from "./finance-error.js";
import { formatOre, parseIsoDate, parseNokToOre } from "./finance-money.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { BankSnapshot, FinanceMutationResult } from "./finance-types.js";

/** Caller must authorize the narrow read before invoking this function. */
export async function loadBankSnapshot(db: CvDatabase): Promise<BankSnapshot | null> {
  const result = await db.query<{ amount_ore: string | null; as_of_date: string | null; updated_at: string | null; revision: number }>(
    "select amount_ore::text, as_of_date::text, updated_at::text, revision from finance.bank_snapshot where singleton",
  );
  const row = result.rows[0];
  if (!row) throw new FinanceError(503, "The bank balance is temporarily unavailable.");
  if (row.amount_ore === null) return null;
  if (!row.as_of_date || !row.updated_at || !/^-?\d+$/.test(row.amount_ore)) throw new FinanceError(503, "The bank balance is temporarily unavailable.");
  return { amountNok: formatOre(BigInt(row.amount_ore)), asOfDate: row.as_of_date, updatedAt: row.updated_at, revision: Number(row.revision) };
}

export async function setBankSnapshot(db: CvDatabase, actor: string, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  let amount: bigint | null;
  let date: string;
  try {
    amount = parseNokToOre(typeof body.amountNok === "string" ? body.amountNok : "");
    date = parseIsoDate(typeof body.asOfDate === "string" ? body.asOfDate : "");
    if (amount === null || amount > 9223372036854775807n || amount < -9223372036854775808n) throw new Error();
  } catch { throw new FinanceError(400, "Enter a valid balance and as-of date."); }
  const revision = body.expectedRevision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new FinanceError(400, "A valid revision is required.");
  const hash = createHash("sha256").update(JSON.stringify({ amount: amount.toString(), date, revision })).digest("hex");
  try {
    const result = await db.query<{ result: FinanceMutationResult }>("select finance.set_bank_snapshot($1::uuid,$2::uuid,$3,$4::bigint,$5::date,$6::integer) as result", [actor, body.requestId, hash, amount.toString(), date, revision]);
    if (!result.rows[0]?.result) throw new Error();
    return result.rows[0].result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("finance:FORBIDDEN")) throw new FinanceError(403, "Finance access is required.");
    if (message.includes("finance:REVISION_CONFLICT")) throw new FinanceError(409, "The balance changed. Reload it before saving.");
    if (message.includes("finance:IDEMPOTENCY_CONFLICT")) throw new FinanceError(409, "This request was already used for a different change.");
    throw new FinanceError(503, "The bank balance could not be saved. Please try again.");
  }
}
