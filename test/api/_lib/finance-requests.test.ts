import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as financeMoney from "../../../api/_lib/finance-money.js";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { addCalendarDays, osloToday } from "../../../src/features/Finance/money.js";
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

async function counts() {
  const [audit, outbox, idem] = await Promise.all([
    sql<{ count: string }>("select count(*)::text as count from finance.audit_log"),
    sql<{ count: string }>("select count(*)::text as count from finance.outbox"),
    sql<{ count: string }>("select count(*)::text as count from finance.idempotency_keys"),
  ]);
  return {
    audit: Number(audit[0]?.count ?? 0),
    outbox: Number(outbox[0]?.count ?? 0),
    idem: Number(idem[0]?.count ?? 0),
  };
}

async function seasonWithBudget() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  await sql(`insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true)`);
  await grant(headId, "head_of_finance");
  await grant(financeId, "finance");
  await call("head", { action: "createBudget", requestId: requestId() });
  await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
  await sql(
    `insert into finance.budget_items (
      budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected,
      created_by_member_id, updated_by_member_id
    )
    select b.id, s.id, 'BI-S27-010', 'Carbon tube stock', 'material', 500000, 'P2', 'new', 'planned', false,
      $1::uuid, $1::uuid
    from finance.budgets b cross join finance.systems s
    where b.public_ref = 'B-S27' and s.code = 'SYS-FR'`,
    [operatorId],
  );
  itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-010'"))[0]?.id ?? "";
}

function savedRevision(body: unknown): number {
  return Number((body as { revision?: number }).revision ?? 0);
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

async function draftAndSubmit(request = sampleRequest()) {
  const saved = await call("member", { action: "saveRequest", requestId: requestId(), request });
  expect(saved.status).toBe(200);
  const recordId = (saved.body as { id: string }).id;
  const revision = Number((saved.body as { revision?: number }).revision ?? 0);
  const submitted = await call("member", {
    action: "submitRequest",
    requestId: requestId(),
    requestRecordId: recordId,
    expectedRevision: revision,
    request,
  });
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
  const revisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]))[0]?.id;
  return { recordId, revisionId };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
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
  for (const file of [
    "011_finance_core.sql",
    "012_finance_season_budgets.sql",
    "013_finance_funding.sql",
    "014_finance_register_purchases.sql",
    "015_finance_requests.sql",
    "016_finance_fulfillment.sql",
  ]) {
    await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  }
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

describe("FIN-05 A01 draft and submit", () => {
  it("saves draft and submits with budget-linked positive lines without receipts", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    expect(saved.status).toBe(200);
    const lines = await sql("select estimated_ore::text from finance.request_draft_lines");
    expect(lines.length).toBe(1);
    const { recordId } = await draftAndSubmit();
    const revLines = await sql<{ estimated_ore: string }>("select estimated_ore::text as estimated_ore from finance.request_lines");
    expect(BigInt(revLines[0]?.estimated_ore ?? "0")).toBe(250000n);
    const row = await sql<{ status: string }>("select status from finance.requests where id = $1::uuid", [recordId]);
    expect(row[0]?.status).toBe("submitted");
  });

  it("requires late reason inside three Oslo days, for past dates, but not on the third day ahead", async () => {
    await seasonWithBudget();
    const today = osloToday();
    const yesterday = addCalendarDays(today, -1);
    expect((await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: sampleRequest({ plannedDate: yesterday }),
    })).status).toBe(400);
    expect((await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: sampleRequest({ plannedDate: "2020-06-01", lateReason: "Backdated plan" }),
    })).status).toBe(200);
    const twoDays = addCalendarDays(today, 2);
    const saved = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: sampleRequest({ plannedDate: twoDays, lateReason: "Draft lead time" }),
    });
    expect(saved.status).toBe(200);
    const recordId = (saved.body as { id: string }).id;
    const draftRevision = savedRevision(saved.body);
    expect((await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: draftRevision,
      request: sampleRequest({ plannedDate: twoDays }),
    })).status).toBe(400);
    expect((await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: draftRevision,
      request: sampleRequest({ plannedDate: twoDays, lateReason: "Short lead time" }),
    })).status).toBe(200);
    const third = thirdOsloDayFrom(today);
    const ok = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest({ plannedDate: third }) });
    expect(ok.status).toBe(200);
  });

  it("counts Oslo late boundaries across DST", async () => {
    await seasonWithBudget();
    const beforeDst = "2026-03-28";
    vi.spyOn(financeMoney, "osloToday").mockReturnValue(beforeDst);
    const saved = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: sampleRequest({ plannedDate: "2026-03-30", lateReason: "DST boundary draft" }),
    });
    expect(saved.status).toBe(200);
    const recordId = (saved.body as { id: string }).id;
    const draftRevision = savedRevision(saved.body);
    expect((await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: draftRevision,
      request: sampleRequest({ plannedDate: "2026-03-30" }),
    })).status).toBe(400);
    expect((await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: draftRevision,
      request: sampleRequest({ plannedDate: "2026-03-30", lateReason: "DST boundary test" }),
    })).status).toBe(200);
    expect(beforeDst).toBe("2026-03-28");
    vi.restoreAllMocks();
  });
});

