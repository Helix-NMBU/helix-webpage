import { createHash } from "node:crypto";
import { duplicateIncomeReference, parseIncomeChange, similarIncomeField, similarIncomePayment, summarizeIncomeAmounts, summarizeIncomeReceipts, type IncomeReceipt, type IncomeReceipts } from "../../src/features/Finance/income-receipts.js";
import { FinanceError } from "./finance-error.js";
import { formatOre, osloToday } from "./finance-money.js";
import type { FinanceMutationResult } from "./finance-types.js";
import type { CvDatabase } from "./member-cv-service.js";

function schemaPending(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "42P01"
    && error.message.includes("finance.income_receipts");
}

export async function loadIncomeReceipts(db: CvDatabase, seasonCode: string, includeDetails: boolean): Promise<IncomeReceipts | undefined> {
  try {
    if (!includeDetails) {
      const { rows } = await db.query<{ receivedOn: string; amountOre: string }>(`
        select r.received_on::text as "receivedOn", sum(r.amount_ore)::text as "amountOre"
        from finance.income_receipts r join finance.seasons s on s.id = r.season_id
        where s.code = $1 and r.voided_at is null
        group by r.received_on
      `, [seasonCode]);
      return summarizeIncomeAmounts(new Map(rows.map(row => [row.receivedOn, BigInt(row.amountOre)])));
    }

    const { rows } = await db.query<Omit<IncomeReceipt, "amountNok"> & { amountOre: string }>(`
      select r.id::text, r.category, r.source, r.amount_ore::text as "amountOre", r.received_on::text as "receivedOn",
        r.method, r.reference, r.void_reason as "voidReason"
      from finance.income_receipts r join finance.seasons s on s.id = r.season_id
      where s.code = $1
      order by r.received_on desc, r.created_at desc, r.id
    `, [seasonCode]);
    const records = rows.map(({ amountOre, ...row }) => ({ ...row, amountNok: formatOre(BigInt(amountOre)) }));
    return { ...summarizeIncomeReceipts(records), records };
  } catch (error) {
    // Existing financing reads can continue during a rolling schema release.
    if (schemaPending(error)) return undefined;
    throw error;
  }
}

export async function applyIncomeMutation(db: CvDatabase, memberId: string, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  const parsed = parseIncomeChange(body, osloToday());
  if (!parsed.change) throw new FinanceError(400, parsed.errors[0].message, parsed.errors);
  const hash = createHash("sha256").update(JSON.stringify(parsed.change)).digest("hex");
  const payload = JSON.stringify({ ...parsed.change, [similarIncomeField]: body[similarIncomeField] === true });
  try {
    const { rows: [row] } = await db.query<{ result: FinanceMutationResult | null }>(
      "select finance.apply_income_change($1::uuid, $2::uuid, $3, $4::jsonb) as result",
      [memberId, body.requestId, hash, payload],
    );
    if (!row?.result?.ok) throw new Error("Missing income mutation result.");
    return row.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("INCOME_SIMILAR_PAYMENT")) {
      throw new FinanceError(409, similarIncomePayment, [{ field: similarIncomeField, message: similarIncomePayment }]);
    }
    if (message.includes("INCOME_DUPLICATE_REFERENCE")) {
      throw new FinanceError(409, duplicateIncomeReference, [{ field: "reference", message: duplicateIncomeReference }]);
    }
    if (message.includes("INCOME_SEASON_CHANGED")) throw new FinanceError(409, "The finance season changed. Reload Income & Spend and try again.");
    if (message.includes("INCOME_SEASON_CLOSED")) throw new FinanceError(409, "This season is closed.");
    if (message.includes("INCOME_ALREADY_VOIDED")) throw new FinanceError(409, "This income entry is no longer available to void. Reload Income & Spend.");
    if (message.includes("INCOME_FUTURE_DATE")) throw new FinanceError(400, "Enter a date on or before today.");
    if (message.includes("FINANCE|denied|")) throw new FinanceError(403, "Finance access is required.");
    if (message.includes("FINANCE|conflict|")) throw new FinanceError(409, "This request ID was already used for a different change.");
    throw new FinanceError(503, "Could not save the income entry. Please try again.");
  }
}
