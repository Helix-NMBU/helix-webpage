import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { osloToday } from "../../../src/features/Finance/money.js";
import { thirdOsloDayFrom } from "../../../src/features/Finance/request-domain.js";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const financeId = "66666666-6666-4666-8666-666666666666";
const otherId = "77777777-7777-4777-8777-777777777777";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  finance: { userId: financeId, googleSub: "finance-sub", email: "finance@example.test", name: "Finance Example" },
  other: { userId: otherId, googleSub: "other-sub", email: "other@example.test", name: "Other Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let itemId = "";
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

async function read(token: string, query: Record<string, string> = {}) {
  const wrapped = response();
  await handler({
    method: "GET",
    query: { action: "purchases", ...query },
    body: undefined,
    headers: { authorization: `Bearer ${token}` },
  } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await pg.query<T>(text, params)).rows;
}

function requestId() {
  sequence += 1;
  return `88888888-8888-4888-8888-${String(sequence).padStart(12, "0")}`;
}

async function grant(member: string, profile: string) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function version() {
  const rows = await sql<{ version: string }>("select version::text as version from finance.view_versions");
  return rows[0]?.version ?? "0";
}

async function seasonWithBudget() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  await sql(
    `insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true)`,
  );
  await grant(headId, "head_of_finance");
  await grant(financeId, "finance");
  await call("head", { action: "createBudget", requestId: requestId() });
  await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
  const items = await sql<{ id: string }>(
    `select id from finance.budget_items where protected is not true limit 1`,
  );
  itemId = items[0]?.id ?? "";
  await sql(
    `insert into finance.budget_items (
      budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected
    )
    select b.id, s.id, 'BI-S27-010', 'Carbon tube stock', 'material', 500000, 'P2', 'new', 'planned', false
    from finance.budgets b
    cross join finance.systems s
    where b.public_ref = 'B-S27' and s.code = 'SYS-FR'`,
  );
  const added = await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-010'");
  itemId = added[0]?.id ?? itemId;
}

function sampleRequest(overrides: Record<string, unknown> = {}) {
  const today = osloToday();
  return {
    supplierName: "Nordic Parts AS",
    justification: "Need material for frame assembly",
    plannedDate: thirdOsloDayFrom(today),
    lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "2500.00" }],
    ...overrides,
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (
      id uuid primary key,
      google_sub text not null,
      email text not null,
      full_name text not null
    );
    create table identity.departments (department_key text primary key, name text not null unique, sort_order smallint not null unique);
    insert into identity.departments values ('mechanical-production', 'Mechanical', 1);
    create table identity.platform_roles (role_key text primary key);
    create table identity.member_roles (member_id uuid not null, role_key text not null);
    insert into identity.members (id, google_sub, email, full_name) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member'),
      ('${headId}', 'head-sub', 'head@example.test', 'Head'),
      ('${financeId}', 'finance-sub', 'finance@example.test', 'Finance'),
      ('${otherId}', 'other-sub', 'other@example.test', 'Other');
    insert into identity.platform_roles values ('platform_administrator');
    insert into identity.member_roles values ('${operatorId}', 'platform_administrator');
    create role anon;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/012_finance_season_budgets.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/015_finance_requests.sql", import.meta.url), "utf8"));
  const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  handler = createFinanceHandler(() => createFinanceServices({
    db,
    authenticate: async (token) => {
      const identity = identities[token];
      if (!identity) throw new MemberCvError(401, "Log in to continue.");
      return identity;
    },
  }));
});

beforeEach(async () => {
  sequence = 0;
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    truncate table
      finance.request_draft_lines,
      finance.request_lines, finance.request_decisions, finance.request_revisions, finance.requests,
      finance.budget_items, finance.budgets, finance.systems, finance.seasons,
      finance.idempotency_keys, finance.outbox, finance.member_grants, finance.settings,
      finance.reference_counters, finance.audit_log
    restart identity;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
});

afterAll(async () => { await pg.close(); });

