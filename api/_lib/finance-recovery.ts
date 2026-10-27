import { createHash, randomUUID } from "node:crypto";
import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { FinanceStorageUncertainError, type FinanceObjectStorage } from "./finance-storage.js";
import { buildPurchaseExport } from "./finance-export.js";
import { deliverPending, reconcileOutboxDelivery } from "./finance-outbox.js";
import type { FinanceMailSender } from "./finance-mail.js";
import type { FinanceLog } from "./finance-outbox.js";
import { financeLogLine } from "../../src/features/Finance/export-text.js";
import type { FinanceCapabilitySet, FinanceMutationResult, FinanceRecoveryView } from "./finance-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";
export const FINANCE_EXPORT_INLINE_LIMIT = 1_048_576;
export const FINANCE_EXPORT_PRIVATE_LIMIT = 20 * 1024 * 1024;
export const FINANCE_UPLOAD_CLEANUP_GRACE = "24 hours";
const RECONCILE = new Set(["sent", "not_sent", "still_unknown"]);
const UPLOAD_RECONCILE = new Set(["saved", "absent", "still_unknown"]);

export type DeliveryCaller = {
  memberId: string;
  viewVersion: number;
  seasonCode: string | null;
  capabilities: FinanceCapabilitySet;
};

/** Finance can inspect bounded operational metadata, but never file keys, payloads or refund details. */
export async function loadFinanceRecovery(db: CvDatabase, caller: DeliveryCaller): Promise<FinanceRecoveryView> {
  if (!caller.capabilities.purchaseRegister) throw new FinanceError(403, "Finance access is required.");
  const deliveries = await db.query<{
    id: string; event_type: string; recipient: string | null; status: string; safe_error: string | null;
    attempt_count: number; updated_at: string; last_claimed_at: string | null; provider_message_id: string | null;
  }>(`select o.id::text, o.event_type, m.full_name as recipient, o.status, o.safe_error,
             o.attempt_count, o.updated_at::text, a.claimed_at::text as last_claimed_at,
             coalesce(o.provider_message_id, a.provider_message_id) as provider_message_id
      from finance.outbox o
      left join identity.members m on m.id = o.recipient_member_id
      left join lateral (select claimed_at, provider_message_id from finance.outbox_attempts
                         where outbox_id = o.id order by attempt_no desc limit 1) a on true
      where o.status in ('pending', 'failed', 'uncertain')
      order by o.updated_at desc, o.id limit 50`);
  const uploads = await db.query<{
    id: string; owner: string | null; status: string; commit_state: string; referenced: boolean; created_at: string; expires_at: string;
  }>(`select u.id::text, m.full_name as owner, u.status, u.commit_state,
             finance.upload_is_referenced(u) as referenced, u.created_at::text, u.expires_at::text
      from finance.uploads u join identity.members m on m.id = u.member_id
      where u.commit_state = 'uncertain'
      order by u.created_at desc, u.id limit 50`);
  return {
    deliveries: deliveries.rows.map((r) => ({ id: r.id, eventType: r.event_type, recipient: r.recipient, status: r.status,
      safeError: r.safe_error, attemptCount: Number(r.attempt_count), updatedAt: r.updated_at,
      lastClaimedAt: r.last_claimed_at, providerMessageId: r.provider_message_id })),
    uploads: uploads.rows.map((r) => ({ id: r.id, owner: r.owner, status: r.status, commitState: r.commit_state, referenced: r.referenced,
      createdAt: r.created_at, expiresAt: r.expires_at })),
  };
}

type QueryResult = { result?: FinanceMutationResult | string };

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

export function hashRecoveryPayload(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function mapFinanceDeliveryError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const tagged = /FINANCE\|(conflict|denied|invalid|stale|not_found|quota|uncertain)\|([^|]*)/.exec(message);
  if (tagged) {
    const kind = tagged[1];
    const text = tagged[2] || "Could not finish the finance operation.";
    const status = kind === "denied" ? 403 : kind === "not_found" ? 404 : kind === "quota" ? 429 : kind === "invalid" ? 400 : 409;
    return new FinanceError(status, text);
  }
  return new FinanceError(503, UNAVAILABLE);
}

function asResult(value: unknown): FinanceMutationResult | null {
  const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value as FinanceMutationResult;
  if (!parsed || parsed.ok !== true || !Number.isSafeInteger(Number(parsed.viewVersion))) return null;
  return parsed;
}

