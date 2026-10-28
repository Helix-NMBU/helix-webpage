import type { CvDatabase } from "./member-cv-service.js";
import { formatOre } from "./finance-money.js";
import type { RequestFulfillmentSummary } from "./finance-types.js";

type Query = <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export async function queryRequestFulfilledOre(query: Query, requestId: string): Promise<bigint> {
  const rows = await query<{ fulfilled: string }>(
    "select finance.request_fulfilled_ore($1::uuid)::text as fulfilled",
    [requestId],
  );
  return BigInt(rows.rows[0]?.fulfilled ?? "0");
}

export async function queryRequestRemainingOre(query: Query, requestId: string): Promise<bigint> {
  const rows = await query<{ remaining: string }>(
    "select finance.request_remaining_ore($1::uuid)::text as remaining",
    [requestId],
  );
  return BigInt(rows.rows[0]?.remaining ?? "0");
}

export async function queryBudgetItemOpenCommitmentOre(query: Query, budgetItemId: string): Promise<bigint> {
  const rows = await query<{ commitment: string }>(
    "select finance.budget_item_open_commitment_ore($1::uuid)::text as commitment",
    [budgetItemId],
  );
  return BigInt(rows.rows[0]?.commitment ?? "0");
}

export async function loadRequestFulfillmentSummaries(
  query: Query,
  requestId: string,
  requesterMemberId: string,
): Promise<RequestFulfillmentSummary[]> {
  const rows = await query<{
    public_ref: string;
    purchase_date: string;
    description: string;
    amount_ore: string;
  }>(
    `select p.public_ref, p.purchase_date::text as purchase_date, pl.description, pl.amount_ore::text as amount_ore
     from finance.purchases p
     join finance.purchase_lines pl on pl.purchase_id = p.id
     where p.request_id = $1::uuid
       and p.requester_member_id = $2::uuid
       and p.status = 'registered'
       and pl.request_line_id is not null
     order by p.public_ref, pl.public_ref`,
    [requestId, requesterMemberId],
  );
  const byPurchase = new Map<string, RequestFulfillmentSummary>();
  for (const row of rows.rows) {
    const existing = byPurchase.get(row.public_ref) ?? {
      publicRef: row.public_ref,
      purchaseDate: row.purchase_date,
      totalNok: "0.00",
      lines: [],
    };
    existing.lines.push({ description: row.description, amountNok: formatOre(BigInt(row.amount_ore)) });
    byPurchase.set(row.public_ref, existing);
  }
  return [...byPurchase.values()].map((entry) => ({
    ...entry,
    totalNok: formatOre(
      entry.lines.reduce((sum, line) => {
        const [whole, fraction = "00"] = line.amountNok.split(".");
        return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
      }, 0n),
    ),
  }));
}

export async function voidRegisteredPurchase(
  db: CvDatabase,
  actorId: string,
  idempotencyRequestId: string,
  payloadHash: string,
  purchaseId: string,
  reason: string,
  expectedRevision?: number | null,
): Promise<unknown> {
  const result = await db.query<{ result: unknown }>(
    "select finance.void_registered_purchase($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::integer) as result",
    [actorId, idempotencyRequestId, payloadHash, purchaseId, reason, expectedRevision ?? null],
  );
  return result.rows[0]?.result;
}
