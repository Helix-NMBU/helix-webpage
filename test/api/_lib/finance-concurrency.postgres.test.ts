import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import { thirdOsloDayFrom } from "../../../src/features/Finance/request-domain.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";

// Opt-in, loopback-only PostgreSQL. This suite creates and drops its own
// randomly named database and never connects to a configured application DB.
const testUrl = process.env.FINANCE_TEST_POSTGRES_URL;
const actor = "22222222-2222-4222-8222-222222222222";
const head = "33333333-3333-4333-8333-333333333333";
const operator = "11111111-1111-4111-8111-111111111111";
const dbName = `finance_test_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!testUrl)("Finance concurrency on separate PostgreSQL connections", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let services: ReturnType<typeof createFinanceServices>;
  let systemId: string;
  let itemId: string;
  const storage = createMemoryFinanceStorage();
  const identities: Record<string, WorkspaceIdentity> = {
    member: { userId: actor, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
    head: { userId: head, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  };

  async function mutate(token: string, action: Record<string, unknown>) {
    return services.mutate(token, { requestId: randomUUID(), ...action });
  }

  async function upload() {
    const created = await mutate("member", { action: "authorizeUpload", fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 });
    await putMemoryPdf(storage, created.stagingKey ?? "");
    await mutate("member", { action: "finalizeUpload", uploadId: created.id });
    return created.id;
  }

  function purchase(uploadId: string | undefined, amountNok: string, requestRecordId?: string, requestLineId?: string) {
    return {
      buyerName: "Member Example", supplierName: "Example Supplier", paymentMethod: "team_account", purchaseDate: osloToday(),
      justification: "Material for the frame", documentKind: "receipt", requestRecordId,
      lines: [{ systemId, budgetItemId: itemId, requestLineId, description: "Tube", quantity: "1", amountNok }],
      uploadIds: [uploadId],
    };
  }

  beforeAll(async () => {
    const base = new URL(testUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.pathname !== "/postgres") {
      throw new Error("Finance PostgreSQL tests require a loopback connection to the postgres maintenance database.");
    }
    admin = new pg.Client({ connectionString: base.toString() });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    base.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: base.toString(), max: 8 });
    await pool.query(`
      create schema identity;
      create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
      create table identity.departments (department_key text primary key, name text not null unique, sort_order smallint not null unique);
      create table identity.platform_roles (role_key text primary key);
      create table identity.member_roles (member_id uuid not null, role_key text not null);
      insert into identity.departments values ('mechanical-production', 'Mechanical', 1);
      insert into identity.members values
        ('${operator}', 'operator-sub', 'operator@example.test', 'Operator'),
        ('${actor}', 'member-sub', 'member@example.test', 'Member'),
        ('${head}', 'head-sub', 'head@example.test', 'Head');
      insert into identity.platform_roles values ('platform_administrator');
      insert into identity.member_roles values ('${operator}', 'platform_administrator');
    `);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const file of readdirSync(migrations).filter((name) => /^0(1[1-9]|2[0-9])_finance_.*\.sql$/.test(name)).sort()) {
      await pool.query(readFileSync(new URL(file, migrations), "utf8"));
    }
    const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pool.query(query, params)).rows as T[] }) };
    services = createFinanceServices({ db, financeStorage: storage, authenticate: async (token) => identities[token] });
    await pool.query("select finance.configure_current_season($1::uuid, 'S27', 'Test season', '2026-01-01', '2027-12-31')", [operator]);
    await pool.query("select finance.set_member_grant($1::uuid, $2::uuid, 'head_of_finance', true, 'Test')", [operator, head]);
    const system = await pool.query("insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true) returning id");
    systemId = system.rows[0].id;
    await mutate("head", { action: "createBudget" });
    await mutate("head", { action: "approveBudget", expectedRevision: 0 });
    const item = await pool.query(`insert into finance.budget_items
      (budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected, created_by_member_id, updated_by_member_id)
      select b.id, $1::uuid, 'BI-S27-010', 'Tube stock', 'material', 50000000, 'P2', 'new', 'planned', false, $2::uuid, $2::uuid
      from finance.budgets b where b.public_ref = 'B-S27' returning id`, [systemId, operator]);
    itemId = item.rows[0].id;
    const year = Number(osloToday().slice(0, 4));
    await pool.query("insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id) values ($1, $2, 1, $3::uuid)", [`purchase:${year}`, year, operator]);
  }, 30000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  it("serializes concurrent retries of one registration into one purchase and reference", async () => {
    const uploadId = await upload();
    const requestId = randomUUID();
    const action = { action: "registerPurchase", requestId, purchase: purchase(uploadId, "100.00") };
    const [first, second] = await Promise.all([services.mutate("member", action), services.mutate("member", action)]);
    expect(first.id).toBe(second.id);
    const rows = await pool.query("select count(*)::int as count from finance.purchases where id = $1::uuid", [first.id]);
    expect(rows.rows[0].count).toBe(1);
  }, 30000);

  it("serializes concurrent fulfillments against one approved line", async () => {
    const draft = { supplierName: "Example Supplier", justification: "Material for the frame", plannedDate: thirdOsloDayFrom(osloToday()),
      lines: [{ budgetItemId: itemId, description: "Tube", estimatedNok: "10000.00" }] };
    const saved = await mutate("member", { action: "saveRequest", request: draft });
    await mutate("member", { action: "submitRequest", requestRecordId: saved.id, expectedRevision: saved.revision ?? 0, request: draft });
    const line = await pool.query(`select rl.id, rr.id as revision_id from finance.requests r
      join finance.request_revisions rr on rr.id = r.submitted_revision_id
      join finance.request_lines rl on rl.revision_id = rr.id where r.id = $1::uuid`, [saved.id]);
    const lineId: string = line.rows[0].id;
    await mutate("head", { action: "decideRequest", requestRecordId: saved.id, revisionId: line.rows[0].revision_id,
      decision: "approved", reason: "Partially approved", approvedOreByLine: { [lineId]: "800000" } });
    const [firstUpload, secondUpload] = await Promise.all([upload(), upload()]);
    const [firstPurchase] = await Promise.all([
      mutate("member", { action: "registerPurchase", purchase: purchase(firstUpload, "4000.00", saved.id, lineId) }),
      mutate("member", { action: "registerPurchase", purchase: purchase(secondUpload, "3000.00", saved.id, lineId) }),
    ]);
    const totals = await pool.query("select finance.budget_item_open_commitment_ore($1::uuid)::text as commitment", [itemId]);
    expect(totals.rows[0].commitment).toBe("100000");
    const actual = await pool.query(`select coalesce(sum(l.amount_ore), 0)::text as amount from finance.purchase_lines l
      join finance.purchases p on p.id = l.purchase_id where l.request_line_id = $1::uuid and p.status = 'registered'`, [lineId]);
    expect(actual.rows[0].amount).toBe("700000");
    const revision = await pool.query("select revision from finance.purchases where id = $1::uuid", [firstPurchase.id]);
    const newUpload = await upload();
    await Promise.all([
      mutate("head", { action: "voidPurchase", purchaseId: firstPurchase.id, expectedRevision: revision.rows[0].revision, reason: "Cancelled" }),
      mutate("member", { action: "registerPurchase", purchase: purchase(newUpload, "2000.00", saved.id, lineId) }),
    ]);
    const after = await pool.query("select finance.budget_item_open_commitment_ore($1::uuid)::text as commitment", [itemId]);
    expect(after.rows[0].commitment).toBe("300000");
  }, 30000);

  it("keeps a voided invoice out of unpaid work when settlement races with void", async () => {
    const invoice = { ...purchase(await upload(), "25.00"), paymentMethod: "invoice", documentKind: "invoice", invoiceDueDate: osloToday() };
    const registered = await mutate("member", { action: "registerPurchase", purchase: invoice });
    const row = await pool.query("select revision from finance.purchases where id = $1::uuid", [registered.id]);
    const outcomes = await Promise.allSettled([
      mutate("head", { action: "markInvoicePaid", purchaseId: registered.id, expectedRevision: row.rows[0].revision, paidOn: osloToday() }),
      mutate("head", { action: "voidPurchase", purchaseId: registered.id, expectedRevision: row.rows[0].revision, reason: "Cancelled" }),
    ]);
    for (const outcome of outcomes) if (outcome.status === "rejected") expect(outcome.reason.status).toBe(409);
    // A revision conflict is valid for either ordering; retry void at the new revision.
    if (outcomes[1].status === "rejected") {
      const updated = await pool.query("select revision from finance.purchases where id = $1::uuid", [registered.id]);
      await mutate("head", { action: "voidPurchase", purchaseId: registered.id, expectedRevision: updated.rows[0].revision, reason: "Cancelled" });
    }
    const purchases = await services.purchases("head");
    if ("unchanged" in purchases) throw new Error("Unexpected unchanged purchase view");
    expect(purchases.register?.find((item) => item.id === registered.id)?.status).toBe("voided");
    expect(purchases.register?.find((item) => item.id === registered.id)?.unpaid).toBe(false);
  }, 30000);

  it("allows only one of two imports based on the same department preview", async () => {
    const csv = "system_id;description;planned_nok\nSYS-FR;Tube stock;490000";
    const preview = (await mutate("head", { action: "previewImport", departmentKey: "mechanical-production", csv })).importPreview;
    if (!preview) throw new Error("Expected an import preview");
    expect(preview.errors).toEqual([]);
    const changes = { action: "importItems", departmentKey: "mechanical-production", csv,
      expectedRevision: preview.viewVersion, previewToken: preview.previewToken, reason: "Adjust plan" };
    const outcomes = await Promise.allSettled([mutate("head", changes), mutate("head", changes)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
    const item = await pool.query("select planned_ore::text as planned from finance.budget_items where id = $1::uuid", [itemId]);
    expect(item.rows[0].planned).toBe("49000000");
  }, 30000);

  it("does not publish a final object after cleanup claims it, or clean a published object", async () => {
    const created = await mutate("member", { action: "authorizeUpload", fileName: "race.pdf", contentType: "application/pdf", byteSize: 8 });
    if (!created.id || !created.stagingKey) throw new Error("Expected an upload authorization");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const key = storage.finalKey(actor, created.id);
    await pool.query("select finance.reserve_upload_final_candidate($1::uuid,$2::uuid,$3,$4,$5::bigint)", [actor, created.id, key, digest, 8]);
    const outcomes = await Promise.allSettled([
      pool.query("select finance.complete_upload_finalize($1::uuid,$2::uuid,$3,$4,$5::bigint,$6)", [actor, created.id, key, digest, 8, "application/pdf"]),
      pool.query("select finance.begin_final_candidate_cleanup($1::uuid,$2::uuid,$3,clock_timestamp() + interval '1 minute',interval '0')", [head, created.id, key]),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const row = await pool.query("select status, final_key from finance.uploads where id = $1::uuid", [created.id]);
    const candidate = await pool.query("select status from finance.upload_final_candidates where storage_key = $1", [key]);
    if (row.rows[0].status === "finalized") {
      expect(row.rows[0].final_key).toBe(key);
      expect(candidate.rows[0].status).toBe("published");
    } else {
      expect(row.rows[0].final_key).toBeNull();
      expect(candidate.rows[0].status).toBe("cleanup");
    }
  }, 30000);

  it("enforces the hourly quota and unique references during concurrent registrations", async () => {
    const current = await pool.query("select count(*)::int as count from finance.purchases where requester_member_id = $1::uuid and created_at > now() - interval '1 hour'", [actor]);
    for (let count = current.rows[0].count; count < 19; count += 1) {
      await mutate("member", { action: "registerPurchase", purchase: purchase(await upload(), "10.00") });
    }
    const [firstUpload, secondUpload] = await Promise.all([upload(), upload()]);
    const results = await Promise.allSettled([
      mutate("member", { action: "registerPurchase", purchase: purchase(firstUpload, "10.00") }),
      mutate("member", { action: "registerPurchase", purchase: purchase(secondUpload, "10.00") }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.status === "rejected" && rejection.reason.status).toBe(429);
    const totals = await pool.query("select count(*)::int as count, count(distinct public_ref)::int as refs from finance.purchases where requester_member_id = $1::uuid", [actor]);
    expect(totals.rows[0]).toEqual({ count: 20, refs: 20 });
  }, 30000);
});