async function replay(
  db: CvDatabase,
  caller: DeliveryCaller,
  requestId: string,
  action: string,
  payloadHash: string,
): Promise<FinanceMutationResult | null> {
  try {
    const rows = await db.query<QueryResult>(
      "select finance.replay_recovery_mutation($1::uuid, $2::uuid, $3, $4) as result",
      [caller.memberId, requestId, action, payloadHash],
    );
    return asResult(rows.rows[0]?.result);
  } catch (error) {
    throw mapFinanceDeliveryError(error);
  }
}

async function save(
  db: CvDatabase,
  caller: DeliveryCaller,
  requestId: string,
  action: string,
  payloadHash: string,
  capability: string,
  response: FinanceMutationResult,
): Promise<FinanceMutationResult> {
  try {
    const rows = await db.query<QueryResult>(
      "select finance.save_recovery_mutation($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb) as result",
      [caller.memberId, requestId, action, payloadHash, capability, JSON.stringify(response)],
    );
    const saved = asResult(rows.rows[0]?.result);
    if (!saved) throw new FinanceError(503, UNAVAILABLE);
    return saved;
  } catch (error) {
    throw mapFinanceDeliveryError(error);
  }
}

function baseResult(caller: DeliveryCaller, extra: Partial<FinanceMutationResult>): FinanceMutationResult {
  return { ok: true, viewVersion: caller.viewVersion, warnings: [], errors: [], ...extra };
}

function requireUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(400, message);
  return value;
}

export async function performDeliveryMutation(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  caller: DeliveryCaller,
  body: Record<string, unknown>,
  deps: {
    send: FinanceMailSender;
    env: NodeJS.ProcessEnv;
    inlineLimit?: number;
    log?: FinanceLog;
    now?: () => Date;
  },
): Promise<FinanceMutationResult> {
  const action = body.action;
  const requestId = requireUuid(body.requestId, "A valid request ID is required.");
  try {
    if (action === "downloadExport") return downloadExport(db, storage, caller, body);
    if (action === "exportPurchases") return exportPurchases(db, storage, caller, requestId, deps.inlineLimit ?? FINANCE_EXPORT_INLINE_LIMIT);
    if (action === "retryOutbox") return retryOutbox(db, caller, requestId, body, deps);
    if (action === "cleanupUploads") return cleanupUploads(db, storage, caller, requestId, body, deps.now ?? (() => new Date()), deps.log);
  } catch (error) {
    throw mapFinanceDeliveryError(error);
  }
  throw new FinanceError(400, "Unknown request.");
}

async function downloadExport(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  caller: DeliveryCaller,
  body: Record<string, unknown>,
): Promise<FinanceMutationResult> {
  if (!caller.capabilities.purchaseRegister) throw new FinanceError(403, "Finance access is required.");
  if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
  const exportId = requireUuid(body.exportId, "A valid export ID is required.");
  const rows = await db.query<{ storage_key: string; file_name: string }>(
    "select storage_key, file_name from finance.export_objects where id = $1::uuid",
    [exportId],
  );
  const row = rows.rows[0];
  if (!row) throw new FinanceError(404, "Export not found.");
  const downloadUrl = await storage.presignGet(row.storage_key, row.file_name, "text/csv");
  return baseResult(caller, { downloadUrl });
}

async function exportPurchases(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  caller: DeliveryCaller,
  requestId: string,
  inlineLimit: number,
): Promise<FinanceMutationResult> {
  const payloadHash = hashRecoveryPayload({ action: "exportPurchases" });
  const existing = await replay(db, caller, requestId, "exportPurchases", payloadHash);
  if (existing) return existing;
  if (!caller.seasonCode) throw new FinanceError(409, "An operator has not configured the current season.");
  const exported = await buildPurchaseExport(db, caller.seasonCode);
  // The manifest is built from an explicit allowlist that excludes refund fields.
  // Do not reject user-supplied text merely because it names those fields.
  if (/X-Amz-|AWSAccessKeyId=/i.test(exported.csv)) {
    throw new FinanceError(400, "The export could not be prepared.");
  }
  if (exported.byteSize <= inlineLimit) {
    return save(db, caller, requestId, "exportPurchases", payloadHash, "purchaseRegister", baseResult(caller, {
      exportFile: {
        fileName: exported.fileName,
        csv: exported.csv,
        byteSize: exported.byteSize,
        contentSha256: exported.contentSha256,
        delivery: "inline",
      },
    }));
  }
  if (exported.byteSize > FINANCE_EXPORT_PRIVATE_LIMIT) throw new FinanceError(413, "The export is too large.");
  if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
  const exportId = randomUUID();
  const storageKey = storage.exportKey(caller.memberId, exportId);
  const bytes = new Uint8Array(Buffer.from(exported.csv, "utf8"));
  try {
    await storage.putObject(storageKey, bytes, "text/csv");
  } catch (error) {
    if (error instanceof FinanceStorageUncertainError) {
      throw new FinanceError(503, "The export could not be confirmed in private storage.");
    }
    throw new FinanceError(503, "The export could not be stored.");
  }
  try {
    await db.query(
      "select finance.store_export_object($1::uuid, $2::uuid, $3, $4, $5::bigint)",
      [caller.memberId, exportId, storageKey, exported.contentSha256, exported.byteSize],
    );
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw mapFinanceDeliveryError(error);
  }
  return save(db, caller, requestId, "exportPurchases", payloadHash, "purchaseRegister", baseResult(caller, {
    exportFile: {
      fileName: exported.fileName,
      exportId,
      byteSize: exported.byteSize,
      contentSha256: exported.contentSha256,
      delivery: "private",
    },
  }));
}

