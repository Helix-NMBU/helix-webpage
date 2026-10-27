import { exceedsApprovalThreshold, formatOre, osloToday, parseIsoDate, parseNokToOre } from "./money.js";
import type { FinanceFieldError, FinanceWarning, PaymentMethod, PurchaseInput, PurchaseLineInput } from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "pdf"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"]);

export const MAX_PURCHASE_FILES = 15;
export const MAX_PURCHASE_FILE_BYTES = 10 * 1024 * 1024;

export type NormalizedPurchaseLine = {
  systemId: string;
  budgetItemId: string | null;
  unbudgeted: boolean;
  description: string;
  quantity: string;
  amountOre: bigint;
};

export type NormalizedPurchase = {
  buyerName: string;
  supplierName: string;
  paymentMethod: PaymentMethod;
  purchaseDate: string;
  justification: string;
  documentKind: "receipt" | "invoice";
  documentNumber: string | null;
  invoiceDueDate: string | null;
  refundAccount: string | null;
  refundPhone: string | null;
  lines: NormalizedPurchaseLine[];
  uploadIds: string[];
};

export type PurchaseValidationContext = {
  today: string;
  thresholdOre: bigint | null;
  choices: {
    systems: { id: string; active: boolean; unbudgetedItemId: string | null }[];
    items: { id: string; systemId: string; status: string }[];
  };
  itemActualOre: (itemId: string) => Promise<bigint>;
  itemPlannedOre: (itemId: string) => Promise<bigint>;
};

function field(field: string, message: string, line?: number): FinanceFieldError {
  return line === undefined ? { field, message } : { field, message, line };
}

function digitsOnly(value: string): string {
  return value.replace(/[\s.]/g, "");
}

function extension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

export function allowedUpload(fileName: string, contentType: string): boolean {
  const ext = extension(fileName);
  const mime = contentType.trim().toLowerCase();
  return (ext && ALLOWED_EXTENSIONS.has(ext)) || ALLOWED_MIME.has(mime);
}

export function verifyFileSignature(bytes: Uint8Array, fileName: string, contentType: string): boolean {
  const ext = extension(fileName);
  const mime = contentType.trim().toLowerCase();
  const header = bytes.subarray(0, Math.min(bytes.length, 12));
  const text = String.fromCharCode(...header);
  if (text.startsWith("%PDF-")) return ext === "pdf" || mime === "application/pdf";
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return ext === "jpg" || ext === "jpeg" || mime === "image/jpeg";
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return ext === "png" || mime === "image/png";
  const brand = text.includes("ftypheic") || text.includes("ftypheif") || text.includes("ftypmif1");
  if (brand) return ext === "heic" || ext === "heif" || mime === "image/heic" || mime === "image/heif";
  return allowedUpload(fileName, contentType);
}

function normalizeLine(raw: PurchaseLineInput, lineNumber: number, errors: FinanceFieldError[]): NormalizedPurchaseLine | null {
  const systemId = typeof raw.systemId === "string" && UUID.test(raw.systemId) ? raw.systemId : "";
  if (!systemId) errors.push(field("systemId", "Choose a system.", lineNumber));
  const unbudgeted = raw.unbudgeted === true;
  let budgetItemId: string | null = null;
  if (!unbudgeted) {
    if (typeof raw.budgetItemId !== "string" || !UUID.test(raw.budgetItemId)) {
      errors.push(field("budgetItemId", "Choose a budget item or mark the line as not in the budget.", lineNumber));
    } else {
      budgetItemId = raw.budgetItemId;
    }
  }
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) errors.push(field("description", "Enter a line description.", lineNumber));
  let quantity = typeof raw.quantity === "string" ? raw.quantity.trim() : "";
  if (!quantity) quantity = "1";
  const quantityValue = Number(quantity);
  if (!Number.isFinite(quantityValue) || quantityValue <= 0) errors.push(field("quantity", "Enter a positive quantity.", lineNumber));
  let amountOre: bigint | null = null;
  try {
    amountOre = parseNokToOre(typeof raw.amountNok === "string" ? raw.amountNok : "");
    if (amountOre === null || amountOre <= 0n) errors.push(field("amountNok", "Enter a positive line total in NOK.", lineNumber));
  } catch {
    errors.push(field("amountNok", "Enter a positive line total in NOK.", lineNumber));
  }
  if (!systemId || !description || amountOre === null || amountOre <= 0n || !Number.isFinite(quantityValue) || quantityValue <= 0) return null;
  return { systemId, budgetItemId, unbudgeted, description, quantity: String(quantityValue), amountOre };
}

