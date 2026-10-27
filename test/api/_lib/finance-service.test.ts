import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { capabilitiesForProfiles } from "../../../api/_lib/finance-access.js";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { FinanceProfile } from "../../../api/_lib/finance-types.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import { MAX_PURCHASE_FILE_BYTES, MAX_PURCHASE_FILES } from "../../../src/features/Finance/purchase-domain.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const strangerId = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  old: { userId: memberId, googleSub: "replaced-sub", email: "member@example.test", name: "Member Example" },
  admin: { userId: adminId, googleSub: "admin-sub", email: "admin@example.test", name: "Admin Example" },
  stranger: { userId: strangerId, googleSub: "stranger-sub", email: "stranger@example.test", name: "Stranger Example" },
  banned: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
};

let pg: PGlite;
let db: CvDatabase;
let services: ReturnType<typeof createFinanceServices>;
let handler: ReturnType<typeof createFinanceHandler>;
let financeStorage: Awaited<ReturnType<typeof import("./finance-storage-mock.js").createMemoryFinanceStorage>>;

function response() {
  let status = 0;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) };
}

async function call(path: { method?: string; query?: Record<string, string>; body?: unknown; token?: string | null; contentLength?: number }) {
  const wrapped = response();
  const headers: Record<string, string> = {};
  if (path.token) headers.authorization = `Bearer ${path.token}`;
  if (path.contentLength !== undefined) headers["content-length"] = String(path.contentLength);
  await handler({
    method: path.method ?? (path.body ? "POST" : "GET"),
    query: path.query ?? {},
    body: path.body,
    headers,
  } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const result = await pg.query(text, params);
  return { rows: result.rows as T[] };
}

async function grant(member: string, profile: FinanceProfile) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function counts() {
  const tables = ["member_grants", "seasons", "budgets", "funding", "purchases", "requests", "audit_log", "idempotency_keys"];
  const result: Record<string, number> = {};
  for (const table of tables) {
    const rows = await sql<{ count: string }>(`select count(*)::text as count from finance.${table}`);
    result[table] = Number(rows.rows[0]?.count ?? 0);
  }
  return result;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (
      id uuid primary key,
      google_sub text not null,
      email text not null,
      full_name text not null,
      helix_role text
    );
    create table identity.departments (
      department_key text primary key,
      name text not null unique,
      sort_order smallint not null unique
    );
    insert into identity.departments (department_key, name, sort_order) values ('mechanical-production', 'Mechanical', 1);
    create table identity.platform_roles (role_key text primary key);
    create table identity.member_roles (member_id uuid not null, role_key text not null);
    create table identity.recruiter_grants (member_id uuid primary key);
    insert into identity.members (id, google_sub, email, full_name, helix_role) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example', 'Member'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example', 'Member'),
      ('${adminId}', 'admin-sub', 'admin@example.test', 'Admin Example', 'Admin');
    insert into identity.departments (department_key, name, sort_order) values ('finance', 'Finance', 2);
    insert into identity.platform_roles values ('platform_administrator'), ('team_member');
    insert into identity.member_roles values ('${adminId}', 'platform_administrator'), ('${operatorId}', 'platform_administrator');
    insert into identity.recruiter_grants values ('${adminId}');
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    create table identity.role_feature_grants (role_key text not null, feature_key text not null, scope text not null);
    create role anon;
    create role authenticated;
    create role anonymous;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/012_finance_season_budgets.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/013_finance_funding.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/014_finance_register_purchases.sql", import.meta.url), "utf8"));
  db = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  const { createMemoryFinanceStorage } = await import("./finance-storage-mock.js");
  financeStorage = createMemoryFinanceStorage();
  services = createFinanceServices({
    db,
    financeStorage,
    authenticate: async (token) => {
      if (token === "banned") throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
      const identity = identities[token];
      if (!identity) throw new MemberCvError(401, "Log in to continue.");
      return identity;
    },
  });
  handler = createFinanceHandler(() => services);
});

async function resetFinance() {
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    truncate table
      finance.allocations,
      finance.purchase_lines,
      finance.outlay_reimbursements,
      finance.invoice_obligations,
      finance.documents,
      finance.uploads,
      finance.exception_reviews,
      finance.purchases,
      finance.request_lines,
      finance.request_decisions,
      finance.request_revisions,
      finance.requests,
      finance.budget_items,
      finance.budgets,
      finance.funding_parts,
      finance.funding,
      finance.systems,
      finance.seasons,
      finance.idempotency_keys,
      finance.outbox,
      finance.member_grants,
      finance.settings,
      finance.reference_counters,
      finance.audit_log
    restart identity;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
}

beforeEach(resetFinance);

afterAll(async () => { await pg.close(); });

