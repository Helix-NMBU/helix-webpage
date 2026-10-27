/** Formula-safe CSV and delivery text. Stored finance text stays unchanged. */

const FORMULA_START = /^[\t\r]|^\s*[=+\-@]/;

export const FINANCE_PURCHASES_PATH = "/finance/purchases";
export const FINANCE_SIGN_IN_LINE = `Sign in to Helix and open ${FINANCE_PURCHASES_PATH}.`;

export const FINANCE_EXPORT_COLUMNS = [
  "row_kind",
  "purchase_ref",
  "purchase_date",
  "buyer_name",
  "supplier_name",
  "justification",
  "payment_method",
  "document_kind",
  "invoice_due_date",
  "invoice_state",
  "outlay_state",
  "above_limit",
  "above_limit_basis",
  "purchase_status",
  "voided_on",
  "line_ref",
  "line_description",
  "quantity",
  "line_amount_nok",
  "system_code",
  "budget_item_ref",
  "budget_status",
  "budget_status_basis",
  "allocation_ref",
  "allocation_amount_nok",
  "document_id",
  "document_ref",
  "document_name",
  "content_sha256",
  "content_type",
  "byte_size",
] as const;

export type FinanceExportColumn = (typeof FINANCE_EXPORT_COLUMNS)[number];
export type FinanceExportRow = Record<FinanceExportColumn, string>;

export function emptyExportRow(): FinanceExportRow {
  return Object.fromEntries(FINANCE_EXPORT_COLUMNS.map((column) => [column, ""])) as FinanceExportRow;
}

/** Prefix formula-like cells so a spreadsheet treats them as text. */
export function protectCsvCell(value: string): string {
  const text = value.replace(/\0/g, "");
  if (FORMULA_START.test(text)) return `'${text}`;
  return text;
}

export function csvCell(value: string): string {
  const text = protectCsvCell(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvLine(values: readonly string[]): string {
  return values.map(csvCell).join(",");
}

export function renderFinanceCsv(rows: readonly FinanceExportRow[]): string {
  const header = csvLine([...FINANCE_EXPORT_COLUMNS]);
  const body = rows.map((row) => csvLine(FINANCE_EXPORT_COLUMNS.map((column) => row[column] ?? "")));
  return [header, ...body].join("\r\n");
}

export function readDbBoolean(value: unknown): boolean | null {
  if (value === true || value === "t" || value === "true" || value === 1) return true;
  if (value === false || value === "f" || value === "false" || value === 0) return false;
  return null;
}

export function budgetStatusLabel(input: { unbudgeted: boolean; actualOre: bigint; effectivePlanOre: bigint }): "unbudgeted" | "over_budget" | "within" {
  if (input.unbudgeted) return "unbudgeted";
  if (input.actualOre > input.effectivePlanOre) return "over_budget";
  return "within";
}

export function approvalSubjectPrefix(aboveLimit: boolean, thresholdNok: string): string {
  if (!aboveLimit) return "";
  return `[Above approval limit NOK ${thresholdNok}]`;
}

export function invoiceSubjectPrefix(unpaidInvoice: boolean): string {
  return unpaidInvoice ? "[Unpaid invoice]" : "";
}

const PRIVATE_DELIVERY = /X-Amz-|signature=|AWSAccessKeyId=|x-amz-credential/i;
const ELEVEN_DIGITS = /(?<!\d)\d{11}(?!\d)/;

export function textHasRefundNumber(text: string): boolean {
  return ELEVEN_DIGITS.test(text);
}

export function deliveryTextHasPrivateMaterial(text: string, forbidden: readonly string[] = []): boolean {
  if (PRIVATE_DELIVERY.test(text) || textHasRefundNumber(text)) return true;
  return forbidden.some((secret) => secret.length > 0 && text.includes(secret));
}

export function financeLogLine(fields: Record<string, string>): string {
  const line = Object.entries(fields)
    .map(([key, value]) => `${key}=${value.replace(/[\r\n]/g, " ")}`)
    .join(" ");
  if (PRIVATE_DELIVERY.test(line) || textHasRefundNumber(line)) return "event=redacted";
  return line;
}