export function normalizePurchaseInput(raw: PurchaseInput): { purchase: NormalizedPurchase | null; errors: FinanceFieldError[] } {
  const errors: FinanceFieldError[] = [];
  const buyerName = typeof raw.buyerName === "string" ? raw.buyerName.trim() : "";
  const supplierName = typeof raw.supplierName === "string" ? raw.supplierName.trim() : "";
  const justification = typeof raw.justification === "string" ? raw.justification.trim() : "";
  const paymentMethod = raw.paymentMethod;
  const documentKind = raw.documentKind;
  if (!buyerName) errors.push(field("buyerName", "Enter the buyer name."));
  if (!supplierName) errors.push(field("supplierName", "Enter the supplier name."));
  if (!justification || justification.length < 10) errors.push(field("justification", "Enter at least 10 characters of justification."));
  if (paymentMethod !== "team_account" && paymentMethod !== "outlay" && paymentMethod !== "invoice") {
    errors.push(field("paymentMethod", "Choose a payment method."));
  }
  if (documentKind !== "receipt" && documentKind !== "invoice") {
    errors.push(field("documentKind", "Choose a document type."));
  }
  let purchaseDate = "";
  try {
    purchaseDate = parseIsoDate(typeof raw.purchaseDate === "string" ? raw.purchaseDate : "");
  } catch {
    errors.push(field("purchaseDate", "Enter a valid purchase date."));
  }
  let invoiceDueDate: string | null = null;
  if (documentKind === "invoice") {
    try {
      invoiceDueDate = parseIsoDate(typeof raw.invoiceDueDate === "string" ? raw.invoiceDueDate : "");
    } catch {
      errors.push(field("invoiceDueDate", "Enter a valid due date for invoice purchases."));
    }
  }
  let refundAccount: string | null = null;
  let refundPhone: string | null = null;
  if (paymentMethod === "outlay") {
    const accountDigits = typeof raw.refundAccount === "string" ? digitsOnly(raw.refundAccount) : "";
    const phoneDigits = typeof raw.refundPhone === "string" ? digitsOnly(raw.refundPhone) : "";
    if (accountDigits && phoneDigits) errors.push(field("refundAccount", "Enter either an account number or a phone number."));
    else if (accountDigits) {
      if (!/^[0-9]{11}$/.test(accountDigits)) errors.push(field("refundAccount", "Enter an 11-digit account number."));
      else refundAccount = accountDigits;
    } else if (phoneDigits) {
      if (!/^[0-9]{8}$/.test(phoneDigits)) errors.push(field("refundPhone", "Enter an 8-digit phone number."));
      else refundPhone = phoneDigits;
    } else {
      errors.push(field("refundAccount", "Enter a refund account or phone number for outlays."));
    }
  }
  const uploadIds = Array.isArray(raw.uploadIds) ? raw.uploadIds.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (uploadIds.length < 1) errors.push(field("files", "Add at least one supporting file."));
  if (uploadIds.length > MAX_PURCHASE_FILES) errors.push(field("files", "You can attach at most 15 files."));
  const linesInput = Array.isArray(raw.lines) ? raw.lines : [];
  if (linesInput.length < 1) errors.push(field("lines", "Add at least one purchase line."));
  const lines = linesInput.map((line, index) => normalizeLine(line, index + 1, errors)).filter((line): line is NormalizedPurchaseLine => line !== null);
  const documentNumber = typeof raw.documentNumber === "string" && raw.documentNumber.trim() ? raw.documentNumber.trim() : null;
  if (errors.length) return { purchase: null, errors };
  return {
    purchase: {
      buyerName,
      supplierName,
      paymentMethod,
      purchaseDate,
      justification,
      documentKind,
      documentNumber,
      invoiceDueDate,
      refundAccount,
      refundPhone,
      lines,
      uploadIds,
    },
    errors,
  };
}