describe("finance schema privacy", () => {
  it("enables row level security and grants nothing to browser roles", async () => {
    const tables = await sql<{ name: string; rls: boolean; forced: boolean }>(`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'finance' and c.relkind = 'r'
      order by c.relname
    `);
    expect(tables.rows.length).toBeGreaterThanOrEqual(20);
    expect(tables.rows.every((row) => row.rls && !row.forced)).toBe(true);
    for (const role of ["anon", "authenticated", "anonymous", "public"]) {
      const privilege = await sql<{ allowed: boolean }>(
        "select has_table_privilege($1, 'finance.member_grants', 'select') as allowed",
        [role],
      );
      expect(privilege.rows[0]?.allowed, role).toBe(false);
    }
    const version = await sql<{ version: string }>("select version::text as version from finance.view_versions");
    expect(version.rows).toEqual([{ version: "0" }]);
    expect(await counts()).toMatchObject({ member_grants: 0, seasons: 0, budgets: 0, funding: 0, purchases: 0, requests: 0 });
  });

  it("keeps audit history append-only", async () => {
    await sql("select finance.append_audit($1::uuid, 'settings', 'current_season', 'current_season', null, 'S27', null)", [operatorId]);
    await expect(sql("update finance.audit_log set reason = 'changed'")).rejects.toThrow(/append-only/i);
    await expect(sql("delete from finance.audit_log")).rejects.toThrow(/append-only/i);
    await expect(sql("truncate finance.audit_log")).rejects.toThrow(/append-only/i);
  });

  it("does not derive profiles from title, department, platform administration, or recruiting", async () => {
    const flags = await sql<{ flags: { profiles: string[] } }>("select finance.capability_flags($1::uuid) as flags", [adminId]);
    expect(flags.rows[0]?.flags.profiles).toEqual([]);
    expect(flags.rows[0]?.flags).toMatchObject({ financing: false, purchaseRegister: false, createBudget: false, publicBudgets: true });
    const missing = await sql<{ flags: { publicBudgets: boolean; profiles: unknown } }>("select finance.capability_flags($1::uuid) as flags", [strangerId]);
    expect(missing.rows[0]?.flags.publicBudgets).toBe(false);
    expect(missing.rows[0]?.flags.profiles).toEqual([]);
  });

  it("matches the capability union for every active profile combination", async () => {
    const profiles: FinanceProfile[] = ["business", "finance", "head_of_finance"];
    for (let mask = 0; mask < 8; mask += 1) {
      await pg.exec("alter table finance.audit_log disable trigger user; truncate finance.member_grants, finance.audit_log; alter table finance.audit_log enable trigger user; update finance.view_versions set version = 0;");
      const selected = profiles.filter((_, index) => mask & (1 << index));
      for (const profile of selected) await grant(memberId, profile);
      const row = await sql<{ flags: Record<string, unknown> & { profiles: FinanceProfile[] } }>("select finance.capability_flags($1::uuid) as flags", [memberId]);
      const flags = row.rows[0]?.flags;
      expect(flags?.profiles).toEqual([...selected].sort());
      const { profiles: _profiles, ...capabilities } = flags ?? { profiles: [] };
      expect(capabilities).toEqual(capabilitiesForProfiles(selected));
    }
  });

  it("rejects self-grant and records operator grant and revoke", async () => {
    await expect(sql("select finance.set_member_grant($1::uuid, $1::uuid, 'finance', true, 'Self')", [operatorId])).rejects.toThrow(/self-grant/i);
    await expect(sql("select finance.set_member_grant($1::uuid, $2::uuid, 'finance', true, 'Not an administrator')", [memberId, adminId])).rejects.toThrow(/platform administrator/i);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.member_grants")).rows[0]?.count).toBe("0");
    await grant(memberId, "finance");
    await expect(grant(memberId, "finance")).resolves.toBeUndefined();
    const active = await sql<{ count: string }>("select count(*)::text as count from finance.member_grants where active");
    expect(active.rows[0]?.count).toBe("1");
    await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'finance', false, 'Coverage revoke')", [operatorId, memberId]);
    const revoked = await sql<{ active: boolean }>("select active from finance.member_grants");
    expect(revoked.rows).toEqual([{ active: false }]);
    const flags = await sql<{ flags: { profiles: string[]; financing: boolean } }>("select finance.capability_flags($1::uuid) as flags", [memberId]);
    expect(flags.rows[0]?.flags.profiles).toEqual([]);
    expect(flags.rows[0]?.flags.financing).toBe(false);
  });

  it("stores season, threshold, and a monotonic reference start without issuing a reference", async () => {
    await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
    await sql("select finance.configure_approval_threshold($1::uuid, 500000)", [operatorId]);
    const started = await sql<{ calendar_year: number; next_value: string; issued: boolean }>(
      "select calendar_year, next_value::text, issued from finance.configure_annual_reference_start($1::uuid, 2026, 42)",
      [operatorId],
    );
    expect(started.rows[0]).toEqual({ calendar_year: 2026, next_value: "42", issued: false });
    const counter = await sql<{ last_issued: string | null; configured_next: string }>(
      "select last_issued::text as last_issued, configured_next::text as configured_next from finance.reference_counters",
    );
    expect(counter.rows[0]).toEqual({ last_issued: null, configured_next: "42" });
    expect((await counts()).purchases).toBe(0);
    await expect(sql("select finance.configure_annual_reference_start($1::uuid, 2026, 41)", [operatorId])).rejects.toThrow(/backward/i);
    await sql("update finance.reference_counters set last_issued = 40 where counter_key = 'purchase:2026'");
    await expect(sql("select finance.configure_annual_reference_start($1::uuid, 2026, 40)", [operatorId])).rejects.toThrow(/reuse/i);
    await sql("select finance.configure_annual_reference_start($1::uuid, 2026, 43)", [operatorId]);
    const raised = await sql<{ last_issued: string; configured_next: string }>(
      "select last_issued::text as last_issued, configured_next::text as configured_next from finance.reference_counters",
    );
    expect(raised.rows[0]).toEqual({ last_issued: "40", configured_next: "43" });
  });

  it("rejects closed-season writes, split earmarks, and unbalanced allocations", async () => {
    await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
    const season = await sql<{ id: string }>("select id from finance.seasons");
    const seasonId = season.rows[0]?.id;
    await sql("update finance.seasons set status = 'closed' where id = $1::uuid", [seasonId]);
    await expect(sql(
      `insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'B-S27', 'draft', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    )).rejects.toThrow(/closed/i);
    await sql("update finance.seasons set status = 'planning' where id = $1::uuid", [seasonId]);
    await sql(
      `insert into finance.systems (department_key, code, name) values
        ('mechanical-production', 'SYS-FR', 'Frame'),
        ('mechanical-production', 'SYS-TR', 'Travel')`,
    );
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'F-S27-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
       select id, 'FE-001', 'Frame work', 100000, 'private condition', $1::uuid, $1::uuid from finance.funding`,
      [operatorId],
    );
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'B-S27', 'draft', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, note, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, s.id, 'BI-S27-001', 'Frame tube', 'material', 250000, 'EM', 'new', 'planned', 'private item note', p.id, $1::uuid, $1::uuid
       from finance.budgets b, finance.systems s, finance.funding_parts p
       where s.code = 'SYS-FR'`,
      [operatorId],
    );
    await expect(sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, s.id, 'BI-S27-002', 'Travel case', 'travel', 1000, 'EM', 'new', 'planned', p.id, $1::uuid, $1::uuid
       from finance.budgets b, finance.systems s, finance.funding_parts p
       where s.code = 'SYS-TR'`,
      [operatorId],
    )).rejects.toThrow(/one system/i);
    await sql(
      `insert into finance.purchases (
         season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind, refund_account
       ) values ($1::uuid, $2::uuid, '2026-0042', 'registered', 'Buyer Example', 'Hidden Supplier', 'outlay', '2026-10-01', 'Workshop material', 'receipt', '12345678901')`,
      [seasonId, memberId],
    );
    await expect(pg.exec(`
      insert into finance.purchase_lines (purchase_id, public_ref, system_id, unbudgeted, description, quantity, amount_ore)
      select p.id, '2026-0042-L1', s.id, true, 'Tube', 1, 1000
      from finance.purchases p, finance.systems s where s.code = 'SYS-FR';
    `)).rejects.toThrow(/allocation/i);
  });

  it("rejects an earmark from another season", async () => {
    await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
    await sql(
      `insert into finance.seasons (code, name, start_date, end_date, created_by_member_id, updated_by_member_id)
       values ('S26', 'Earlier season', '2025-08-01', '2026-07-31', $1::uuid, $1::uuid)`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       select id, 'F-S26-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $1::uuid, $1::uuid
       from finance.seasons where code = 'S26'`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, created_by_member_id, updated_by_member_id)
       select id, 'FE-002', 'Earlier frame', 100000, $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S26-001'`,
      [operatorId],
    );
    await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
       select id, 'B-S27', 'draft', $1::uuid, $1::uuid from finance.seasons where code = 'S27'`,
      [operatorId],
    );
    await expect(sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, s.id, 'BI-S27-001', 'Frame tube', 'material', 1000, 'EM', 'new', 'planned', p.id, $1::uuid, $1::uuid
       from finance.budgets b, finance.systems s, finance.funding_parts p
       where s.code = 'SYS-FR' and p.public_ref = 'FE-002'`,
      [operatorId],
    )).rejects.toThrow(/same season/i);
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       select id, 'F-S27-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $1::uuid, $1::uuid
       from finance.seasons where code = 'S27'`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, created_by_member_id, updated_by_member_id)
       select id, 'FE-001', 'Frame work', 100000, $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S27-001'`,
      [operatorId],
    );
    await expect(sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, s.id, 'BI-S27-001', 'Frame tube', 'material', 1000, 'EM', 'new', 'planned', p.id, $1::uuid, $1::uuid
       from finance.budgets b, finance.systems s, finance.funding_parts p
       where s.code = 'SYS-FR' and p.public_ref = 'FE-001'`,
      [operatorId],
    )).resolves.toBeDefined();
  });

  it("accepts a request season counter without a calendar year", async () => {
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('request:S27', null, 1, $1::uuid)`,
      [operatorId],
    );
    const stored = await sql<{ counter_key: string; calendar_year: number | null }>(
      "select counter_key, calendar_year from finance.reference_counters where counter_key = 'request:S27'",
    );
    expect(stored.rows).toEqual([{ counter_key: "request:S27", calendar_year: null }]);
    await expect(sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('request:2026', null, 1, $1::uuid)`,
      [operatorId],
    )).rejects.toThrow();
    await expect(sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('request:S26', 2026, 1, $1::uuid)`,
      [operatorId],
    )).rejects.toThrow();
  });

  it("keeps a member row while a finance grant points at it", async () => {
    const definition = await sql<{ definition: string }>(`
      select pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = 'finance.member_grants'::regclass
        and c.contype = 'f'
        and a.attname = 'member_id'
        and array_length(c.conkey, 1) = 1
    `);
    expect(definition.rows[0]?.definition).toMatch(/on delete restrict/i);
    await grant(memberId, "finance");
    await expect(sql("delete from identity.members where id = $1::uuid", [memberId])).rejects.toThrow(/member_grants|foreign key|restrict/i);
    const stillThere = await sql<{ id: string }>("select id from identity.members where id = $1::uuid", [memberId]);
    expect(stillThere.rows).toEqual([{ id: memberId }]);
  });
});

