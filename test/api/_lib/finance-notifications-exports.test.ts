import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { localDeliveryDecision, type FinanceMailMessage, type FinanceMailSendResult } from "../../../api/_lib/finance-mail.js";
import { claimOutboxDeliveries } from "../../../api/_lib/finance-outbox.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { FinanceStorageUncertainError, type FinanceObjectStorage } from "../../../api/_lib/finance-storage.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";
import { thirdOsloDayFrom } from "../../../src/features/Finance/request-domain.js";
import { osloToday } from "../../../src/features/Finance/money.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const financeId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const businessId = "44444444-4444-4444-8444-444444444444";
const requesterId = "66666666-6666-4666-8666-666666666666";
const refundAccount = "10987654321";
const refundPhone = "80808080";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  finance: { userId: financeId, googleSub: "finance-sub", email: "finance.user@example.test", name: "Finance Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head.user@example.test", name: "Head Example" },
  business: { userId: businessId, googleSub: "business-sub", email: "business.user@example.test", name: "Business Example" },
  requester: { userId: requesterId, googleSub: "requester-sub", email: "requester.user@example.test", name: "Requester Example" },
};

const allowlist = "finance.user@example.test,head.user@example.test,requester.user@example.test";
const env: NodeJS.ProcessEnv = {
  HELIX_ENVIRONMENT: "local",
  WEBSITE_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "test-only",
  WEBSITE_EMAIL_TEST_RECIPIENTS: allowlist,
  CONTACT_FROM_EMAIL: "no-reply@example.test",
};

let pg: PGlite;
let db: CvDatabase;
let storage: ReturnType<typeof createMemoryFinanceStorage>;
let sent: FinanceMailMessage[];
let logs: string[];
let send: (message: FinanceMailMessage) => Promise<FinanceMailSendResult>;
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

