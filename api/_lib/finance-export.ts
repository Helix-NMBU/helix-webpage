import { createHash } from "node:crypto";
import type { CvDatabase } from "./member-cv-service.js";
import { formatOre } from "./finance-money.js";
import {
  budgetStatusLabel,
  emptyExportRow,
  readDbBoolean,
  renderFinanceCsv,
  type FinanceExportRow,
} from "../../src/features/Finance/export-text.js";

const EXPORT_NAME = "purchases.csv";

type PurchaseExportRow = {
  id: string;
  public_ref: string;
  purchase_date: string;
  buyer_name: string;
  supplier_name: string;
  justification: string;
  payment_method: string;
  document_kind: string;
  status: string;
  voided_on: string | null;
  total_ore: string;
  invoice_due_date: string | null;
  invoice_paid: boolean | null;
  outlay_paid: boolean | null;
  registration_threshold_ore: string | null;
};

type LineExportRow = {
  purchase_id: string;
  public_ref: string;
  description: string;
  quantity: string;
  amount_ore: string;
  unbudgeted: boolean;
  system_code: string;
  budget_item_ref: string | null;
  effective_plan_ore: string | null;
  actual_ore: string | null;
};

type AllocationExportRow = {
  purchase_id: string;
  public_ref: string;
  amount_ore: string;
  budget_item_ref: string;
};

type DocumentExportRow = {
  purchase_id: string;
  id: string;
  public_ref: string;
  original_name: string;
  content_sha256: string;
  content_type: string;
  byte_size: string;
};

export type FinanceCsvExport = {
  fileName: string;
  csv: string;
  byteSize: number;
  contentSha256: string;
};

function money(ore: string): string {
  return formatOre(BigInt(ore));
}

function stateLabel(paid: boolean | null | undefined, paidLabel: string, unpaidLabel: string): string {
  if (paid === null || paid === undefined) return "";
  return paid ? paidLabel : unpaidLabel;
}