describe("finance access API", () => {
  it("denies signed-out, banned, unrelated, and replaced identities", async () => {
    expect((await call({ query: { action: "capabilities" } })).status).toBe(401);
    expect((await call({ query: { action: "capabilities" }, token: "banned" })).body).toEqual({ error: "Use your verified @helixnmbu.no Google Workspace account." });
    expect((await call({ query: { action: "capabilities" }, token: "stranger" })).body).toEqual({ error: "A verified Helix member account is required." });
    const replaced = await call({ query: { action: "overview" }, token: "old" });
    expect(replaced.status).toBe(403);
    expect(replaced.body).toEqual({ error: "Your Google identity no longer matches this profile." });
    expect(replaced.headers["Cache-Control"]).toBe("no-store");
    expect(replaced.headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("gives an ordinary member public reads and denies private actions", async () => {
    const capabilities = await call({ query: { action: "capabilities" }, token: "member" });
    expect(capabilities.status).toBe(200);
    expect(capabilities.body).toMatchObject({ profiles: [], capabilities: capabilitiesForProfiles([]) });
    const overview = await call({ query: { action: "overview" }, token: "member" });
    expect(overview.status).toBe(200);
    const purchases = await call({ query: { action: "purchases" }, token: "member" });
    expect(purchases.body).toEqual({ viewVersion: 0, ownRequests: [] });
    expect(await call({ query: { action: "financing" }, token: "member" })).toMatchObject({ status: 403, body: { error: "Financing access is required." } });
    const denied = await call({ token: "member", body: { action: "voidPurchase", requestId, expectedRevision: 0, purchaseId: memberId, reason: "Coverage" } });
    expect(denied).toMatchObject({ status: 403, body: { error: "Finance access is required." } });
    expect(await call({ token: "member", body: { action: "setMemberGrant", requestId } })).toMatchObject({ status: 400, body: { error: "Unknown request." } });
  });

  it("denies a platform administrator with no finance profile", async () => {
    const financing = await call({ query: { action: "financing" }, token: "admin" });
    expect(financing.status).toBe(403);
    const mutation = await call({ token: "admin", body: { action: "createBudget", requestId } });
    expect(mutation.status).toBe(403);
    const purchases = await call({ query: { action: "purchases" }, token: "admin" });
    expect(purchases.body).not.toHaveProperty("register");
  });

  it("gives no finance capability for a department, a title, team.finance, or the admin wildcard", async () => {
    const elevated = ["financing", "manageFunding", "purchaseRegister", "filesAndRefunds", "paymentsVoidReview", "draftBudgetItems", "permittedImports", "createBudget", "approveBudget", "protectedBudgetEdits", "decideRequests"] as const;
    async function expectNothing(token: "member" | "admin", id: string) {
      const flags = await sql<{ flags: Record<string, unknown> }>("select finance.capability_flags($1::uuid) as flags", [id]);
      expect(flags.rows[0]?.flags.profiles).toEqual([]);
      expect(flags.rows[0]?.flags.publicBudgets).toBe(true);
      for (const key of elevated) expect(flags.rows[0]?.flags[key], key).toBe(false);
      const capabilities = await call({ query: { action: "capabilities" }, token });
      expect(capabilities.status).toBe(200);
      const body = capabilities.body as { profiles: string[]; capabilities: Record<string, boolean> };
      expect(body.profiles).toEqual([]);
      expect(body.capabilities.publicBudgets).toBe(true);
      for (const key of elevated) expect(body.capabilities[key], key).toBe(false);
      expect((await call({ query: { action: "financing" }, token })).status).toBe(403);
      expect((await call({ query: { action: "purchases" }, token })).body).not.toHaveProperty("register");
    }

    await sql("insert into identity.member_departments (member_id, department_key) values ($1::uuid, 'finance')", [memberId]);
    await expectNothing("member", memberId);
    await sql("delete from identity.member_departments where member_id = $1::uuid", [memberId]);

    await sql("update identity.members set helix_role = 'Head of Finance' where id = $1::uuid", [memberId]);
    await expectNothing("member", memberId);
    await sql("update identity.members set helix_role = 'Member' where id = $1::uuid", [memberId]);

    await sql("insert into identity.role_feature_grants (role_key, feature_key, scope) values ('team_member', 'team.finance', 'global')");
    await sql("insert into identity.member_roles (member_id, role_key) values ($1::uuid, 'team_member')", [memberId]);
    await expectNothing("member", memberId);
    await sql("delete from identity.member_roles where member_id = $1::uuid and role_key = 'team_member'", [memberId]);
    await sql("delete from identity.role_feature_grants where feature_key = 'team.finance'");

    await sql("insert into identity.role_feature_grants (role_key, feature_key, scope) values ('platform_administrator', '*', 'all_features')");
    await expectNothing("admin", adminId);
    await sql("delete from identity.role_feature_grants where feature_key = '*'");
  });

  it("filters financing, the purchase register, and head actions by the active grant", async () => {
    await seedPrivateRows();
    const memberPurchases = await call({ query: { action: "purchases" }, token: "member" });
    expect(JSON.stringify(memberPurchases.body)).not.toContain("Hidden Supplier");
    expect(JSON.stringify(memberPurchases.body)).not.toContain("12345678901");
    const budgets = await call({ query: { action: "budgets" }, token: "member" });
    expect(JSON.stringify(budgets.body)).toContain("Frame tube");
    expect(JSON.stringify(budgets.body)).not.toContain("private item note");
    const overview = await call({ query: { action: "overview" }, token: "member" });
    expect(JSON.stringify(overview.body)).toContain("Frame work");
    expect(JSON.stringify(overview.body)).not.toContain("Example source");
    expect(JSON.stringify(overview.body)).not.toContain("private condition");

    await grant(memberId, "business");
    expect((await call({ query: { action: "financing" }, token: "member" })).status).toBe(200);
    expect(JSON.stringify((await call({ query: { action: "financing" }, token: "member" })).body)).toContain("private condition");
    expect(await call({ token: "member", body: { action: "voidPurchase", requestId, expectedRevision: 1, purchaseId: memberId, reason: "Coverage" } })).toMatchObject({ status: 403 });

    await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'business', false, 'Coverage revoke')", [operatorId, memberId]);
    expect((await call({ query: { action: "financing" }, token: "member" })).status).toBe(403);

    await grant(memberId, "finance");
    const register = await call({ query: { action: "purchases" }, token: "member" });
    expect(JSON.stringify(register.body)).toContain("Hidden Supplier");
    expect(JSON.stringify(register.body)).toContain("12345678901");
    const before = await counts();
    expect(await call({ token: "member", body: { action: "registerPurchase", requestId, purchase: {} } })).toMatchObject({
      status: 400,
    });
    expect(await call({ token: "member", body: { action: "voidPurchase", requestId } })).toMatchObject({ status: 400, body: { error: "A valid revision is required." } });
    expect(await call({ token: "member", body: { action: "createBudget", requestId } })).toMatchObject({ status: 403 });
    expect(await counts()).toMatchObject({ purchases: before.purchases, audit_log: before.audit_log, idempotency_keys: 0 });

    await grant(adminId, "head_of_finance");
    const versionBefore = await sql<{ version: string }>("select version::text as version from finance.view_versions");
    expect(await call({ token: "admin", body: { action: "createBudget", requestId } })).toMatchObject({ status: 409, body: { error: "A budget already exists for this season." } });
    const versionAfter = await sql<{ version: string }>("select version::text as version from finance.view_versions");
    expect(versionAfter.rows[0]?.version).toBe(versionBefore.rows[0]?.version);
    expect(await call({ token: "admin", body: { action: "registerPurchase", requestId, purchase: {} } })).toMatchObject({ status: 400 });
  });

  it("hides draft budget items and limits the register to the current season", async () => {
    await seedPrivateRows();
    await sql("update finance.budgets set status = 'draft', approved_by_member_id = null, approved_on = null");
    const hidden = await call({ query: { action: "budgets" }, token: "member" });
    expect(hidden.body).toMatchObject({ budgetStatus: "draft", departments: [] });
    expect(JSON.stringify(hidden.body)).not.toContain("Frame tube");
    await grant(memberId, "business");
    expect(JSON.stringify((await call({ query: { action: "budgets" }, token: "member" })).body)).not.toContain("Frame tube");
    await grant(memberId, "finance");
    expect(JSON.stringify((await call({ query: { action: "budgets" }, token: "member" })).body)).toContain("Frame tube");

    await sql(
      `insert into finance.seasons (code, name, start_date, end_date, created_by_member_id, updated_by_member_id)
       values ('S26', 'Earlier season', '2025-08-01', '2026-07-31', $1::uuid, $1::uuid)`,
      [operatorId],
    );
    await sql(
      `insert into finance.purchases (
         season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
       )
       select id, $1::uuid, '2025-0001', 'registered', 'Buyer Example', 'Other Season Supplier', 'invoice', '2025-10-01', 'Workshop material', 'invoice'
       from finance.seasons where code = 'S26'`,
      [memberId],
    );
    const register = JSON.stringify((await call({ query: { action: "purchases" }, token: "member" })).body);
    expect(register).toContain("Hidden Supplier");
    expect(register).not.toContain("Other Season Supplier");
  });

  it("persists register_purchase in SQL without hanging", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 40, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = crypto.randomUUID();
    const stagingKey = `${memberId}/staging/${uploadId}/abcdef0123456789abcdef0123456789`;
    const finalKey = `${memberId}/final/${uploadId}/abcdef0123456789abcdef0123456789`;
    await sql(
      `insert into finance.uploads (id, member_id, staging_key, final_key, status, byte_size, content_type, original_name, content_sha256, expires_at)
       values ($1::uuid, $2::uuid, $3, $4, 'finalized', 8, 'application/pdf', 'receipt.pdf', 'abc', now() + interval '1 hour')`,
      [uploadId, memberId, stagingKey, finalKey],
    );
    const body = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, unbudgeted: false, description: "Tube", quantity: "1", amountOre: "90000" }],
      uploadIds: [uploadId],
      registrationYear: 2026,
      thresholdOre: "500000",
      missingApproval: false,
      warnings: [],
    };
    const hash = "a".repeat(64);
    const issued = await pg.query<{ public_ref: string }>("select * from finance.issue_purchase_reference($1::uuid, 2026)", [memberId]);
    expect(issued.rows[0]?.public_ref).toBe("2026-0040");
    const result = await pg.query<{ result: { ok: boolean } }>(
      "select finance.register_purchase($1::uuid, $2::uuid, $3, $4::jsonb) as result",
      [memberId, crypto.randomUUID(), hash, JSON.stringify(body)],
    );
    expect(result.rows[0]?.result).toMatchObject({ ok: true });
  });

  it("registers a purchase with uploads, bumps the view version, and replays idempotently", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await grant(adminId, "head_of_finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 40, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const { putMemoryPdf } = await import("./finance-storage-mock.js");
    const auth = await call({
      token: "member",
      body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 },
    });
    expect(auth.status).toBe(200);
    const stagingKey = (auth.body as { stagingKey?: string }).stagingKey ?? "";
    await putMemoryPdf(financeStorage, stagingKey);
    const uploadId = (auth.body as { id?: string }).id;
    expect((await call({ token: "member", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } })).status).toBe(200);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Tube stock", quantity: "3", amountNok: "900.00" }],
      uploadIds: [uploadId],
    };
    const before = Number((await sql<{ version: string }>("select version::text as version from finance.view_versions")).rows[0]?.version ?? "0");
    const rid = crypto.randomUUID();
    const saved = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    if (saved.status !== 200) throw new Error(JSON.stringify(saved.body));
    expect(saved.body).toMatchObject({ ok: true });
    const after = Number((await sql<{ version: string }>("select version::text as version from finance.view_versions")).rows[0]?.version ?? "0");
    expect(after).toBe(before + 1);
    expect((await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } })).body).toMatchObject(saved.body as Record<string, unknown>);
    expect((await counts()).purchases).toBe(2);
  });

  it("enforces purchase registration quota and upload ownership", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const season = (await sql<{ id: string }>("select id from finance.seasons")).rows[0]?.id;
    for (let index = 0; index < 20; index += 1) {
      await sql(
        `insert into finance.purchases (
           season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
         ) values ($1::uuid, $2::uuid, $3, 'registered', 'Buyer', 'Supplier', 'team_account', '2026-10-01', 'Justification text', 'receipt')`,
        [season, memberId, `2026-${String(1000 + index)}`],
      );
    }
    const { putMemoryPdf } = await import("./finance-storage-mock.js");
    const auth = await call({
      token: "member",
      body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 },
    });
    await putMemoryPdf(financeStorage, (auth.body as { stagingKey?: string }).stagingKey ?? "");
    const uploadId = (auth.body as { id?: string }).id;
    await call({ token: "member", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } });
    const blocked = await call({
      token: "member",
      body: {
        action: "registerPurchase",
        requestId: crypto.randomUUID(),
        purchase: {
          buyerName: "Buyer Example",
          supplierName: "Supplier Example",
          paymentMethod: "team_account",
          purchaseDate: "2026-10-01",
          justification: "Workshop material for frame",
          documentKind: "receipt",
          lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
          uploadIds: [uploadId],
        },
      },
    });
    expect(blocked.status).toBe(429);
    const otherAuth = await call({
      token: "member",
      body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 },
    });
    await putMemoryPdf(financeStorage, (otherAuth.body as { stagingKey?: string }).stagingKey ?? "");
    expect((await call({ token: "stranger", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId: (otherAuth.body as { id?: string }).id } })).status).toBe(403);
  });

  it("enforces purchase upload limits at the API without writes or view bumps on rejection", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const purchaseBase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
    };

    const versionBeforeLimits = await viewVersion();
    const uploadsBefore = await tableCount("uploads");
    const purchasesBefore = await tableCount("purchases");

    expect(
      await call({
        token: "member",
        body: {
          action: "authorizeUpload",
          requestId: crypto.randomUUID(),
          fileName: "large.pdf",
          contentType: "application/pdf",
          byteSize: MAX_PURCHASE_FILE_BYTES + 1,
        },
      }),
    ).toMatchObject({ status: 400 });
    expect(await tableCount("uploads")).toBe(uploadsBefore);
    expect(await viewVersion()).toBe(versionBeforeLimits);

    const exactAuth = await call({
      token: "member",
      body: {
        action: "authorizeUpload",
        requestId: crypto.randomUUID(),
        fileName: "max.pdf",
        contentType: "application/pdf",
        byteSize: MAX_PURCHASE_FILE_BYTES,
      },
    });
    expect(exactAuth.status).toBe(200);
    expect(await tableCount("uploads")).toBe(uploadsBefore + 1);
    expect(await viewVersion()).toBe(versionBeforeLimits);
    const maxStagingKey = (exactAuth.body as { stagingKey?: string }).stagingKey ?? "";
    const { putSizedPdf } = await import("./finance-storage-mock.js");
    putSizedPdf(financeStorage, maxStagingKey, MAX_PURCHASE_FILE_BYTES);
    const maxUploadId = (exactAuth.body as { id?: string }).id;
    expect(
      await call({ token: "member", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId: maxUploadId } }),
    ).toMatchObject({ status: 200 });
    expect(await viewVersion()).toBe(versionBeforeLimits);

    expect(
      await call({
        token: "member",
        body: { action: "registerPurchase", requestId: crypto.randomUUID(), purchase: { ...purchaseBase, uploadIds: [] } },
      }),
    ).toMatchObject({ status: 400 });
    expect(await tableCount("purchases")).toBe(purchasesBefore);
    expect(await viewVersion()).toBe(versionBeforeLimits);

    const sixteenIds = Array.from({ length: MAX_PURCHASE_FILES + 1 }, () => crypto.randomUUID());
    expect(
      await call({
        token: "member",
        body: { action: "registerPurchase", requestId: crypto.randomUUID(), purchase: { ...purchaseBase, uploadIds: sixteenIds } },
      }),
    ).toMatchObject({ status: 400 });
    expect(await tableCount("purchases")).toBe(purchasesBefore);
    expect(await viewVersion()).toBe(versionBeforeLimits);

    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 50, $1::uuid)`,
      [operatorId],
    );
    const fifteenIds: string[] = [];
    for (let index = 0; index < MAX_PURCHASE_FILES; index += 1) {
      fifteenIds.push(await authorizeAndFinalizeUpload(8));
    }
    const versionBeforeRegister = await viewVersion();
    const saved = await call({
      token: "member",
      body: {
        action: "registerPurchase",
        requestId: crypto.randomUUID(),
        purchase: { ...purchaseBase, uploadIds: fifteenIds },
      },
    });
    expect(saved.status).toBe(200);
    expect(await viewVersion()).toBe(versionBeforeRegister + 1);
    expect(await tableCount("purchases")).toBe(purchasesBefore + 1);
    expect(await tableCount("documents")).toBe(MAX_PURCHASE_FILES);
  });

  it("records missing-approval exception, warnings, and finance outbox with single view bump and idempotent replay", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await grant(adminId, "head_of_finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 60, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = await authorizeAndFinalizeUpload(8);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [
        { systemId, budgetItemId: itemId, description: "Over plan line", quantity: "1", amountNok: "3000.00" },
        { systemId, unbudgeted: true, description: "Unbudgeted line", quantity: "1", amountNok: "3500.00" },
      ],
      uploadIds: [uploadId],
    };
    const versionBefore = await viewVersion();
    const rid = crypto.randomUUID();
    const saved = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    if (saved.status !== 200) throw new Error(JSON.stringify(saved.body));
    expect(await viewVersion()).toBe(versionBefore + 1);

    const warnings = (saved.body as { warnings?: { message: string }[] }).warnings ?? [];
    expect(warnings.some((row) => /not in the budget/i.test(row.message))).toBe(true);
    expect(warnings.some((row) => /exceed the plan/i.test(row.message))).toBe(true);
    expect(warnings.some((row) => /approval threshold/i.test(row.message))).toBe(true);

    const exceptions = await sql<{ kind: string; facts: Record<string, string> }>(
      "select kind, facts from finance.exception_reviews",
    );
    expect(exceptions.rows).toHaveLength(1);
    expect(exceptions.rows[0]).toMatchObject({
      kind: "missing_approval",
      facts: { totalOre: "650000", thresholdOre: "500000" },
    });
    expect(exceptions.rows[0]?.facts.publicRef).toMatch(/^2026-/);

    const outbox = await sql<{ event_type: string; payload: Record<string, string> }>(
      "select event_type, payload from finance.outbox order by recipient_member_id::text",
    );
    expect(outbox.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of outbox.rows) {
      expect(row.event_type).toBe("purchase_registered");
      expect(row.payload).toMatchObject({
        publicRef: exceptions.rows[0]?.facts.publicRef,
        supplierName: "Supplier Example",
        totalOre: "650000",
      });
      expect(row.payload).not.toHaveProperty("buyerName");
      expect(row.payload).not.toHaveProperty("refundAccount");
      expect(row.payload).not.toHaveProperty("refundPhone");
    }

    const replay = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject(saved.body as Record<string, unknown>);
    expect(await viewVersion()).toBe(versionBefore + 1);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.exception_reviews")).rows[0]?.count).toBe("1");
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.outbox")).rows[0]?.count).toBe(String(outbox.rows.length));

    const stored = await sql<{ response: { warnings: { message: string }[] } }>(
      "select response from finance.idempotency_keys where member_id = $1::uuid and request_id = $2::uuid",
      [memberId, rid],
    );
    const storedWarnings = stored.rows[0]?.response?.warnings ?? [];
    expect(storedWarnings.some((row) => /not in the budget/i.test(row.message))).toBe(true);
    expect(storedWarnings.some((row) => /exceed the plan/i.test(row.message))).toBe(true);
  });

  it("keeps register_purchase advisory lock, item key-share locks, and post-budget quota count in migration 014", () => {
    const source = readFileSync(new URL("../../../db/migrations/014_finance_register_purchases.sql", import.meta.url), "utf8");
    const start = source.indexOf("create or replace function finance.register_purchase");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("$fn$;", start + 1));
    expect(body).toMatch(
      /perform pg_advisory_xact_lock\(hashtextextended\(p_actor::text \|\| ':' \|\| p_request_id::text, 0\)\);\s*replay := finance\.begin_purchase_mutation/,
    );
    const keyShare = body.indexOf("for key share of i");
    const budgetLock = body.indexOf("current_budget := finance.lock_current_budget()");
    const quotaSelect = body.indexOf("select count(*)::integer into quota_count");
    expect(keyShare).toBeGreaterThan(-1);
    expect(budgetLock).toBeGreaterThan(keyShare);
    expect(quotaSelect).toBeGreaterThan(budgetLock);
  });

  it("allows the 20th hourly purchase and rejects the 21st after the budget lock quota check", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    const season = (await sql<{ id: string }>("select id from finance.seasons")).rows[0]?.id;
    for (let index = 0; index < 18; index += 1) {
      await sql(
        `insert into finance.purchases (
           season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
         ) values ($1::uuid, $2::uuid, $3, 'registered', 'Buyer', 'Supplier', 'team_account', '2026-10-01', 'Justification text', 'receipt')`,
        [season, memberId, `2026-${String(2000 + index)}`],
      );
    }
    expect(await tableCount("purchases")).toBe(19);
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 70, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = await authorizeAndFinalizeUpload(8);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
      uploadIds: [uploadId],
    };
    const versionBefore = await viewVersion();
    expect((await call({ token: "member", body: { action: "registerPurchase", requestId: crypto.randomUUID(), purchase } })).status).toBe(200);
    expect(await tableCount("purchases")).toBe(20);
    expect(await viewVersion()).toBe(versionBefore + 1);
    const uploadId2 = await authorizeAndFinalizeUpload(8);
    expect(
      (await call({
        token: "member",
        body: {
          action: "registerPurchase",
          requestId: crypto.randomUUID(),
          purchase: { ...purchase, uploadIds: [uploadId2] },
        },
      })).status,
    ).toBe(429);
    expect(await tableCount("purchases")).toBe(20);
    expect(await viewVersion()).toBe(versionBefore + 1);
  });

  it("replays a stored registerPurchase before validation when the budget is no longer approved", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 80, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = await authorizeAndFinalizeUpload(8);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
      uploadIds: [uploadId],
    };
    const rid = crypto.randomUUID();
    const saved = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    expect(saved.status).toBe(200);
    const purchasesAfterSave = await tableCount("purchases");
    const auditsAfterSave = await tableCount("audit_log");
    const outboxAfterSave = await tableCount("outbox");
    const versionAfterSave = await viewVersion();
    await sql("update finance.budgets set status = 'draft', approved_by_member_id = null, approved_on = null");
    const replay = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject(saved.body as Record<string, unknown>);
    expect(await tableCount("purchases")).toBe(purchasesAfterSave);
    expect(await tableCount("audit_log")).toBe(auditsAfterSave);
    expect(await tableCount("outbox")).toBe(outboxAfterSave);
    expect(await viewVersion()).toBe(versionAfterSave);
  });

  it("replays duplicate registerPurchase without a second write or view bump", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 90, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = await authorizeAndFinalizeUpload(8);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
      uploadIds: [uploadId],
    };
    const rid = crypto.randomUUID();
    const versionBefore = await viewVersion();
    const saved = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    expect(saved.status).toBe(200);
    const purchasesAfter = await tableCount("purchases");
    const auditsAfter = await tableCount("audit_log");
    const outboxAfter = await tableCount("outbox");
    expect(await viewVersion()).toBe(versionBefore + 1);
    const replay = await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject(saved.body as Record<string, unknown>);
    expect(await tableCount("purchases")).toBe(purchasesAfter);
    expect(await tableCount("audit_log")).toBe(auditsAfter);
    expect(await tableCount("outbox")).toBe(outboxAfter);
    expect(await tableCount("idempotency_keys")).toBe(1);
    expect(await viewVersion()).toBe(versionBefore + 1);
  });

  it("rejects registerPurchase when the same requestId is reused with a different purchase payload", async () => {
    await seedPrivateRows();
    await grant(memberId, "finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 95, $1::uuid)`,
      [operatorId],
    );
    const [{ id: systemId }] = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'")).rows;
    const [{ id: itemId }] = (await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'")).rows;
    const uploadId = await authorizeAndFinalizeUpload(8);
    const uploadId2 = await authorizeAndFinalizeUpload(8);
    const purchase = {
      buyerName: "Buyer Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "10.00" }],
      uploadIds: [uploadId],
    };
    const rid = crypto.randomUUID();
    const versionBefore = await viewVersion();
    expect((await call({ token: "member", body: { action: "registerPurchase", requestId: rid, purchase } })).status).toBe(200);
    const purchasesAfter = await tableCount("purchases");
    const changed = await call({
      token: "member",
      body: {
        action: "registerPurchase",
        requestId: rid,
        purchase: {
          ...purchase,
          supplierName: "Other Supplier Example",
          lines: [{ systemId, budgetItemId: itemId, description: "Line", quantity: "1", amountNok: "99.00" }],
          uploadIds: [uploadId2],
        },
      },
    });
    expect(changed).toMatchObject({
      status: 409,
      body: { error: "This request ID was already used for a different change." },
    });
    expect(await tableCount("purchases")).toBe(purchasesAfter);
    expect(await viewVersion()).toBe(versionBefore + 1);
  });

  it("returns an unchanged view without skipping a financing denial", async () => {
    const same = await call({ query: { action: "overview", knownVersion: "0" }, token: "member" });
    expect(same.body).toEqual({ unchanged: true, viewVersion: 0 });
    expect((await call({ query: { action: "financing", knownVersion: "0" }, token: "member" })).status).toBe(403);
    expect((await call({ method: "PUT", token: "member" })).status).toBe(405);
    expect((await call({ token: "member", body: { action: "checkPurchase", requestId: "not-a-uuid" } })).status).toBe(400);
    const large = await call({ token: "member", body: { action: "checkPurchase", requestId }, contentLength: 2 * 1024 * 1024 + 1 });
    expect(large).toMatchObject({ status: 413, body: { error: "The request is too large." } });
  });
});

