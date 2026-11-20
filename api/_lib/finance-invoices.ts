import { createHash, randomUUID } from "node:crypto";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import type { FinanceObjectStorage } from "./finance-storage.js";
import { FinanceError } from "./finance-error.js";
import {
  InvoiceTransferError,
  type FinanceDrive,
  type InvoiceSource,
} from "./finance-drive.js";
import type { FinanceMutationResult } from "./finance-types.js";
import type { ProjectBudgetInvoiceReference } from "../../src/features/Finance/project-budget-types.js";
import type {
  FinanceInvoiceRecoveryRow,
  InvoiceEvidenceSummary,
} from "../../src/features/Finance/invoice-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function viewVersion(db: CvDatabase) {
  return Number(
    (
      await db.query<{ version: string }>(
        "select version::text from finance.view_versions where singleton",
      )
    ).rows[0].version,
  );
}
const actor = (i: WorkspaceIdentity) => [i.userId, i.googleSub, i.email];
/** A partially deployed database must never create a private-only new invoice. */
export async function requireInvoiceTransferSchema(
  db: CvDatabase,
): Promise<void> {
  const ready = (
    await db.query<{ available: boolean }>(`select
 to_regprocedure('finance.claim_invoice_transfer(uuid,text,text,uuid,integer,text,text,uuid,boolean,uuid)') is not null
 and (select count(*)=2 from pg_trigger where tgrelid='finance.documents'::regclass
   and tgname in ('documents_verified_transfer','documents_enqueue_transfer') and tgenabled in ('O','A')) as available`)
  ).rows[0]?.available;
  if (ready !== true)
    throw new FinanceError(
      503,
      "Invoice storage setup is incomplete. Ask Finance to finish setup before registering a purchase.",
    );
}

function error(e: unknown): never {
  if (e instanceof FinanceError) throw e;
  const code = (e as { code?: string })?.code;
  if (code === "42501")
    throw new FinanceError(403, "Invoice access is no longer available.");
  if (code === "40001")
    throw new FinanceError(
      409,
      "Invoice transfer changed. Load the latest status and try again.",
    );
  if (code === "P0002") throw new FinanceError(404, "Invoice not found.");
  throw new FinanceError(
    503,
    "Invoice evidence is temporarily unavailable. Try again.",
  );
}
async function access(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  documentId: unknown,
  retry = false,
) {
  await requireInvoiceTransferSchema(db);
  if (typeof documentId !== "string" || !UUID.test(documentId))
    throw new FinanceError(400, "Choose a valid invoice.");
  const allowed = (
    await db.query<{ allowed: boolean }>(
      "select finance.invoice_document_access($1::uuid,$2,$3,$4::uuid,$5) as allowed",
      [...actor(identity), documentId, retry],
    )
  ).rows[0]?.allowed;
  if (!allowed)
    throw new FinanceError(403, "Invoice access is no longer available.");
  return documentId;
}
type EvidenceRow = {
  document_id: string;
  purchase_id: string;
  purchase_ref: string;
  original_name: string;
  storage_backend: "private_storage" | "google_drive";
  status: ProjectBudgetInvoiceReference["transferStatus"] | null;
  revision: number | null;
  drive_viewer_url: string | null;
  can_retry: boolean;
  retry_ready: boolean;
  entry_id?: string;
  attempts?: number;
  updated_at?: string;
  last_error?: string | null;
};
function reference(row: EvidenceRow): ProjectBudgetInvoiceReference {
  return {
    documentId: row.document_id,
    purchaseId: row.purchase_id,
    purchaseRef: row.purchase_ref,
    originalName: row.original_name,
    backend: row.storage_backend,
    transferStatus:
      row.storage_backend === "private_storage"
        ? "stored"
        : (row.status ?? "needs_attention"),
    transferRevision: row.revision,
    viewerUrl:
      row.storage_backend === "google_drive" && row.status === "stored"
        ? row.drive_viewer_url
        : null,
    canRetry: row.can_retry && row.retry_ready,
  };
}
const fields = `d.id::text document_id,d.purchase_id::text,p.public_ref purchase_ref,d.original_name,d.storage_backend,t.status,t.revision,d.drive_viewer_url,
 finance.invoice_document_access($1::uuid,$2,$3,d.id,true) can_retry,
 (t.status in ('pending','needs_attention') or (t.status='transferring' and t.lease_until<=clock_timestamp())) retry_ready`;