export async function buildPurchaseExport(db: CvDatabase, seasonCode: string): Promise<FinanceCsvExport> {
  const purchases = (await db.query<PurchaseExportRow>(
    `select p.id, p.public_ref, p.purchase_date::text as purchase_date, p.buyer_name, p.supplier_name,
            p.justification, p.payment_method, p.document_kind, p.status,
            case when p.voided_at is null then null else (p.voided_at at time zone 'Europe/Oslo')::date::text end as voided_on,
            coalesce(sum(l.amount_ore), 0)::text as total_ore,
            i.due_date::text as invoice_due_date,
            i.paid as invoice_paid,
            o.paid as outlay_paid,
            (
              select e.facts ->> 'thresholdOre'
              from finance.exception_reviews e
              where e.purchase_id = p.id and e.kind = 'missing_approval'
              order by e.created_at, e.id
              limit 1
            ) as registration_threshold_ore
     from finance.purchases p
     join finance.seasons s on s.id = p.season_id
     left join finance.purchase_lines l on l.purchase_id = p.id
     left join finance.invoice_obligations i on i.purchase_id = p.id
     left join finance.outlay_reimbursements o on o.purchase_id = p.id
     where s.code = $1
     group by p.id, i.due_date, i.paid, o.paid
     order by p.public_ref`,
    [seasonCode],
  )).rows;
  const lines = (await db.query<LineExportRow>(
    `select l.purchase_id, l.public_ref, l.description, l.quantity::text as quantity, l.amount_ore::text as amount_ore,
            l.unbudgeted, s.code as system_code, i.public_ref as budget_item_ref,
            case
              when i.id is null then null
              when i.status = 'cancelled' or i.protected then '0'
              else i.planned_ore::text
            end as effective_plan_ore,
            case when i.id is null then null else finance.item_registered_actual_ore(i.id)::text end as actual_ore
     from finance.purchase_lines l
     join finance.purchases p on p.id = l.purchase_id
     join finance.seasons season on season.id = p.season_id
     join finance.systems s on s.id = l.system_id
     left join finance.budget_items i on i.id = l.budget_item_id
     where season.code = $1
     order by l.public_ref`,
    [seasonCode],
  )).rows;
  const allocations = (await db.query<AllocationExportRow>(
    `select l.purchase_id, a.public_ref, a.amount_ore::text as amount_ore, i.public_ref as budget_item_ref
     from finance.allocations a
     join finance.purchase_lines l on l.id = a.line_id
     join finance.purchases p on p.id = l.purchase_id
     join finance.seasons season on season.id = p.season_id
     join finance.budget_items i on i.id = a.budget_item_id
     where season.code = $1
     order by a.public_ref`,
    [seasonCode],
  )).rows;
  const documents = (await db.query<DocumentExportRow>(
    `select d.purchase_id, d.id, d.public_ref, d.original_name, d.content_sha256, d.content_type, d.byte_size::text as byte_size
     from finance.documents d
     join finance.purchases p on p.id = d.purchase_id
     join finance.seasons season on season.id = p.season_id
     where season.code = $1
     order by d.public_ref`,
    [seasonCode],
  )).rows;
  const setting = (await db.query<{ threshold_ore: string | null }>(
    "select setting_value #>> '{}' as threshold_ore from finance.settings where setting_key = 'approval_threshold_ore'",
  )).rows[0];
  const currentThreshold = setting?.threshold_ore && /^[0-9]+$/.test(setting.threshold_ore) ? setting.threshold_ore : null;
  const rows: FinanceExportRow[] = [];
  for (const purchase of purchases) {
    const basis = purchase.registration_threshold_ore && /^[0-9]+$/.test(purchase.registration_threshold_ore)
      ? "at_registration"
      : "current_setting";
    const threshold = basis === "at_registration" ? purchase.registration_threshold_ore : currentThreshold;
    const above = threshold !== null && BigInt(purchase.total_ore) > BigInt(threshold);
    const summary = emptyExportRow();
    summary.row_kind = "purchase";
    summary.purchase_ref = purchase.public_ref;
    summary.purchase_date = purchase.purchase_date;
    summary.buyer_name = purchase.buyer_name;
    summary.supplier_name = purchase.supplier_name;
    summary.justification = purchase.justification;
    summary.payment_method = purchase.payment_method;
    summary.document_kind = purchase.document_kind;
    summary.invoice_due_date = purchase.invoice_due_date ?? "";
    summary.invoice_state = stateLabel(readDbBoolean(purchase.invoice_paid), "paid", "unpaid");
    summary.outlay_state = stateLabel(readDbBoolean(purchase.outlay_paid), "reimbursed", "unreimbursed");
    summary.above_limit = above ? "yes" : "no";
    summary.above_limit_basis = threshold ? basis : "";
    summary.purchase_status = purchase.status;
    summary.voided_on = purchase.voided_on ?? "";
    summary.line_amount_nok = money(purchase.total_ore);
    rows.push(summary);
    for (const line of lines.filter((item) => item.purchase_id === purchase.id)) {
      const status = budgetStatusLabel({
        unbudgeted: readDbBoolean(line.unbudgeted) === true,
        actualOre: BigInt(line.actual_ore ?? "0"),
        effectivePlanOre: BigInt(line.effective_plan_ore ?? "0"),
      });
      const record = emptyExportRow();
      record.row_kind = "line";
      record.purchase_ref = purchase.public_ref;
      record.line_ref = line.public_ref;
      record.line_description = line.description;
      record.quantity = line.quantity;
      record.line_amount_nok = money(line.amount_ore);
      record.system_code = line.system_code;
      record.budget_item_ref = line.budget_item_ref ?? "";
      record.budget_status = status;
      record.budget_status_basis = "current";
      rows.push(record);
    }
    for (const allocation of allocations.filter((item) => item.purchase_id === purchase.id)) {
      const record = emptyExportRow();
      record.row_kind = "allocation";
      record.purchase_ref = purchase.public_ref;
      record.allocation_ref = allocation.public_ref;
      record.allocation_amount_nok = money(allocation.amount_ore);
      record.budget_item_ref = allocation.budget_item_ref;
      rows.push(record);
    }
    for (const document of documents.filter((item) => item.purchase_id === purchase.id)) {
      const record = emptyExportRow();
      record.row_kind = "document";
      record.purchase_ref = purchase.public_ref;
      record.document_id = document.id;
      record.document_ref = document.public_ref;
      record.document_name = document.original_name;
      record.content_sha256 = document.content_sha256;
      record.content_type = document.content_type;
      record.byte_size = document.byte_size;
      rows.push(record);
    }
  }
  const csv = renderFinanceCsv(rows);
  const bytes = Buffer.from(csv, "utf8");
  return {
    fileName: EXPORT_NAME,
    csv,
    byteSize: bytes.byteLength,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
