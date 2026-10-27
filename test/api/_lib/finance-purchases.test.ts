import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const financeId = "66666666-6666-4666-8666-666666666666";
const otherId = "44444444-4444-4444-8444-444444444444";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  finance: { userId: financeId, googleSub: "finance-sub", email: "finance@example.test", name: "Finance Example" },
  other: { userId: otherId, googleSub: "other-sub", email: "other@example.test", name: "Other Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let storage: ReturnType<typeof createMemoryFinanceStorage>;
let sequence = 0;
let itemId = "";
let systemId = "";

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

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await pg.query(text, params)).rows as T[];
}

function requestId() {
  sequence += 1;
  return `88888888-8888-4888-8888-${String(sequence).padStart(12, "0")}`;
}

async function grant(member: string, profile: string) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function seasonAndBudget() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  systemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
  await sql(
    `insert into finance.systems (id, department_key, code, name, active) values
      ($1::uuid, 'mechanical-production', 'SYS-FR', 'Frame', true)`,
    [systemId],
  );
  await grant(headId, "head_of_finance");
  await grant(financeId, "finance");
  await call("head", { action: "createBudget", requestId: requestId() });
  const added = await call("finance", {
    action: "addItem",
    requestId: requestId(),
    expectedRevision: 0,
    item: {
      systemId,
      description: "Frame tube",
      category: "material",
      plannedNok: "1000.00",
      priority: "P1",
      reuseStatus: "new",
    },
  });
  const revision = await sql<{ revision: string }>("select revision::text as revision from finance.budgets");
  const approved = await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: Number(revision[0]?.revision ?? 0) });
  expect(approved.status).toBe(200);
  const rows = await sql<{ id: string }>("select id from finance.budget_items where description = 'Frame tube'");
  itemId = rows[0]?.id ?? "";
  expect(added.status).toBe(200);
  await sql(
    `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
     values ('purchase:2026', 2026, 40, $1::uuid)`,
    [operatorId],
  );
  await sql("select finance.configure_approval_threshold($1::uuid, 500000::bigint)", [operatorId]);
}

async function authorizeAndFinalize(token: string, size = 8) {
  const uploadId = requestId();
  const auth = await call(token, {
    action: "authorizeUpload",
    requestId: uploadId,
    fileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: size,
  });
  expect(auth.status).toBe(200);
  const stagingKey = (auth.body as { stagingKey?: string }).stagingKey ?? "";
  await putMemoryPdf(storage, stagingKey);
  const finalized = await call(token, { action: "finalizeUpload", requestId: requestId(), uploadId: (auth.body as { id?: string }).id });
  expect(finalized.status).toBe(200);
  return (auth.body as { id: string }).id;
}

function purchase(uploadIds: string[]) {
  return {
    buyerName: "Buyer Example",
    supplierName: "Supplier Example",
    paymentMethod: "team_account",
    purchaseDate: "2026-10-01",
    justification: "Workshop material for frame",
    documentKind: "receipt",
    lines: [{ systemId, budgetItemId: itemId, description: "Tube stock", quantity: "3", amountNok: "900.00" }],
    uploadIds,
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null, helix_role text);
    create table identity.departments (department_key text primary key, name text not null unique, sort_order smallint not null unique);
    insert into identity.departments (department_key, name, sort_order) values ('mechanical-production', 'Mechanical', 1);
    create table identity.platform_roles (role_key text primary key);
    create table identity.member_roles (member_id uuid not null, role_key text not null);
    insert into identity.members (id, google_sub, email, full_name) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example'),
      ('${headId}', 'head-sub', 'head@example.test', 'Head Example'),
      ('${financeId}', 'finance-sub', 'finance@example.test', 'Finance Example'),
      ('${otherId}', 'other-sub', 'other@example.test', 'Other Example');
    insert into identity.platform_roles values ('platform_administrator');
    insert into identity.member_roles values ('${operatorId}', 'platform_administrator');
    create role anon;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/012_finance_season_budgets.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/014_finance_register_purchases.sql", import.meta.url), "utf8"));
  const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  storage = createMemoryFinanceStorage();
  const services = createFinanceServices({
    db,
    authenticate: async (token) => {
      const identity = identities[token];
      if (!identity) throw new MemberCvError(401, "Log in to continue.");
      return identity;
    },
    financeStorage: storage,
  });
  handler = createFinanceHandler(() => services);
});