describe("purchase requests", () => {
  it("submits, notifies heads, and bumps view_versions once", async () => {
    await seasonWithBudget();
    const before = await version();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    expect(saved.status).toBe(200);
    const recordId = (saved.body as { id: string }).id;
    const submitted = await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 0,
      request: sampleRequest(),
    });
    expect(submitted.status).toBe(200);
    expect(await version()).toBe(String(Number(before) + 2));
    const outbox = await sql<{ event_type: string }>("select event_type from finance.outbox");
    expect(outbox.some((row) => row.event_type === "request.submitted")).toBe(true);
  });

  it("does not bump view_versions on a no-op draft save", async () => {
    await seasonWithBudget();
    const rid = requestId();
    const body = sampleRequest();
    await call("member", { action: "saveRequest", requestId: rid, request: body });
    const mid = await version();
    const again = await call("member", { action: "saveRequest", requestId: requestId(), requestRecordId: (await sql<{ id: string }>("select id from finance.requests limit 1"))[0]?.id, expectedRevision: 0, request: body });
    expect(again.status).toBe(200);
    expect(await version()).toBe(mid);
  });

  it("rejects late submissions without a reason on Oslo boundaries", async () => {
    await seasonWithBudget();
    const today = osloToday();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest({ plannedDate: today }) });
    const recordId = (saved.body as { id: string }).id;
    const denied = await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 0,
      request: sampleRequest({ plannedDate: today }),
    });
    expect(denied.status).toBe(400);
    const ok = await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 0,
      request: sampleRequest({ plannedDate: today, lateReason: "Urgent repair window" }),
    });
    expect(ok.status).toBe(200);
    const boundaryOk = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: sampleRequest({ plannedDate: thirdOsloDayFrom(today) }),
    });
    expect(boundaryOk.status).toBe(200);
  });

  it("records head decisions without finance authority and retains prior rejections", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    const recordId = (saved.body as { id: string }).id;
    await call("member", { action: "submitRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: 0, request: sampleRequest() });
    const rev = await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]);
    const revisionId = rev[0]?.id;
    expect((await call("finance", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "rejected",
      reason: "Not in plan",
    })).status).toBe(403);
    const rejected = await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "rejected",
      reason: "Not in plan",
    });
    expect(rejected.status).toBe(200);
    const stale = await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "Too late",
    });
    expect(stale.status).toBe(409);
    await call("member", {
      action: "reviseRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 2,
      request: sampleRequest({ justification: "Revised scope for frame assembly" }),
    });
    const decisions = await sql<{ count: string }>("select count(*)::text as count from finance.request_decisions");
    expect(Number(decisions[0]?.count)).toBe(1);
  });

  it("withdrawal invalidates the submitted revision target for decisions", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    const recordId = (saved.body as { id: string }).id;
    await call("member", { action: "submitRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: 0, request: sampleRequest() });
    const revisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]))[0]?.id;
    await call("member", { action: "withdrawRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: 1 });
    const denied = await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "After withdraw",
    });
    expect(denied.status).toBe(409);
  });

  it("creates commitments on approval and supports explicit closure with release", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    const recordId = (saved.body as { id: string }).id;
    await call("member", { action: "submitRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: 0, request: sampleRequest() });
    const revisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]))[0]?.id;
    await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "Within plan",
    });
    const approved = await sql<{ approved_ore: string }>(
      "select approved_ore::text as approved_ore from finance.request_lines where revision_id = $1::uuid",
      [revisionId],
    );
    expect(BigInt(approved[0]?.approved_ore ?? "0")).toBe(250000n);
    const closed = await call("member", {
      action: "closeRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 2,
      reason: "No longer needed",
      releasedNok: "2500.00",
    });
    expect(closed.status).toBe(200);
    const row = await sql<{ status: string; released_ore: string }>("select status, released_ore::text as released_ore from finance.requests where id = $1::uuid", [recordId]);
    expect(row[0]).toMatchObject({ status: "closed", released_ore: "250000" });
  });

  it("replays idempotent mutations and hides other members requests", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    const recordId = (saved.body as { id: string }).id;
    const replayId = requestId();
    const first = await call("member", { action: "submitRequest", requestId: replayId, requestRecordId: recordId, expectedRevision: 0, request: sampleRequest() });
    const second = await call("member", { action: "submitRequest", requestId: replayId, requestRecordId: recordId, expectedRevision: 0, request: sampleRequest() });
    expect(second.body).toEqual(first.body);
    const foreign = await read("other");
    expect(foreign.status).toBe(200);
    expect((foreign.body as { ownRequests: unknown[] }).ownRequests).toHaveLength(0);
    const denied = await read("other", { requestRecordId: recordId });
    expect(denied.status).toBe(404);
  });

  it("rejects invalid API actions with 503 placeholders removed", async () => {
    await seasonWithBudget();
    const still = await call("member", { action: "registerPurchase", requestId: requestId(), purchase: {} });
    expect(still.status).toBe(503);
    const save = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    expect(save.status).toBe(200);
  });
});
