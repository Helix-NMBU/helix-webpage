import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import {
  dispatchPurchaseInvoices,
  loadBudgetEntryInvoiceReferences,
  loadInvoiceRecovery,
  mutateInvoice,
  openInvoice,
  transferInvoice,
} from "../../../api/_lib/finance-invoices.js";
import {
  InvoiceTransferError,
  type FinanceDrive,
  type InvoiceSource,
  type DriveFile,
} from "../../../api/_lib/finance-drive.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import {
  applyProjectBudgetMigrations,
  projectBudgetFixture as f,
  projectBudgetIdentity,
  seedProjectBudgetLegacy,
  setupProjectBudgetBase,
  type ProjectBudgetFixtureRole,
  type ProjectBudgetTestDatabase,
} from "./project-budget-test-db.js";
import { createMemoryFinanceStorage } from "./finance-storage-mock.js";
import { osloToday } from "../../../src/features/Finance/money.js";
const url = process.env.FINANCE_TEST_POSTGRES_URL,
  name = `finance_invoice_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Client,
  pool: pg.Pool,
  close: (() => Promise<void>) | undefined,
  db: ProjectBudgetTestDatabase;
const storage = createMemoryFinanceStorage();
function driveFixture() {
  const files = new Map<string, DriveFile>(),
    sources = new Map<string, InvoiceSource>();
  let counter = 0;
  const prefix = randomUUID().replaceAll("-", "");
  const drive: FinanceDrive = {
    destination: { driveId: "sharedDrive1", folderId: "invoiceFolder1" },
    generateId: vi.fn(async () => `generated_file_${prefix}_${++counter}`),
    validateDestination: vi.fn(async () => {}),
    lookup: vi.fn(async (id) => files.get(id) ?? null),
    verify: vi.fn(async (source, file) => {
      if (
        file.id !== source.fileId ||
        file.driveId !== source.driveId ||
        file.parents[0] !== source.folderId ||
        file.sha256Checksum !== source.sha256
      )
        throw new InvoiceTransferError("provider_mismatch");
    }),
    begin: vi.fn(async (source) => {
      sources.set(source.fileId, source);
      return `https://www.googleapis.com/upload/drive/v3/files?upload_id=${source.fileId}`;
    }),
    probe: vi.fn(async () => ({ done: false, confirmedBytes: 0 })),
    upload: vi.fn(async (uri, bytes, offset, total) => {
      const id = new URL(uri).searchParams.get("upload_id")!,
        s = sources.get(id)!;
      if (offset + bytes.length === total) {
        files.set(id, {
          id,
          driveId: s.driveId,
          parents: [s.folderId],
          mimeType: s.contentType,
          size: String(total),
          sha256Checksum: s.sha256,
          appProperties: { financeDocumentId: s.documentId, sha256: s.sha256 },
        });
        return { done: true, confirmedBytes: total };
      }
      return { done: false, confirmedBytes: offset + bytes.length };
    }),
  };
  return { drive, files, sources };
}
function service(drive: FinanceDrive | null = null, budgetMs = 1) {
  return createFinanceServices({
    db,
    financeStorage: storage,
    financeDrive: drive,
    invoiceBudgetMs: budgetMs,
    authenticate: async (token) =>
      projectBudgetIdentity(token as ProjectBudgetFixtureRole),
  });
}
async function upload(size = 8) {
  const services = service(),
    bind = { projectId: f.project, responsibleDepartmentId: f.department };
  const auth = await services.mutate("departmentLead", {
    action: "authorizeProjectPurchaseUpload",
    ...bind,
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: size,
    requestId: randomUUID(),
  });
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.4"));
  storage.objects.set(auth.stagingKey!, bytes);
  await services.mutate("departmentLead", {
    action: "finalizeProjectPurchaseUpload",
    ...bind,
    uploadId: auth.id,
    requestId: randomUUID(),
  });
  return auth.id!;
}
async function register(
  options: {
    drive?: FinanceDrive | null;
    count?: number;
    size?: number;
    budgetMs?: number;
  } = {},
) {
  const uploads = [];
  for (let i = 0; i < (options.count ?? 1); i++)
    uploads.push(await upload(options.size));
  const services = service(options.drive, options.budgetMs ?? 1);
  const result = await services.mutate("departmentLead", {
    action: "registerProjectPurchase",
    projectId: f.project,
    responsibleDepartmentId: f.department,
    requestId: randomUUID(),
    purchase: {
      buyerName: "Buyer",
      supplierName: "Supplier",
      paymentMethod: "team_account",
      purchaseDate: osloToday(),
      justification: "Incurred project expense",
      documentKind: "receipt",
      uploadIds: uploads,
      lines: [
        {
          systemId: f.system,
          unbudgeted: true,
          description: "Unplanned materials",
          quantity: "1",
          amountNok: "10.00",
        },
      ],
    },
  });
  const docs = (
    await db.query<{ id: string }>(
      "select id::text from finance.documents where purchase_id=$1::uuid order by id",
      [result.id],
    )
  ).rows;
  return { result, documents: docs.map((d) => d.id), uploads };
}
async function job(id: string) {
  return (
    await db.query<{
      status: string;
      revision: number;
      drive_id: string | null;
      folder_id: string | null;
      drive_file_id: string | null;
      staging_key: string;
      content_sha256: string;
      attempts: number;
      resumable_session_uri: string | null;
      confirmed_bytes: string;
      lease_token: string | null;
    }>("select * from finance.invoice_transfers where document_id=$1::uuid", [
      id,
    ])
  ).rows[0];
}
const lead = projectBudgetIdentity("departmentLead"),
  finance = projectBudgetIdentity("finance");