export async function validatePurchaseRelationships(
  purchase: NormalizedPurchase,
  context: PurchaseValidationContext,
): Promise<{ errors: FinanceFieldError[]; warnings: FinanceWarning[] }> {
  const errors: FinanceFieldError[] = [];
  const warnings: FinanceWarning[] = [];
  const today = context.today;
  if (purchase.purchaseDate > today) errors.push(field("purchaseDate", "Purchase date cannot be after today."));
  const systems = new Map(context.choices.systems.map((row) => [row.id, row]));
  const items = new Map(context.choices.items.map((row) => [row.id, row]));
  const pendingByItem = new Map<string, bigint>();
  let totalOre = 0n;
  purchase.lines.forEach((line, index) => {
    const system = systems.get(line.systemId);
    if (!system || !system.active) {
      errors.push(field("systemId", "Choose an active system.", index + 1));
      return;
    }
    let allocationItemId: string;
    if (line.unbudgeted) {
      allocationItemId = system.unbudgetedItemId ?? "";
      warnings.push({ message: `Line ${index + 1} is recorded as not in the budget.` });
    } else if (!line.budgetItemId) {
      errors.push(field("budgetItemId", "Choose a budget item or mark the line as not in the budget.", index + 1));
      return;
    } else {
      const item = items.get(line.budgetItemId);
      if (!item || item.systemId !== line.systemId || item.status === "cancelled") {
        errors.push(field("budgetItemId", "Choose a current budget item for this system.", index + 1));
        return;
      }
      allocationItemId = line.budgetItemId;
    }
    if (allocationItemId) {
      pendingByItem.set(allocationItemId, (pendingByItem.get(allocationItemId) ?? 0n) + line.amountOre);
    } else if (line.unbudgeted) {
      warnings.push({ message: `Line ${index + 1} will use the system's unallocated item when saved.` });
    }
    totalOre += line.amountOre;
  });
  for (const [itemId, pendingOre] of pendingByItem) {
    const actual = await context.itemActualOre(itemId);
    const planned = await context.itemPlannedOre(itemId);
    const after = actual + pendingOre;
    if (planned === 0n && pendingOre > 0n) {
      warnings.push({ message: "One or more lines spend against an unallocated item." });
    } else if (after > planned) {
      warnings.push({ message: `Line totals exceed the plan for one budget item by ${formatOre(after - planned)} NOK.` });
    }
  }
  if (context.thresholdOre !== null && exceedsApprovalThreshold(totalOre, context.thresholdOre)) {
    warnings.push({ message: `Total ${formatOre(totalOre)} NOK exceeds the ${formatOre(context.thresholdOre)} NOK approval threshold without prior approval.` });
  }
  return { errors, warnings };
}

export function registrationYear(now = new Date()): number {
  return Number(osloToday(now).slice(0, 4));
}

/** Stable idempotency subject for registerPurchase: normalized purchase fields only (no warnings, threshold, or registration year). */
export function registerPurchaseIdempotencySubject(purchase: NormalizedPurchase) {
  return {
    buyerName: purchase.buyerName,
    supplierName: purchase.supplierName,
    paymentMethod: purchase.paymentMethod,
    purchaseDate: purchase.purchaseDate,
    justification: purchase.justification,
    documentKind: purchase.documentKind,
    documentNumber: purchase.documentNumber,
    invoiceDueDate: purchase.invoiceDueDate,
    refundAccount: purchase.refundAccount,
    refundPhone: purchase.refundPhone,
    lines: purchase.lines.map((line) => ({
      systemId: line.systemId,
      budgetItemId: line.budgetItemId,
      unbudgeted: line.unbudgeted,
      description: line.description,
      quantity: line.quantity,
      amountOre: line.amountOre.toString(),
    })),
    uploadIds: [...purchase.uploadIds].sort(),
  };
}

export function serializePurchaseBody(
  purchase: NormalizedPurchase,
  options: { registrationYear: number; thresholdOre: bigint | null; missingApproval: boolean; warnings: FinanceWarning[] },
) {
  return {
    buyerName: purchase.buyerName,
    supplierName: purchase.supplierName,
    paymentMethod: purchase.paymentMethod,
    purchaseDate: purchase.purchaseDate,
    justification: purchase.justification,
    documentKind: purchase.documentKind,
    documentNumber: purchase.documentNumber,
    invoiceDueDate: purchase.invoiceDueDate,
    refundAccount: purchase.refundAccount,
    refundPhone: purchase.refundPhone,
    lines: purchase.lines.map((line) => ({
      systemId: line.systemId,
      budgetItemId: line.budgetItemId,
      unbudgeted: line.unbudgeted,
      description: line.description,
      quantity: line.quantity,
      amountOre: line.amountOre.toString(),
    })),
    uploadIds: purchase.uploadIds,
    registrationYear: options.registrationYear,
    thresholdOre: options.thresholdOre?.toString() ?? "0",
    missingApproval: options.missingApproval,
    warnings: options.warnings,
  };
}