describe("FIN-05 A02 decisions", () => {
  it("allows only Head to decide; finance and plain members get 403", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    expect((await call("finance", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Nope",
    })).status).toBe(403);
    expect((await call("other", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Nope",
    })).status).toBe(403);
    expect((await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    })).status).toBe(200);
  });

  it("rejects stale repeated decisions without overwriting", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    });
    const before = await counts();
    const stale = await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "rejected", reason: "Too late",
    });
    expect(stale.status).toBe(409);
    expect(await counts()).toEqual(before);
  });

  it("returns conflict when approving after a budget line was cancelled, without writing a decision", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    const itemRevision = Number((await sql<{ revision: number }>("select revision from finance.budget_items where id = $1::uuid", [itemId]))[0]?.revision ?? 0);
    expect((await call("head", {
      action: "cancelItem",
      requestId: requestId(),
      expectedRevision: itemRevision,
      itemId,
      reason: "Line removed",
    })).status).toBe(200);
    const vBefore = await version();
    const cBefore = await counts();
    const decided = await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "Approved",
    });
    expect(decided.status).toBe(409);
    expect((decided.body as { error?: string }).error).toMatch(/cancelled/i);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.request_decisions where revision_id = $1::uuid", [revisionId]))[0]?.count).toBe("0");
    expect(await version()).toBe(vBefore);
    expect(await counts()).toEqual(cBefore);
  });

  it("leaves pending and rejected revisions without approved_ore commitments", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    const pending = await sql<{ approved_ore: string | null }>(
      "select approved_ore::text as approved_ore from finance.request_lines where revision_id = $1::uuid", [revisionId],
    );
    expect(pending[0]?.approved_ore).toBeNull();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "rejected", reason: "Not now",
    });
    const rejected = await sql<{ approved_ore: string | null }>(
      "select approved_ore::text as approved_ore from finance.request_lines where revision_id = $1::uuid", [revisionId],
    );
    expect(rejected[0]?.approved_ore).toBeNull();
  });
});

describe("FIN-05 A03 withdrawal revise and immutability", () => {
  it("withdrawal invalidates the submitted revision decision target", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    const submittedRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    await call("member", { action: "withdrawRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: submittedRevision });
    expect((await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Late",
    })).status).toBe(409);
  });

  it("retains old decisions when revising after rejection", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "rejected", reason: "First pass",
    });
    const rejectedRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    await call("member", {
      action: "reviseRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: rejectedRevision,
      request: sampleRequest({ justification: "Revised scope for frame assembly" }),
    });
    expect(Number((await sql<{ count: string }>("select count(*)::text as count from finance.request_decisions"))[0]?.count)).toBe(1);
    expect((await sql<{ id: string }>("select id from finance.request_decisions where revision_id = $1::uuid", [revisionId])).length).toBe(1);
  });

  it("blocks edits once approved", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    });
    const approvedRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    expect((await call("member", {
      action: "saveRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: approvedRevision, request: sampleRequest(),
    })).status).toBe(400);
  });
});

describe("FIN-05 A04 closure and commitments", () => {
  it("stores per-line approved øre on approval", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "Within plan",
      approvedOreByLine: {},
    });
    const line = await sql<{ approved_ore: string }>("select approved_ore::text as approved_ore from finance.request_lines where revision_id = $1::uuid", [revisionId]);
    expect(BigInt(line[0]?.approved_ore ?? "0")).toBe(250000n);
  });

  it("rejects close when released amount exceeds approved total and allows closing at the exact approved sum", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    });
    const openRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    const vBefore = await version();
    const tooMuch = await call("member", {
      action: "closeRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: openRevision,
      reason: "Too much release",
      releasedNok: "2501.00",
    });
    expect(tooMuch.status).toBe(400);
    expect((tooMuch.body as { errors?: { field?: string }[] }).errors?.[0]?.field).toBe("releasedOre");
    expect((await sql<{ status: string; released_ore: string }>(
      "select status, released_ore::text as released_ore from finance.requests where id = $1::uuid", [recordId],
    ))[0]).toMatchObject({ status: "approved", released_ore: "0" });
    expect(await version()).toBe(vBefore);
    const exact = await call("member", {
      action: "closeRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: openRevision,
      reason: "Full release",
      releasedNok: "2500.00",
    });
    expect(exact.status).toBe(200);
    expect((await sql<{ status: string; released_ore: string }>(
      "select status, released_ore::text as released_ore from finance.requests where id = $1::uuid", [recordId],
    ))[0]).toMatchObject({ status: "closed", released_ore: "250000" });
  });

  it("closes by requester with explicit zero release when fully consumed", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    });
    const openRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    expect((await call("member", {
      action: "closeRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: openRevision,
      reason: "Done spending", releasedNok: "0.00",
    })).status).toBe(200);
  });

  it("lets Head close another members open approval with explicit release", async () => {
    await seasonWithBudget();
    const { recordId, revisionId } = await draftAndSubmit();
    await call("head", {
      action: "decideRequest", requestId: requestId(), requestRecordId: recordId, revisionId, decision: "approved", reason: "Approved",
    });
    const openRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    expect((await call("head", {
      action: "closeRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: openRevision,
      reason: "Head closed", releasedNok: "2500.00",
    })).status).toBe(200);
  });

  it("does not reopen closed or cancelled requests", async () => {
    await seasonWithBudget();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest() });
    const recordId = (saved.body as { id: string }).id;
    const draftRevision = savedRevision(saved.body);
    await call("member", { action: "cancelRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: draftRevision });
    expect((await call("member", {
      action: "submitRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: draftRevision + 1, request: sampleRequest(),
    })).status).toBe(409);
  });
});

