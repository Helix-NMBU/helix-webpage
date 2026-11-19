import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import type { PurchaseInput } from "../../../api/_lib/finance-types.js";
import { normalizePurchaseInput, serializePurchaseBody } from "../../../src/features/Finance/purchase-domain.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";

const testUrl = process.env.FINANCE_TEST_POSTGRES_URL;
const operator = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const head = "33333333-3333-4333-8333-333333333333";
const dbName = `finance_threshold_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!testUrl)("Retired amount-based purchase approval on PostgreSQL", () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let closePool: (() => Promise<void>) | undefined;
  let services: ReturnType<typeof createFinanceServices>;
  let systemId: string;
  let itemId: string;
  const storage = createMemoryFinanceStorage();
  const identities: Record<string, WorkspaceIdentity> = {
    member: { userId: member, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
    head: { userId: head, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  };
  const migration = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8");

  async function upload() {
    const created = await services.mutate("member", { action: "authorizeUpload", requestId: randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 });
    await putMemoryPdf(storage, created.stagingKey ?? "");
    await services.mutate("member", { action: "finalizeUpload", requestId: randomUUID(), uploadId: created.id });
    if (!created.id) throw new Error("Upload did not return an ID.");
    return created.id;
  }

  function purchase(uploadId: string, amountNok: string): PurchaseInput {
    return {
      buyerName: "Member Example", supplierName: "Example Supplier", paymentMethod: "team_account", purchaseDate: osloToday(),
      justification: "Material for the frame", documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Tube", quantity: "1", amountNok }],
      uploadIds: [uploadId],
    };
  }

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/postgres") {
      throw new Error("Threshold retirement tests require the loopback postgres maintenance database.");
    }
    admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    url.pathname = `/${dbName}`;
    const resource = createPostgresTestPool({ connectionString: url.toString(), max: 4 });
    pool = resource.pool;
    closePool = resource.close;
    await pool.query(`
      create schema identity;
      create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
      create table identity.departments (department_key text primary key, name text not null unique, sort_order smallint not null unique);
      create table identity.platform_roles (role_key text primary key);
      create table identity.member_roles (member_id uuid not null, role_key text not null);
      insert into identity.departments values ('mechanical-production', 'Mechanical', 1);
      insert into identity.members values
        ('${operator}', 'operator-sub', 'operator@example.test', 'Operator'),
        ('${member}', 'member-sub', 'member@example.test', 'Member'),
        ('${head}', 'head-sub', 'head@example.test', 'Head');
      insert into identity.platform_roles values ('platform_administrator');
      insert into identity.member_roles values ('${operator}', 'platform_administrator');
    `);
    for (const file of ["011_finance_core.sql", "012_finance_season_budgets.sql", "013_finance_funding.sql", "014_finance_register_purchases.sql", "015_finance_requests.sql", "016_finance_fulfillment.sql", "018_finance_unpaid_voids_reviews.sql", "020_finance_processing_guards.sql", "021_finance_final_candidate_ledger.sql"]) {
      await pool.query(migration(file));
    }
    await pool.query("select finance.configure_approval_threshold($1::uuid, 500000)", [operator]);
    await pool.query(migration("067_finance_retire_purchase_threshold.sql"));
    const db: CvDatabase = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }) };
    services = createFinanceServices({ db, financeStorage: storage, authenticate: async token => identities[token] });
    await pool.query("select finance.configure_current_season($1::uuid, 'S27', 'Test season', '2026-08-01', '2027-07-31')", [operator]);
    await pool.query("select finance.set_member_grant($1::uuid, $2::uuid, 'head_of_finance', true, 'Test')", [operator, head]);
    systemId = (await pool.query("insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true) returning id")).rows[0].id;
    await services.mutate("head", { action: "createBudget", requestId: randomUUID() });
    await services.mutate("head", { action: "approveBudget", requestId: randomUUID(), expectedRevision: 0 });
    itemId = (await pool.query(`insert into finance.budget_items
      (budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected, created_by_member_id, updated_by_member_id)
      select b.id, $1::uuid, 'BI-S27-010', 'Tube stock', 'material', 50000000, 'P2', 'new', 'planned', false, $2::uuid, $2::uuid
      from finance.budgets b where b.public_ref='B-S27' returning id`, [systemId, operator])).rows[0].id;
    const year = Number(osloToday().slice(0, 4));
    await pool.query("insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id) values ($1, $2, 1, $3::uuid)", [`purchase:${year}`, year, operator]);
  }, 30000);

  afterAll(async () => {
    try {
      await closePool?.();
      if (admin) await admin.query(`drop database if exists ${dbName}`);
    } finally {
      await admin?.end();
    }
  });

  it("retains the old setting as history and refuses to configure a new limit", async () => {
    const setting = (await pool.query("select setting_value::text as value, description from finance.settings where setting_key='approval_threshold_ore'")).rows[0];
    expect(setting.value).toBe("500000");
    expect(setting.description).toMatch(/retired/i);
    await expect(pool.query("select finance.configure_approval_threshold($1::uuid, 1)", [operator])).rejects.toThrow(/retired/i);
    await pool.query("update finance.settings set setting_value='\"obsolete\"'::jsonb where setting_key='approval_threshold_ore'");
    expect((await services.capabilities("member")).approvalThresholdNok).toBeNull();
  });

  it.each(["5000.00", "5000.01", "8000.00"])("registers NOK %s without an amount-triggered request or warning", async amountNok => {
    const saved = await services.mutate("member", { action: "registerPurchase", requestId: randomUUID(), purchase: purchase(await upload(), amountNok) });
    expect(saved.ok).toBe(true);
    expect(JSON.stringify(saved.warnings)).not.toMatch(/approval threshold|approval limit|prior approval/i);
    const flags = await pool.query("select kind from finance.exception_reviews where purchase_id=$1::uuid and kind='missing_approval'", [saved.id]);
    expect(flags.rows).toEqual([]);
  });

  it("ignores stale caller flags at the SQL boundary without deleting historical exceptions", async () => {
    const normalized = normalizePurchaseInput(purchase(await upload(), "8000.00"));
    expect(normalized.errors).toEqual([]);
    const payload = { ...serializePurchaseBody(normalized.purchase!, { registrationYear: Number(osloToday().slice(0, 4)), warnings: [] }), missingApproval: "obsolete", thresholdOre: "obsolete" };
    const result = await pool.query("select finance.register_purchase($1::uuid,$2::uuid,$3,$4::jsonb) as result", [member, randomUUID(), "a".repeat(64), JSON.stringify(payload)]);
    const id = result.rows[0].result.id;
    expect((await pool.query("select id from finance.exception_reviews where purchase_id=$1::uuid", [id])).rows).toEqual([]);
    await pool.query("select finance.record_purchase_exception($1::uuid,'missing_approval',$2::jsonb)", [id, JSON.stringify({ totalOre: "800000", thresholdOre: "500000" })]);
    await pool.query(migration("067_finance_retire_purchase_threshold.sql"));
    const historical = await pool.query("select facts from finance.exception_reviews where purchase_id=$1::uuid", [id]);
    expect(historical.rows).toEqual([{ facts: { totalOre: "800000", thresholdOre: "500000" } }]);
  });

  it("keeps duplicate-safe registration above the former limit on independent connections", async () => {
    const action = { action: "registerPurchase", requestId: randomUUID(), purchase: purchase(await upload(), "8000.00") };
    const [first, second] = await Promise.all([services.mutate("member", action), services.mutate("member", action)]);
    expect(first.id).toBe(second.id);
    expect((await pool.query("select count(*)::int as count from finance.purchases where id=$1::uuid", [first.id])).rows[0].count).toBe(1);
  });
});
