import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { thirdOsloDayFrom } from "../../../src/features/Finance/request-domain.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const otherId = "77777777-7777-4777-8777-777777777777";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  other: { userId: otherId, googleSub: "other-sub", email: "other@example.test", name: "Other Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let financeStorage: Awaited<ReturnType<typeof import("./finance-storage-mock.js").createMemoryFinanceStorage>>;
let itemId = "";
let systemId = "";
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
  await sql(`insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true)`);
  await grant(headId, "head_of_finance");
  await call("head", { action: "createBudget", requestId: requestId() });
  await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 });
  await sql(
    `insert into finance.budget_items (
      budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected,
      created_by_member_id, updated_by_member_id
    )
    select b.id, s.id, 'BI-S27-010', 'Carbon tube stock', 'material', 50000000, 'P2', 'new', 'planned', false,
      $1::uuid, $1::uuid
    from finance.budgets b cross join finance.systems s
    where b.public_ref = 'B-S27' and s.code = 'SYS-FR'`,
    [operatorId],
  );
  itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-010'"))[0]?.id ?? "";
  systemId = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]?.id ?? "";
  await sql(
    `insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id)
     values ('purchase:2026', 2026, 1, $1::uuid)`,
    [operatorId],
  );
}

function sampleRequest(estimatedNok = "10000.00") {
  return {
    supplierName: "Nordic Parts AS",
    justification: "Need material for frame assembly",
    plannedDate: thirdOsloDayFrom(osloToday()),
    lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok }],
  };
}

async function approveRequest(estimatedNok = "10000.00", approvedNok = "10000.00") {
  const saved = await call("member", { action: "saveRequest", requestId: requestId(), request: sampleRequest(estimatedNok) });
  const recordId = (saved.body as { id: string }).id;
  const revision = Number((saved.body as { revision?: number }).revision ?? 0);
  await call("member", {
    action: "submitRequest",
    requestId: requestId(),
    requestRecordId: recordId,
    expectedRevision: revision,
    request: sampleRequest(estimatedNok),
  });
  const revisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]))[0]?.id;
  const lineId = (await sql<{ id: string }>("select id from finance.request_lines where revision_id = $1::uuid", [revisionId]))[0]?.id;
  const oreByLine: Record<string, string> = {};
  if (lineId) {
    const [whole, fraction = "00"] = approvedNok.split(".");
    oreByLine[lineId] = String(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  }
  await call("head", {
    action: "decideRequest",
    requestId: requestId(),
    requestRecordId: recordId,
    revisionId,
    decision: "approved",
    reason: "Approved for test",
    approvedOreByLine: oreByLine,
  });
  return { recordId, lineId, revisionId };
}

async function authorizeUpload() {
  const auth = await call("member", {
    action: "authorizeUpload",
    requestId: requestId(),
    fileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: 8,
  });
  const { putMemoryPdf } = await import("./finance-storage-mock.js");
  await putMemoryPdf(financeStorage, (auth.body as { stagingKey?: string }).stagingKey ?? "");
  const uploadId = (auth.body as { id?: string }).id;
  await call("member", { action: "finalizeUpload", requestId: requestId(), uploadId });
  return uploadId;
}