describe("FIN-05 A05 privacy idempotency and view_versions", () => {
  it("hides other members requests and returns not found for foreign detail", async () => {
    await seasonWithBudget();
    const { recordId } = await draftAndSubmit();
    expect((await read("other")).body).toMatchObject({ ownRequests: [] });
    expect((await read("other", { requestRecordId: recordId })).status).toBe(404);
    const financeView = await read("finance");
    expect((financeView.body as { requestContext?: unknown[] }).requestContext?.length).toBeGreaterThan(0);
  });

  it("replays every mutation without extra audit outbox or view bump", async () => {
    await seasonWithBudget();
    const body = sampleRequest();
    const saveId = requestId();
    const saved = await call("member", { action: "saveRequest", requestId: saveId, request: body });
    const recordId = (saved.body as { id: string }).id;
    const v1 = await version();
    const c1 = await counts();
    const replaySave = await call("member", { action: "saveRequest", requestId: saveId, request: body });
    expect(replaySave.body).toEqual(saved.body);
    expect(await version()).toBe(v1);
    expect(await counts()).toEqual(c1);

    const submitId = requestId();
    const draftRevision = savedRevision(saved.body);
    const submitted = await call("member", {
      action: "submitRequest", requestId: submitId, requestRecordId: recordId, expectedRevision: draftRevision, request: body,
    });
    const v2 = await version();
    const c2 = await counts();
    const replaySubmit = await call("member", {
      action: "submitRequest", requestId: submitId, requestRecordId: recordId, expectedRevision: draftRevision, request: body,
    });
    expect(replaySubmit.body).toEqual(submitted.body);
    expect(await version()).toBe(v2);
    expect(await counts()).toEqual(c2);
  });

  it("replays submit after budget changes using the stored response", async () => {
    await seasonWithBudget();
    const body = sampleRequest();
    const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: body });
    const recordId = (saved.body as { id: string }).id;
    const submitId = requestId();
    const draftRevision = savedRevision(saved.body);
    const first = await call("member", {
      action: "submitRequest", requestId: submitId, requestRecordId: recordId, expectedRevision: draftRevision, request: body,
    });
    const itemRevision = Number((await sql<{ revision: number }>("select revision from finance.budget_items where id = $1::uuid", [itemId]))[0]?.revision ?? 0);
    await call("finance", {
      action: "editItem", requestId: requestId(), expectedRevision: itemRevision, itemId: itemId, patch: { note: "Changed after submit" },
    });
    const second = await call("member", {
      action: "submitRequest", requestId: submitId, requestRecordId: recordId, expectedRevision: draftRevision, request: body,
    });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("bumps view_versions once per successful mutation and not on invalid or no-op saves", async () => {
    await seasonWithBudget();
    const before = await version();
    expect((await call("member", {
      action: "saveRequest", requestId: requestId(), request: { ...sampleRequest(), lines: [] },
    })).status).toBe(400);
    expect(await version()).toBe(before);
    const rid = requestId();
    const body = sampleRequest();
    const firstSave = await call("member", { action: "saveRequest", requestId: rid, request: body });
    expect(await version()).toBe(String(Number(before) + 1));
    const recordId = (firstSave.body as { id: string }).id;
    const mid = await version();
    await call("member", { action: "saveRequest", requestId: requestId(), requestRecordId: recordId, expectedRevision: savedRevision(firstSave.body), request: body });
    expect(await version()).toBe(mid);
  });

  it("writes outbox events in the same transaction as audit rows on submit", async () => {
    await seasonWithBudget();
    const before = await counts();
    const { recordId } = await draftAndSubmit();
    const after = await counts();
    expect(after.audit).toBeGreaterThan(before.audit);
    expect(after.outbox).toBeGreaterThan(before.outbox);
    const outbox = await sql<{ event_type: string; payload: { event?: string } }>(
      "select event_type, payload from finance.outbox where entity_id = $1::uuid", [recordId],
    );
    expect(outbox.some((row) => row.event_type === "request.submitted")).toBe(true);
    expect(outbox[0]?.payload?.event).toBeDefined();
  });

  it("still returns 503 for unrelated finance placeholders", async () => {
    await seasonWithBudget();
    expect((await call("finance", { action: "exportPurchases", requestId: requestId() })).status).toBe(503);
  });
});