async function retryOutbox(
  db: CvDatabase,
  caller: DeliveryCaller,
  requestId: string,
  body: Record<string, unknown>,
  deps: { send: FinanceMailSender; env: NodeJS.ProcessEnv; log?: FinanceLog },
): Promise<FinanceMutationResult> {
  const outboxId = body.outboxId === undefined || body.outboxId === null ? null : requireUuid(body.outboxId, "A valid delivery ID is required.");
  const reconciliation = body.reconciliation === undefined || body.reconciliation === null ? null : String(body.reconciliation);
  if (reconciliation !== null && !RECONCILE.has(reconciliation)) throw new FinanceError(400, "Unknown delivery observation.");
  const payloadHash = hashRecoveryPayload({ action: "retryOutbox", outboxId, reconciliation });
  const existing = await replay(db, caller, requestId, "retryOutbox", payloadHash);
  if (existing) return existing;
    if (reconciliation) {
    if (!outboxId) throw new FinanceError(400, "A valid delivery ID is required.");
    let status: string;
    try {
      status = await reconcileOutboxDelivery(db, outboxId, reconciliation as "sent" | "not_sent" | "still_unknown");
    } catch (error) {
      throw mapFinanceDeliveryError(error);
    }
    const message = status === "uncertain"
      ? "The delivery outcome is still unknown. It was not retried."
      : status === "sent"
        ? "The delivery was recorded as sent and was not retried."
        : "The delivery was recorded as not sent. Run delivery again to retry it.";
    deps.log?.(financeLogLine({ event: "finance_reconcile", outbox: outboxId, outcome: status }));
    return save(db, caller, requestId, "retryOutbox", payloadHash, "purchaseRegister", baseResult(caller, {
      recovery: { sent: 0, failed: 0, uncertain: status === "uncertain" ? 1 : 0, skipped: status === "sent" ? 1 : 0, deleted: 0, message },
    }));
  }
  const counts = await deliverPending(db, { ...deps, outboxId: outboxId ?? undefined });
  const message = counts.uncertain > 0
    ? "A delivery outcome is unknown. Reconcile it before retrying."
    : counts.sent > 0
      ? "Finance notifications were delivered."
      : counts.failed > 0
        ? "Some finance notifications were not delivered."
        : "No finance notifications were waiting.";
  return save(db, caller, requestId, "retryOutbox", payloadHash, "purchaseRegister", baseResult(caller, {
    recovery: { ...counts, deleted: 0, message },
  }));
}