describe.skipIf(!url)("durable invoice evidence on PostgreSQL", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) ||
      connection.pathname !== "/postgres"
    )
      throw new Error("Use task-local loopback PostgreSQL.");
    admin = new pg.Client({ connectionString: connection.href });
    await admin.connect();
    await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({
      connectionString: connection.href,
      max: 6,
    });
    pool = resource.pool;
    close = resource.close;
    db = {
      exec: (sql) => pool.query(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pool.query(sql, params)).rows as T[],
      }),
    };
    await setupProjectBudgetBase(db);
    await seedProjectBudgetLegacy(db);
    await applyProjectBudgetMigrations(db);
    await db.query(
      "insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid)",
      [f.head],
    );
  }, 30000);
  afterAll(async () => {
    try {
      await close?.();
      if (admin) await admin.query(`drop database if exists ${name}`);
    } finally {
      await admin?.end();
    }
  });
  it("commits every job with the expense, preserves immutable final bytes, and automatically transfers all invoices", async () => {
    const fake = driveFixture();
    const { result, documents, uploads } = await register({
      drive: fake.drive,
      count: 3,
      budgetMs: 30000,
    });
    expect(result.invoiceEvidence).toEqual({
      pending: 0,
      transferring: 0,
      stored: 3,
      needsAttention: 0,
    });
    expect(fake.drive.generateId).toHaveBeenCalledTimes(3);
    for (const id of documents) {
      const value = await job(id);
      expect(value.status).toBe("stored");
      expect(value.staging_key).toContain("/final/");
      expect(value.staging_key).not.toContain("/staging/");
      const download = await openInvoice(
        db,
        storage,
        projectBudgetIdentity("lead"),
        id,
      );
      expect(download.viewerUrl).toMatch(
        /^https:\/\/drive.google.com\/file\/d\/generated_file_/,
      );
      expect(download.downloadUrl).toBeUndefined();
    }
    const linked = (
      await db.query<{ count: string }>(
        "select count(*)::text from finance.uploads where id=any($1::uuid[]) and purchase_id=$2::uuid",
        [uploads, result.id],
      )
    ).rows[0];
    expect(linked.count).toBe("3");
  });
  it("saves actuals during missing configuration, records attention for every invoice, and never exposes private new bytes as fallback", async () => {
    const { result, documents } = await register({ count: 2, budgetMs: 30000 });
    expect(result.invoiceEvidence?.needsAttention).toBe(2);
    expect((await job(documents[0])).drive_id).toBeNull();
    await expect(
      openInvoice(db, storage, lead, documents[0]),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db.query<{ status: string }>(
          "select status from finance.purchases where id=$1::uuid",
          [result.id],
        )
      ).rows[0].status,
    ).toBe("registered");
    const rows = await loadInvoiceRecovery(db, finance);
    expect(
      rows.invoiceTransfers.filter((d) => documents.includes(d.documentId)),
    ).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toMatch(
      /staging_key|storage_key|sharedDrive1|resumable_session_uri/,
    );
  });
  it("retries after setup, binds a destination once, and replays the same retry request without duplicate files or audit", async () => {
    const { documents } = await register({ budgetMs: 30000 }),
      id = documents[0],
      fake = driveFixture();
    const request = {
      action: "retryInvoiceTransfer",
      documentId: id,
      expectedRevision: (await job(id)).revision,
      requestId: randomUUID(),
    };
    await mutateInvoice(db, finance, request, { drive: fake.drive, storage });
    const count = (
      await db.query<{ count: string }>(
        "select count(*)::text from finance.invoice_transfer_events where document_id=$1::uuid",
        [id],
      )
    ).rows[0].count;
    await mutateInvoice(db, finance, request, { drive: fake.drive, storage });
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    expect((await job(id)).drive_id).toBe("sharedDrive1");
    expect(
      (
        await db.query<{ count: string }>(
          "select count(*)::text from finance.invoice_transfer_events where document_id=$1::uuid",
          [id],
        )
      ).rows[0].count,
    ).toBe(count);
    await expect(
      db.query(
        "update finance.invoice_transfers set folder_id='differentFolder' where document_id=$1::uuid",
        [id],
      ),
    ).rejects.toMatchObject({ message: "invoice_immutable_evidence" });
  });
  it("leases one independent worker and fences stale progress without duplicate generation", async () => {
    const { documents } = await register(),
      id = documents[0],
      fake = driveFixture();
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((r) => (started = r)),
      gate = new Promise<void>((r) => (release = r));
    const original = fake.drive.generateId;
    fake.drive.generateId = vi.fn(async () => {
      started();
      await gate;
      return original();
    });
    const first = transferInvoice(
      db,
      lead,
      id,
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 30000,
    );
    await entered;
    await transferInvoice(db, finance, id, { drive: fake.drive, storage });
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect((await job(id)).attempts).toBe(1);
    await expect(
      db.query(
        'select finance.advance_invoice_transfer($1::uuid,$2,$3,$4::uuid,$5::uuid,0,\'{"action":"yield"}\')',
        [finance.userId, finance.googleSub, finance.email, id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("recovers a lost upload response by verifying the reserved file ID and digest", async () => {
    const { documents } = await register(),
      fake = driveFixture(),
      original = fake.drive.upload;
    fake.drive.upload = vi.fn(async (...args: Parameters<FinanceDrive["upload"]>) => {
      await original(...args);
      throw new InvoiceTransferError("transfer_uncertain");
    });
    await transferInvoice(
      db,
      lead,
      documents[0],
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 30000,
    );
    expect((await job(documents[0])).status).toBe("stored");
    expect(fake.files.size).toBe(1);
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
  });
  it("resumes partial progress and expires a session using the same persisted ID and destination", async () => {
    const { documents } = await register({ size: 2 * 1024 * 1024 }),
      id = documents[0],
      fake = driveFixture();
    await transferInvoice(
      db,
      lead,
      id,
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 5500,
    );
    const pending = await job(id);
    expect(pending.status).toBe("pending");
    expect(pending.resumable_session_uri).toBeTruthy();
    fake.drive.probe = vi.fn(async () => ({
      done: false,
      expired: true,
      confirmedBytes: 0,
    }));
    fake.drive.destination.folderId = "changedConfig";
    await transferInvoice(
      db,
      lead,
      id,
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 30000,
    );
    expect((await job(id)).status).toBe("stored");
    expect((await job(id)).folder_id).toBe("invoiceFolder1");
    expect(fake.drive.begin).toHaveBeenCalledTimes(2);
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    expect(fake.drive.upload).toHaveBeenCalledTimes(2);
  });
  it("keeps mismatched existing files in attention instead of treating 409/existence as confirmation", async () => {
    const { documents } = await register(),
      id = documents[0],
      fake = driveFixture();
    fake.drive.lookup = vi.fn(async (fileId) => ({
      id: fileId,
      driveId: "anotherDrive",
      parents: ["anotherFolder"],
      mimeType: "application/pdf",
      size: "8",
      sha256Checksum: "wrong",
    }));
    await transferInvoice(db, lead, id, { drive: fake.drive, storage });
    expect((await job(id)).status).toBe("needs_attention");
    expect(fake.drive.begin).not.toHaveBeenCalled();
    await expect(openInvoice(db, storage, lead, id)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("refuses corrupted immutable source, retains the expense and does not start external upload", async () => {
    const { documents, result } = await register(),
      id = documents[0],
      fake = driveFixture(),
      source = await job(id);
    storage.objects.set(
      source.staging_key,
      new TextEncoder().encode("not a PDF"),
    );
    await transferInvoice(db, lead, id, { drive: fake.drive, storage });
    expect((await job(id)).status).toBe("needs_attention");
    expect(fake.drive.begin).not.toHaveBeenCalled();
    expect(
      (
        await db.query<{ count: string }>(
          "select count(*)::text from finance.purchases where id=$1::uuid",
          [result.id],
        )
      ).rows[0].count,
    ).toBe("1");
  });
  it("rechecks Google linkage during an in-flight transfer, with Finance recovery after revocation", async () => {
    const { documents } = await register(),
      id = documents[0],
      fake = driveFixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      started = new Promise<void>((r) => (entered = r));
    const lookup = fake.drive.lookup;
    fake.drive.lookup = vi.fn(async (fileId) => {
      entered();
      await gate;
      return lookup(fileId);
    });
    const pending = transferInvoice(db, lead, id, {
      drive: fake.drive,
      storage,
    });
    await started;
    await db.query('delete from neon_auth.account where "userId"=$1::uuid', [
      lead.userId,
    ]);
    release();
    await expect(pending).rejects.toMatchObject({ status: 403 });
    await expect(openInvoice(db, storage, lead, id)).rejects.toMatchObject({
      status: 403,
    });
    await db.query(
      "update finance.invoice_transfers set lease_until=clock_timestamp()-interval '1 second' where document_id=$1::uuid",
      [id],
    );
    fake.drive.lookup = lookup;
    await dispatchPurchaseInvoices(
      db,
      finance,
      (
        await db.query<{ purchase_id: string }>(
          "select purchase_id::text from finance.documents where id=$1::uuid",
          [id],
        )
      ).rows[0].purchase_id,
      { drive: fake.drive, storage, budgetMs: 30000 },
    );
    expect((await job(id)).status).toBe("stored");
    await db.query(
      "insert into neon_auth.account values($1::uuid,$1::uuid,'google',$2)",
      [lead.userId, lead.googleSub],
    );
  });
  it("preserves historical private evidence and prevents mixed-project invoice disclosure", async () => {
    const legacy = await openInvoice(db, storage, finance, f.document);
    expect(legacy.downloadUrl).toContain("legacy/private/invoice.pdf");
    expect(legacy.viewerUrl).toBeUndefined();
    await expect(
      openInvoice(db, storage, projectBudgetIdentity("outsider"), f.document),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      openInvoice(db, storage, projectBudgetIdentity("lead"), f.document),
    ).rejects.toMatchObject({ status: 403 });
    const refs = await loadBudgetEntryInvoiceReferences(
      db,
      projectBudgetIdentity("outsider"),
      [f.entry],
    );
    expect(refs.size).toBe(0);
  });
  it("rejects raw unverified evidence atomically, with neither document nor orphan job", async () => {
    const before = (
      await db.query<{ count: string }>(
        "select count(*)::text from finance.invoice_transfers",
      )
    ).rows[0].count;
    await expect(
      db.query(
        "insert into finance.documents(purchase_id,public_ref,kind,original_name,content_type,byte_size,content_sha256,storage_key) values($1::uuid,'UNVERIFIED','invoice','invoice.pdf','application/pdf',8,repeat('a',64),'mutable/staging/file')",
        [f.purchase],
      ),
    ).rejects.toThrow(/verified finalized upload/);
    expect(
      (
        await db.query<{ count: string }>(
          "select count(*)::text from finance.invoice_transfers",
        )
      ).rows[0].count,
    ).toBe(before);
  });
  it("supports fifteen invoices and a 10 MiB file while rejecting over-limit metadata and another owner's upload", async () => {
    const fake = driveFixture();
    const many = await register({
      count: 15,
      drive: fake.drive,
      budgetMs: 30000,
    });
    expect(many.result.invoiceEvidence?.stored).toBe(15);
    const large = await register({
      size: 10 * 1024 * 1024,
      drive: fake.drive,
      budgetMs: 30000,
    });
    expect(large.result.invoiceEvidence?.stored).toBe(1);
    await expect(
      service().mutate("departmentLead", {
        action: "authorizeProjectPurchaseUpload",
        projectId: f.project,
        responsibleDepartmentId: f.department,
        fileName: "large.pdf",
        contentType: "application/pdf",
        byteSize: 10 * 1024 * 1024 + 1,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const owned = await upload();
    await expect(
      service().mutate("finance", {
        action: "finalizeProjectPurchaseUpload",
        projectId: f.project,
        responsibleDepartmentId: f.department,
        uploadId: owned,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("keeps pending final evidence referenced through void and cleanup candidate enumeration", async () => {
    const { result, documents, uploads } = await register();
    const source = await job(documents[0]);
    const before = (
      await db.query<{ referenced: boolean }>(
        "select finance.upload_is_referenced(u) referenced from finance.uploads u where id=$1::uuid",
        [uploads[0]],
      )
    ).rows[0];
    expect(before.referenced).toBe(true);
    const purchase = (
      await db.query<{ revision: number }>(
        "select revision from finance.purchases where id=$1::uuid",
        [result.id],
      )
    ).rows[0];
    await service().mutate("finance", {
      action: "voidPurchase",
      purchaseId: result.id,
      expectedRevision: purchase.revision,
      reason: "Returned goods",
      requestId: randomUUID(),
    });
    expect((await job(documents[0])).status).toBe("pending");
    expect(storage.objects.has(source.staging_key)).toBe(true);
    expect(
      (
        await db.query<{ referenced: boolean }>(
          "select finance.upload_is_referenced(u) referenced from finance.uploads u where id=$1::uuid",
          [uploads[0]],
        )
      ).rows[0].referenced,
    ).toBe(true);
  });
});