async function registerLinked(
  recordId: string,
  lineId: string,
  amountNok: string,
  purchaseDate = "2026-10-15",
  extra: Record<string, unknown> = {},
) {
  const uploadId = await authorizeUpload();
  const purchase = {
    buyerName: "Member Example",
    supplierName: "Supplier Example",
    paymentMethod: "team_account",
    purchaseDate,
    justification: "Workshop material for frame",
    documentKind: "receipt",
    requestRecordId: recordId,
    lines: [{
      systemId,
      budgetItemId: itemId,
      requestLineId: lineId,
      description: "Linked line",
      quantity: "1",
      amountNok,
    }],
    uploadIds: [uploadId],
    ...extra,
  };
  return call("member", { action: "registerPurchase", requestId: requestId(), purchase });
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
  const { createMemoryFinanceStorage } = await import("./finance-storage-mock.js");
  financeStorage = createMemoryFinanceStorage();
  const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  handler = createFinanceHandler(() => createFinanceServices({
    db,
    financeStorage,
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

describe("FIN-07 A01 commitment from linked registrations", () => {
  it("shows actual 4000 and commitment 6000 on a 10000 approval, then consumes further registrations", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest("10000.00", "10000.00");
    expect((await registerLinked(recordId, lineId, "4000.00")).status).toBe(200);
    const detail = (await read("member", { requestRecordId: recordId })).body as { detail?: { fulfilledNok: string; remainingNok: string } };
    expect(detail.detail?.fulfilledNok).toBe("4000.00");
    expect(detail.detail?.remainingNok).toBe("6000.00");
    expect((await registerLinked(recordId, lineId, "2000.00")).status).toBe(200);
    const after = (await read("member", { requestRecordId: recordId })).body as { detail?: { fulfilledNok: string; remainingNok: string } };
    expect(after.detail?.fulfilledNok).toBe("6000.00");
    expect(after.detail?.remainingNok).toBe("4000.00");
  });

  it("sums remaining balances across multiple open requests on one item", async () => {
    await seasonWithBudget();
    const first = await approveRequest("10000.00", "10000.00");
    const second = await approveRequest("5000.00", "5000.00");
    await registerLinked(first.recordId, first.lineId!, "3000.00");
    const commitment = await sql<{ commitment: string }>(
      "select finance.budget_item_open_commitment_ore($1::uuid)::text as commitment",
      [itemId],
    );
    expect(BigInt(commitment[0]?.commitment ?? "0")).toBe(1_200_000n);
  });
});

describe("FIN-07 A02 validation recovery and overrun", () => {
  it("rejects invalid links with direct-registration recovery and records line mismatch on recovery", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest();
    const wrongItem = await sql<{ id: string }>(
      `insert into finance.budget_items (
        budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, protected,
        created_by_member_id, updated_by_member_id
      )
      select b.id, s.id, 'BI-S27-011', 'Other item', 'material', 10000, 'P2', 'new', 'planned', false, $1::uuid, $1::uuid
      from finance.budgets b cross join finance.systems s where b.public_ref = 'B-S27' and s.code = 'SYS-FR'
      returning id`,
      [operatorId],
    );
    const uploadId = await authorizeUpload();
    const mismatch = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Supplier Example",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-15",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        requestRecordId: recordId,
        lines: [{
          systemId,
          budgetItemId: wrongItem[0]?.id,
          requestLineId: lineId,
          description: "Wrong item",
          quantity: "1",
          amountNok: "100.00",
        }],
        uploadIds: [uploadId],
      },
    });
    expect(mismatch.status).toBe(409);
    expect((mismatch.body as { recovery?: { action: string } }).recovery?.action).toBe("registerDirect");

    const recovered = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Supplier Example",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-15",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        forceDirect: true,
        recoveryContext: { requestRecordId: recordId, requestLineId: lineId },
        lines: [{
          systemId,
          budgetItemId: wrongItem[0]?.id,
          description: "Direct after mismatch",
          quantity: "1",
          amountNok: "100.00",
        }],
        uploadIds: [await authorizeUpload()],
      },
    });
    expect(recovered.status).toBe(200);
    const exceptions = await sql<{ kind: string }>("select kind from finance.exception_reviews");
    expect(exceptions.some((row) => row.kind === "line_mismatch")).toBe(true);
  });

  it("records overrun as actual with review flag and zero remaining", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest("10000.00", "10000.00");
    expect((await registerLinked(recordId, lineId!, "11000.00")).status).toBe(200);
    const detail = (await read("member", { requestRecordId: recordId })).body as { detail?: { fulfilledNok: string; remainingNok: string } };
    expect(detail.detail?.fulfilledNok).toBe("11000.00");
    expect(detail.detail?.remainingNok).toBe("0.00");
    const overrun = await sql<{ kind: string }>("select kind from finance.exception_reviews where kind = 'overrun'");
    expect(overrun.length).toBe(1);
  });
});

describe("FIN-07 A03 idempotency and view_versions", () => {
  it("replays registerPurchase and rejects changed payload with 409", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest();
    const uploadId = await authorizeUpload();
    const purchase = {
      buyerName: "Member Example",
      supplierName: "Supplier Example",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-15",
      justification: "Workshop material for frame",
      documentKind: "receipt",
      requestRecordId: recordId,
      lines: [{ systemId, budgetItemId: itemId, requestLineId: lineId, description: "Line", quantity: "1", amountNok: "500.00" }],
      uploadIds: [uploadId],
    };
    const rid = requestId();
    const v0 = await version();
    const saved = await call("member", { action: "registerPurchase", requestId: rid, purchase });
    expect(saved.status).toBe(200);
    expect(await version()).toBe(String(Number(v0) + 1));
    const replay = await call("member", { action: "registerPurchase", requestId: rid, purchase });
    expect(replay.body).toEqual(saved.body);
    expect(await version()).toBe(String(Number(v0) + 1));
    const changed = await call("member", {
      action: "registerPurchase",
      requestId: rid,
      purchase: { ...purchase, lines: [{ ...purchase.lines[0], amountNok: "501.00" }] },
    });
    expect(changed.status).toBe(409);
  });
});

