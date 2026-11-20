import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage } from "./project-budget-test-db.js";
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
    itemId?: string;
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
          unbudgeted: !options.itemId,
          budgetItemId: options.itemId,
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
    const begin = fake.drive.begin;
    fake.drive.begin = vi.fn(async (source) => {
      expect((await job(source.documentId)).drive_file_id).toBe(source.fileId);
      return begin(source);
    });
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
    fake.drive.upload = vi.fn(
      async (...args: Parameters<FinanceDrive["upload"]>) => {
        await original(...args);
        throw new InvoiceTransferError("transfer_uncertain");
      },
    );
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
  it("projects confirmed evidence through the canonical entry helper and exports provider status without service secrets", async () => {
    const services = service();
    const created = await services.mutate("lead", {
      action: "createProjectBudget",
      projectId: f.project,
      responsibleDepartmentId: f.department,
      requestId: randomUUID(),
    });
    let detail = await services.projectBudget("lead", created.id!);
    await services.mutate("lead", {
      action: "saveProjectBudgetEntry",
      projectBudgetId: detail.id,
      expectedRevision: detail.revision,
      requestId: randomUUID(),
      entry: {
        systemId: f.system,
        description: "Invoice-bearing materials",
        category: "material",
        plannedNok: "100.00",
        ordinaryPriority: "P2",
        reuseStatus: "new",
        status: "planned",
      },
    });
    detail = await services.projectBudget("lead", detail.id);
    await services.mutate("lead",{action:"submitProjectBudget",projectBudgetId:detail.id,expectedRevision:detail.revision,requestId:randomUUID()});
    detail = await services.projectBudget("lead",detail.id);
    detail = (await submitProjectBudgetDepartmentPackage(services,detail)).budget;
    detail = await approveProjectBudgetDepartmentPackage(services,detail);
    const entry = detail.approvedVersion!.entries[0],
      fake = driveFixture();
    const saved = await register({
      drive: fake.drive,
      budgetMs: 30000,
      itemId: entry.budgetItemId!,
    });
    const read = await services.projectBudget("lead", detail.id);
    expect(read.approvedVersion!.entries[0].invoices?.[0]).toMatchObject({
      documentId: saved.documents[0],
      backend: "google_drive",
      transferStatus: "stored",
      canRetry: false,
      viewerUrl: expect.stringContaining("https://drive.google.com/file/d/"),
    });
    const { buildPurchaseExport } =
      await import("../../../api/_lib/finance-export.js");
    const exported = await buildPurchaseExport(db, "S27");
    expect(exported.csv).toContain("invoice_transfer_status");
    expect(exported.csv).toContain("https://drive.google.com/file/d/");
    expect(exported.csv).toContain("private_storage");
    expect(exported.csv).not.toMatch(
      /Bearer|service-token|upload_id=|X-Amz|\/final\//,
    );
  });
  it("resumes a persisted acknowledged offset after a worker interruption without allocating another ID", async () => {
    const { documents } = await register({ size: 2 * 1024 * 1024 }),
      id = documents[0],
      fake = driveFixture(),
      token = randomUUID();
    let snapshot = (
      await db.query<{ job: { revision: number } }>(
        "select finance.claim_invoice_transfer($1::uuid,$2,$3,$4::uuid,null,$5,$6,$7::uuid,false,null) job",
        [
          lead.userId,
          lead.googleSub,
          lead.email,
          id,
          fake.drive.destination.driveId,
          fake.drive.destination.folderId,
          token,
        ],
      )
    ).rows[0].job;
    const advance = async (change: Record<string, unknown>) => {
      snapshot = (
        await db.query<{ job: { revision: number } }>(
          "select finance.advance_invoice_transfer($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::jsonb) job",
          [
            lead.userId,
            lead.googleSub,
            lead.email,
            id,
            token,
            snapshot.revision,
            JSON.stringify(change),
          ],
        )
      ).rows[0].job;
    };
    const fileId = await fake.drive.generateId();
    await advance({ action: "reserve", fileId });
    const source: InvoiceSource = {
      documentId: id,
      fileId,
      driveId: fake.drive.destination.driveId,
      folderId: fake.drive.destination.folderId,
      name: "invoice.pdf",
      contentType: "application/pdf",
      byteSize: 2 * 1024 * 1024,
      sha256: (await job(id)).content_sha256,
    };
    await advance({ action: "session", uri: await fake.drive.begin(source) });
    await advance({ action: "progress", bytes: 1024 * 1024 });
    await advance({ action: "yield" });
    fake.drive.probe = vi.fn(async () => ({
      done: false,
      confirmedBytes: 1024 * 1024,
    }));
    await transferInvoice(
      db,
      finance,
      id,
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 30000,
    );
    expect((await job(id)).status).toBe("stored");
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    expect(fake.drive.upload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fake.drive.upload).mock.calls[0][2]).toBe(1024 * 1024);
  });
  it("bounds unavailable source reads and leaves honest recoverable attention", async () => {
    const { documents } = await register(),
      fake = driveFixture();
    const hanging = {
      ...storage,
      readObject: () => new Promise<Uint8Array>(() => {}),
    };
    await transferInvoice(
      db,
      lead,
      documents[0],
      { drive: fake.drive, storage: hanging },
      null,
      false,
      Date.now() + 30,
    );
    expect((await job(documents[0])).status).toBe("needs_attention");
    expect(fake.drive.begin).not.toHaveBeenCalled();
  });
  it("automatically transfers a generic Financials registration under the actual current capability function", async () => {
    await db.query(
      "insert into identity.member_roles values($1::uuid,'financials')",
      [f.outsider],
    );
    try {
      const flags = (
        await db.query<{
          flags: {
            registerActual: boolean;
            filesAndRefunds: boolean;
            profiles: string[];
          };
        }>("select finance.capability_flags($1::uuid) flags", [f.outsider])
      ).rows[0].flags;
      expect(flags).toMatchObject({
        registerActual: true,
        filesAndRefunds: true,
        profiles: expect.arrayContaining(["finance"]),
      });
      const fake = driveFixture(),
        services = service(fake.drive, 30000),
        authorization = await services.mutate("outsider", {
          action: "authorizeUpload",
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          byteSize: 8,
          requestId: randomUUID(),
        });
      storage.objects.set(
        authorization.stagingKey!,
        new TextEncoder().encode("%PDF-1.4"),
      );
      await services.mutate("outsider", {
        action: "finalizeUpload",
        uploadId: authorization.id,
        requestId: randomUUID(),
      });
      const saved = await services.mutate("outsider", {
        action: "registerPurchase",
        requestId: randomUUID(),
        purchase: {
          buyerName: "Buyer",
          supplierName: "Supplier",
          paymentMethod: "team_account",
          purchaseDate: osloToday(),
          justification: "Incurred materials",
          documentKind: "receipt",
          uploadIds: [authorization.id!],
          lines: [
            {
              systemId: f.system,
              budgetItemId: f.entry,
              description: "Steel",
              quantity: "1",
              amountNok: "10.00",
            },
          ],
        },
      });
      expect(saved.invoiceEvidence).toEqual({
        pending: 0,
        transferring: 0,
        stored: 1,
        needsAttention: 0,
      });
      expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    } finally {
      await db.query(
        "delete from identity.member_roles where member_id=$1::uuid and role_key='financials'",
        [f.outsider],
      );
    }
  });
  it("shares header-ID lock order with an independent mixed-project void when project IDs sort oppositely", async () => {
    const projectA = "10000000-0000-4000-8000-000000000001",
      projectB = "20000000-0000-4000-8000-000000000002",
      headerA = "f0000000-0000-4000-8000-000000000001",
      headerB = "01000000-0000-4000-8000-000000000002";
    const services = service(),
      items: string[] = [];
    for (const [projectId, headerId] of [
      [projectA, headerA],
      [projectB, headerB],
    ]) {
      const version = randomUUID();
      await db.query(
        "insert into project_management.projects values($1::uuid,'S27','Reversed invoice order',array[$2::uuid],array['Mechanical & Production'],1)",
        [projectId, f.lead],
      );
      await db.exec(
        `begin;insert into finance.project_budgets(id,season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) values('${headerId}','${f.season}','${projectId}','${f.department}','${f.lead}','${f.lead}');insert into finance.project_budget_versions(id,project_budget_id,version_number,created_by_member_id) values('${version}','${headerId}',1,'${f.lead}');update finance.project_budgets set pending_version_id='${version}' where id='${headerId}';commit;`,
      );
      let detail = await services.projectBudget("lead", headerId);
      await services.mutate("lead", {
        action: "saveProjectBudgetEntry",
        projectBudgetId: headerId,
        expectedRevision: detail.revision,
        requestId: randomUUID(),
        entry: {
          systemId: f.system,
          description: "Mixed invoice materials",
          category: "material",
          plannedNok: "100.00",
          ordinaryPriority: "P2",
          reuseStatus: "new",
          status: "planned",
        },
      });
      detail = await services.projectBudget("lead", headerId);
      await services.mutate("lead",{action:"submitProjectBudget",projectBudgetId:detail.id,expectedRevision:detail.revision,requestId:randomUUID()});
      detail = await services.projectBudget("lead",detail.id);
      detail = (await submitProjectBudgetDepartmentPackage(services,detail)).budget;
      detail = await approveProjectBudgetDepartmentPackage(services,detail);
      items.push(detail.approvedVersion!.entries[0].budgetItemId!);
    }
    expect(projectA < projectB && headerA > headerB).toBe(true);
    const authorization = await services.mutate("finance", {
      action: "authorizeUpload",
      requestId: randomUUID(),
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      byteSize: 8,
    });
    storage.objects.set(
      authorization.stagingKey!,
      new TextEncoder().encode("%PDF-1.4"),
    );
    await services.mutate("finance", {
      action: "finalizeUpload",
      requestId: randomUUID(),
      uploadId: authorization.id,
    });
    const saved = await services.mutate("finance", {
      action: "registerPurchase",
      requestId: randomUUID(),
      purchase: {
        buyerName: "Buyer",
        supplierName: "Supplier",
        paymentMethod: "team_account",
        purchaseDate: osloToday(),
        justification: "Both project materials",
        documentKind: "receipt",
        uploadIds: [authorization.id!],
        lines: items.map((budgetItemId) => ({
          systemId: f.system,
          budgetItemId,
          description: "Material",
          quantity: "1",
          amountNok: "10.00",
        })),
      },
    });
    const document = (
      await db.query<{ id: string }>(
        "select id::text from finance.documents where purchase_id=$1::uuid",
        [saved.id],
      )
    ).rows[0].id;
    const writer = await pool.connect(),
      invoice = await pool.connect();
    let outcome: Promise<{ error?: unknown; result?: unknown }> | undefined;
    try {
      await writer.query("begin");
      await writer.query("set local lock_timeout='4s'");
      await writer.query(
        "select id from finance.project_budgets where id=$1::uuid for update",
        [headerB],
      );
      await invoice.query("set statement_timeout='5s'");
      const writerPid = (await writer.query("select pg_backend_pid() pid"))
          .rows[0].pid,
        invoicePid = (await invoice.query("select pg_backend_pid() pid"))
          .rows[0].pid;
      outcome = invoice
        .query(
          "select finance.claim_invoice_transfer($1::uuid,$2,$3,$4::uuid,null,'sharedDrive1','invoiceFolder1',$5::uuid,false,null)",
          [
            finance.userId,
            finance.googleSub,
            finance.email,
            document,
            randomUUID(),
          ],
        )
        .then(
          (result) => ({ result }),
          (error) => ({ error }),
        );
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        const blockers = (
          await db.query<{ pids: number[] }>(
            "select pg_blocking_pids($1::integer) pids",
            [invoicePid],
          )
        ).rows[0].pids;
        if (blockers.includes(writerPid)) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(
        blocked,
        "invoice claim must overlap and wait for the canonical first header",
      ).toBe(true);
      // The old project-order loop already held headerA here and deadlocked with this real070 void.
      await writer.query(
        "select finance.void_registered_purchase($1::uuid,$2::uuid,$3,$4::uuid,'Returned mixed order',0)",
        [finance.userId, randomUUID(), "a".repeat(64), saved.id],
      );
      await writer.query("commit");
      const finished = await outcome;
      expect(finished.error).toBeUndefined();
      expect((await job(document)).status).toBe("transferring");
      expect(
        (
          await db.query<{ status: string }>(
            "select status from finance.purchases where id=$1::uuid",
            [saved.id],
          )
        ).rows[0].status,
      ).toBe("voided");
    } finally {
      await writer.query("rollback");
      await outcome;
      await invoice.query("reset statement_timeout");
      writer.release();
      invoice.release();
    }
  });
  it("continues a slow explicit recovery retry through bounded invocations using the stored purchase identity", async () => {
    const { documents, result } = await register({ budgetMs: 30000 }),
      id = documents[0],
      fake = driveFixture();
    const retried = await mutateInvoice(
      db,
      finance,
      {
        action: "retryInvoiceTransfer",
        documentId: id,
        expectedRevision: (await job(id)).revision,
        requestId: randomUUID(),
      },
      { drive: fake.drive, storage, budgetMs: 5500 },
    );
    expect(retried).toMatchObject({
      id,
      purchaseId: result.id,
      invoiceEvidence: {
        pending: 1,
        transferring: 0,
        stored: 0,
        needsAttention: 0,
      },
    });
    const resumed = await mutateInvoice(
      db,
      finance,
      {
        action: "continueInvoiceTransfers",
        purchaseId: retried.purchaseId,
        requestId: randomUUID(),
      },
      { drive: fake.drive, storage, budgetMs: 30000 },
    );
    expect(resumed.invoiceEvidence?.stored).toBe(1);
    expect(fake.drive.generateId).toHaveBeenCalledTimes(1);
    expect((await job(id)).status).toBe("stored");
  });
  it("preserves one actual and every job during a provider outage", async () => {
    const fake = driveFixture();
    fake.drive.generateId = vi.fn(async () => {
      throw new InvoiceTransferError("provider_unavailable");
    });
    const saved = await register({
      drive: fake.drive,
      count: 2,
      budgetMs: 30000,
    });
    expect(saved.result.invoiceEvidence?.needsAttention).toBe(2);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from finance.purchases where id=$1::uuid",
          [saved.result.id],
        )
      ).rows[0].status,
    ).toBe("registered");
    for (const id of saved.documents) {
      expect((await job(id)).drive_file_id).toBeNull();
      expect(
        (
          await db.query<{ last_error: string }>(
            "select last_error from finance.invoice_transfers where document_id=$1::uuid",
            [id],
          )
        ).rows[0].last_error,
      ).toBe("provider_unavailable");
    }
  });
  it("reconciles a409-style create conflict only after matching the reserved ID and exact evidence", async () => {
    const { documents } = await register(),
      id = documents[0],
      fake = driveFixture();
    fake.drive.begin = vi.fn(async (source) => {
      fake.files.set(source.fileId, {
        id: source.fileId,
        driveId: source.driveId,
        parents: [source.folderId],
        mimeType: source.contentType,
        size: String(source.byteSize),
        sha256Checksum: source.sha256,
      });
      throw new InvoiceTransferError("transfer_uncertain");
    });
    await transferInvoice(
      db,
      finance,
      id,
      { drive: fake.drive, storage },
      null,
      false,
      Date.now() + 30000,
    );
    expect((await job(id)).status).toBe("stored");
    expect(fake.drive.upload).not.toHaveBeenCalled();
    expect(fake.drive.verify).toHaveBeenCalledOnce();
    expect(fake.files.size).toBe(1);
  });
});