async function cleanupUploads(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  caller: DeliveryCaller,
  requestId: string,
  body: Record<string, unknown>,
  now: () => Date,
  logger?: FinanceLog,
): Promise<FinanceMutationResult> {
  const uploadId = body.uploadId === undefined || body.uploadId === null ? null : requireUuid(body.uploadId, "A valid upload ID is required.");
  const reconciliation = body.reconciliation === undefined || body.reconciliation === null ? null : String(body.reconciliation);
  const reportUncertain = body.reportUncertain === true;
  if (reconciliation !== null && !UPLOAD_RECONCILE.has(reconciliation)) throw new FinanceError(400, "Unknown upload observation.");
  const payloadHash = hashRecoveryPayload({ action: "cleanupUploads", uploadId, reconciliation, reportUncertain });
  const existing = await replay(db, caller, requestId, "cleanupUploads", payloadHash);
  if (existing) return existing;
  if (!storage) throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
  if (reportUncertain) {
    if (!uploadId) throw new FinanceError(400, "A valid upload ID is required.");
    await db.query("select finance.mark_upload_commit_uncertain($1::uuid, $2::uuid)", [caller.memberId, uploadId]);
    logger?.(financeLogLine({ event: "finance_upload_uncertain", upload: uploadId }));
    return save(db, caller, requestId, "cleanupUploads", payloadHash, "purchaseRegister", baseResult(caller, {
      recovery: { sent: 0, failed: 0, uncertain: 1, skipped: 0, deleted: 0, message: "The upload commit is unknown. Reconcile it before deleting files." },
    }));
  }
  if (reconciliation) {
    if (!uploadId) throw new FinanceError(400, "A valid upload ID is required.");
    await db.query(
      "select finance.reconcile_upload_commit($1::uuid, $2::uuid, $3)",
      [caller.memberId, uploadId, reconciliation],
    );
    const uncertain = reconciliation === "still_unknown" ? 1 : 0;
    const message = uncertain
      ? "The upload commit is still unknown. Files were not deleted."
      : "The upload commit was reconciled. Files were not deleted by this step.";
    return save(db, caller, requestId, "cleanupUploads", payloadHash, "purchaseRegister", baseResult(caller, {
      recovery: { sent: 0, failed: 0, uncertain, skipped: uncertain ? 0 : 1, deleted: 0, message },
    }));
  }
  const listed = uploadId
    ? [uploadId]
    : (await db.query<{ upload_id: string }>(
      "select upload_id from finance.list_upload_cleanup_ids($1::uuid, $2::timestamptz, $3::interval, 50)",
      [caller.memberId, now().toISOString(), FINANCE_UPLOAD_CLEANUP_GRACE],
    )).rows.map((row) => row.upload_id);
  let deleted = 0;
  let failed = 0;
  let uncertain = 0;
  let skipped = 0;
  for (const id of listed) {
    const outcome = await cleanupOne(db, storage, caller.memberId, id, now(), uploadId !== null);
    if (outcome === "deleted") deleted += 1;
    else if (outcome === "failed") failed += 1;
    else if (outcome === "uncertain") {
      uncertain += 1;
      break;
    } else skipped += 1;
  }
  const message = uncertain > 0
    ? "Cleanup stopped for an unknown storage or commit outcome. Reconcile it before retrying."
    : deleted > 0
      ? "Expired uploads with no saved purchase were deleted."
      : "No expired uploads were ready for cleanup.";
  logger?.(financeLogLine({ event: "finance_cleanup", deleted: String(deleted), failed: String(failed), uncertain: String(uncertain) }));
  return save(db, caller, requestId, "cleanupUploads", payloadHash, "purchaseRegister", baseResult(caller, {
    recovery: { sent: 0, failed, uncertain, skipped, deleted, message },
  }));
}

async function cleanupOne(
  db: CvDatabase,
  storage: FinanceObjectStorage,
  actorId: string,
  uploadId: string,
  now: Date,
  strict: boolean,
): Promise<"deleted" | "failed" | "uncertain" | "skipped"> {
  let keys: { staging_key: string; final_key: string | null };
  try {
    const rows = await db.query<{ staging_key: string; final_key: string | null }>(
      "select staging_key, final_key from finance.begin_upload_cleanup($1::uuid, $2::uuid, $3::timestamptz, $4::interval)",
      [actorId, uploadId, now.toISOString(), FINANCE_UPLOAD_CLEANUP_GRACE],
    );
    const row = rows.rows[0];
    if (!row) return "skipped";
    keys = row;
  } catch (error) {
    const mapped = mapFinanceDeliveryError(error);
    if (!strict && mapped.status === 409 && /not ready|does not belong|saved with a purchase/i.test(mapped.message)) return "skipped";
    if (mapped.status === 409 && /unknown upload commit/i.test(mapped.message)) {
      if (strict) throw mapped;
      return "uncertain";
    }
    throw mapped;
  }
  const targets = [keys.staging_key, keys.final_key].filter((key): key is string => Boolean(key));
  for (const key of targets) {
    try {
      await storage.remove(key);
    } catch (error) {
      await db.query("select finance.mark_upload_delete_uncertain($1::uuid, $2::uuid)", [actorId, uploadId]).catch(() => undefined);
      if (error instanceof FinanceStorageUncertainError || error instanceof FinanceError) {
        if (strict) throw new FinanceError(409, "Reconcile the unknown upload commit before deleting files.");
        return "uncertain";
      }
      return "failed";
    }
  }
  try {
    await db.query("select finance.finish_upload_object_delete($1::uuid, $2::uuid)", [actorId, uploadId]);
  } catch (error) {
    const mapped = mapFinanceDeliveryError(error);
    if (mapped.status === 409) return "uncertain";
    throw mapped;
  }
  return "deleted";
}
