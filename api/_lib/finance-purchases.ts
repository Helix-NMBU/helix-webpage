import { createHash, randomUUID } from "node:crypto";
import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { osloToday } from "./finance-money.js";
import type { FinanceObjectStorage } from "./finance-storage.js";
import { allowedUpload, verifyFileSignature } from "../../src/features/Finance/purchase-domain.js";
import {
  MAX_PURCHASE_FILE_BYTES,
  MAX_PURCHASE_FILES,
  normalizePurchaseInput,
  registerPurchaseIdempotencySubject,
  registrationYear,
  serializePurchaseBody,
  validatePurchaseRelationships,
  type NormalizedPurchase,
} from "../../src/features/Finance/purchase-domain.js";
import type {
  BudgetChoices,
  FinanceCapabilitySet,
  FinanceFieldError,
  FinanceMutationResult,
  FinanceWarning,
  PurchaseInput,
} from "./finance-types.js";
import { loadBudgetHierarchy } from "./finance-budgets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";
const REGISTER_IDEMPOTENCY_CONFLICT = "This request ID was already used for a different change.";

export function hashRegisterPurchaseIdempotency(purchase: NormalizedPurchase): string {
  return payloadHash({ action: "registerPurchase", purchase: registerPurchaseIdempotencySubject(purchase) });
}
const PURCHASE_ACTIONS = new Set(["checkPurchase", "authorizeUpload", "finalizeUpload", "registerPurchase", "downloadDocument"]);

export type PurchaseCaller = {
  memberId: string;
  viewVersion: number;
  seasonCode: string | null;
  approvalThresholdNok: string | null;
  capabilities: FinanceCapabilitySet;
};

export function isPurchaseMutation(action: string): boolean {
  return PURCHASE_ACTIONS.has(action);
}

function canonical(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapPurchaseError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = textOf(error);
  const tagged = /FINANCE\|(conflict|denied|invalid|stale|not_found|quota|recover)\|([^|]*)(?:\|([A-Za-z][A-Za-z0-9]*))?/.exec(message);
  if (tagged) {
    const kind = tagged[1];
    const text = tagged[2] || "Could not save the purchase.";
    const field = tagged[3];
    if (kind === "recover") {
      return new FinanceError(409, text, field ? [{ field, message: text }] : undefined, { action: "registerDirect", field });
    }
    const status = kind === "denied" ? 403 : kind === "not_found" ? 404 : kind === "quota" ? 429 : kind === "invalid" ? 400 : 409;
    return new FinanceError(status, text, field ? [{ field, message: text }] : undefined);
  }
  if (/season is closed/i.test(message)) return new FinanceError(409, "This season is closed.");
  if (/must be approved/i.test(message)) return new FinanceError(409, "The season budget must be approved before registering purchases.");
  return new FinanceError(503, UNAVAILABLE);
}