beforeEach(async () => {
  sequence = 0;
  storage.objects.clear();
  await pg.exec("rollback").catch(() => undefined);
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    truncate table
      finance.allocations, finance.purchase_lines, finance.outlay_reimbursements, finance.invoice_obligations,
      finance.documents, finance.uploads, finance.exception_reviews, finance.purchases,
      finance.request_lines, finance.request_decisions, finance.request_revisions, finance.requests,
      finance.budget_items, finance.budgets, finance.funding_parts, finance.funding, finance.systems,
      finance.seasons, finance.idempotency_keys, finance.outbox, finance.member_grants, finance.settings,
      finance.reference_counters, finance.audit_log
    restart identity;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
});

afterAll(async () => { await pg.close(); });

describe("purchase registration", () => {
  it("registers a purchase with files, bumps the view version, and replays safely", async () => {
    await seasonAndBudget();
    const uploadId = await authorizeAndFinalize("member");
    const before = await sql<{ version: string }>("select version::text as version from finance.view_versions");
    const rid = requestId();
    const saved = await call("member", { action: "registerPurchase", requestId: rid, purchase: purchase([uploadId]) });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ ok: true, warnings: expect.any(Array) });
    const after = await sql<{ version: string }>("select version::text as version from finance.view_versions");
    expect(Number(after[0]?.version)).toBe(Number(before[0]?.version) + 1);
    const replay = await call("member", { action: "registerPurchase", requestId: rid, purchase: purchase([uploadId]) });
    expect(replay.body).toMatchObject(saved.body);
    expect(await sql("select count(*)::int as count from finance.purchases")).toEqual([{ count: 1 }]);
    expect(await sql("select count(*)::int as count from finance.idempotency_keys")).toEqual([{ count: 1 }]);
  });

  it("rejects mismatched replay payloads and oversized uploads", async () => {
    await seasonAndBudget();
    const uploadId = await authorizeAndFinalize("member");
    const rid = requestId();
    await call("member", { action: "registerPurchase", requestId: rid, purchase: purchase([uploadId]) });
    const conflict = await call("member", {
      action: "registerPurchase",
      requestId: rid,
      purchase: { ...purchase([uploadId]), supplierName: "Different Supplier Example" },
    });
    expect(conflict.status).toBe(409);
    const tooLarge = await call("member", {
      action: "authorizeUpload",
      requestId: requestId(),
      fileName: "big.pdf",
      contentType: "application/pdf",
      byteSize: 10 * 1024 * 1024 + 1,
    });
    expect(tooLarge.status).toBe(400);
  });

  it("blocks another member from finalizing or reusing an upload", async () => {
    await seasonAndBudget();
    const auth = await call("member", {
      action: "authorizeUpload",
      requestId: requestId(),
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      byteSize: 8,
    });
    const stagingKey = (auth.body as { stagingKey?: string }).stagingKey ?? "";
    await putMemoryPdf(storage, stagingKey);
    const denied = await call("other", { action: "finalizeUpload", requestId: requestId(), uploadId: (auth.body as { id?: string }).id });
    expect(denied.status).toBe(404);
    const uploadId = (auth.body as { id: string }).id;
    await call("member", { action: "finalizeUpload", requestId: requestId(), uploadId });
    const stolen = await call("other", { action: "registerPurchase", requestId: requestId(), purchase: purchase([uploadId]) });
    expect(stolen.status).toBe(400);
  });

  it("enforces the 20-per-hour quota", async () => {
    await seasonAndBudget();
    for (let index = 0; index < 20; index += 1) {
      const uploadId = await authorizeAndFinalize("member");
      const saved = await call("member", { action: "registerPurchase", requestId: requestId(), purchase: purchase([uploadId]) });
      expect(saved.status).toBe(200);
    }
    const uploadId = await authorizeAndFinalize("member");
    const blocked = await call("member", { action: "registerPurchase", requestId: requestId(), purchase: purchase([uploadId]) });
    expect(blocked.status).toBe(429);
  });

  it("records missing-approval context above the threshold", async () => {
    await seasonAndBudget();
    const uploadId = await authorizeAndFinalize("member");
    const saved = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        ...purchase([uploadId]),
        lines: [{ systemId, budgetItemId: itemId, description: "Large buy", quantity: "1", amountNok: "6000.00" }],
      },
    });
    expect(saved.status).toBe(200);
    const reviews = await sql<{ kind: string }>("select kind from finance.exception_reviews");
    expect(reviews).toEqual([{ kind: "missing_approval" }]);
  });
});
