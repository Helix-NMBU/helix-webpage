import { formatOre } from "./finance-money.js";
import type {
  DocumentKind,
  ExceptionKind,
  FinancePurchaseSummary,
  PaymentMethod,
  PurchaseExceptionReview,
  PurchaseRegisterDocument,
  PurchaseRegisterLine,
  PurchaseStatus,
} from "./finance-types.js";

type Query = <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

type RegisterRow = {
  id: string;
  public_ref: string;
  status: PurchaseStatus;
  buyer_name: string;
  supplier_name: string;
  requester_member_id: string;
  requester_name: string;
  payment_method: PaymentMethod;
  purchase_date: string;
  justification: string;
  document_kind: DocumentKind;
  document_number: string | null;
  revision: number | string;
  void_reason: string | null;
  total_ore: string;
  refund_account: string | null;
  refund_phone: string | null;
  unpaid: boolean | string;
  invoice_due: string | null;
  invoice_paid: boolean | string | null;
  invoice_paid_on: string | null;
  outlay_paid: boolean | string | null;
  outlay_paid_on: string | null;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asFacts(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export async function loadPurchaseRegister(
  query: Query,
  seasonCode: string,
  unpaidOnly: boolean,
): Promise<{ register: FinancePurchaseSummary[]; unpaidCount: number }> {
  const count = await query<{ count: string }>(
    `select count(*)::text as count
     from finance.purchases p
     join finance.seasons s on s.id = p.season_id
     where s.code = $1
       and finance.purchase_has_unsettled_obligation(p.id)`,
    [seasonCode],
  );
  const loaded = await query<RegisterRow>(
    `select p.id, p.public_ref, p.status, p.buyer_name, p.supplier_name, p.requester_member_id,
            m.full_name as requester_name, p.payment_method, p.purchase_date::text as purchase_date,
            p.justification, p.document_kind, p.document_number, p.revision, p.void_reason,
            coalesce(sum(l.amount_ore), 0)::text as total_ore, p.refund_account, p.refund_phone,
            finance.purchase_has_unsettled_obligation(p.id) as unpaid,
            (select i.due_date::text from finance.invoice_obligations i where i.purchase_id = p.id) as invoice_due,
            (select i.paid from finance.invoice_obligations i where i.purchase_id = p.id) as invoice_paid,
            (select i.paid_on::text from finance.invoice_obligations i where i.purchase_id = p.id) as invoice_paid_on,
            (select o.paid from finance.outlay_reimbursements o where o.purchase_id = p.id) as outlay_paid,
            (select o.paid_on::text from finance.outlay_reimbursements o where o.purchase_id = p.id) as outlay_paid_on
     from finance.purchases p
     join finance.seasons s on s.id = p.season_id
     join identity.members m on m.id = p.requester_member_id
     left join finance.purchase_lines l on l.purchase_id = p.id
     where s.code = $1
       and ($2::boolean is not true or finance.purchase_has_unsettled_obligation(p.id))
     group by p.id, m.full_name
     order by p.public_ref desc`,
    [seasonCode, unpaidOnly],
  );
  const ids = loaded.rows.map((row) => row.id);
  const lines = ids.length
    ? (await query<{
      purchase_id: string; id: string; public_ref: string; system_name: string; item_name: string | null;
      description: string; amount_ore: string; allocation_ore: string;
    }>(
      `select pl.purchase_id, pl.id, pl.public_ref, sys.name as system_name, bi.description as item_name,
              pl.description, pl.amount_ore::text as amount_ore, coalesce(sum(a.amount_ore), 0)::text as allocation_ore
       from finance.purchase_lines pl
       join finance.systems sys on sys.id = pl.system_id
       left join finance.budget_items bi on bi.id = pl.budget_item_id
       left join finance.allocations a on a.line_id = pl.id
       where pl.purchase_id = any($1::uuid[])
       group by pl.id, sys.name, bi.description
       order by pl.public_ref`,
      [ids],
    )).rows
    : [];
  const documents = ids.length
    ? (await query<{
      purchase_id: string; id: string; public_ref: string; kind: DocumentKind; document_number: string | null; original_name: string;
    }>(
      `select purchase_id, id, public_ref, kind, document_number, original_name
       from finance.documents
       where purchase_id = any($1::uuid[])
       order by public_ref`,
      [ids],
    )).rows
    : [];
  const exceptions = ids.length
    ? (await query<{
      purchase_id: string; id: string; kind: ExceptionKind; facts: unknown; review_status: "open" | "reviewed";
      reason: string | null; actor_member_id: string | null; reviewed_at: unknown;
    }>(
      `select purchase_id, id, kind, facts, review_status, reason, actor_member_id, reviewed_at
       from finance.exception_reviews
       where purchase_id = any($1::uuid[])
       order by created_at`,
      [ids],
    )).rows
    : [];
  const register = loaded.rows.map((row): FinancePurchaseSummary => {
    const purchaseLines: PurchaseRegisterLine[] = lines
      .filter((line) => line.purchase_id === row.id)
      .map((line) => ({
        id: line.id,
        publicRef: line.public_ref,
        systemName: line.system_name,
        itemName: line.item_name,
        description: line.description,
        amountNok: formatOre(BigInt(line.amount_ore)),
        allocationNok: formatOre(BigInt(line.allocation_ore)),
      }));
    const purchaseDocuments: PurchaseRegisterDocument[] = documents
      .filter((doc) => doc.purchase_id === row.id)
      .map((doc) => ({
        id: doc.id,
        publicRef: doc.public_ref,
        kind: doc.kind,
        documentNumber: doc.document_number,
        originalName: doc.original_name,
      }));
    const purchaseExceptions: PurchaseExceptionReview[] = exceptions
      .filter((review) => review.purchase_id === row.id)
      .map((review) => ({
        id: review.id,
        kind: review.kind,
        reviewStatus: review.review_status,
        facts: asFacts(review.facts),
        reason: review.reason,
        actorMemberId: review.actor_member_id,
        reviewedAt: asText(review.reviewed_at),
      }));
    return {
      id: row.id,
      publicRef: row.public_ref,
      status: row.status,
      buyerName: row.buyer_name,
      supplierName: row.supplier_name,
      requesterMemberId: row.requester_member_id,
      requesterName: row.requester_name,
      paymentMethod: row.payment_method,
      purchaseDate: row.purchase_date,
      justification: row.justification,
      documentKind: row.document_kind,
      documentNumber: row.document_number,
      revision: Number(row.revision),
      voidReason: row.void_reason,
      totalNok: formatOre(BigInt(row.total_ore)),
      refundAccount: row.refund_account,
      refundPhone: row.refund_phone,
      unpaid: asBool(row.unpaid),
      invoice: row.invoice_paid === null || row.invoice_paid === undefined
        ? null
        : { dueDate: row.invoice_due, paid: asBool(row.invoice_paid), paidOn: row.invoice_paid_on },
      reimbursement: row.outlay_paid === null || row.outlay_paid === undefined
        ? null
        : { paid: asBool(row.outlay_paid), paidOn: row.outlay_paid_on },
      lines: purchaseLines,
      documents: purchaseDocuments,
      exceptions: purchaseExceptions,
    };
  });
  return { register, unpaidCount: Number(count.rows[0]?.count ?? "0") };
}