async function call(path: { token?: string; body?: unknown; query?: Record<string, string> }) {
  const wrapped = response();
  const headers: Record<string, string> = {};
  if (path.token) headers.authorization = `Bearer ${path.token}`;
  await handler({
    method: path.body ? "POST" : "GET",
    query: path.query ?? {},
    body: path.body,
    headers,
  } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await pg.query<T>(text, params);
  return result.rows;
}

async function viewVersion() {
  return Number((await sql<{ version: string }>("select version::text as version from finance.view_versions"))[0]?.version ?? "0");
}

function privateMaterial(value: string) {
  expect(value).not.toContain(refundAccount);
  expect(value).not.toContain(refundPhone);
  expect(value).not.toContain("X-Amz-");
  expect(value).not.toContain("refund_account");
  expect(value).not.toContain("refund_phone");
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (
      id uuid primary key, google_sub text not null, email text not null, full_name text not null, helix_role text
    );
    create table identity.departments (
      department_key text primary key, name text not null unique, sort_order smallint not null unique
    );
    insert into identity.departments (department_key, name, sort_order) values
      ('mechanical-production', 'Mechanical', 1),
      ('finance', 'Finance', 2);
    create table identity.platform_roles (role_key text primary key);
    create table identity.member_roles (member_id uuid not null, role_key text not null);
    create table identity.recruiter_grants (member_id uuid primary key);
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    create table identity.role_feature_grants (role_key text not null, feature_key text not null, scope text not null);
    insert into identity.platform_roles values ('platform_administrator');
    insert into identity.members (id, google_sub, email, full_name) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example'),
      ('${financeId}', 'finance-sub', 'finance.user@example.test', 'Finance Example'),
      ('${headId}', 'head-sub', 'head.user@example.test', 'Head Example'),
      ('${businessId}', 'business-sub', 'business.user@example.test', 'Business Example'),
      ('${requesterId}', 'requester-sub', 'requester.user@example.test', 'Requester Example');
    insert into identity.member_roles values ('${operatorId}', 'platform_administrator');
    create role anon;
    create role authenticated;
    create role anonymous;
  `);
  for (const file of ["011_finance_core.sql", "012_finance_season_budgets.sql", "013_finance_funding.sql", "014_finance_register_purchases.sql", "015_finance_requests.sql", "017_finance_notifications_exports.sql", "018_finance_unpaid_voids_reviews.sql", "020_finance_processing_guards.sql", "021_finance_final_candidate_ledger.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  db = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  storage = createMemoryFinanceStorage();
  sent = [];
  logs = [];
  send = async (message) => {
    sent.push(message);
    return { outcome: "sent", providerMessageId: "msg_test" };
  };
  wireServices();
});

function wireServices(overrides: { storage?: FinanceObjectStorage; inlineLimit?: number; autoDispatch?: boolean } = {}) {
  services = createFinanceServices({
    db,
    financeStorage: overrides.storage ?? storage,
    financeDelivery: {
      send: (message) => send(message),
      env,
      log: (line) => logs.push(line),
      inlineLimit: overrides.inlineLimit ?? 1_048_576,
      autoDispatch: overrides.autoDispatch ?? false,
    },
    authenticate: async (token) => {
      const identity = identities[token];
      if (!identity) throw new Error("Log in to continue.");
      return identity;
    },
  });
  handler = createFinanceHandler(() => services);
}

async function resetFinance() {
  await pg.exec("rollback").catch(() => undefined);
  env.WEBSITE_EMAIL_TEST_RECIPIENTS = allowlist;
  sent = [];
  logs = [];
  storage.objects.clear();
  send = async (message) => {
    sent.push(message);
    return { outcome: "sent", providerMessageId: "msg_test" };
  };
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    update finance.requests set submitted_revision_id = null, approved_revision_id = null;
    truncate table finance.upload_final_candidates,
      finance.outbox_attempts,
      finance.export_objects,
      finance.allocations,
      finance.purchase_lines,
      finance.outlay_reimbursements,
      finance.invoice_obligations,
      finance.documents,
      finance.uploads,
      finance.exception_reviews,
      finance.purchases,
      finance.request_draft_lines,
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
    restart identity cascade;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
  wireServices();
}

beforeEach(resetFinance);
afterAll(async () => { await pg.close(); });

async function seedSeason() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  await sql("select finance.configure_approval_threshold($1::uuid, 500000)", [operatorId]);
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'finance', true, 'Test profile')", [operatorId, financeId]);
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'head_of_finance', true, 'Test profile')", [operatorId, headId]);
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'business', true, 'Test profile')", [operatorId, businessId]);
  const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
  await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
  await sql(
    `insert into finance.budgets (season_id, public_ref, status, approved_by_member_id, approved_on, created_by_member_id, updated_by_member_id)
     values ($1::uuid, 'B-S27', 'approved', $2::uuid, '2026-10-01', $2::uuid, $2::uuid)`,
    [seasonId, operatorId],
  );
  await sql(
    `insert into finance.budget_items (
       budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, created_by_member_id, updated_by_member_id
     )
     select b.id, s.id, 'BI-S27-001', 'Frame tube', 'material', 10000, 'P2', 'new', 'planned', $1::uuid, $1::uuid
     from finance.budgets b, finance.systems s`,
    [operatorId],
  );
  return seasonId as string;
}

async function insertPurchase(options: {
  ref: string;
  method: "outlay" | "invoice";
  totalOre: string;
  refund?: "account" | "phone";
  supplier?: string;
  description?: string;
}) {
  const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
  const itemId = (await sql<{ id: string }>("select id from finance.budget_items"))[0]?.id;
  const systemId = (await sql<{ id: string }>("select id from finance.systems"))[0]?.id;
  const purchase = (await sql<{ id: string }>(
    `insert into finance.purchases (
       season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method,
       purchase_date, justification, document_kind, refund_account, refund_phone
     ) values (
       $1::uuid, $2::uuid, $3, 'registered', 'Buyer Example', $4, $5,
       '2026-10-01', 'Workshop material for the frame build', $6, $7, $8
     ) returning id`,
    [
      seasonId,
      requesterId,
      options.ref,
      options.supplier ?? "Supplier Example",
      options.method,
      options.method === "invoice" ? "invoice" : "receipt",
      options.refund === "account" ? refundAccount : null,
      options.refund === "phone" ? refundPhone : null,
    ],
  ))[0];
  const purchaseId = purchase?.id as string;
  await pg.exec("begin");
  const lineRef = `${options.ref}-L1`;
  const extra = options.description?.startsWith("+") === true;
  const line = (await sql<{ id: string }>(
    `insert into finance.purchase_lines (
       purchase_id, public_ref, system_id, budget_item_id, unbudgeted, description, quantity, amount_ore
     ) values ($1::uuid, $2, $3::uuid, $4::uuid, false, $5, 2, $6::bigint) returning id`,
    [purchaseId, lineRef, systemId, itemId, extra ? "Frame tube" : (options.description ?? "Frame tube"), options.totalOre],
  ));
  const lineId = line[0]?.id;
  await sql(
    `insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
     values ($1::uuid, $2::uuid, $3, $4::bigint)`,
    [lineId, itemId, `${lineRef}-A1`, options.totalOre],
  );
  if (extra) {
    const extraLine = (await sql<{ id: string }>(
      `insert into finance.purchase_lines (
         purchase_id, public_ref, system_id, budget_item_id, unbudgeted, description, quantity, amount_ore
       ) values ($1::uuid, $2, $3::uuid, null, true, $4, 1, 100::bigint) returning id`,
      [purchaseId, `${options.ref}-L2`, systemId, options.description],
    ))[0];
    await sql(
      `insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
       values ($1::uuid, $2::uuid, $3, 100::bigint)`,
      [extraLine?.id, itemId, `${options.ref}-L2-A1`],
    );
  }
  if (options.method === "invoice") {
    await sql("insert into finance.invoice_obligations (purchase_id, due_date) values ($1::uuid, '2026-10-20')", [purchaseId]);
    await sql(
      `insert into finance.exception_reviews (purchase_id, kind, facts)
       values ($1::uuid, 'missing_approval', jsonb_build_object('totalOre', $2::text, 'thresholdOre', '500000', 'publicRef', $3::text))`,
      [purchaseId, options.totalOre, options.ref],
    );
  } else {
    await sql("insert into finance.outlay_reimbursements (purchase_id) values ($1::uuid)", [purchaseId]);
  }
  const sha = createHash("sha256").update(options.ref).digest("hex");
  await sql(
    `insert into finance.documents (
       purchase_id, public_ref, kind, original_name, content_type, byte_size, content_sha256, storage_key
     ) values ($1::uuid, $2, $3, $4, 'application/pdf', 8, $5, $6)`,
    [purchaseId, `${options.ref}-D1`, options.method === "invoice" ? "invoice" : "receipt", "receipt.pdf", sha, `${requesterId}/final/${purchaseId}/${sha.slice(0, 32)}`],
  );
  await pg.exec("commit");
  for (const recipient of [financeId, headId]) {
    await sql(
      `insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
       values ('purchase_registered', 'purchase', $1::uuid, $2::uuid, $3::text, jsonb_build_object('publicRef', $4::text, 'supplierName', $5::text, 'totalOre', $6::text))
       on conflict (dedupe_key) do nothing`,
      [purchaseId, recipient, `purchase_registered:${purchaseId}:${recipient}`, options.ref, options.supplier ?? "Supplier Example", options.totalOre],
    );
  }
  return purchaseId;
}

describe("FIN-10 local delivery policy", () => {
  it("requires an explicit allowlist outside production and does not treat a missing switch as permission to send", () => {
    expect(localDeliveryDecision({ HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-only", WEBSITE_EMAIL_TEST_RECIPIENTS: "other@example.test" }, "finance.user@example.test")).toEqual({ deliver: false, safeError: "recipient_not_allowlisted" });
    expect(localDeliveryDecision(env, "finance.user@example.test")).toEqual({ deliver: true });
    expect(localDeliveryDecision({ ...env, WEBSITE_EMAIL_ENABLED: "false" }, "finance.user@example.test")).toEqual({ deliver: false, safeError: "delivery_disabled" });
    expect(localDeliveryDecision({ HELIX_ENVIRONMENT: "production", WEBSITE_EMAIL_ENABLED: "false" }, "finance.user@example.test").deliver).toBe(false);
  });
});

describe("FIN-10-A01 outbox delivery", () => {
  it("delivers more than one batch of request notifications without duplicating retries", async () => {
    await seedSeason();
    const additional = Array.from({ length: 30 }, (_, index) => `head${index}@example.test`);
    for (const [index, email] of additional.entries()) {
      const memberId = crypto.randomUUID();
      await sql("insert into identity.members (id, google_sub, email, full_name) values ($1::uuid, $2, $3, $4)", [memberId, `batch-sub-${index}`, email, `Batch Head ${index}`]);
      await sql("insert into finance.member_grants (member_id, profile, active, operator_member_id, reason) values ($1::uuid, 'head_of_finance', true, $2::uuid, 'Test')", [memberId, operatorId]);
    }
    env.WEBSITE_EMAIL_TEST_RECIPIENTS = [allowlist, ...additional.slice(0, -1)].join(",");
    const normalSend = send;
    send = async (message) => {
      if (message.to === additional[10]) throw new Error("synthetic provider failure");
      return normalSend(message);
    };
    wireServices({ autoDispatch: true });
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'"))[0]!.id;
    const request = { supplierName: "Example", justification: "Materials for the frame", plannedDate: thirdOsloDayFrom(osloToday()),
      lines: [{ budgetItemId: itemId, description: "Tube", estimatedNok: "50.00" }] };
    const saved = await call({ token: "requester", body: { action: "saveRequest", requestId: crypto.randomUUID(), request } });
    const draft = saved.body as { id: string; revision: number };
    const body = { action: "submitRequest", requestId: crypto.randomUUID(), requestRecordId: draft.id, expectedRevision: draft.revision, request };
    const submitted = await call({ token: "requester", body });
    expect(submitted.status).toBe(200);
    expect(sent).toHaveLength(29);
    expect(new Set(sent.map((message) => message.to)).size).toBe(29);
    expect(sent.some((message) => message.to === additional[29])).toBe(false);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.outbox where entity_id = $1::uuid and status = 'pending'", [draft.id]))[0].count).toBe("0");
    expect((await sql<{ safe_error: string }>("select safe_error from finance.outbox where entity_id = $1::uuid and status = 'failed'", [draft.id]))[0].safe_error).toBe("recipient_not_allowlisted");
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.outbox where entity_id = $1::uuid and status = 'uncertain'", [draft.id]))[0].count).toBe("1");
    expect((await call({ token: "requester", body })).status).toBe(200);
    expect(sent).toHaveLength(29);
  });

  it("paginates deliveries and uploads independently without exposing private fields", async () => {
    await seedSeason();
    await sql(`insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, status, safe_error)
      select 'request.submitted', 'request', gen_random_uuid(), $1::uuid, 'page-' || n, 'uncertain', 'provider_unknown' from generate_series(1, 55) n`, [requesterId]);
    await sql(`insert into finance.uploads (id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at, commit_state)
      select id, $1::uuid, id::text || '/private-key', 'pending', 8, 'application/pdf', 'private.pdf', now(), 'uncertain'
      from (select gen_random_uuid() as id from generate_series(1, 55)) generated`, [requesterId]);
    const first = await call({ token: "finance", query: { action: "recovery" } });
    expect(first.status).toBe(200);
    const page = first.body as { deliveries: { id: string }[]; uploads: { id: string }[]; deliveryNextCursor: string; uploadNextCursor: string };
    expect(page.deliveries).toHaveLength(50);
    expect(page.uploads).toHaveLength(50);
    expect(page.deliveryNextCursor).toBeTruthy();
    expect(page.uploadNextCursor).toBeTruthy();
    const nextDeliveries = await call({ token: "finance", query: { action: "recovery", deliveryAfter: page.deliveryNextCursor } });
    const next = nextDeliveries.body as { deliveries: { id: string }[]; uploads: { id: string }[]; deliveryNextCursor: string | null };
    expect(next.deliveries).toHaveLength(5);
    expect(next.uploads).toHaveLength(50);
    expect(next.deliveryNextCursor).toBeNull();
    expect(next.deliveries.some((row) => page.deliveries.some((firstRow) => firstRow.id === row.id))).toBe(false);
    const nextUploads = await call({ token: "finance", query: { action: "recovery", uploadAfter: page.uploadNextCursor } });
    const uploadPage = nextUploads.body as { deliveries: { id: string }[]; uploads: { id: string }[]; uploadNextCursor: string | null };
    expect(uploadPage.deliveries).toHaveLength(50);
    expect(uploadPage.uploads).toHaveLength(5);
    expect(uploadPage.uploadNextCursor).toBeNull();
    expect(uploadPage.uploads.some((row) => page.uploads.some((firstRow) => firstRow.id === row.id))).toBe(false);
    expect(JSON.stringify([first.body, nextDeliveries.body, nextUploads.body])).not.toContain("private-key");
    expect((await call({ token: "finance", query: { action: "recovery", deliveryAfter: "invalid" } })).status).toBe(400);
    expect((await call({ token: "requester", query: { action: "recovery", uploadAfter: page.uploadNextCursor } })).status).toBe(403);
  });
  it("automatically delivers a submitted request after commit and does not resend on replay", async () => {
    await seedSeason();
    wireServices({ autoDispatch: true });
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'"))[0]!.id;
    const request = { supplierName: "Example", justification: "Materials for the frame", plannedDate: thirdOsloDayFrom(osloToday()),
      lines: [{ budgetItemId: itemId, description: "Tube", estimatedNok: "50.00" }] };
    const saved = await call({ token: "requester", body: { action: "saveRequest", requestId: crypto.randomUUID(), request } });
    expect(saved.status).toBe(200);
    const draft = saved.body as { id: string; revision: number };
    const requestId = crypto.randomUUID();
    const body = { action: "submitRequest", requestId, requestRecordId: draft.id, expectedRevision: draft.revision, request };
    const submitted = await call({ token: "requester", body });
    expect(submitted.status).toBe(200);
    expect(sent.map((message) => message.to)).toEqual(["head.user@example.test"]);
    expect((await sql<{ status: string }>("select status from finance.requests where id = $1::uuid", [draft.id]))[0]?.status).toBe("submitted");
    expect((await call({ token: "requester", body })).status).toBe(200);
    expect(sent).toHaveLength(1);
    const revisionId = (await sql<{ id: string }>("select submitted_revision_id::text as id from finance.requests where id = $1::uuid", [draft.id]))[0]!.id;
    const decision = await call({ token: "head", body: { action: "decideRequest", requestId: crypto.randomUUID(), requestRecordId: draft.id, revisionId, decision: "rejected", reason: "Not needed" } });
    expect(decision.status).toBe(200);
    expect(sent.map((message) => message.to)).toEqual(["head.user@example.test", "requester.user@example.test"]);
  });

  it("keeps a committed request and records an uncertain provider outcome", async () => {
    await seedSeason();
    wireServices({ autoDispatch: true });
    send = async () => { throw new Error("synthetic provider failure"); };
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'"))[0]!.id;
    const request = { supplierName: "Example", justification: "Materials for the frame", plannedDate: thirdOsloDayFrom(osloToday()),
      lines: [{ budgetItemId: itemId, description: "Tube", estimatedNok: "50.00" }] };
    const saved = await call({ token: "requester", body: { action: "saveRequest", requestId: crypto.randomUUID(), request } });
    const draft = saved.body as { id: string; revision: number };
    const submitted = await call({ token: "requester", body: { action: "submitRequest", requestId: crypto.randomUUID(), requestRecordId: draft.id, expectedRevision: draft.revision, request } });
    expect(submitted.status).toBe(200);
    expect((await sql<{ status: string }>("select status from finance.requests where id = $1::uuid", [draft.id]))[0]?.status).toBe("submitted");
    expect((await sql<{ status: string }>("select status from finance.outbox where entity_id = $1::uuid", [draft.id]))[0]?.status).toBe("uncertain");
  });

  it("automatically sends registration events to Finance after a purchase is saved", async () => {
    await seedSeason();
    wireServices({ autoDispatch: true });
    const year = Number(osloToday().slice(0, 4));
    await sql("select finance.configure_annual_reference_start($1::uuid, $2::integer, 1)", [operatorId, year]);
    const systemId = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0]!.id;
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'"))[0]!.id;
    const auth = await call({ token: "requester", body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 } });
    expect(auth.status).toBe(200);
    const upload = auth.body as { id: string; stagingKey: string };
    await putMemoryPdf(storage, upload.stagingKey);
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId: upload.id } })).status).toBe(200);
    const purchase = { buyerName: "Member", supplierName: "Example", paymentMethod: "team_account", purchaseDate: osloToday(),
      justification: "Materials for the frame", documentKind: "receipt", uploadIds: [upload.id],
      lines: [{ systemId, budgetItemId: itemId, description: "Tube", quantity: "1", amountNok: "50.00" }] };
    const result = await call({ token: "requester", body: { action: "registerPurchase", requestId: crypto.randomUUID(), purchase } });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(sent.map((message) => message.to).sort()).toEqual(["finance.user@example.test", "head.user@example.test"]);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.purchases"))[0]?.count).toBe("1");
  });

  it("only lets Finance inspect safe actionable recovery metadata", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0042", method: "invoice", totalOre: "1000" });
    await sql("update finance.outbox set status = 'uncertain', safe_error = 'provider_unknown' where entity_id = $1::uuid", [purchaseId]);
    const uploadId = crypto.randomUUID();
    await sql(`insert into finance.uploads (id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at, commit_state)
      values ($1::uuid, $2::uuid, $3, 'pending', 8, 'application/pdf', 'private.pdf', now(), 'uncertain')`,
    [uploadId, requesterId, `${requesterId}/staging/${uploadId}/${"a".repeat(32)}`]);
    const savedUploadId = crypto.randomUUID();
    await sql(`insert into finance.uploads (id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at, commit_state, purchase_id)
      values ($1::uuid, $2::uuid, $3, 'pending', 8, 'application/pdf', 'saved.pdf', now(), 'uncertain', $4::uuid)`,
    [savedUploadId, requesterId, `${requesterId}/staging/${savedUploadId}/${"b".repeat(32)}`, purchaseId]);
    expect((await call({ token: "business", query: { action: "recovery" } })).status).toBe(403);
    expect((await call({ token: "requester", query: { action: "recovery" } })).status).toBe(403);
    const response = await call({ token: "finance", query: { action: "recovery" } });
    expect(response.status).toBe(200);
    const view = response.body as { deliveries: { id: string; status: string }[]; uploads: { id: string; referenced: boolean }[] };
    expect(view.deliveries).toHaveLength(2);
    expect(view.deliveries.every((row) => row.status === "uncertain")).toBe(true);
    expect(view.uploads.map((row) => row.id)).toContain(uploadId);
    expect(view.uploads.find((row) => row.id === uploadId)?.referenced).toBe(false);
    expect(view.uploads.find((row) => row.id === savedUploadId)?.referenced).toBe(true);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("staging/");
    expect(serialized).not.toContain("final/");
    expect(serialized).not.toContain(refundAccount);
    expect(serialized).not.toContain(refundPhone);
    const record = view.deliveries[0]!;
    const reconciled = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId: record.id, reconciliation: "not_sent" } });
    expect(reconciled.status).toBe(200);
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [record.id]))[0]?.status).toBe("failed");
    const uploaded = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, reconciliation: "absent" } });
    expect(uploaded.status).toBe(200);
    const saved = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: savedUploadId, reconciliation: "saved" } });
    expect(saved.status).toBe(200);
    expect((await sql<{ commit_state: string }>("select commit_state from finance.uploads where id = $1::uuid", [savedUploadId]))[0]?.commit_state).toBe("settled");
  });

  it("notifies active heads, the requester, and finance recipients once, and keeps a failed send off the business transaction", async () => {
    await seedSeason();
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons"))[0]?.id;
    const requestId = (await sql<{ id: string }>(
      `insert into finance.requests (season_id, requester_member_id, public_ref, status)
       values ($1::uuid, $2::uuid, 'RQ-S27-001', 'submitted') returning id`,
      [seasonId, requesterId],
    ))[0]?.id as string;
    const revisionId = (await sql<{ id: string }>(
      `insert into finance.request_revisions (request_id, revision_number, supplier_name, justification, planned_date)
       values ($1::uuid, 1, 'Supplier Example', 'Need a frame this month', '2026-11-01') returning id`,
      [requestId],
    ))[0]?.id as string;
    await sql(
      `insert into finance.request_decisions (revision_id, decision, reason, actor_member_id)
       values ($1::uuid, 'approved', 'Fits the plan', $2::uuid)`,
      [revisionId, headId],
    );
    await sql("update finance.requests set submitted_revision_id = $2::uuid, status = 'approved' where id = $1::uuid", [requestId, revisionId]);
    await sql("select finance.notify_heads_request_submitted($1::uuid, $2::uuid, 'RQ-S27-001')", [requestId, revisionId]);
    await sql("select finance.notify_heads_request_submitted($1::uuid, $2::uuid, 'RQ-S27-001')", [requestId, revisionId]);
    await sql("select finance.notify_requester_decision($1::uuid, $2::uuid, 'RQ-S27-001', $3::uuid, 'approved')", [requestId, revisionId, requesterId]);
    const purchaseId = await insertPurchase({ ref: "2026-0042", method: "invoice", totalOre: "650000", supplier: '=HYPERLINK("http://evil.test")', description: "+SUM(A1)" });
    await insertPurchase({ ref: "2026-0043", method: "outlay", totalOre: "1500", refund: "account" });
    const recipients = await sql<{ email: string; event_type: string }>(
      `select m.email, o.event_type
       from finance.outbox o
       join identity.members m on m.id = o.recipient_member_id
       order by o.event_type, m.email`,
    );
    expect(recipients.some((row) => row.email === "business.user@example.test")).toBe(false);
    expect(recipients.filter((row) => row.event_type === "request.submitted").map((row) => row.email)).toEqual(["head.user@example.test"]);
    expect(recipients.filter((row) => row.event_type === "request.decided").map((row) => row.email)).toEqual(["requester.user@example.test"]);
    expect(recipients.filter((row) => row.event_type === "purchase_registered").map((row) => row.email).sort()).toEqual([
      "finance.user@example.test",
      "finance.user@example.test",
      "head.user@example.test",
      "head.user@example.test",
    ]);
    const version = await viewVersion();
    const purchases = (await sql<{ count: string }>("select count(*)::text as count from finance.purchases"))[0]?.count;
    const first = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(first.status).toBe(200);
    expect(sent.map((message) => message.to).sort()).toEqual([
      "finance.user@example.test",
      "finance.user@example.test",
      "head.user@example.test",
      "head.user@example.test",
      "head.user@example.test",
      "requester.user@example.test",
    ]);
    const registration = sent.find((message) => message.subject.includes("2026-0042"));
    expect(registration?.subject.startsWith("[Unpaid invoice] [Above approval limit NOK 5000.00]")).toBe(true);
    expect(registration?.text).toContain("2026-0042");
    expect(registration?.text).toContain("quantity");
    expect(registration?.text).toContain("NOK");
    expect(registration?.text).toContain("unbudgeted");
    expect(registration?.text).toContain("over_budget");
    expect(registration?.text).toContain("approval limit");
    expect(registration?.text).toContain("Sign in to Helix and open /finance/purchases");
    expect(registration?.html).toContain("/finance/purchases");
    for (const message of sent) privateMaterial(`${message.subject}\n${message.text}\n${message.html}`);
    expect(sent.some((message) => message.text.includes("80808080"))).toBe(false);
    const second = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(second.status).toBe(200);
    expect(sent).toHaveLength(6);
    expect(await viewVersion()).toBe(version);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.purchases"))[0]?.count).toBe(purchases);
    expect((await sql<{ status: string }>("select status from finance.outbox where entity_id = $1::uuid", [purchaseId])).every((row) => row.status === "sent")).toBe(true);
    for (const line of logs) privateMaterial(line);
    expect(purchaseId).toBeTruthy();
  });

  it("keeps an uncertain send from being retried until it is reconciled", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0044", method: "outlay", totalOre: "2000", refund: "phone" });
    await sql("delete from finance.outbox where recipient_member_id = $1::uuid", [headId]);
    send = async () => { throw new Error("socket reset"); };
    const version = await viewVersion();
    const failed = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(failed.status).toBe(200);
    expect((failed.body as { recovery?: { uncertain: number } }).recovery?.uncertain).toBe(1);
    expect((await sql<{ status: string }>("select status from finance.outbox where entity_id = $1::uuid", [purchaseId]))[0]?.status).toBe("uncertain");
    expect(await viewVersion()).toBe(version);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.purchases"))[0]?.count).toBe("1");
    send = async (message) => { sent.push(message); return { outcome: "sent", providerMessageId: "msg_retry" }; };
    const blocked = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(blocked.status).toBe(200);
    expect(sent).toHaveLength(0);
    const outboxId = (await sql<{ id: string }>("select id from finance.outbox where entity_id = $1::uuid", [purchaseId]))[0]?.id as string;
    const needsObservation = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId } });
    expect(needsObservation.status).toBe(409);
    expect((needsObservation.body as { error?: string }).error).toBe("Reconcile the unknown delivery before retrying.");
    const same = crypto.randomUUID();
    const reconciled = await call({ token: "finance", body: { action: "retryOutbox", requestId: same, outboxId, reconciliation: "not_sent" } });
    expect(reconciled.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [outboxId]))[0]?.status).toBe("failed");
    const mismatch = await call({ token: "finance", body: { action: "retryOutbox", requestId: same, outboxId, reconciliation: "sent" } });
    expect(mismatch.status).toBe(409);
    expect((mismatch.body as { error?: string }).error).toBe("This request ID was already used for a different change.");
    const retried = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId } });
    expect(retried.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [outboxId]))[0]?.status).toBe("sent");
    privateMaterial(sent[0]?.text ?? "");
    for (const line of logs) privateMaterial(line);
  });

  it("records a claim before the send so a crashed process cannot roll the attempt back or send it twice", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0045", method: "team_account" as "outlay", totalOre: "1000" });
    await sql("update finance.purchases set payment_method = 'team_account', refund_account = null, refund_phone = null, document_kind = 'receipt' where id = $1::uuid", [purchaseId]);
    await sql("delete from finance.outbox where recipient_member_id <> $1::uuid", [financeId]);
    await sql("delete from finance.outlay_reimbursements where purchase_id = $1::uuid", [purchaseId]);
    const claimed = await claimOutboxDeliveries(db, 10);
    expect(claimed).toHaveLength(1);
    expect((await sql<{ status: string }>("select status from finance.outbox"))[0]?.status).toBe("uncertain");
    const version = await viewVersion();
    const again = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(again.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(await viewVersion()).toBe(version);
    const replay = await sql<{ result: { replay?: boolean } | string }>(
      "select finance.record_delivery_result($1::uuid, 'uncertain', null, 'provider_unknown') as result",
      [claimed[0]?.claim_token],
    );
    const parsed = typeof replay[0]?.result === "string" ? JSON.parse(replay[0].result) as { replay?: boolean } : replay[0]?.result;
    expect(parsed?.replay).toBe(false);
    const second = await sql<{ result: { replay?: boolean } | string }>(
      "select finance.record_delivery_result($1::uuid, 'uncertain', null, 'provider_unknown') as result",
      [claimed[0]?.claim_token],
    );
    const parsedAgain = typeof second[0]?.result === "string" ? JSON.parse(second[0].result) as { replay?: boolean } : second[0]?.result;
    expect(parsedAgain?.replay).toBe(true);
    await expect(sql(
      "select finance.record_delivery_result($1::uuid, 'sent', 'msg_other', null)",
      [claimed[0]?.claim_token],
    )).rejects.toThrow(/already recorded/i);
  });

  it("does not call the sender for a recipient who is not allowlisted or no longer active", async () => {
    await seedSeason();
    await insertPurchase({ ref: "2026-0046", method: "outlay", totalOre: "1000", refund: "account" });
    env.WEBSITE_EMAIL_TEST_RECIPIENTS = "finance.user@example.test";
    await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'head_of_finance', false, 'Revoke for test')", [operatorId, headId]);
    const result = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
    expect(result.status).toBe(200);
    expect(sent.map((message) => message.to)).toEqual(["finance.user@example.test"]);
    const headStatus = await sql<{ status: string; safe_error: string }>(
      "select status, safe_error from finance.outbox where recipient_member_id = $1::uuid",
      [headId],
    );
    expect(headStatus.every((row) => row.status === "failed" && row.safe_error === "recipient_inactive")).toBe(true);
    env.WEBSITE_EMAIL_TEST_RECIPIENTS = allowlist;
    for (const message of sent) privateMaterial(`${message.text}${message.html}`);
  });

  it("keeps claiming when email is disabled so a config failure does not use up the retry bound", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0049", method: "outlay", totalOre: "1000", refund: "account" });
    await sql("delete from finance.outbox where recipient_member_id <> $1::uuid", [financeId]);
    env.WEBSITE_EMAIL_ENABLED = "false";
    send = async () => { throw new Error("sender must not be called"); };
    try {
      for (let index = 0; index < 8; index += 1) {
        const result = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
        expect(result.status).toBe(200);
        expect((result.body as { recovery?: { failed: number; uncertain: number; sent: number } }).recovery).toMatchObject({ failed: 1, uncertain: 0, sent: 0 });
      }
      const row = (await sql<{ attempt_count: string; status: string; safe_error: string }>(
        "select attempt_count::text as attempt_count, status, safe_error from finance.outbox where entity_id = $1::uuid",
        [purchaseId],
      ))[0];
      expect(row).toMatchObject({ attempt_count: "0", status: "failed", safe_error: "delivery_disabled" });
      expect((await sql<{ count: string }>("select count(*)::text as count from finance.outbox_attempts where status = 'failed'"))[0]?.count).toBe("8");
      expect(sent).toHaveLength(0);
      env.WEBSITE_EMAIL_ENABLED = "true";
      env.WEBSITE_EMAIL_TEST_RECIPIENTS = "other@example.test";
      const excluded = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID() } });
      expect(excluded.status).toBe(200);
      expect((excluded.body as { recovery?: { failed: number; uncertain: number } }).recovery).toMatchObject({ failed: 1, uncertain: 0 });
      const after = (await sql<{ attempt_count: string; status: string; safe_error: string }>(
        "select attempt_count::text as attempt_count, status, safe_error from finance.outbox where entity_id = $1::uuid",
        [purchaseId],
      ))[0];
      expect(after).toMatchObject({ attempt_count: "0", status: "failed", safe_error: "recipient_not_allowlisted" });
      expect((await sql<{ count: string }>("select count(*)::text as count from finance.outbox_attempts"))[0]?.count).toBe("9");
      expect(sent).toHaveLength(0);
    } finally {
      env.WEBSITE_EMAIL_ENABLED = "true";
      env.WEBSITE_EMAIL_TEST_RECIPIENTS = allowlist;
    }
  });

  it("refuses to reconcile a claim that is still in progress", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0050", method: "outlay", totalOre: "1000", refund: "phone" });
    await sql("delete from finance.outbox where recipient_member_id <> $1::uuid", [financeId]);
    const claimed = await claimOutboxDeliveries(db, 10);
    expect(claimed).toHaveLength(1);
    const outboxId = claimed[0]?.outbox_id as string;
    const early = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId, reconciliation: "not_sent" } });
    expect(early.status).toBe(409);
    expect((early.body as { error?: string }).error).toBe("This delivery is still in progress. Try again in a few minutes.");
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [outboxId]))[0]?.status).toBe("uncertain");
    expect((await sql<{ status: string }>("select status from finance.outbox_attempts where outbox_id = $1::uuid", [outboxId]))[0]?.status).toBe("claimed");
    await sql(
      "update finance.outbox_attempts set claimed_at = clock_timestamp() - interval '6 minutes' where claim_token = $1::uuid",
      [claimed[0]?.claim_token],
    );
    const later = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId, reconciliation: "not_sent" } });
    expect(later.status).toBe(200);
    expect((await sql<{ status: string; safe_error: string }>("select status, safe_error from finance.outbox where id = $1::uuid", [outboxId]))[0]).toMatchObject({ status: "failed", safe_error: "reconciled_not_sent" });
    send = async () => { throw new Error("socket reset"); };
    const recorded = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId } });
    expect(recorded.status).toBe(200);
    expect((recorded.body as { recovery?: { uncertain: number } }).recovery?.uncertain).toBe(1);
    const reconciled = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId, reconciliation: "not_sent" } });
    expect(reconciled.status).toBe(200);
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [outboxId]))[0]?.status).toBe("failed");
    send = async (message) => { sent.push(message); return { outcome: "sent", providerMessageId: "msg_after" }; };
    const delivered = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId } });
    expect(delivered.status).toBe(200);
    expect(sent).toHaveLength(1);
    const overwrite = await call({ token: "finance", body: { action: "retryOutbox", requestId: crypto.randomUUID(), outboxId, reconciliation: "not_sent" } });
    expect(overwrite.status).toBe(409);
    expect((overwrite.body as { error?: string }).error).toBe("Reconcile the unknown delivery before retrying.");
    expect((await sql<{ status: string }>("select status from finance.outbox where id = $1::uuid", [outboxId]))[0]?.status).toBe("sent");
    expect(sent).toHaveLength(1);
    privateMaterial(sent[0]?.text ?? "");
    expect(purchaseId).toBeTruthy();
  });
});

describe("FIN-10-A03 and FIN-10-A04 export", () => {
  it("exports literal field names in ordinary text without exposing refund values", async () => {
    await seedSeason();
    await insertPurchase({ ref: "2026-0041", method: "outlay", totalOre: "1500", refund: "account", description: "Check refund_account and refund_phone labels" });
    const result = await call({ token: "finance", body: { action: "exportPurchases", requestId: crypto.randomUUID() } });
    expect(result.status).toBe(200);
    const csv = (result.body as { exportFile: { csv: string } }).exportFile.csv;
    expect(csv).toContain("Check refund_account and refund_phone labels");
    expect(csv).not.toContain(refundAccount);
    expect(csv).not.toContain(refundPhone);
    expect(csv.split("\r\n")[0]).not.toMatch(/refund_account|refund_phone/);
    expect((await sql<{ safe: boolean }>("select finance.delivery_output_is_safe($1::jsonb) as safe", [JSON.stringify({ nested: { refundAccount: refundAccount } })]))[0]?.safe).toBe(false);
    expect((await sql<{ safe: boolean }>("select finance.delivery_output_is_safe($1::jsonb) as safe", [JSON.stringify({ nested: { refund_phone: refundPhone } })]))[0]?.safe).toBe(false);
  });

  it("exports a repeatable formula-safe manifest without refund numbers or permanent links, and denies a revoked grant", async () => {
    await seedSeason();
    await insertPurchase({ ref: "2026-0042", method: "invoice", totalOre: "650000", supplier: "=CMD()", description: "+SUM(A1)" });
    await insertPurchase({ ref: "2026-0043", method: "outlay", totalOre: "1500", refund: "phone" });
    const version = await viewVersion();
    const sha = (await sql<{ content_sha256: string }>("select content_sha256 from finance.documents order by public_ref"))[0]?.content_sha256 as string;
    services = createFinanceServices({
      db,
      financeStorage: storage,
      financeDelivery: { send: (message) => send(message), env, log: (line) => logs.push(line), inlineLimit: 1 },
      authenticate: async (token) => identities[token] ?? Promise.reject(new Error("Log in to continue.")),
    });
    handler = createFinanceHandler(() => services);
    expect((await call({ token: "business", body: { action: "exportPurchases", requestId: crypto.randomUUID() } })).status).toBe(403);
    expect((await call({ token: "operator", body: { action: "exportPurchases", requestId: crypto.randomUUID() } })).status).toBe(403);
    const requestId = crypto.randomUUID();
    const exported = await call({ token: "finance", body: { action: "exportPurchases", requestId } });
    expect(exported.status).toBe(200);
    const file = (exported.body as { exportFile?: { delivery: string; exportId?: string; csv?: string; contentSha256: string } }).exportFile;
    expect(file?.delivery).toBe("private");
    expect(file?.csv).toBeUndefined();
    privateMaterial(JSON.stringify(exported.body));
    const stored = [...storage.objects.entries()].filter(([key]) => key.startsWith("exports/"));
    expect(stored).toHaveLength(1);
    const csv = new TextDecoder().decode(stored[0]?.[1]);
    privateMaterial(csv);
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("2026-0042");
    expect(csv).toContain("2026-0043");
    expect(csv).toContain(sha);
    expect(csv).toContain("receipt.pdf");
    expect(csv).toContain("unbudgeted");
    expect(csv).toContain("over_budget");
    expect(csv).toContain("current");
    expect(csv).toContain("unpaid");
    expect(csv).toContain("unreimbursed");
    expect(csv).toContain("at_registration");
    expect(csv).not.toContain("http");
    expect(csv).not.toContain("memory://");
    const replay = await call({ token: "finance", body: { action: "exportPurchases", requestId } });
    expect(replay.body).toMatchObject(exported.body as Record<string, unknown>);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("exports/"))).toHaveLength(1);
    const again = await call({ token: "finance", body: { action: "exportPurchases", requestId: crypto.randomUUID() } });
    expect((again.body as { exportFile?: { contentSha256?: string } }).exportFile?.contentSha256).toBe(file?.contentSha256);
    expect(await viewVersion()).toBe(version);
    const budgets = await call({ token: "requester", query: { action: "budgets" } });
    privateMaterial(JSON.stringify(budgets.body));
    expect(JSON.stringify(budgets.body)).not.toContain(sha);
    expect(JSON.stringify(budgets.body)).not.toContain("exports/");
    const exportId = file?.exportId as string;
    const presigns: string[] = [];
    const wrapped: FinanceObjectStorage = { ...storage, presignGet: async (...args) => { presigns.push(args[0]); return storage.presignGet(...args); } };
    services = createFinanceServices({
      db,
      financeStorage: wrapped,
      financeDelivery: { send: (message) => send(message), env, inlineLimit: 1 },
      authenticate: async (token) => identities[token] ?? Promise.reject(new Error("Log in to continue.")),
    });
    handler = createFinanceHandler(() => services);
    const downloaded = await call({ token: "head", body: { action: "downloadExport", requestId: crypto.randomUUID(), exportId } });
    expect(downloaded.status).toBe(200);
    expect(String((downloaded.body as { downloadUrl?: string }).downloadUrl)).toContain("X-Amz-Signature");
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.idempotency_keys where action = 'downloadExport'"))[0]?.count).toBe("0");
    expect(await viewVersion()).toBe(version);
    await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'head_of_finance', false, 'Revoke for test')", [operatorId, headId]);
    const denied = await call({ token: "head", body: { action: "downloadExport", requestId: crypto.randomUUID(), exportId } });
    expect(denied.status).toBe(403);
    expect(presigns).toHaveLength(1);
    expect(await viewVersion()).toBe(version + 1);
    for (const line of logs) privateMaterial(line);
  });

  it("stores a private export only after the bytes are accepted and reports an injected storage failure", async () => {
    await seedSeason();
    await insertPurchase({ ref: "2026-0047", method: "outlay", totalOre: "1000", refund: "account" });
    const failing: FinanceObjectStorage = {
      ...storage,
      putObject: async () => { throw new FinanceStorageUncertainError(); },
    };
    services = createFinanceServices({
      db,
      financeStorage: failing,
      financeDelivery: { send: (message) => send(message), env, inlineLimit: 1 },
      authenticate: async (token) => identities[token] ?? Promise.reject(new Error("Log in to continue.")),
    });
    handler = createFinanceHandler(() => services);
    const version = await viewVersion();
    const failed = await call({ token: "finance", body: { action: "exportPurchases", requestId: crypto.randomUUID() } });
    expect(failed.status).toBe(503);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.export_objects"))[0]?.count).toBe("0");
    expect(await viewVersion()).toBe(version);
  });
});

describe("FIN-10-A05 cleanup and reconciliation", () => {
  it("does not register a purchase if actual upload cleanup wins after evidence was read", async () => {
    await seedSeason();
    await sql("insert into finance.reference_counters (counter_key, calendar_year, configured_next, updated_by_member_id) values ('purchase:2026', 2026, 1, $1::uuid)", [operatorId]);
    const authorized = await call({ token: "requester", body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 } });
    const { id: uploadId, stagingKey } = authorized.body as { id: string; stagingKey: string };
    await putMemoryPdf(storage, stagingKey);
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } })).status).toBe(200);
    await sql("update finance.uploads set expires_at = clock_timestamp() - interval '3 days' where id = $1::uuid", [uploadId]);
    let cleaned = false;
    wireServices({ storage: {
      ...storage,
      readObject: async (key, size) => {
        const bytes = Uint8Array.from(await storage.readObject(key, size));
        const result = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId } });
        cleaned = result.status === 200;
        return bytes;
      },
    } });
    const systemId = (await sql<{ id: string }>("select id from finance.systems where code = 'SYS-FR'"))[0].id;
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'"))[0].id;
    const purchase = {
      buyerName: "Buyer", supplierName: "Supplier", paymentMethod: "team_account", purchaseDate: "2026-10-01", justification: "Workshop frame supplies", documentKind: "receipt",
      lines: [{ systemId, budgetItemId: itemId, description: "Frame tube", quantity: "1", amountNok: "10.00" }], uploadIds: [uploadId],
    };
    const registered = await call({ token: "requester", body: { action: "registerPurchase", requestId: crypto.randomUUID(), purchase } });
    expect(cleaned).toBe(true);
    expect(registered.status).toBe(400);
    expect((await sql<{ status: string }>("select status from finance.uploads where id = $1::uuid", [uploadId]))[0].status).toBe("abandoned");
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.purchases"))[0].count).toBe("0");
  });

  it("records unknown final writes before I/O and safely re-sweeps a late write", async () => {
    await seedSeason();
    const authorized = await call({ token: "requester", body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 } });
    const { id: uploadId, stagingKey } = authorized.body as { id: string; stagingKey: string };
    await putMemoryPdf(storage, stagingKey);
    const uncertainStorage: FinanceObjectStorage = {
      ...storage,
      putFinalObject: async (key, bytes, type) => {
        await storage.putFinalObject(key, bytes, type);
        throw new FinanceStorageUncertainError();
      },
    };
    wireServices({ storage: uncertainStorage });
    const finalize = await call({ token: "requester", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } });
    expect(finalize.status).toBe(503);
    const candidate = (await sql<{ storage_key: string; status: string; content_sha256: string }>("select storage_key, status, content_sha256 from finance.upload_final_candidates where upload_id = $1::uuid", [uploadId]))[0];
    expect(candidate.status).toBe("pending");
    expect(storage.objects.has(candidate.storage_key)).toBe(true);
    await expect(sql("select finance.begin_final_candidate_cleanup($1::uuid, $2::uuid, $3, clock_timestamp(), interval '24 hours')", [requesterId, uploadId, candidate.storage_key])).rejects.toThrow(/not ready for cleanup/);
    expect((await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } })).status).toBe(200);
    expect(storage.objects.has(candidate.storage_key)).toBe(true);
    await sql("update finance.upload_final_candidates set created_at = clock_timestamp() - interval '2 days' where upload_id = $1::uuid", [uploadId]);
    wireServices();
    expect((await call({ token: "requester", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } })).status).toBe(403);
    wireServices({ storage: { ...storage, remove: async (key) => { await storage.remove(key); throw new FinanceStorageUncertainError(); } } });
    const uncertainDelete = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } });
    expect((uncertainDelete.body as { recovery: { uncertain: number } }).recovery.uncertain).toBe(1);
    expect((await sql<{ status: string; last_cleaned_at: string | null }>("select status, last_cleaned_at::text from finance.upload_final_candidates where storage_key = $1", [candidate.storage_key]))[0]).toEqual({ status: "cleanup", last_cleaned_at: null });
    wireServices();
    const cleaned = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } });
    expect(cleaned.status).toBe(200);
    expect((cleaned.body as { recovery: { deleted: number } }).recovery.deleted).toBe(1);
    expect(storage.objects.has(candidate.storage_key)).toBe(false);
    expect((await sql<{ status: string; last_cleaned_at: string | null }>("select status, last_cleaned_at::text from finance.upload_final_candidates where storage_key = $1", [candidate.storage_key]))[0]).toMatchObject({ status: "cleanup", last_cleaned_at: expect.any(String) });

    // A delayed provider write cannot be published after cleanup began. The
    // retained ledger allows a later sweep to delete that key again.
    storage.objects.set(candidate.storage_key, new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]));
    await expect(sql("select finance.complete_upload_finalize($1::uuid, $2::uuid, $3, $4, 8, 'application/pdf')", [requesterId, uploadId, candidate.storage_key, candidate.content_sha256])).rejects.toThrow(/no longer available/);
    await sql("update finance.upload_final_candidates set last_cleaned_at = clock_timestamp() - interval '2 days' where upload_id = $1::uuid", [uploadId]);
    const reswept = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } });
    expect(reswept.status).toBe(200);
    expect(storage.objects.has(candidate.storage_key)).toBe(false);
  });

  it("retains a published final key through targeted candidate cleanup", async () => {
    await seedSeason();
    const authorized = await call({ token: "requester", body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 } });
    const { id: uploadId, stagingKey } = authorized.body as { id: string; stagingKey: string };
    await putMemoryPdf(storage, stagingKey);
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } })).status).toBe(200);
    const candidate = (await sql<{ storage_key: string; status: string }>("select storage_key, status from finance.upload_final_candidates where upload_id = $1::uuid", [uploadId]))[0];
    expect(candidate.status).toBe("published");
    const purchaseId = await insertPurchase({ ref: "2026-0049", method: "outlay", totalOre: "1000", refund: "account" });
    await sql("update finance.documents set storage_key = $1 where purchase_id = $2::uuid", [candidate.storage_key, purchaseId]);
    await sql("update finance.uploads set purchase_id = $1::uuid where id = $2::uuid", [purchaseId, uploadId]);
    await sql("update finance.upload_final_candidates set created_at = clock_timestamp() - interval '2 days' where upload_id = $1::uuid", [uploadId]);
    expect((await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } })).status).toBe(200);
    expect(storage.objects.has(candidate.storage_key)).toBe(true);
    await expect(sql("select finance.begin_final_candidate_cleanup($1::uuid, $2::uuid, $3, clock_timestamp(), interval '24 hours')", [financeId, uploadId, candidate.storage_key])).rejects.toThrow(/saved with a purchase/);
  });

  it("cleans a lost-write candidate after a retry publishes a different key", async () => {
    await seedSeason();
    const authorized = await call({ token: "requester", body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 } });
    const { id: uploadId, stagingKey } = authorized.body as { id: string; stagingKey: string };
    await putMemoryPdf(storage, stagingKey);
    wireServices({ storage: { ...storage, putFinalObject: async (key, bytes, type) => { await storage.putFinalObject(key, bytes, type); throw new FinanceStorageUncertainError(); } } });
    const requestId = crypto.randomUUID();
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId, uploadId } })).status).toBe(503);
    wireServices();
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId, uploadId } })).status).toBe(200);
    const rows = await sql<{ storage_key: string; status: string }>("select storage_key, status from finance.upload_final_candidates where upload_id = $1::uuid", [uploadId]);
    const abandoned = rows.find((row) => row.status === "pending")?.storage_key as string;
    const published = rows.find((row) => row.status === "published")?.storage_key as string;
    expect(storage.objects.has(abandoned)).toBe(true);
    expect(storage.objects.has(published)).toBe(true);
    await sql("update finance.upload_final_candidates set created_at = clock_timestamp() - interval '2 days' where upload_id = $1::uuid", [uploadId]);
    expect((await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, candidateOnly: true } })).status).toBe(200);
    expect(storage.objects.has(abandoned)).toBe(false);
    expect(storage.objects.has(published)).toBe(true);
    expect((await sql<{ final_key: string }>("select final_key from finance.uploads where id = $1::uuid", [uploadId]))[0].final_key).toBe(published);
  });

  it("refuses cleanup after an uncertain commit until absence is reconciled, then deletes only an expired unreferenced file", async () => {
    await seedSeason();
    const version = await viewVersion();
    const authorized = await call({
      token: "requester",
      body: { action: "authorizeUpload", requestId: crypto.randomUUID(), fileName: "receipt.pdf", contentType: "application/pdf", byteSize: 8 },
    });
    expect(authorized.status).toBe(200);
    const uploadId = (authorized.body as { id: string }).id;
    const stagingKey = (authorized.body as { stagingKey: string }).stagingKey;
    await putMemoryPdf(storage, stagingKey);
    expect((await call({ token: "requester", body: { action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId } })).status).toBe(200);
    const finalKey = (await sql<{ final_key: string }>("select final_key from finance.uploads where id = $1::uuid", [uploadId]))[0]?.final_key as string;
    expect(storage.objects.has(finalKey)).toBe(true);
    await sql("update finance.uploads set expires_at = clock_timestamp() - interval '3 days' where id = $1::uuid", [uploadId]);
    const marked = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, reportUncertain: true } });
    expect(marked.status).toBe(200);
    const blocked = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId } });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error?: string }).error).toMatch(/Reconcile the unknown upload commit/i);
    expect(storage.objects.has(finalKey)).toBe(true);
    const still = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, reconciliation: "still_unknown" } });
    expect(still.status).toBe(200);
    expect(storage.objects.has(finalKey)).toBe(true);
    const absent = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId, reconciliation: "absent" } });
    expect(absent.status).toBe(200);
    const removed = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId } });
    expect(removed.status).toBe(200);
    expect((removed.body as { recovery?: { deleted: number } }).recovery?.deleted).toBe(1);
    expect(storage.objects.has(stagingKey)).toBe(false);
    expect(storage.objects.has(finalKey)).toBe(false);
    expect((await sql<{ status: string; object_removed: boolean }>("select status, object_removed from finance.uploads where id = $1::uuid", [uploadId]))[0]).toMatchObject({ status: "abandoned", object_removed: true });
    expect(await viewVersion()).toBe(version);
  });

  it("keeps a saved document and a foreign path, and treats an uncertain delete as not deleted", async () => {
    await seedSeason();
    const purchaseId = await insertPurchase({ ref: "2026-0048", method: "outlay", totalOre: "1000", refund: "account" });
    const document = (await sql<{ storage_key: string }>("select storage_key from finance.documents where purchase_id = $1::uuid", [purchaseId]))[0];
    const uploadId = crypto.randomUUID();
    await sql(
      `insert into finance.uploads (id, member_id, staging_key, final_key, status, byte_size, content_type, original_name, content_sha256, expires_at, purchase_id)
       values ($1::uuid, $2::uuid, $3, $4, 'finalized', 8, 'application/pdf', 'receipt.pdf', $5, clock_timestamp() - interval '3 days', $6::uuid)`,
      [uploadId, requesterId, `${requesterId}/staging/${uploadId}/${"a".repeat(32)}`, document?.storage_key, "b".repeat(64), purchaseId],
    );
    storage.objects.set(document?.storage_key ?? "", new Uint8Array([1]));
    const kept = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId } });
    expect(kept.status).toBe(409);
    expect(storage.objects.has(document?.storage_key ?? "")).toBe(true);
    const foreignId = crypto.randomUUID();
    const foreignKey = `${financeId}/staging/${foreignId}/${"c".repeat(32)}`;
    await sql(
      `insert into finance.uploads (id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at)
       values ($1::uuid, $2::uuid, $3, 'pending', 8, 'application/pdf', 'receipt.pdf', clock_timestamp() - interval '3 days')`,
      [foreignId, requesterId, foreignKey],
    );
    storage.objects.set(foreignKey, new Uint8Array([1]));
    const foreign = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: foreignId } });
    expect(foreign.status).toBe(409);
    expect(storage.objects.has(foreignKey)).toBe(true);
    const uncertainKey = `${requesterId}/staging/${crypto.randomUUID()}/${"d".repeat(32)}`;
    const uncertainId = crypto.randomUUID();
    await sql(
      `insert into finance.uploads (id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at)
       values ($1::uuid, $2::uuid, $3, 'pending', 8, 'application/pdf', 'receipt.pdf', clock_timestamp() - interval '3 days')`,
      [uncertainId, requesterId, uncertainKey],
    );
    storage.objects.set(uncertainKey, new Uint8Array([1]));
    const uncertainStorage: FinanceObjectStorage = {
      ...storage,
      remove: async () => { throw new FinanceStorageUncertainError(); },
    };
    services = createFinanceServices({
      db,
      financeStorage: uncertainStorage,
      financeDelivery: { send: (message) => send(message), env },
      authenticate: async (token) => identities[token] ?? Promise.reject(new Error("Log in to continue.")),
    });
    handler = createFinanceHandler(() => services);
    const uncertain = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: uncertainId } });
    expect(uncertain.status).toBe(409);
    expect(storage.objects.has(uncertainKey)).toBe(true);
    expect((await sql<{ commit_state: string }>("select commit_state from finance.uploads where id = $1::uuid", [uncertainId]))[0]?.commit_state).toBe("uncertain");
    services = createFinanceServices({
      db,
      financeStorage: storage,
      financeDelivery: { send: (message) => send(message), env },
      authenticate: async (token) => identities[token] ?? Promise.reject(new Error("Log in to continue.")),
    });
    handler = createFinanceHandler(() => services);
    expect((await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: uncertainId } })).status).toBe(409);
    expect((await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: uncertainId, reconciliation: "absent" } })).status).toBe(200);
    const deleted = await call({ token: "finance", body: { action: "cleanupUploads", requestId: crypto.randomUUID(), uploadId: uncertainId } });
    expect(deleted.status).toBe(200);
    expect(storage.objects.has(uncertainKey)).toBe(false);
  });
});

describe("FIN-10 migration contracts", () => {
  it("uses the delivery lock order and does not depend on a later migration", () => {
    const source = readFileSync(new URL("../../../db/migrations/017_finance_notifications_exports.sql", import.meta.url), "utf8");
    expect(source).not.toContain("016_");
    const save = source.slice(source.indexOf("function finance.save_recovery_mutation"), source.indexOf("function finance.replay_recovery_mutation"));
    expect(save.indexOf("pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0))")).toBeGreaterThan(-1);
    expect(save.indexOf("for update")).toBeGreaterThan(save.indexOf("pg_advisory_xact_lock"));
    const claim = source.slice(source.indexOf("function finance.claim_outbox_deliveries"), source.indexOf("function finance.record_delivery_result"));
    expect(claim).toContain("for update skip locked");
    const record = source.slice(source.indexOf("function finance.record_delivery_result"), source.indexOf("function finance.reconcile_outbox_delivery"));
    const outboxLock = record.indexOf("from finance.outbox where id = target_outbox for update");
    const attemptLock = record.indexOf("from finance.outbox_attempts", outboxLock);
    expect(outboxLock).toBeGreaterThan(-1);
    expect(attemptLock).toBeGreaterThan(outboxLock);
    expect(record.slice(attemptLock, attemptLock + 160)).toContain("for update");
    expect(source).not.toContain("for update of b");
    expect(source).not.toContain("finance.systems");
    expect(source).not.toContain("bump_view_version");
    const mail = readFileSync(new URL("../../../api/_lib/finance-mail.ts", import.meta.url), "utf8");
    const exported = readFileSync(new URL("../../../api/_lib/finance-export.ts", import.meta.url), "utf8");
    expect(mail).not.toMatch(/^import .*resend/m);
    expect(mail).not.toContain("refund_account");
    expect(exported).not.toContain("refund_account");
    expect(exported).toContain("at time zone 'Europe/Oslo'");
  });

  it("rejects a reused recovery request id at the SQL boundary", async () => {
    await seedSeason();
    const requestId = crypto.randomUUID();
    const response = JSON.stringify({ ok: true, viewVersion: 1, warnings: [], errors: [], recovery: { sent: 0, failed: 0, uncertain: 0, skipped: 1, deleted: 0, message: "No finance notifications were waiting." } });
    await sql(
      "select finance.save_recovery_mutation($1::uuid, $2::uuid, 'retryOutbox', $3, 'purchaseRegister', $4::jsonb)",
      [financeId, requestId, "a".repeat(64), response],
    );
    await expect(sql(
      "select finance.save_recovery_mutation($1::uuid, $2::uuid, 'retryOutbox', $3, 'purchaseRegister', $4::jsonb)",
      [financeId, requestId, "b".repeat(64), response],
    )).rejects.toThrow(/already used for a different change/i);
    await expect(sql(
      "select finance.save_recovery_mutation($1::uuid, $2::uuid, 'retryOutbox', $3, 'purchaseRegister', $4::jsonb)",
      [requesterId, crypto.randomUUID(), "c".repeat(64), response],
    )).rejects.toThrow(/Finance access is required/i);
  });
});
