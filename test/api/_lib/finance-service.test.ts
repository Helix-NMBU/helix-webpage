import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { capabilitiesForProfiles } from "../../../api/_lib/finance-access.js";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { FinanceProfile } from "../../../api/_lib/finance-types.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

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
    insert into identity.platform_roles values ('platform_administrator');
    insert into identity.member_roles values ('${adminId}', 'platform_administrator');
    insert into identity.recruiter_grants values ('${adminId}');
    create role anon;
    create role authenticated;
    create role anonymous;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  db = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  services = createFinanceServices({
    db,
    authenticate: async (token) => {
      if (token === "banned") throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
      const identity = identities[token];
      if (!identity) throw new MemberCvError(401, "Log in to continue.");
      return identity;
    },
  });
  handler = createFinanceHandler(() => services);
});

beforeEach(async () => {
  await pg.exec(`
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
    update finance.view_versions set version = 0 where singleton;
  `);
});

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
      await pg.exec("truncate finance.member_grants, finance.audit_log; update finance.view_versions set version = 0;");
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
      status: 503,
      body: { error: "This finance operation is not available yet." },
    });
    expect(await call({ token: "member", body: { action: "voidPurchase", requestId } })).toMatchObject({ status: 400, body: { error: "A valid revision is required." } });
    expect(await call({ token: "member", body: { action: "createBudget", requestId } })).toMatchObject({ status: 403 });
    expect(await counts()).toMatchObject({ purchases: before.purchases, audit_log: before.audit_log, idempotency_keys: 0 });

    await grant(adminId, "head_of_finance");
    expect(await call({ token: "admin", body: { action: "createBudget", requestId } })).toMatchObject({ status: 503, body: { error: "This finance operation is not available yet." } });
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
}