export async function loadBudgetEntryInvoiceReferences(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  entryIds: readonly string[],
): Promise<Map<string, ProjectBudgetInvoiceReference[]>> {
  const result = new Map<string, ProjectBudgetInvoiceReference[]>();
  await requireInvoiceTransferSchema(db);
  if (!entryIds.length) return result;
  const rows = (
    await db.query<EvidenceRow>(
      `select distinct a.budget_item_id::text entry_id,${fields}
 from finance.allocations a join finance.purchase_lines l on l.id=a.line_id join finance.purchases p on p.id=l.purchase_id
 join finance.documents d on d.purchase_id=p.id left join finance.invoice_transfers t on t.document_id=d.id
 where a.budget_item_id=any($4::uuid[]) and finance.invoice_document_access($1::uuid,$2,$3,d.id,false) order by d.id::text`,
      [...actor(identity), entryIds],
    )
  ).rows;
  for (const row of rows) {
    const group = result.get(row.entry_id!) ?? [];
    group.push(reference(row));
    result.set(row.entry_id!, group);
  }
  return result;
}
export async function loadPurchaseInvoiceReferences(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  purchaseIds: string[],
): Promise<Map<string, ProjectBudgetInvoiceReference>> {
  const result = new Map<string, ProjectBudgetInvoiceReference>();
  await requireInvoiceTransferSchema(db);
  if (!purchaseIds.length) return result;
  for (const row of (
    await db.query<EvidenceRow>(
      `select ${fields} from finance.documents d join finance.purchases p on p.id=d.purchase_id
 left join finance.invoice_transfers t on t.document_id=d.id where d.purchase_id=any($4::uuid[]) and finance.invoice_document_access($1::uuid,$2,$3,d.id,false)`,
      [...actor(identity), purchaseIds],
    )
  ).rows)
    result.set(row.document_id, reference(row));
  return result;
}
export async function loadInvoiceRecovery(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  after?: string,
): Promise<{
  invoiceTransfers: FinanceInvoiceRecoveryRow[];
  invoiceNextCursor: string | null;
}> {
  await requireInvoiceTransferSchema(db);
  if (after && !UUID.test(after))
    throw new FinanceError(400, "Choose a valid invoice page.");
  const rows = (
    await db.query<EvidenceRow>(
      `select ${fields},t.attempts,t.updated_at::text,t.last_error from finance.invoice_transfers t
 join finance.documents d on d.id=t.document_id join finance.purchases p on p.id=d.purchase_id
 where t.status<>'stored' and finance.invoice_document_access($1::uuid,$2,$3,d.id,true)
 and ($4::uuid is null or d.id>$4::uuid) order by d.id limit 51`,
      [...actor(identity), after ?? null],
    )
  ).rows;
  return {
    invoiceTransfers: rows.slice(0, 50).map((row) => ({
      ...reference(row),
      transferRevision: Number(row.revision),
      attempts: Number(row.attempts),
      updatedAt: row.updated_at!,
      safeError: row.last_error ?? null,
    })),
    invoiceNextCursor: rows.length > 50 ? rows[49].document_id : null,
  };
}
export async function openInvoice(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  identity: WorkspaceIdentity,
  documentId: unknown,
): Promise<FinanceMutationResult> {
  const id = await access(db, identity, documentId);
  const row = (
    await db.query<{
      storage_backend: string;
      status: string;
      drive_viewer_url: string | null;
      storage_key: string;
      original_name: string;
      content_type: string;
    }>(
      `select d.*,t.status from finance.documents d left join finance.invoice_transfers t on t.document_id=d.id where d.id=$1::uuid`,
      [id],
    )
  ).rows[0];
  if (row.storage_backend === "google_drive") {
    if (row.status !== "stored" || !row.drive_viewer_url)
      throw new FinanceError(
        409,
        "The purchase is saved. Its invoice is not yet confirmed in Drive. Check the transfer status or ask Finance to retry.",
      );
    await access(db, identity, id);
    return {
      ok: true,
      viewVersion: await viewVersion(db),
      viewerUrl: row.drive_viewer_url,
      warnings: [],
      errors: [],
    };
  }
  if (!storage)
    throw new FinanceError(
      503,
      "Private invoice storage is unavailable. Try again later.",
    );
  const downloadUrl = await storage.presignGet(
    row.storage_key,
    row.original_name,
    row.content_type,
  );
  await access(db, identity, id);
  return {
    ok: true,
    viewVersion: await viewVersion(db),
    downloadUrl,
    warnings: [],
    errors: [],
  };
}
type Job = {
  document_id: string;
  status: string;
  revision: number;
  staging_key: string;
  content_sha256: string;
  drive_id: string | null;
  folder_id: string | null;
  drive_file_id: string | null;
  resumable_session_uri: string | null;
  confirmed_bytes: number;
  byte_size: number;
  content_type: string;
  original_name: string;
  done?: boolean;
  busy?: boolean;
  attention?: boolean;
  replayed?: boolean;
};
async function boundedRead(
  storage: FinanceObjectStorage,
  key: string,
  size: number,
  deadline: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      storage.readObject(key, size),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new InvoiceTransferError("source_unavailable")),
          Math.max(1, Math.min(5000, deadline - Date.now())),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export interface InvoiceDispatcher {
  drive: FinanceDrive | null;
  storage: FinanceObjectStorage | null;
  budgetMs?: number;
  now?: () => number;
}
/** Leases fence progress; all network calls are outside DB transactions and every advancement rechecks authority. */
export async function transferInvoice(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  documentId: string,
  deps: InvoiceDispatcher,
  expectedRevision: number | null = null,
  manual = false,
  deadline = Date.now() + 15_000,
  retryRequest: string | null = null,
): Promise<void> {
  const token = randomUUID();
  let job: Job;
  try {
    job = (
      await db.query<{ job: Job }>(
        "select finance.claim_invoice_transfer($1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8::uuid,$9,$10::uuid) job",
        [
          ...actor(identity),
          documentId,
          expectedRevision,
          deps.drive?.destination.driveId ?? null,
          deps.drive?.destination.folderId ?? null,
          token,
          manual,
          retryRequest,
        ],
      )
    ).rows[0].job;
  } catch (e) {
    error(e);
  }
  if (job.done || job.busy || job.attention || job.replayed) return;
  async function advance(change: Record<string, unknown>) {
    const updated = (
      await db.query<{ job: Job }>(
        "select finance.advance_invoice_transfer($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::jsonb) job",
        [
          ...actor(identity),
          documentId,
          token,
          job.revision,
          JSON.stringify(change),
        ],
      )
    ).rows[0].job;
    job = { ...job, ...updated };
  }
  try {
    if (!deps.drive || !job.drive_id || !job.folder_id)
      throw new InvoiceTransferError("configuration_missing");
    if (!deps.storage) throw new InvoiceTransferError("source_unavailable");
    const drive = deps.drive;
    if (!job.drive_file_id)
      await advance({
        action: "reserve",
        fileId: await drive.generateId(deadline),
      });
    const source: InvoiceSource = {
      documentId,
      fileId: job.drive_file_id!,
      driveId: job.drive_id!,
      folderId: job.folder_id!,
      name: job.original_name,
      contentType: job.content_type,
      byteSize: Number(job.byte_size),
      sha256: job.content_sha256,
    };
    async function reconcile() {
      const file = await drive.lookup(source.fileId, deadline);
      if (!file) return false;
      await drive.verify(source, file, deadline);
      await advance({
        action: "stored",
        fileId: source.fileId,
        sha256: source.sha256,
      });
      return true;
    }
    if (await reconcile()) return;
    await drive.validateDestination(source.driveId, source.folderId, deadline);
    let bytes: Uint8Array;
    try {
      bytes = await boundedRead(
        deps.storage,
        job.staging_key,
        source.byteSize,
        deadline,
      );
    } catch {
      throw new InvoiceTransferError("source_unavailable");
    }
    if (
      bytes.byteLength !== source.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== source.sha256
    )
      throw new InvoiceTransferError("source_mismatch");
    if (job.resumable_session_uri) {
      const state = await drive.probe(
        job.resumable_session_uri,
        source.byteSize,
        deadline,
      );
      if (state.done) {
        if (!(await reconcile()))
          throw new InvoiceTransferError("transfer_uncertain");
        return;
      }
      if (state.expired) await advance({ action: "reset" });
      else await advance({ action: "progress", bytes: state.confirmedBytes });
    }
    if (!job.resumable_session_uri)
      await advance({
        action: "session",
        uri: await drive.begin(source, deadline),
      });
    while (Number(job.confirmed_bytes) < source.byteSize) {
      if (Date.now() + 5500 >= deadline) {
        await advance({ action: "yield" });
        return;
      }
      const offset = Number(job.confirmed_bytes),
        chunk = bytes.subarray(
          offset,
          Math.min(offset + 1024 * 1024, bytes.length),
        );
      const state = await drive.upload(
        job.resumable_session_uri!,
        chunk,
        offset,
        source.byteSize,
        deadline,
      );
      if (state.expired) {
        await advance({ action: "reset" });
        await advance({ action: "yield" });
        return;
      }
      if (state.done) {
        if (!(await reconcile()))
          throw new InvoiceTransferError("transfer_uncertain");
        return;
      }
      if (state.confirmedBytes <= offset)
        throw new InvoiceTransferError("transfer_uncertain");
      await advance({ action: "progress", bytes: state.confirmedBytes });
    }
    if (!(await reconcile()))
      throw new InvoiceTransferError("transfer_uncertain");
  } catch (e) {
    // A lost upload response (including 409) can still be confirmed under the preallocated ID.
    if (
      deps.drive &&
      job.drive_file_id &&
      job.drive_id &&
      job.folder_id &&
      Date.now() + 5500 < deadline &&
      !(
        e instanceof InvoiceTransferError &&
        [
          "source_mismatch",
          "provider_mismatch",
          "configuration_missing",
        ].includes(e.safeError)
      )
    ) {
      try {
        const source: InvoiceSource = {
          documentId,
          fileId: job.drive_file_id,
          driveId: job.drive_id,
          folderId: job.folder_id,
          name: job.original_name,
          contentType: job.content_type,
          byteSize: Number(job.byte_size),
          sha256: job.content_sha256,
        };
        const file = await deps.drive.lookup(source.fileId, deadline);
        if (file) {
          await deps.drive.verify(source, file, deadline);
          await advance({
            action: "stored",
            fileId: source.fileId,
            sha256: source.sha256,
          });
          return;
        }
      } catch (reconcileError) {
        if (
          reconcileError instanceof InvoiceTransferError &&
          reconcileError.safeError === "provider_mismatch"
        )
          e = reconcileError;
      }
    }
    try {
      await advance({
        action: "fail",
        error:
          e instanceof InvoiceTransferError
            ? e.safeError
            : "transfer_uncertain",
      });
    } catch (advanceError) {
      error(advanceError);
    } // Lost authority/lease is never hidden as success.
  }
}
export async function invoiceSummary(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  purchaseId: string,
): Promise<InvoiceEvidenceSummary> {
  const allowed = (
    await db.query<{ allowed: boolean; count: string }>(
      `select bool_and(finance.invoice_document_access($1::uuid,$2,$3,d.id,true)) allowed,count(*)::text from finance.documents d where d.purchase_id=$4::uuid`,
      [...actor(identity), purchaseId],
    )
  ).rows[0];
  if (!allowed?.allowed || allowed.count === "0")
    throw new FinanceError(
      403,
      "Purchase invoice access is no longer available.",
    );
  const summary = { pending: 0, transferring: 0, stored: 0, needsAttention: 0 };
  const rows = (
    await db.query<{ status: string; count: string }>(
      `select t.status,count(*)::text from finance.invoice_transfers t join finance.documents d on d.id=t.document_id
 where d.purchase_id=$4::uuid and finance.invoice_document_access($1::uuid,$2,$3,d.id,true) group by t.status`,
      [...actor(identity), purchaseId],
    )
  ).rows;
  for (const row of rows) {
    const key =
      row.status === "needs_attention" ? "needsAttention" : row.status;
    if (key in summary)
      summary[key as keyof InvoiceEvidenceSummary] = Number(row.count);
  }
  return summary;
}
export async function dispatchPurchaseInvoices(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  purchaseId: string,
  deps: InvoiceDispatcher,
): Promise<InvoiceEvidenceSummary> {
  await requireInvoiceTransferSchema(db);
  if (!UUID.test(purchaseId))
    throw new FinanceError(400, "Choose a valid purchase.");
  const all = (
    await db.query<{ id: string; allowed: boolean }>(
      `select d.id::text,finance.invoice_document_access($1::uuid,$2,$3,d.id,true) allowed from finance.documents d where d.purchase_id=$4::uuid`,
      [...actor(identity), purchaseId],
    )
  ).rows;
  if (!all.length || all.some((d) => !d.allowed))
    throw new FinanceError(
      403,
      "Purchase invoice access is no longer available.",
    );
  const waiting = (
    await db.query<{ document_id: string }>(
      `select t.document_id::text from finance.invoice_transfers t join finance.documents d on d.id=t.document_id
 where d.purchase_id=$1::uuid and (t.status='pending' or (t.status='transferring' and t.lease_until<=clock_timestamp())) order by t.attempts,t.updated_at,t.document_id`,
      [purchaseId],
    )
  ).rows;
  const deadline = Date.now() + (deps.budgetMs ?? 15_000);
  for (const row of waiting) {
    if (Date.now() + 5500 >= deadline) break;
    await transferInvoice(
      db,
      identity,
      row.document_id,
      deps,
      null,
      false,
      deadline,
    );
  }
  return invoiceSummary(db, identity, purchaseId);
}
export async function mutateInvoice(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  body: Record<string, unknown>,
  deps: InvoiceDispatcher,
): Promise<FinanceMutationResult> {
  if (body.action === "downloadDocument")
    return openInvoice(db, deps.storage, identity, body.documentId);
  if (body.action === "continueInvoiceTransfers") {
    const invoiceEvidence = await dispatchPurchaseInvoices(
      db,
      identity,
      String(body.purchaseId),
      deps,
    );
    return {
      ok: true,
      viewVersion: await viewVersion(db),
      invoiceEvidence,
      warnings: [],
      errors: [],
    };
  }
  const id = await access(db, identity, body.documentId, true);
  if (
    typeof body.expectedRevision !== "number" ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0 ||
    typeof body.requestId !== "string" ||
    !UUID.test(body.requestId)
  )
    throw new FinanceError(
      400,
      "A valid invoice revision and request ID are required.",
    );
  await transferInvoice(
    db,
    identity,
    id,
    deps,
    body.expectedRevision,
    true,
    Date.now() + (deps.budgetMs ?? 15_000),
    body.requestId,
  );
  const row = (
    await db.query<{ purchase_id: string }>(
      "select purchase_id::text from finance.documents where id=$1::uuid",
      [id],
    )
  ).rows[0];
  return {
    ok: true,
    viewVersion: await viewVersion(db),
    id,
    purchaseId: row.purchase_id,
    invoiceEvidence: await invoiceSummary(db, identity, row.purchase_id),
    warnings: [],
    errors: [],
  };
}
