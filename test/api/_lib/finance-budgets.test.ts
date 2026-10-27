import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { PublicBudgets } from "../../../api/_lib/finance-types.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const financeId = "66666666-6666-4666-8666-666666666666";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  finance: { userId: financeId, googleSub: "finance-sub", email: "finance@example.test", name: "Finance Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let sequence = 0;

function response() {
  let status = 0;
  let body: unknown;
  const res = {
    setHeader: () => {},
    status: (code: number) => { status = code; return res; },
    json: (value: unknown) => { body = value; return res; },
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body }) };
}

async function call(token: string, body: Record<string, unknown>) {
  const wrapped = response();
  await handler({ method: "POST", query: {}, body, headers: { authorization: `Bearer ${token}` } } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function read(token: string, action = "budgets") {
  const wrapped = response();
  await handler({ method: "GET", query: { action }, body: undefined, headers: { authorization: `Bearer ${token}` } } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await pg.query(text, params);
  return result.rows as T[];
}

function requestId() {
  sequence += 1;
  return `77777777-7777-4777-8777-${String(sequence).padStart(12, "0")}`;
}

async function version() {
  const rows = await sql<{ version: string }>("select version::text as version from finance.view_versions");
  return rows[0]?.version ?? "0";
}

async function grant(member: string, profile: string) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function season() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  await sql(
    `insert into finance.systems (department_key, code, name, active) values
      ('mechanical-production', 'SYS-FR', 'Frame', true),
      ('mechanical-production', 'SYS-LV', 'Linkage', false),
      ('finance', 'SYS-TR', 'Travel', true)`,
  );
}

async function counters() {
  return sql<{ counter_key: string; configured_next: string; last_issued: string | null }>(
    "select counter_key, configured_next::text as configured_next, last_issued::text as last_issued from finance.reference_counters order by counter_key",
  );
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
    insert into identity.departments (department_key, name, sort_order) values
      ('mechanical-production', 'Mechanical', 1),
      ('finance', 'Finance', 2);
    create table identity.platform_roles (role_key text primary key);
    create table identity.member_roles (member_id uuid not null, role_key text not null);
    insert into identity.members (id, google_sub, email, full_name) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example'),
      ('${headId}', 'head-sub', 'head@example.test', 'Head Example'),
      ('${financeId}', 'finance-sub', 'finance@example.test', 'Finance Example');
    insert into identity.platform_roles values ('platform_administrator');
    insert into identity.member_roles values ('${operatorId}', 'platform_administrator');
    create role anon;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/012_finance_season_budgets.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/013_finance_funding.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/014_finance_register_purchases.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/015_finance_requests.sql", import.meta.url), "utf8"));
  const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  const services = createFinanceServices({
    db,
    authenticate: async (token) => {
      const identity = identities[token];
      if (!identity) throw new MemberCvError(401, "Log in to continue.");
      return identity;
    },
  });
  handler = createFinanceHandler(() => services);
});

beforeEach(async () => {
  sequence = 0;
  await pg.exec("rollback").catch(() => undefined);
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    update finance.requests set submitted_revision_id = null, approved_revision_id = null;
    truncate table
      finance.allocations, finance.purchase_lines, finance.outlay_reimbursements, finance.invoice_obligations,
      finance.documents, finance.uploads, finance.exception_reviews, finance.purchases,
      finance.request_draft_lines, finance.request_lines, finance.request_decisions, finance.request_revisions, finance.requests,
      finance.budget_items, finance.budgets, finance.funding_parts, finance.funding, finance.systems,
      finance.seasons, finance.idempotency_keys, finance.outbox, finance.member_grants, finance.settings,
      finance.reference_counters, finance.audit_log
    restart identity;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
});

afterAll(async () => { await pg.close(); });

describe("season budgets", () => {
  it("lets only the head create one draft with unallocated items and bumps the view once", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await sql(
      `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
       values ('purchase:2026', 2026, 40, $1::uuid), ('request:S27', null, 7, $1::uuid)`,
      [operatorId],
    );
    const preserved = await counters();
    const before = await version();
    expect((await call("member", { action: "createBudget", requestId: requestId() })).status).toBe(403);
    expect((await call("finance", { action: "createBudget", requestId: requestId() })).status).toBe(403);
    expect(await version()).toBe(before);
    const created = await call("head", { action: "createBudget", requestId: requestId() });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ ok: true, warnings: [], errors: [] });
    expect(await version()).toBe(String(Number(before) + 1));
    const budgets = await sql<{ public_ref: string; status: string; approved_by_member_id: string | null }>("select public_ref, status, approved_by_member_id from finance.budgets");
    expect(budgets).toEqual([{ public_ref: "B-S27", status: "draft", approved_by_member_id: null }]);
    const items = await sql<{ public_ref: string; planned_ore: string; protected: boolean; code: string }>(
      `select i.public_ref, i.planned_ore::text as planned_ore, i.protected, s.code
       from finance.budget_items i join finance.systems s on s.id = i.system_id order by i.public_ref`,
    );
    expect(items).toEqual([
      { public_ref: "BI-S27-FR-UNALLOC", planned_ore: "0", protected: true, code: "SYS-FR" },
      { public_ref: "BI-S27-TR-UNALLOC", planned_ore: "0", protected: true, code: "SYS-TR" },
    ]);
    expect(await counters()).toEqual(preserved);
    const duplicate = await call("head", { action: "createBudget", requestId: requestId() });
    expect(duplicate).toMatchObject({ status: 409, body: { error: "A budget already exists for this season." } });
    expect(await version()).toBe(String(Number(before) + 1));
    expect(await sql("select count(*)::text as count from finance.budgets")).toEqual([{ count: "1" }]);
  });

  it("rolls back a budget create with its view bump", async () => {
    await season();
    await grant(headId, "head_of_finance");
    const before = await version();
    await pg.exec("begin");
    try {
      await sql("select finance.create_season_budget($1::uuid, $2::uuid, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')", [headId, requestId()]);
      expect(Number(await version())).toBe(Number(before) + 1);
    } finally {
      await pg.exec("rollback");
    }
    expect(await version()).toBe(before);
    expect(await sql("select count(*)::text as count from finance.budgets")).toEqual([{ count: "0" }]);
  });

  it("approves a draft once and records the actor, date, and audit", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    expect((await call("head", { action: "createBudget", requestId: requestId() })).status).toBe(200);
    const before = await version();
    expect((await call("finance", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 })).status).toBe(403);
    expect(await version()).toBe(before);
    const approved = await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
    expect(approved.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    const row = await sql<{ status: string; approved_by_member_id: string; approved_on: string; revision: number }>(
      "select status, approved_by_member_id, approved_on::text as approved_on, revision from finance.budgets",
    );
    expect(row[0]).toMatchObject({ status: "approved", approved_by_member_id: headId, revision: 1 });
    expect(row[0]?.approved_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const audit = await sql<{ field_name: string; old_value: string | null; new_value: string | null; actor_member_id: string }>(
      "select field_name, old_value, new_value, actor_member_id from finance.audit_log where entity = 'budget' and field_name = 'status' order by occurred_at",
    );
    expect(audit.at(-1)).toMatchObject({ field_name: "status", old_value: "draft", new_value: "approved", actor_member_id: headId });
    const repeat = await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 1 });
    expect(repeat).toMatchObject({ status: 409, body: { error: "This budget is already approved." } });
    expect(await version()).toBe(String(Number(before) + 1));
    const replayId = requestId();
    const first = await call("head", { action: "approveBudget", requestId: replayId, expectedRevision: 0 });
    expect(first.status).toBe(409);
    await pg.exec("begin");
    await sql(
      "select finance.approve_season_budget($1::uuid, $2::uuid, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 0, '2026-10-26')",
      [headId, requestId()],
    ).catch(() => undefined);
    await pg.exec("rollback");
    expect(await version()).toBe(String(Number(before) + 1));
  });

  it("validates manual item fields and lets finance edit a draft", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const system = await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'");
    const systemId = system[0]?.id;
    const before = await version();
    const invalid = await call("finance", {
      action: "addItem",
      requestId: requestId(),
      expectedRevision: 0,
      item: { systemId, description: " ", plannedNok: "10.555", priority: "EM" },
    });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).toContain("description");
    expect(await version()).toBe(before);
    const added = await call("finance", {
      action: "addItem",
      requestId: requestId(),
      expectedRevision: 0,
      item: { systemId, description: "Frame tube", plannedNok: "2 500,00" },
    });
    expect(added.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    const item = await sql<{ id: string; public_ref: string; category: string; priority: string; reuse_status: string; status: string; planned_ore: string }>(
      "select id, public_ref, category, priority, reuse_status, status, planned_ore::text as planned_ore from finance.budget_items where protected = false",
    );
    expect(item[0]).toMatchObject({ public_ref: "BI-S27-001", category: "material", priority: "P1", reuse_status: "new", status: "planned", planned_ore: "250000" });
    const countersAfter = await counters();
    expect(countersAfter).toEqual([{ counter_key: "budget_item:S27", configured_next: "2", last_issued: "1" }]);
    const edited = await call("finance", {
      action: "editItem",
      requestId: requestId(),
      expectedRevision: 0,
      itemId: item[0]?.id,
      patch: { note: "Workshop note", ownerEmail: "owner@example.test", category: "component" },
    });
    expect(edited.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 2));
    const note = await sql<{ note: string; owner_email: string; category: string }>("select note, owner_email, category from finance.budget_items where protected = false");
    expect(note[0]).toEqual({ note: "Workshop note", owner_email: "owner@example.test", category: "component" });
  });

  it("keeps protected approved changes with the head and a before and after audit", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const system = await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'");
    const travel = await sql<{ id: string }>("select id from finance.systems where code = 'SYS-TR'");
    await call("finance", {
      action: "addItem",
      requestId: requestId(),
      expectedRevision: 0,
      item: { systemId: system[0]?.id, description: "Frame tube", plannedNok: "100.00", priority: "P2", category: "material", reuseStatus: "new" },
    });
    await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
    const item = await sql<{ id: string; revision: number }>("select id, revision from finance.budget_items where protected = false");
    const before = await version();
    const denied = await call("finance", {
      action: "editItem",
      requestId: requestId(),
      expectedRevision: item[0]?.revision,
      itemId: item[0]?.id,
      patch: { plannedNok: "80.00" },
      reason: "Reduce the plan",
    });
    expect(denied.status).toBe(403);
    expect(await version()).toBe(before);
    const missingReason = await call("head", {
      action: "editItem",
      requestId: requestId(),
      expectedRevision: item[0]?.revision,
      itemId: item[0]?.id,
      patch: { plannedNok: "80.00" },
    });
    expect(missingReason.status).toBe(400);
    expect(await version()).toBe(before);
    const moved = await call("finance", {
      action: "editItem",
      requestId: requestId(),
      expectedRevision: item[0]?.revision,
      itemId: item[0]?.id,
      patch: { systemId: travel[0]?.id, note: "Moved for travel" },
    });
    expect(moved.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    const moveAudit = await sql<{ field_name: string; old_value: string; new_value: string }>(
      "select field_name, old_value, new_value from finance.audit_log where field_name = 'system_id' and old_value is not null",
    );
    expect(moveAudit[0]).toEqual({ field_name: "system_id", old_value: system[0]?.id, new_value: travel[0]?.id });
    const current = await sql<{ revision: number; planned_ore: string }>("select revision, planned_ore::text as planned_ore from finance.budget_items where id = $1::uuid", [item[0]?.id]);
    const changed = await call("head", {
      action: "editItem",
      requestId: requestId(),
      expectedRevision: current[0]?.revision,
      itemId: item[0]?.id,
      patch: { plannedNok: "80.00", priority: "P3" },
      reason: "Defer part of the plan",
    });
    expect(changed.status).toBe(200);
    const amountAudit = await sql<{ old_value: string; new_value: string; reason: string }>(
      "select old_value, new_value, reason from finance.audit_log where field_name = 'planned_ore' and old_value = '10000'",
    );
    expect(amountAudit[0]).toEqual({ old_value: "10000", new_value: "8000", reason: "Defer part of the plan" });
    expect((await sql<{ planned_ore: string }>("select planned_ore::text as planned_ore from finance.budget_items where id = $1::uuid", [item[0]?.id]))[0]?.planned_ore).toBe("8000");
  });

  it("cancels and restores an item without losing its id, plan, or spending", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const system = await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'");
    await call("finance", {
      action: "addItem",
      requestId: requestId(),
      expectedRevision: 0,
      item: { systemId: system[0]?.id, description: "Frame tube", plannedNok: "50.00" },
    });
    const item = await sql<{ id: string; public_ref: string; planned_ore: string }>(
      "select id, public_ref, planned_ore::text as planned_ore from finance.budget_items where protected = false",
    );
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    await pg.exec("begin");
    await sql(
      `insert into finance.purchases (
         season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
       ) values ($1::uuid, $2::uuid, '2026-0042', 'registered', 'Buyer Example', 'Hidden Supplier', 'team_account', '2026-10-01', 'Workshop material', 'receipt')`,
      [seasonId, memberId],
    );
    await sql(
      `insert into finance.purchase_lines (purchase_id, public_ref, system_id, budget_item_id, description, quantity, amount_ore)
       select p.id, '2026-0042-L1', $1::uuid, $2::uuid, 'Tube', 3, 900
       from finance.purchases p where p.public_ref = '2026-0042'`,
      [system[0]?.id, item[0]?.id],
    );
    await sql(
      `insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
       select id, $1::uuid, '2026-0042-L1-A1', 900 from finance.purchase_lines`,
      [item[0]?.id],
    );
    await pg.exec("commit");
    const before = await version();
    const cancelled = await call("finance", { action: "cancelItem", requestId: requestId(), expectedRevision: 0, itemId: item[0]?.id });
    expect(cancelled.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    const stored = await sql<{ id: string; public_ref: string; planned_ore: string; status: string }>(
      "select id, public_ref, planned_ore::text as planned_ore, status from finance.budget_items where id = $1::uuid",
      [item[0]?.id],
    );
    expect(stored[0]).toEqual({ id: item[0]?.id, public_ref: item[0]?.public_ref, planned_ore: "5000", status: "cancelled" });
    const body = (await read("finance")).body as PublicBudgets;
    const visible = body.departments.flatMap((department) => department.systems).flatMap((entry) => entry.items).find((entry) => entry.id === item[0]?.id);
    expect(visible).toMatchObject({ plannedNok: "50.00", effectivePlanNok: "0.00", actualNok: "9.00", differenceNok: "-9.00", status: "cancelled" });
    const frame = body.departments.find((department) => department.departmentKey === "mechanical-production")?.systems.find((entry) => entry.code === "SYS-FR");
    expect(frame).toMatchObject({ plannedNok: "0.00", actualNok: "9.00", differenceNok: "-9.00" });
    const restored = await call("finance", { action: "restoreItem", requestId: requestId(), expectedRevision: 1, itemId: item[0]?.id });
    expect(restored.status).toBe(200);
    const again = await sql<{ planned_ore: string; status: string; public_ref: string }>(
      "select planned_ore::text as planned_ore, status, public_ref from finance.budget_items where id = $1::uuid",
      [item[0]?.id],
    );
    expect(again[0]).toEqual({ planned_ore: "5000", status: "planned", public_ref: "BI-S27-001" });
    await pg.exec("begin");
    await sql("select finance.cancel_budget_item($1::uuid, $2::uuid, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', $3::uuid, 2, null)", [financeId, requestId(), item[0]?.id]);
    expect(Number(await version())).toBeGreaterThan(Number(before));
    await pg.exec("rollback");
    expect((await sql<{ status: string }>("select status from finance.budget_items where id = $1::uuid", [item[0]?.id]))[0]?.status).toBe("planned");
  });

  it("protects unallocated items and creates one for a later active system", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
    const unallocated = await sql<{ id: string; revision: number }>("select id, revision from finance.budget_items where public_ref = 'BI-S27-FR-UNALLOC'");
    const before = await version();
    expect((await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: unallocated[0]?.revision, itemId: unallocated[0]?.id, patch: { plannedNok: "10.00" },
    })).status).toBe(400);
    expect((await call("head", {
      action: "cancelItem", requestId: requestId(), expectedRevision: unallocated[0]?.revision, itemId: unallocated[0]?.id, reason: "Remove it",
    })).status).toBe(400);
    expect(await version()).toBe(before);
    const noted = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: unallocated[0]?.revision, itemId: unallocated[0]?.id, patch: { note: "Outside the plan" },
    });
    expect(noted.status).toBe(200);
    expect((await sql<{ note: string; planned_ore: string }>("select note, planned_ore::text as planned_ore from finance.budget_items where id = $1::uuid", [unallocated[0]?.id]))[0]).toEqual({ note: "Outside the plan", planned_ore: "0" });
    await sql("update finance.systems set active = true where code = 'SYS-LV'");
    const linkage = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-LV'"))[0]?.id;
    const ensured = await call("finance", { action: "ensureUnallocated", requestId: requestId(), systemId: linkage });
    expect(ensured.status).toBe(200);
    const created = await sql<{ public_ref: string; planned_ore: string; protected: boolean }>(
      "select public_ref, planned_ore::text as planned_ore, protected from finance.budget_items where system_id = $1::uuid",
      [linkage],
    );
    expect(created).toEqual([{ public_ref: "BI-S27-LV-UNALLOC", planned_ore: "0", protected: true }]);
    const after = await version();
    const again = await call("finance", { action: "ensureUnallocated", requestId: requestId(), systemId: linkage });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: (ensured.body as { id: string }).id });
    expect(await version()).toBe(after);
    expect(await sql("select count(*)::text as count from finance.budget_items where system_id = $1::uuid", [linkage])).toEqual([{ count: "1" }]);
    expect((await call("member", { action: "ensureUnallocated", requestId: requestId(), systemId: linkage })).status).toBe(403);
  });

  it("returns an existing unallocated item without locking that item row", async () => {
    const sources = await sql<{ proname: string; prosrc: string }>(
      `select p.proname, p.prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'finance' and p.proname in ('add_budget_item', 'ensure_unallocated_item')`,
    );
    const add = sources.find((row) => row.proname === "add_budget_item")?.prosrc.toLowerCase() ?? "";
    const ensure = sources.find((row) => row.proname === "ensure_unallocated_item")?.prosrc.toLowerCase() ?? "";
    expect(add).not.toContain("for update");
    const itemRead = ensure.indexOf("from finance.budget_items");
    expect(itemRead).toBeGreaterThan(-1);
    expect(ensure.slice(itemRead)).not.toContain("for update");
    const systemRead = ensure.indexOf("from finance.systems");
    expect(systemRead).toBeGreaterThan(-1);
    const systemLock = ensure.slice(systemRead, itemRead);
    expect(systemLock).toContain("for share");
    expect(systemLock).not.toContain("for update");
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    const existing = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-FR-UNALLOC'"))[0]?.id;
    const ensured = await call("finance", { action: "ensureUnallocated", requestId: requestId(), systemId: frame });
    expect(ensured.status).toBe(200);
    expect(ensured.body).toMatchObject({ id: existing });
  });

  it("keeps an earmark in one system and the same season", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'F-S27-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
       select id, 'FE-001', 'Frame work', 80000, 'private condition', $1::uuid, $1::uuid from finance.funding`,
      [operatorId],
    );
    await sql(
      `insert into finance.seasons (code, name, start_date, end_date, created_by_member_id, updated_by_member_id)
       values ('S26', 'Earlier season', '2025-08-01', '2026-07-31', $1::uuid, $1::uuid)`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       select id, 'F-S26-001', 'Earlier source', 'Example owner', 'other', 100000, 'secured', $1::uuid, $1::uuid from finance.seasons where code = 'S26'`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, created_by_member_id, updated_by_member_id)
       select id, 'FE-002', 'Earlier work', 100000, $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S26-001'`,
      [operatorId],
    );
    await call("head", { action: "createBudget", requestId: requestId() });
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    const travel = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-TR'"))[0]?.id;
    const part = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-001'"))[0]?.id;
    const otherPart = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-002'"))[0]?.id;
    const before = await version();
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Wrong season", plannedNok: "10.00", priority: "EM", earmarkId: otherPart },
    })).status).toBe(400);
    expect(await version()).toBe(before);
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Frame tube", plannedNok: "10.00", priority: "EM", earmarkId: part },
    })).status).toBe(200);
    const split = await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: travel, description: "Travel case", plannedNok: "10.00", priority: "EM", earmarkId: part },
    });
    expect(split.status).toBe(400);
    expect(await sql("select count(*)::text as count from finance.budget_items where protected = false")).toEqual([{ count: "1" }]);
    const same = await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Second frame line", plannedNok: "5.00", priority: "EM", earmarkId: part },
    });
    expect(same.status).toBe(200);
  });

  it("rejects a stale edit without changing the item or the view", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const system = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: system, description: "Frame tube", plannedNok: "10.00" },
    });
    const item = await sql<{ id: string; description: string }>("select id, description from finance.budget_items where protected = false");
    const before = await version();
    const stale = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: 4, itemId: item[0]?.id, patch: { description: "Replaced tube" },
    });
    expect(stale.status).toBe(409);
    expect(await version()).toBe(before);
    expect((await sql<{ description: string }>("select description from finance.budget_items where id = $1::uuid", [item[0]?.id]))[0]?.description).toBe("Frame tube");
    const replay = requestId();
    expect((await call("finance", {
      action: "editItem", requestId: replay, expectedRevision: 0, itemId: item[0]?.id, patch: { description: "Replaced tube" },
    })).status).toBe(200);
    const bumped = await version();
    const second = await call("finance", {
      action: "editItem", requestId: replay, expectedRevision: 0, itemId: item[0]?.id, patch: { description: "Replaced tube" },
    });
    expect(second.status).toBe(200);
    expect(await version()).toBe(bumped);
    const conflict = await call("finance", {
      action: "editItem", requestId: replay, expectedRevision: 0, itemId: item[0]?.id, patch: { description: "Different tube" },
    });
    expect(conflict.status).toBe(409);
    expect(await version()).toBe(bumped);
  });

  it("shows members planned, actual, and difference without private purchase or funding fields", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'F-S27-001', 'Example source', 'Example owner', 'other', 100000, 'secured', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
       select id, 'FE-001', 'Frame work', 80000, 'private condition', $1::uuid, $1::uuid from finance.funding`,
      [operatorId],
    );
    await call("head", { action: "createBudget", requestId: requestId() });
    const part = (await sql<{ id: string }>("select id from finance.funding_parts"))[0]?.id;
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Frame tube", plannedNok: "20.00", priority: "EM", earmarkId: part, note: "private item note" },
    });
    await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
    const memberBody = JSON.stringify((await read("member")).body);
    expect(memberBody).toContain("Frame tube");
    expect(memberBody).toContain("20.00");
    expect(memberBody).toContain("Frame work");
    expect(memberBody).toContain("BI-S27-FR-UNALLOC");
    expect(memberBody).not.toContain("private item note");
    expect(memberBody).not.toContain("private condition");
    expect(memberBody).not.toContain("Example source");
    expect(memberBody).not.toContain("Hidden Supplier");
    const financeBody = JSON.stringify((await read("finance")).body);
    expect(financeBody).toContain("private item note");
    expect(financeBody).toContain("Example source");
    expect(financeBody).toContain("private condition");
    const draft = await sql("update finance.budgets set status = 'draft', approved_by_member_id = null, approved_on = null, revision = 0");
    expect(draft).toBeDefined();
    const hidden = JSON.stringify((await read("member")).body);
    expect(hidden).not.toContain("Frame tube");
    expect(hidden).not.toContain("private item note");
    expect(hidden).not.toContain("Example source");
  });

  it("hides prospect and deleted earmark details from members and shows them to financing", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       values
         ($1::uuid, 'F-S27-010', 'Prospect source', 'Example owner', 'other', 20000, 'prospect', $2::uuid, $2::uuid),
         ($1::uuid, 'F-S27-011', 'Removed source', 'Example owner', 'other', 30000, 'secured', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
       select id, 'FE-010', 'Prospect work', 1234, 'prospect condition', $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S27-010'`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, conditions, created_by_member_id, updated_by_member_id)
       select id, 'FE-011', 'Deleted work', 5678, 'deleted condition', $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S27-011'`,
      [operatorId],
    );
    await call("head", { action: "createBudget", requestId: requestId() });
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    const prospect = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-010'"))[0]?.id;
    const removed = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-011'"))[0]?.id;
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Prospect tube", plannedNok: "10.00", priority: "EM", earmarkId: prospect },
    })).status).toBe(200);
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Removed tube", plannedNok: "15.00", priority: "EM", earmarkId: removed },
    })).status).toBe(200);
    await sql("update finance.funding set status = 'deleted' where public_ref = 'F-S27-011'");
    await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
    const member = (await read("member")).body as PublicBudgets;
    const memberItems = member.departments.flatMap((department) => department.systems).flatMap((system) => system.items);
    expect(memberItems.find((item) => item.description === "Prospect tube")).toMatchObject({ earmarkPurpose: null, earmarkAmountNok: null });
    expect(memberItems.find((item) => item.description === "Removed tube")).toMatchObject({ earmarkPurpose: null, earmarkAmountNok: null });
    const memberBody = JSON.stringify(member);
    expect(memberBody).not.toContain("Prospect work");
    expect(memberBody).not.toContain("Deleted work");
    expect(memberBody).not.toContain("12.34");
    expect(memberBody).not.toContain("56.78");
    expect(memberBody).not.toContain("Prospect source");
    expect(memberBody).not.toContain("Removed source");
    const finance = (await read("finance")).body as PublicBudgets;
    const financeItems = finance.departments.flatMap((department) => department.systems).flatMap((system) => system.items);
    expect(financeItems.find((item) => item.description === "Prospect tube")).toMatchObject({
      earmarkPurpose: "Prospect work", earmarkAmountNok: "12.34", earmarkSourceName: "Prospect source", earmarkConditions: "prospect condition",
    });
    expect(financeItems.find((item) => item.description === "Removed tube")).toMatchObject({
      earmarkPurpose: "Deleted work", earmarkAmountNok: "56.78", earmarkSourceName: "Removed source", earmarkConditions: "deleted condition",
    });
  });

  it("rejects a new or changed link to deleted funding and keeps an existing link", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    await sql(
      `insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, created_by_member_id, updated_by_member_id)
       values
         ($1::uuid, 'F-S27-020', 'Kept source', 'Example owner', 'other', 20000, 'secured', $2::uuid, $2::uuid),
         ($1::uuid, 'F-S27-021', 'Other source', 'Example owner', 'other', 20000, 'secured', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, created_by_member_id, updated_by_member_id)
       select id, 'FE-020', 'Kept work', 10000, $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S27-020'`,
      [operatorId],
    );
    await sql(
      `insert into finance.funding_parts (funding_id, public_ref, purpose, amount_ore, created_by_member_id, updated_by_member_id)
       select id, 'FE-021', 'Other work', 10000, $1::uuid, $1::uuid from finance.funding where public_ref = 'F-S27-021'`,
      [operatorId],
    );
    await call("head", { action: "createBudget", requestId: requestId() });
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    const kept = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-020'"))[0]?.id;
    const other = (await sql<{ id: string }>("select id from finance.funding_parts where public_ref = 'FE-021'"))[0]?.id;
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Frame tube", plannedNok: "10.00", priority: "EM", earmarkId: kept },
    })).status).toBe(200);
    await sql("update finance.funding set status = 'deleted'");
    const item = (await sql<{ id: string; revision: number; earmark_id: string }>(
      "select id, revision, earmark_id from finance.budget_items where protected = false",
    ))[0];
    const before = await version();
    const added = await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "New deleted link", plannedNok: "10.00", priority: "EM", earmarkId: other },
    });
    expect(added.status).toBe(400);
    expect(JSON.stringify(added.body)).toContain("deleted");
    const changed = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: item?.revision, itemId: item?.id,
      patch: { earmarkId: other },
    });
    expect(changed.status).toBe(400);
    expect(await version()).toBe(before);
    expect((await sql<{ earmark_id: string }>("select earmark_id from finance.budget_items where id = $1::uuid", [item?.id]))[0]?.earmark_id).toBe(kept);
    const edited = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: item?.revision, itemId: item?.id,
      patch: { description: "Frame tube updated" },
    });
    expect(edited.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    expect((await sql<{ description: string; earmark_id: string }>(
      "select description, earmark_id from finance.budget_items where id = $1::uuid",
      [item?.id],
    ))[0]).toEqual({ description: "Frame tube updated", earmark_id: kept });
  });

  it("does not bump the revision or view when an edit changes nothing", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    await call("head", { action: "createBudget", requestId: requestId() });
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Frame tube", plannedNok: "10.00" },
    })).status).toBe(200);
    const item = (await sql<{ id: string; revision: number }>(
      "select id, revision from finance.budget_items where protected = false",
    ))[0];
    const audits = async () => (await sql<{ count: string }>(
      "select count(*)::text as count from finance.audit_log where entity = 'budget_item' and entity_id = $1",
      [item?.id],
    ))[0]?.count;
    const beforeAudits = await audits();
    const before = await version();
    const same = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: item?.revision, itemId: item?.id,
      patch: { description: "Frame tube" },
    });
    expect(same.status).toBe(200);
    expect(await version()).toBe(before);
    expect((await sql<{ revision: number }>("select revision from finance.budget_items where id = $1::uuid", [item?.id]))[0]?.revision).toBe(item?.revision);
    expect(await audits()).toBe(beforeAudits);
    const changed = await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: item?.revision, itemId: item?.id,
      patch: { description: "Replaced tube" },
    });
    expect(changed.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 1));
    expect((await sql<{ revision: number; description: string }>(
      "select revision, description from finance.budget_items where id = $1::uuid",
      [item?.id],
    ))[0]).toEqual({ revision: (item?.revision ?? 0) + 1, description: "Replaced tube" });
  });

  it("rolls every successful budget mutation back with the view version", async () => {
    await season();
    await grant(headId, "head_of_finance");
    await grant(financeId, "finance");
    const hash = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    const frame = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id;
    const linkage = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-LV'"))[0]?.id;
    async function expectRollback(run: () => Promise<unknown>, changed: () => Promise<void>, restored: () => Promise<void>) {
      const before = await version();
      await pg.exec("begin");
      try {
        await run();
        expect(Number(await version())).toBe(Number(before) + 1);
        await changed();
      } finally {
        await pg.exec("rollback");
      }
      expect(await version()).toBe(before);
      await restored();
    }
    await expectRollback(
      () => sql("select finance.create_season_budget($1::uuid, $2::uuid, $3)", [headId, requestId(), hash]),
      async () => { expect(await sql("select count(*)::text as count from finance.budgets")).toEqual([{ count: "1" }]); },
      async () => { expect(await sql("select count(*)::text as count from finance.budgets")).toEqual([{ count: "0" }]); },
    );
    expect((await call("head", { action: "createBudget", requestId: requestId() })).status).toBe(200);
    await expectRollback(
      () => sql("select finance.approve_season_budget($1::uuid, $2::uuid, $3, 0, '2026-10-26')", [headId, requestId(), hash]),
      async () => { expect((await sql<{ status: string }>("select status from finance.budgets"))[0]?.status).toBe("approved"); },
      async () => { expect((await sql<{ status: string }>("select status from finance.budgets"))[0]?.status).toBe("draft"); },
    );
    await expectRollback(
      () => sql(
        "select finance.add_budget_item($1::uuid, $2::uuid, $3, 0, $4::uuid, 'Rolled tube', 'material', 1000, 'P1', 'new', null, null, 'planned', null, null, null)",
        [financeId, requestId(), hash, frame],
      ),
      async () => { expect(await sql("select count(*)::text as count from finance.budget_items where protected = false")).toEqual([{ count: "1" }]); },
      async () => { expect(await sql("select count(*)::text as count from finance.budget_items where protected = false")).toEqual([{ count: "0" }]); },
    );
    expect((await call("finance", {
      action: "addItem", requestId: requestId(), expectedRevision: 0,
      item: { systemId: frame, description: "Frame tube", plannedNok: "10.00" },
    })).status).toBe(200);
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where protected = false"))[0]?.id;
    await expectRollback(
      () => sql(
        "select finance.edit_budget_item($1::uuid, $2::uuid, $3, $4::uuid, 0, '{\"description\":\"Rolled edit\"}'::jsonb, null)",
        [financeId, requestId(), hash, itemId],
      ),
      async () => { expect((await sql<{ description: string }>("select description from finance.budget_items where id = $1::uuid", [itemId]))[0]?.description).toBe("Rolled edit"); },
      async () => { expect((await sql<{ description: string }>("select description from finance.budget_items where id = $1::uuid", [itemId]))[0]?.description).toBe("Frame tube"); },
    );
    await expectRollback(
      () => sql("select finance.cancel_budget_item($1::uuid, $2::uuid, $3, $4::uuid, 0, null)", [financeId, requestId(), hash, itemId]),
      async () => { expect((await sql<{ status: string }>("select status from finance.budget_items where id = $1::uuid", [itemId]))[0]?.status).toBe("cancelled"); },
      async () => { expect((await sql<{ status: string }>("select status from finance.budget_items where id = $1::uuid", [itemId]))[0]?.status).toBe("planned"); },
    );
    expect((await call("finance", { action: "cancelItem", requestId: requestId(), expectedRevision: 0, itemId })).status).toBe(200);
    await expectRollback(
      () => sql("select finance.restore_budget_item($1::uuid, $2::uuid, $3, $4::uuid, 1, null)", [financeId, requestId(), hash, itemId]),
      async () => { expect((await sql<{ status: string }>("select status from finance.budget_items where id = $1::uuid", [itemId]))[0]?.status).toBe("planned"); },
      async () => { expect((await sql<{ status: string }>("select status from finance.budget_items where id = $1::uuid", [itemId]))[0]?.status).toBe("cancelled"); },
    );
    await sql("update finance.systems set active = true where code = 'SYS-LV'");
    await expectRollback(
      () => sql("select finance.ensure_unallocated_item($1::uuid, $2::uuid, $3, $4::uuid)", [financeId, requestId(), hash, linkage]),
      async () => { expect(await sql("select count(*)::text as count from finance.budget_items where system_id = $1::uuid", [linkage])).toEqual([{ count: "1" }]); },
      async () => { expect(await sql("select count(*)::text as count from finance.budget_items where system_id = $1::uuid", [linkage])).toEqual([{ count: "0" }]); },
    );
  });
});