async function viewVersion() {
  return Number((await sql<{ version: string }>("select version::text as version from finance.view_versions")).rows[0]?.version ?? "0");
}

async function tableCount(table: string) {
  const rows = await sql<{ count: string }>(`select count(*)::text as count from finance.${table}`);
  return Number(rows.rows[0]?.count ?? 0);
}

async function authorizeAndFinalizeUpload(byteSize: number) {
  const auth = await call({
    token: "member",
    body: {
      action: "authorizeUpload",
      requestId: crypto.randomUUID(),
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize,
    },
  });
  if (auth.status !== 200) throw new Error(JSON.stringify(auth.body));
  const stagingKey = (auth.body as { stagingKey?: string }).stagingKey ?? "";
  const { putMemoryPdf, putSizedPdf } = await import("./finance-storage-mock.js");
  if (byteSize <= 8) await putMemoryPdf(financeStorage, stagingKey);
  else putSizedPdf(financeStorage, stagingKey, byteSize);
  const uploadId = (auth.body as { id?: string }).id;
  const finalized = await call({ token: "member", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } });
  if (finalized.status !== 200) throw new Error(JSON.stringify(finalized.body));
  return uploadId as string;
}

async function seedPrivateRows() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  await sql("select finance.configure_approval_threshold($1::uuid, 500000)", [operatorId]);
  const season = await sql<{ id: string }>("select id from finance.seasons");
  const seasonId = season.rows[0]?.id;
  await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
  await sql(
    `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
     values ($1::uuid, 'F-S27-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $2::uuid, $2::uuid)`,
    [seasonId, operatorId],
  );
  await sql(
    `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
     select id, 'FE-001', 'Frame work', 100000, 'private condition', $1::uuid, $1::uuid from finance.funding`,
    [operatorId],
  );
  await sql(
    `insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
     values ($1::uuid, 'B-S27', 'draft', $2::uuid, $2::uuid)`,
    [seasonId, operatorId],
  );
  await sql(
    `insert into finance.budget_items (
       budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, note, created_by_member_id, updated_by_member_id
     )
     select b.id, s.id, 'BI-S27-001', 'Frame tube', 'material', 250000, 'P2', 'new', 'planned', 'private item note', $1::uuid, $1::uuid
     from finance.budgets b, finance.systems s`,
    [operatorId],
  );
  await sql(
    `insert into finance.purchases (
       season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind, refund_account
     ) values ($1::uuid, $2::uuid, '2026-0042', 'registered', 'Buyer Example', 'Hidden Supplier', 'outlay', '2026-10-01', 'Workshop material', 'receipt', '12345678901')`,
    [seasonId, memberId],
  );
  await sql(
    `update finance.budgets
     set status = 'approved', approved_by_member_id = $1::uuid, approved_on = '2026-10-01'`,
    [operatorId],
  );
}