async function storedPurchaseReplay(
  db: CvDatabase,
  memberId: string,
  requestId: string,
  payloadHashValue: string,
): Promise<FinanceMutationResult | null> {
  const rows = await db.query<{ response: FinanceMutationResult | string; payload_hash: string }>(
    `select response, payload_hash
     from finance.idempotency_keys
     where member_id = $1::uuid
       and request_id = $2::uuid
       and action = 'registerPurchase'`,
    [memberId, requestId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  if (row.payload_hash !== payloadHashValue) {
    throw new FinanceError(409, REGISTER_IDEMPOTENCY_CONFLICT);
  }
  if (row.response === null || row.response === undefined) return null;
  const value = row.response;
  const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value;
  const viewVersion = Number(parsed?.viewVersion);
  if (!parsed || parsed.ok !== true || !Number.isSafeInteger(viewVersion)) return null;
  return { ok: true, viewVersion, id: parsed.id, warnings: parsed.warnings ?? [], errors: parsed.errors ?? [] };
}

async function call(db: CvDatabase, sql: string, params: unknown[]): Promise<FinanceMutationResult> {
  try {
    const result = await db.query<{ result: FinanceMutationResult | string }>(sql, params);
    const value = result.rows[0]?.result;
    const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value;
    const viewVersion = Number(parsed?.viewVersion);
    if (!parsed || parsed.ok !== true || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
    return { ok: true, viewVersion, id: parsed.id, warnings: parsed.warnings ?? [], errors: parsed.errors ?? [] };
  } catch (error) {
    throw mapPurchaseError(error);
  }
}

function invalid(errors: FinanceFieldError[]): FinanceError {
  return new FinanceError(400, errors[0]?.message ?? "Enter a valid purchase.", errors);
}

function requireUuid(value: unknown, field: string, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(400, message, [{ field, message }]);
  return value;
}

function parsePurchase(body: Record<string, unknown>): PurchaseInput {
  if (!body.purchase || typeof body.purchase !== "object" || Array.isArray(body.purchase)) {
    throw new FinanceError(400, "Enter a valid purchase.", [{ field: "purchase", message: "Enter a valid purchase." }]);
  }
  return body.purchase as PurchaseInput;
}

async function validationContext(db: CvDatabase, caller: PurchaseCaller): Promise<{
  choices: BudgetChoices;
  thresholdOre: bigint | null;
  itemActualOre: (itemId: string) => Promise<bigint>;
  itemPlannedOre: (itemId: string) => Promise<bigint>;
}> {
  if (!caller.seasonCode) throw new FinanceError(409, "An operator has not configured the current season.");
  const budget = await db.query<{ status: string; budget_id: string | null }>(
    `select b.status, b.id as budget_id
     from finance.seasons s
     left join finance.budgets b on b.season_id = s.id
     where s.code = $1`,
    [caller.seasonCode],
  );
  const row = budget.rows[0];
  if (!row?.budget_id || row.status !== "approved") {
    throw new FinanceError(409, "The season budget must be approved before registering purchases.");
  }
  const hierarchy = await loadBudgetHierarchy(db, {
    memberId: caller.memberId,
    viewVersion: caller.viewVersion,
    seasonCode: caller.seasonCode,
    capabilities: caller.capabilities,
  }, { status: "approved", approvedOn: null, budgetId: row.budget_id, revision: 0 });
  const choices = hierarchy.choices ?? { systems: [], items: [] };
  let threshold: bigint | null = null;
  if (caller.approvalThresholdNok) {
    const [whole, fraction = "00"] = caller.approvalThresholdNok.split(".");
    threshold = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }
  return {
    choices,
    thresholdOre: threshold,
    async itemActualOre(itemId: string) {
      const result = await db.query<{ actual: string }>("select finance.item_registered_actual_ore($1::uuid)::text as actual", [itemId]);
      return BigInt(result.rows[0]?.actual ?? "0");
    },
    async itemPlannedOre(itemId: string) {
      const result = await db.query<{ planned: string; protected: boolean; status: string }>(
        "select planned_ore::text as planned, protected, status from finance.budget_items where id = $1::uuid",
        [itemId],
      );
      const item = result.rows[0];
      if (!item || item.protected || item.status === "cancelled") return 0n;
      return BigInt(item.planned ?? "0");
    },
  };
}

async function validatePurchase(db: CvDatabase, caller: PurchaseCaller, purchase: PurchaseInput) {
  const normalized = normalizePurchaseInput(purchase);
  if (normalized.errors.length) throw invalid(normalized.errors);
  if (!normalized.purchase) throw invalid([{ field: "purchase", message: "Enter a valid purchase." }]);
  const context = await validationContext(db, caller);
  const related = await validatePurchaseRelationships(normalized.purchase, {
    today: osloToday(),
    thresholdOre: context.thresholdOre,
    choices: context.choices,
    itemActualOre: context.itemActualOre,
    itemPlannedOre: context.itemPlannedOre,
  });
  if (related.errors.length) throw invalid(related.errors);
  const totalOre = normalized.purchase.lines.reduce((sum, line) => sum + line.amountOre, 0n);
  const missingApproval = context.thresholdOre !== null && totalOre > context.thresholdOre;
  return { purchase: normalized.purchase, warnings: related.warnings, thresholdOre: context.thresholdOre, missingApproval };
}

export async function performPurchaseMutation(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  caller: PurchaseCaller,
  body: Record<string, unknown>,
): Promise<FinanceMutationResult> {
  const action = body.action;
  if (action === "checkPurchase") {
    try {
      const result = await validatePurchase(db, caller, parsePurchase(body));
      return { ok: true, viewVersion: caller.viewVersion, warnings: result.warnings, errors: [] };
    } catch (error) {
      if (error instanceof FinanceError && error.errors?.length) {
        return { ok: true, viewVersion: caller.viewVersion, warnings: [], errors: error.errors };
      }
      throw error;
    }
  }
  if (action === "authorizeUpload") {
    if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
    const byteSize = body.byteSize;
    if (!fileName) throw new FinanceError(400, "Choose a file to upload.", [{ field: "files", message: "Choose a file to upload." }]);
    if (!allowedUpload(fileName, contentType)) {
      throw new FinanceError(400, "This file type is not supported.", [{ field: "files", message: "This file type is not supported." }]);
    }
    if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_PURCHASE_FILE_BYTES) {
      throw new FinanceError(400, "Each file must be 10 MB or smaller.", [{ field: "files", message: "Each file must be 10 MB or smaller." }]);
    }
    const uploadId = randomUUID();
    const stagingKey = storage.stagingKey(caller.memberId, uploadId);
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    await db.query(
      "select finance.create_upload_authorization($1::uuid, $2::uuid, $3, $4, $5, $6::bigint, $7::timestamptz)",
      [caller.memberId, uploadId, stagingKey, fileName, contentType, byteSize, expiresAt],
    );
    const uploadUrl = await storage.presignPut(stagingKey, contentType, byteSize);
    return { ok: true, viewVersion: caller.viewVersion, id: uploadId, warnings: [], errors: [], uploadUrl, stagingKey, expiresAt } as FinanceMutationResult & { uploadUrl: string; stagingKey: string; expiresAt: string };
  }
  if (action === "finalizeUpload") {
    if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
    const uploadId = requireUuid(body.uploadId, "uploadId", "A valid upload ID is required.");
    const rows = await db.query<{
      staging_key: string;
      byte_size: string;
      content_type: string | null;
      original_name: string | null;
      status: string;
      member_id: string;
    }>(
      "select staging_key, byte_size::text as byte_size, content_type, original_name, status, member_id::text as member_id from finance.uploads where id = $1::uuid",
      [uploadId],
    );
    const upload = rows.rows[0];
    if (!upload || upload.member_id !== caller.memberId) throw new FinanceError(404, "Upload not found.");
    if (upload.status !== "pending") throw new FinanceError(409, "This upload has already been finalized.");
    const expectedSize = Number(upload.byte_size);
    const head = await storage.headObject(upload.staging_key);
    if (head.byteSize !== expectedSize) {
      throw new FinanceError(400, "Uploaded file size does not match.", [{ field: "files", message: "Uploaded file size does not match." }]);
    }
    const signature = await storage.readSignature(upload.staging_key, 16);
    const fileName = upload.original_name ?? "upload.bin";
    const contentType = upload.content_type ?? head.contentType ?? "application/octet-stream";
    if (!verifyFileSignature(signature, fileName, contentType)) {
      throw new FinanceError(400, "This file type is not supported.", [{ field: "files", message: "This file type is not supported." }]);
    }
    const bytes = await storage.readObject(upload.staging_key, head.byteSize);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const finalKey = storage.finalKey(caller.memberId, uploadId);
    await storage.promoteStagingToFinal(upload.staging_key, finalKey, contentType, head.byteSize);
    await db.query(
      "select finance.complete_upload_finalize($1::uuid, $2::uuid, $3, $4, $5::bigint, $6)",
      [caller.memberId, uploadId, finalKey, digest, head.byteSize, contentType],
    );
    return { ok: true, viewVersion: caller.viewVersion, id: uploadId, warnings: [], errors: [] };
  }
  if (action === "registerPurchase") {
    const requestId = requireUuid(body.requestId, "requestId", "A valid request ID is required.");
    const normalized = normalizePurchaseInput(parsePurchase(body));
    if (normalized.errors.length) throw invalid(normalized.errors);
    if (!normalized.purchase) throw invalid([{ field: "purchase", message: "Enter a valid purchase." }]);
    const hash = hashRegisterPurchaseIdempotency(normalized.purchase);
    const replayed = await storedPurchaseReplay(db, caller.memberId, requestId, hash);
    if (replayed) return replayed;
    const validated = await validatePurchase(db, caller, parsePurchase(body));
    const payload = serializePurchaseBody(validated.purchase, {
      registrationYear: registrationYear(),
      thresholdOre: validated.thresholdOre,
      missingApproval: validated.missingApproval,
      warnings: validated.warnings,
    });
    return call(db, "select finance.register_purchase($1::uuid, $2::uuid, $3, $4::jsonb) as result", [
      caller.memberId,
      requestId,
      hash,
      JSON.stringify(payload),
    ]);
  }
  if (action === "downloadDocument") {
    if (!caller.capabilities.filesAndRefunds) throw new FinanceError(403, "Finance access is required.");
    if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
    const documentId = requireUuid(body.documentId, "documentId", "A valid document ID is required.");
    const rows = await db.query<{ storage_key: string; original_name: string; content_type: string; purchase_id: string }>(
      `select d.storage_key, d.original_name, d.content_type, d.purchase_id::text as purchase_id
       from finance.documents d
       join finance.purchases p on p.id = d.purchase_id
       where d.id = $1::uuid and p.status = 'registered'`,
      [documentId],
    );
    const document = rows.rows[0];
    if (!document) throw new FinanceError(404, "Document not found.");
    const url = await storage.presignGet(document.storage_key, document.original_name, document.content_type);
    return { ok: true, viewVersion: caller.viewVersion, warnings: [], errors: [], downloadUrl: url } as FinanceMutationResult & { downloadUrl: string };
  }
  throw new FinanceError(400, "Unknown request.");
}
