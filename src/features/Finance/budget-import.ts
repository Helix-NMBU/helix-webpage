import { BUDGET_ITEM_CATEGORIES } from "./budget-domain.js";
import { parseIsoDate, parseNokToOre } from "./money.js";

export const IMPORT_COLUMNS = ["system_id", "description", "planned_nok", "priority", "category", "reuse_status", "expected_purchase_date", "note", "earmark_id"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRecord = { line: number; values: Partial<Record<ImportColumn, string>> };
export type ImportError = { field: string; message: string; line?: number };
export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_ERRORS = 100;
export type BudgetCsvResult = { rows: ImportRecord[]; columns: ImportColumn[]; errors: ImportError[]; limitError?: string };

export function parseImportAmount(value: string): bigint | null {
  const text = value.trim();
  const suffix = text.replace(/\s*(?:kr\.?|nok)$/i, "");
  // A trailing currency unit is accepted; embedded text still fails the money parser.
  return parseNokToOre(suffix.replace(/^kr\.(?=\s|[+-]?\d)/i, "kr"));
}

/** Parse RFC-style quoted cells while retaining the physical starting line of each record. */
export function parseBudgetCsv(source: string): BudgetCsvResult {
  const limited = (message: string): BudgetCsvResult => ({ rows: [], columns: [], errors: [{ field: "csv", message }], limitError: message });
  if (source.length > MAX_IMPORT_BYTES || new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
    return limited("The CSV exceeds 256 KiB. Reduce the file size and try again.");
  }
  const csv = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const errors: ImportError[] = [];
  if (!csv.trim()) return { rows: [], columns: [], errors: [{ field: "csv", message: "Choose a nonempty CSV file." }] };
  const firstLine = csv.split("\n").find((value) => value.trim()) ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = []; let cell = ""; let quoted = false; let afterQuote = false; let line = 1; let start = 1;
  function endCell() { cells.push(cell); cell = ""; afterQuote = false; }
  function endRow() { endCell(); if (cells.some((value) => value.trim() !== "")) records.push({ line: start, cells }); cells = []; start = line + 1; }
  for (let i = 0; i < csv.length; i += 1) {
    if (records.length > MAX_IMPORT_ROWS + 1) return limited("The CSV exceeds 500 data rows.");
    if (errors.length >= MAX_IMPORT_ERRORS) return limited("The CSV contains too many errors. Correct the file and try again.");
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else { cell += c; if (c === "\n") line += 1; }
      continue;
    }
    if (c === delimiter) { endCell(); continue; }
    if (c === "\n") { endRow(); line += 1; continue; }
    if (c === '"' && cell.trim() === "" && !afterQuote) { cell = ""; quoted = true; continue; }
    if (c === '"') { errors.push({ field: "csv", line, message: `Line ${line}: unexpected quote in an unquoted cell.` }); continue; }
    if (afterQuote && !/\s/.test(c)) errors.push({ field: "csv", line, message: `Line ${line}: unexpected text after a quoted cell.` });
    else if (!afterQuote) cell += c;
  }
  if (quoted) errors.push({ field: "csv", line: start, message: `Line ${start}: a quoted cell is not closed.` });
  if (cell || cells.length) endRow();
  if (records.length > MAX_IMPORT_ROWS + 1) return limited("The CSV exceeds 500 data rows.");
  if (errors.length >= MAX_IMPORT_ERRORS) return limited("The CSV contains too many errors. Correct the file and try again.");
  if (!records.length) return { rows: [], columns: [], errors: [{ field: "csv", message: "Choose a nonempty CSV file." }] };
  const header = records[0].cells.map((value) => value.trim().toLowerCase());
  const columns: ImportColumn[] = [];
  for (const name of header) {
    if (errors.length >= MAX_IMPORT_ERRORS) return limited("The CSV contains too many errors. Correct the file and try again.");
    if (!name) continue;
    if (!(IMPORT_COLUMNS as readonly string[]).includes(name)) errors.push({ field: name, message: `Unknown column: ${name}.` });
    else if (columns.includes(name as ImportColumn)) errors.push({ field: name, message: `Duplicate column: ${name}.` });
    else columns.push(name as ImportColumn);
  }
  for (const required of ["system_id", "description", "planned_nok"]) if (!header.includes(required)) errors.push({ field: required, message: `The ${required} column is required.` });
  const rows: ImportRecord[] = [];
  const seen = new Set<string>();
  for (const record of records.slice(1)) {
    if (errors.length >= MAX_IMPORT_ERRORS) return limited("The CSV contains too many errors. Correct the file and try again.");
    if (record.cells.length !== header.length) { errors.push({ field: "csv", line: record.line, message: `Line ${record.line}: expected ${header.length} fields, found ${record.cells.length}.` }); continue; }
    const values: Partial<Record<ImportColumn, string>> = {};
    header.forEach((name, index) => { if ((IMPORT_COLUMNS as readonly string[]).includes(name)) values[name as ImportColumn] = record.cells[index].trim(); });
    const fail = (field: string, message: string) => errors.push({ field, line: record.line, message: `Line ${record.line}, ${field}: ${message}` });
    if (!values.system_id) fail("system_id", "Choose a system.");
    if (!values.description || values.description.length > 300) fail("description", "Enter a description of at most 300 characters.");
    try { const amount = parseImportAmount(values.planned_nok ?? ""); if (amount === null || amount < 0n) throw new Error(); }
    catch { fail("planned_nok", "Enter an amount of zero or more."); }
    if (values.expected_purchase_date) { try { parseIsoDate(values.expected_purchase_date); } catch { fail("expected_purchase_date", "Enter a valid date (YYYY-MM-DD)."); } }
    if (values.note && values.note.length > 2000) fail("note", "Enter a note of at most 2000 characters.");
    if (values.priority !== undefined) {
      const priority = values.priority.toUpperCase();
      values.priority = priority === "ØREMERKET" ? "EM" : priority || "P2";
      if (!["P1", "P2", "P3", "P4", "EM"].includes(values.priority)) fail("priority", "Choose P1, P2, P3, P4 or EM.");
    }
    if (values.category !== undefined) {
      values.category = values.category.toLowerCase() || "other";
      if (!(BUDGET_ITEM_CATEGORIES as readonly string[]).includes(values.category)) fail("category", "Choose a valid category.");
    }
    if (values.reuse_status !== undefined) {
      values.reuse_status = values.reuse_status.toLowerCase() || "new";
      if (!["new", "reuse", "inspect", "consumable"].includes(values.reuse_status)) fail("reuse_status", "Choose new, reuse, inspect or consumable.");
    }
    const key = `${values.system_id ?? ""}\0${normalizeImportDescription(values.description ?? "")}`;
    if (seen.has(key)) fail("description", "This system and description occur more than once.");
    seen.add(key); rows.push({ line: record.line, values });
  }
  if (errors.length >= MAX_IMPORT_ERRORS) return limited("The CSV contains too many errors. Correct the file and try again.");
  if (!rows.length) errors.push({ field: "csv", message: "Add at least one data row." });
  return { rows, columns, errors };
}

export function normalizeImportDescription(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nb"); }