describe("finance snapshot", () => {
  it("reads flags and the view version together, then redacts refunds and draft items", async () => {
    const queries: string[] = [];
    const flags = {
      ...capabilitiesForProfiles([]),
      profiles: [] as string[],
      purchaseRegister: true,
      filesAndRefunds: false,
      draftBudgetItems: false,
    };
    const snapshot = createFinanceServices({
      db: {
        query: async <T>(text: string) => {
          queries.push(text);
          if (text.includes("capability_flags") !== text.includes("finance.view_versions")) throw new Error("split snapshot");
          if (text.includes("finance.budget_items")) throw new Error("draft items queried");
          if (text.includes("identity.members")) return { rows: [{ id: memberId }] as T[] };
          if (text.includes("capability_flags")) {
            return { rows: [{ flags, version: "4", season_code: "S27", threshold_ore: null }] as T[] };
          }
          if (text.includes("finance.requests")) return { rows: [] as T[] };
          if (text.includes("finance.purchases")) {
            if (!text.includes("s.code")) throw new Error("missing season filter");
            return {
              rows: [{
                id: "purchase",
                public_ref: "2026-0042",
                status: "registered",
                buyer_name: "Buyer Example",
                supplier_name: "Hidden Supplier",
                payment_method: "outlay",
                purchase_date: "2026-10-01",
                total_ore: "1000",
                refund_account: "private-account",
                refund_phone: "private-phone",
              }] as T[],
            };
          }
          if (text.includes("finance.budgets")) {
            return { rows: [{ id: "budget", status: "draft", approved_on: null }] as T[] };
          }
          return { rows: [] as T[] };
        },
      },
      authenticate: async () => identities.member,
    });
    const purchases = await snapshot.purchases("member");
    expect(purchases).toMatchObject({
      viewVersion: 4,
      register: [{ supplierName: "Hidden Supplier", refundAccount: null, refundPhone: null }],
    });
    const budgets = await snapshot.budgets("member");
    expect(budgets).toMatchObject({ budgetStatus: "draft", departments: [] });
    const snapshots = queries.filter((query) => query.includes("capability_flags") || query.includes("finance.view_versions"));
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((query) => query.includes("capability_flags") && query.includes("finance.view_versions") && !query.includes(";"))).toBe(true);
  });
});