describe("FIN-07 A04 immutable exception facts and threshold", () => {
  it("stores dated_before_approval and uses strict threshold without tolerance", async () => {
    await seasonWithBudget();
    await sql("select finance.configure_approval_threshold($1::uuid, 500000)", [operatorId]);
    const { recordId, lineId } = await approveRequest();
    await sql("update finance.request_decisions set decided_at = '2026-10-20T12:00:00Z' where revision_id = (select approved_revision_id from finance.requests where id = $1::uuid)", [recordId]);
    expect((await registerLinked(recordId, lineId!, "100.00", "2026-10-19")).status).toBe(200);
    const dated = await sql<{ facts: { purchaseDate?: string } }>("select facts from finance.exception_reviews where kind = 'dated_before_approval'");
    expect(dated[0]?.facts?.purchaseDate).toBe("2026-10-19");

    const uploadId = await authorizeUpload();
    const atThreshold = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Supplier Example",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-21",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        lines: [{ systemId, budgetItemId: itemId, description: "Threshold", quantity: "1", amountNok: "5000.00" }],
        uploadIds: [uploadId],
      },
    });
    expect(atThreshold.status).toBe(200);
    const over = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Supplier Example",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-21",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        lines: [{ systemId, budgetItemId: itemId, description: "Over", quantity: "1", amountNok: "5000.01" }],
        uploadIds: [await authorizeUpload()],
      },
    });
    expect(over.status).toBe(200);
    const missing = await sql<{ kind: string }>("select kind from finance.exception_reviews where kind = 'missing_approval'");
    expect(missing.length).toBe(1);
  });
});

describe("FIN-07 A05 closure and void hooks", () => {
  it("releases unused balance on close and void restores open request commitment only", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest("10000.00", "10000.00");
    const reg = await registerLinked(recordId, lineId!, "4000.00");
    expect(reg.status).toBe(200);
    const purchaseId = (reg.body as { id: string }).id;
    const openRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [recordId]))[0]?.revision ?? 0);
    await call("member", {
      action: "closeRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: openRevision,
      reason: "Done",
      releasedNok: "6000.00",
    });
    const closed = (await read("member", { requestRecordId: recordId })).body as { detail?: { status: string; remainingNok: string } };
    expect(closed.detail?.status).toBe("closed");
    expect(closed.detail?.remainingNok).toBe("0.00");

    const { recordId: openId, lineId: openLine } = await approveRequest("5000.00", "5000.00");
    const second = await registerLinked(openId, openLine!, "2000.00");
    const secondPurchaseId = (second.body as { id: string }).id;
    await grant(headId, "finance");
    const hash = "a".repeat(64);
    await sql("select finance.void_registered_purchase($1::uuid, $2::uuid, $3, $4::uuid, $5)", [
      headId, requestId(), hash, secondPurchaseId, "Test void",
    ]);
    const restored = (await read("member", { requestRecordId: openId })).body as { detail?: { remainingNok: string } };
    expect(restored.detail?.remainingNok).toBe("5000.00");
  });
});

describe("FIN-07 A06 own request detail privacy", () => {
  it("shows fulfillment summaries without purchase register or downloads for members", async () => {
    await seasonWithBudget();
    const { recordId, lineId } = await approveRequest();
    await registerLinked(recordId, lineId!, "2500.00");
    const view = (await read("member", { requestRecordId: recordId })).body as {
      detail?: { fulfillments?: { publicRef: string }[] };
      register?: unknown;
    };
    expect(view.detail?.fulfillments?.length).toBe(1);
    expect(view.register).toBeUndefined();
    await grant(headId, "finance");
    const financeView = await read("head", { requestRecordId: recordId });
    expect((financeView.body as { detail?: { fulfillments?: unknown } }).detail?.fulfillments).toBeUndefined();
  });
});
