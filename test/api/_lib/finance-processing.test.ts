import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { thirdOsloDayFrom } from "../../../src/features/Finance/request-domain.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import type { FinancePurchaseSummary, PurchasesView } from "../../../src/features/Finance/types.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const businessId = "44444444-4444-4444-8444-444444444444";
const financeId = "55555555-5555-4555-8555-555555555555";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  head: { userId: headId, googleSub: "head-sub", email: "head@example.test", name: "Head Example" },
  business: { userId: businessId, googleSub: "business-sub", email: "business@example.test", name: "Business Example" },
  finance: { userId: financeId, googleSub: "finance-sub", email: "finance@example.test", name: "Finance Example" },
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
  return wrapped.result() as {
    status: number;
    body: {
      error?: string;
      id?: string;
      ok?: boolean;
      viewVersion?: number;
      decision?: { reviewer: string; time: string; reason: string };
    };
  };
}

async function read(token: string, query: Record<string, string> = {}) {
  const wrapped = response();
  await handler({
    method: "GET",
    query: { action: "purchases", ...query },
    headers: { authorization: `Bearer ${token}` },
  } as unknown as VercelRequest, wrapped.res);
  return wrapped.result() as { status: number; body: PurchasesView };
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
  await sql("insert into finance.systems (department_key, code, name, active) values ('mechanical-production', 'SYS-FR', 'Frame', true)");
  await grant(headId, "head_of_finance");
  await grant(financeId, "finance");
  await grant(businessId, "business");
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
  await sql("select finance.configure_approval_threshold($1::uuid, 500000)", [operatorId]);
}

async function authorizeUpload(name = "receipt.pdf") {
  const auth = await call("member", {
    action: "authorizeUpload",
    requestId: requestId(),
    fileName: name,
    contentType: "application/pdf",
    byteSize: 8,
  });
  const { putMemoryPdf } = await import("./finance-storage-mock.js");
  await putMemoryPdf(financeStorage, (auth.body as { stagingKey?: string }).stagingKey ?? "");
  const uploadId = (auth.body as { id?: string }).id ?? "";
  await call("member", { action: "finalizeUpload", requestId: requestId(), uploadId });
  return uploadId;
}

async function registerPurchase(extra: Record<string, unknown> = {}, amountNok = "100.00") {
  const uploadId = await authorizeUpload(typeof extra.fileName === "string" ? extra.fileName : "evidence.pdf");
  const second = extra.secondFile === true ? [await authorizeUpload("evidence-2.pdf")] : [];
  const purchase = {
    buyerName: "Member Example",
    supplierName: "Hidden Supplier",
    paymentMethod: "team_account",
    purchaseDate: "2026-10-01",
    justification: "Workshop material for frame",
    documentKind: "receipt",
    documentNumber: "",
    lines: [{ systemId, budgetItemId: itemId, description: "Linked line", quantity: "1", amountNok }],
    uploadIds: [uploadId, ...second],
    ...extra,
    fileName: undefined,
    secondFile: undefined,
  };
  return call("member", { action: "registerPurchase", requestId: requestId(), purchase });
}

function registerOf(view: PurchasesView): FinancePurchaseSummary[] {
  return view.register ?? [];
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
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example'),
      ('${headId}', 'head-sub', 'head@example.test', 'Head Example'),
      ('${businessId}', 'business-sub', 'business@example.test', 'Business Example'),
      ('${financeId}', 'finance-sub', 'finance@example.test', 'Finance Example');
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
    "018_finance_unpaid_voids_reviews.sql",
    "020_finance_processing_guards.sql",
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

describe("FIN-08 purchase register, settlement, void, and review", () => {
  it("hides the register and evidence from members, business, and administrators without the finance grant", async () => {
    await seasonWithBudget();
    const saved = await registerPurchase({
      paymentMethod: "outlay",
      refundAccount: "10000000001",
      fileName: "evidence.pdf",
    });
    expect(saved.status).toBe(200);
    for (const token of ["member", "business", "operator"] as const) {
      const view = await read(token);
      expect(view.body.register).toBeUndefined();
      expect(view.body.unpaidCount).toBeUndefined();
      const encoded = JSON.stringify(view.body);
      expect(encoded).not.toContain("Hidden Supplier");
      expect(encoded).not.toContain("10000000001");
      expect(encoded).not.toContain("evidence.pdf");
      const flags = await sql<{ purchase_register: boolean }>(
        "select (finance.capability_flags($1::uuid) ->> 'purchaseRegister')::boolean as purchase_register",
        [identities[token].userId],
      );
      expect(flags[0]?.purchase_register).toBe(false);
    }
    await expect(sql(
      "select finance.void_registered_purchase($1::uuid, $2::uuid, $3, $4::uuid, $5)",
      [memberId, requestId(), "b".repeat(64), saved.body.id, "Not allowed"],
    )).rejects.toThrow(/Finance access is required/);
    const financeView = await read("finance");
    const headView = await read("head");
    for (const view of [financeView, headView]) {
      const row = registerOf(view.body)[0];
      expect(row?.supplierName).toBe("Hidden Supplier");
      expect(row?.buyerName).toBe("Member Example");
      expect(row?.requesterName).toBe("Member Example");
      expect(row?.justification).toContain("Workshop material");
      expect(row?.lines.length).toBeGreaterThan(0);
      expect(row?.lines[0]?.itemName).toBe("Carbon tube stock");
      expect(row?.documents[0]?.originalName).toBe("evidence.pdf");
      expect(row?.refundAccount).toBe("10000000001");
      expect(row?.status).toBe("registered");
    }
    const unpaidAsk = await read("member", { unpaid: "1" });
    expect(unpaidAsk.body.register).toBeUndefined();
  });

  it("shares one invoice state across files, keeps outlay separate, and excludes voided purchases from unpaid", async () => {
    await seasonWithBudget();
    const dual = await registerPurchase({
      paymentMethod: "outlay",
      documentKind: "invoice",
      documentNumber: "INV-1001",
      invoiceDueDate: "2026-11-15",
      refundAccount: "10000000001",
      secondFile: true,
      fileName: "evidence.pdf",
    }, "250.00");
    expect(dual.status).toBe(200);
    const purchaseId = dual.body.id ?? "";
    const obligations = await sql<{ invoices: string; outlays: string; docs: string; numbers: string }>(
      `select
         (select count(*) from finance.invoice_obligations where purchase_id = $1::uuid)::text as invoices,
         (select count(*) from finance.outlay_reimbursements where purchase_id = $1::uuid)::text as outlays,
         (select count(*) from finance.documents where purchase_id = $1::uuid)::text as docs,
         (select count(distinct document_number) from finance.documents where purchase_id = $1::uuid)::text as numbers`,
      [purchaseId],
    );
    expect(obligations[0]).toEqual({ invoices: "1", outlays: "1", docs: "2", numbers: "1" });
    const listed = registerOf((await read("finance")).body)[0];
    expect(listed?.invoice?.dueDate).toBe("2026-11-15");
    expect(listed?.invoice?.paid).toBe(false);
    expect(listed?.reimbursement?.paid).toBe(false);
    expect(listed?.unpaid).toBe(true);
    expect(listed?.documents.map((doc) => doc.documentNumber)).toEqual(["INV-1001", "INV-1001"]);
    expect((await read("finance")).body.unpaidCount).toBe(1);

    const markedInvoice = await call("finance", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 0,
    });
    expect(markedInvoice.status).toBe(200);
    const afterInvoice = registerOf((await read("finance")).body)[0];
    expect(afterInvoice?.invoice?.paid).toBe(true);
    expect(afterInvoice?.invoice?.paidOn).toBe("2026-10-01");
    expect(afterInvoice?.reimbursement?.paid).toBe(false);
    expect(afterInvoice?.unpaid).toBe(true);
    expect(afterInvoice?.documents).toHaveLength(2);

    const markedOutlay = await call("finance", {
      action: "markRefundPaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-02",
      expectedRevision: 1,
    });
    expect(markedOutlay.status).toBe(200);
    const settled = registerOf((await read("finance")).body)[0];
    expect(settled?.unpaid).toBe(false);
    expect((await read("finance", { unpaid: "1" })).body.register).toEqual([]);

    const receipt = await registerPurchase();
    expect(registerOf((await read("finance")).body).find((row) => row.id === receipt.body.id)?.unpaid).toBe(false);
    const voided = await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId,
      reason: "Entered against the wrong supplier",
      expectedRevision: 2,
    });
    expect(voided.status).toBe(200);
    const kept = await sql<{ invoices: string; unpaid: boolean; status: string; ref: string }>(
      `select
         (select count(*) from finance.invoice_obligations where purchase_id = $1::uuid)::text as invoices,
         finance.purchase_has_unsettled_obligation($1::uuid) as unpaid,
         status,
         public_ref as ref
       from finance.purchases where id = $1::uuid`,
      [purchaseId],
    );
    expect(kept[0]?.invoices).toBe("1");
    expect(kept[0]?.unpaid).toBe(false);
    expect(kept[0]?.status).toBe("voided");
    const full = registerOf((await read("head")).body);
    expect(full.some((row) => row.id === purchaseId && row.status === "voided" && row.publicRef === kept[0]?.ref)).toBe(true);
    expect(registerOf((await read("head", { unpaid: "1" })).body).some((row) => row.id === purchaseId)).toBe(false);
    const documentId = full.find((row) => row.id === purchaseId)?.documents[0]?.id;
    expect((await call("finance", { action: "downloadDocument", requestId: requestId(), documentId })).status).toBe(200);
    expect((await call("member", { action: "downloadDocument", requestId: requestId(), documentId })).status).toBe(403);
  });

  it("marks and undoes payment without changing actual or commitment, and rejects repeated, wrong, voided, and unauthorized calls", async () => {
    await seasonWithBudget();
    const saved = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "10000.00" }],
      },
    });
    const recordId = saved.body.id ?? "";
    await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      expectedRevision: 0,
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "10000.00" }],
      },
    });
    const revisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [recordId]))[0]?.id;
    const lineId = (await sql<{ id: string }>("select id from finance.request_lines where revision_id = $1::uuid", [revisionId]))[0]?.id ?? "";
    await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: recordId,
      revisionId,
      decision: "approved",
      reason: "Approved for test",
      approvedOreByLine: { [lineId]: "1000000" },
    });
    const uploadId = await authorizeUpload();
    const registered = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Hidden Supplier",
        paymentMethod: "invoice",
        purchaseDate: "2026-10-01",
        justification: "Workshop material for frame",
        documentKind: "invoice",
        documentNumber: "INV-1001",
        invoiceDueDate: "2026-11-01",
        requestRecordId: recordId,
        lines: [{ systemId, budgetItemId: itemId, requestLineId: lineId, description: "Linked line", quantity: "1", amountNok: "4000.00" }],
        uploadIds: [uploadId],
      },
    });
    expect(registered.status).toBe(200);
    const purchaseId = registered.body.id ?? "";
    const before = await sql<{ actual: string; commitment: string }>(
      `select finance.item_registered_actual_ore($1::uuid)::text as actual,
              finance.budget_item_open_commitment_ore($1::uuid)::text as commitment`,
      [itemId],
    );
    const beforeVersion = await version();
    const marked = await call("head", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 0,
    });
    expect(marked.status).toBe(200);
    expect(Number(await version())).toBeGreaterThan(Number(beforeVersion));
    const after = await sql<{ actual: string; commitment: string }>(
      `select finance.item_registered_actual_ore($1::uuid)::text as actual,
              finance.budget_item_open_commitment_ore($1::uuid)::text as commitment`,
      [itemId],
    );
    expect(after[0]).toEqual(before[0]);
    const audit = await sql<{ field_name: string; new_value: string | null }>(
      "select field_name, new_value from finance.audit_log where entity_id = $1 and field_name like 'invoice_paid%' order by field_name",
      [purchaseId],
    );
    expect(audit.map((row) => row.field_name)).toEqual(["invoice_paid", "invoice_paid_on"]);

    const replayVersion = await version();
    const replay = await call("head", {
      action: "markInvoicePaid",
      requestId: (await sql<{ request_id: string }>(
        "select request_id from finance.idempotency_keys where action = 'markInvoicePaid'",
      ))[0]?.request_id ?? "",
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 99,
    });
    expect(replay.status).toBe(200);
    expect(await version()).toBe(replayVersion);

    const mismatch = await call("head", {
      action: "markInvoicePaid",
      requestId: (await sql<{ request_id: string }>("select request_id from finance.idempotency_keys where action = 'markInvoicePaid'"))[0]?.request_id ?? "",
      purchaseId,
      paidOn: "not-a-date",
      expectedRevision: 0,
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("This request ID was already used for a different change.");
    expect(await version()).toBe(replayVersion);

    const repeated = await call("head", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 1,
    });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toBe("This invoice is already marked paid.");
    expect(await version()).toBe(replayVersion);

    const undone = await call("finance", {
      action: "unmarkInvoicePaid",
      requestId: requestId(),
      purchaseId,
      expectedRevision: 1,
    });
    expect(undone.status).toBe(200);
    expect(registerOf((await read("finance")).body).find((row) => row.id === purchaseId)?.invoice?.paid).toBe(false);

    const team = await registerPurchase();
    const wrong = await call("finance", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId: team.body.id,
      paidOn: "2026-10-01",
      expectedRevision: 0,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("This purchase has no invoice obligation.");
    const wrongOutlay = await call("finance", {
      action: "markRefundPaid",
      requestId: requestId(),
      purchaseId: team.body.id,
      paidOn: "2026-10-01",
      expectedRevision: 0,
    });
    expect(wrongOutlay.status).toBe(400);
    expect(wrongOutlay.body.error).toBe("This purchase has no outlay reimbursement.");

    const stable = await version();
    const denied = await call("business", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 2,
    });
    expect(denied.status).toBe(403);
    expect(await version()).toBe(stable);

    await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId,
      reason: "Duplicate registration",
      expectedRevision: 2,
    });
    const voidedParent = await call("head", {
      action: "markInvoicePaid",
      requestId: requestId(),
      purchaseId,
      paidOn: "2026-10-01",
      expectedRevision: 3,
    });
    expect(voidedParent.status).toBe(409);
    expect(voidedParent.body.error).toBe("Only a registered purchase can be updated.");
  });

  it("voids with a reason, keeps facts, drops actual and unpaid use, and restores open commitment only while the request stays open", async () => {
    await seasonWithBudget();
    const openSaved = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "5000.00" }],
      },
    });
    const openId = openSaved.body.id ?? "";
    await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: openId,
      expectedRevision: 0,
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "5000.00" }],
      },
    });
    const openRevisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [openId]))[0]?.id;
    const openLine = (await sql<{ id: string }>("select id from finance.request_lines where revision_id = $1::uuid", [openRevisionId]))[0]?.id ?? "";
    await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: openId,
      revisionId: openRevisionId,
      decision: "approved",
      reason: "Approved for test",
      approvedOreByLine: { [openLine]: "500000" },
    });
    const uploadId = await authorizeUpload();
    const linked = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Hidden Supplier",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-01",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        requestRecordId: openId,
        lines: [{ systemId, budgetItemId: itemId, requestLineId: openLine, description: "Linked line", quantity: "1", amountNok: "2000.00" }],
        uploadIds: [uploadId],
      },
    });
    const purchaseId = linked.body.id ?? "";
    const refBefore = (await sql<{ public_ref: string; docs: string }>(
      `select p.public_ref, (select count(*) from finance.documents d where d.purchase_id = p.id)::text as docs
       from finance.purchases p where p.id = $1::uuid`,
      [purchaseId],
    ))[0];
    expect((await sql<{ commitment: string }>("select finance.budget_item_open_commitment_ore($1::uuid)::text as commitment", [itemId]))[0]?.commitment).toBe("300000");
    const missingReason = await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId,
      reason: "no",
      expectedRevision: 0,
    });
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.error).toBe("Enter a void reason.");
    const versionBefore = await version();
    const voided = await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId,
      reason: "Wrong supplier on the receipt",
      expectedRevision: 0,
    });
    expect(voided.status).toBe(200);
    expect(Number(await version())).toBeGreaterThan(Number(versionBefore));
    const after = await sql<{ status: string; public_ref: string; docs: string; actual: string; commitment: string; eligible: string }>(
      `select p.status, p.public_ref,
              (select count(*) from finance.documents d where d.purchase_id = p.id)::text as docs,
              finance.item_registered_actual_ore($2::uuid)::text as actual,
              finance.budget_item_open_commitment_ore($2::uuid)::text as commitment,
              coalesce((
                select sum(a.amount_ore) from finance.allocations a
                join finance.purchase_lines pl on pl.id = a.line_id
                join finance.purchases pur on pur.id = pl.purchase_id
                where a.budget_item_id = $2::uuid and pur.status = 'registered' and pur.purchase_date <= '2027-07-31'
              ), 0)::text as eligible
       from finance.purchases p where p.id = $1::uuid`,
      [purchaseId, itemId],
    );
    expect(after[0]?.status).toBe("voided");
    expect(after[0]?.public_ref).toBe(refBefore?.public_ref);
    expect(after[0]?.docs).toBe(refBefore?.docs);
    expect(after[0]?.actual).toBe("0");
    expect(after[0]?.commitment).toBe("500000");
    expect(after[0]?.eligible).toBe("0");
    const again = await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId,
      reason: "Wrong supplier on the receipt",
      expectedRevision: 1,
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("Only a registered purchase can be voided.");

    const closedSaved = await call("member", {
      action: "saveRequest",
      requestId: requestId(),
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "10000.00" }],
      },
    });
    const closedId = closedSaved.body.id ?? "";
    await call("member", {
      action: "submitRequest",
      requestId: requestId(),
      requestRecordId: closedId,
      expectedRevision: 0,
      request: {
        supplierName: "Nordic Parts AS",
        justification: "Need material for frame assembly",
        plannedDate: thirdOsloDayFrom(osloToday()),
        lines: [{ budgetItemId: itemId, description: "Tube set", estimatedNok: "10000.00" }],
      },
    });
    const closedRevisionId = (await sql<{ id: string }>("select submitted_revision_id as id from finance.requests where id = $1::uuid", [closedId]))[0]?.id;
    const closedLine = (await sql<{ id: string }>("select id from finance.request_lines where revision_id = $1::uuid", [closedRevisionId]))[0]?.id ?? "";
    await call("head", {
      action: "decideRequest",
      requestId: requestId(),
      requestRecordId: closedId,
      revisionId: closedRevisionId,
      decision: "approved",
      reason: "Approved for test",
      approvedOreByLine: { [closedLine]: "1000000" },
    });
    const closedUpload = await authorizeUpload("closed.pdf");
    const closedPurchase = await call("member", {
      action: "registerPurchase",
      requestId: requestId(),
      purchase: {
        buyerName: "Member Example",
        supplierName: "Hidden Supplier",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-01",
        justification: "Workshop material for frame",
        documentKind: "receipt",
        requestRecordId: closedId,
        lines: [{ systemId, budgetItemId: itemId, requestLineId: closedLine, description: "Linked line", quantity: "1", amountNok: "4000.00" }],
        uploadIds: [closedUpload],
      },
    });
    const requestRevision = Number((await sql<{ revision: number }>("select revision from finance.requests where id = $1::uuid", [closedId]))[0]?.revision ?? 0);
    await call("member", {
      action: "closeRequest",
      requestId: requestId(),
      requestRecordId: closedId,
      expectedRevision: requestRevision,
      reason: "Work finished",
      releasedNok: "6000.00",
    });
    await call("head", {
      action: "voidPurchase",
      requestId: requestId(),
      purchaseId: closedPurchase.body.id,
      reason: "Closed request cleanup",
      expectedRevision: 0,
    });
    expect((await sql<{ commitment: string }>("select finance.request_remaining_ore($1::uuid)::text as commitment", [closedId]))[0]?.commitment).toBe("0");
    const names = await sql<{ proname: string }>(
      `select p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'finance' and p.proname ~* 'unvoid|delete_purchase'`,
    );
    expect(names).toEqual([]);
  });

  it("locks the linked request before budget items and the current budget when voiding", async () => {
    const sources = await sql<{ proname: string; prosrc: string }>(
      `select p.proname, p.prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'finance'
         and p.proname in ('void_registered_purchase', 'apply_purchase_settlement', 'review_purchase_exception')`,
    );
    const voidSrc = sources.find((row) => row.proname === "void_registered_purchase")?.prosrc.toLowerCase() ?? "";
    const requestLock = voidSrc.indexOf("from finance.requests where id = linked_request_id for update");
    const share = voidSrc.indexOf("for share of i");
    const budget = voidSrc.indexOf("perform finance.lock_current_budget()");
    const purchaseLock = voidSrc.indexOf("from finance.purchases where id = p_purchase_id for update");
    expect(requestLock).toBeGreaterThan(-1);
    expect(voidSrc.indexOf("for update")).toBe(requestLock + "from finance.requests where id = linked_request_id ".length);
    expect(share).toBeGreaterThan(requestLock);
    expect(budget).toBeGreaterThan(share);
    expect(purchaseLock).toBeGreaterThan(budget);
    expect(voidSrc.indexOf("begin_purchase_mutation")).toBeGreaterThan(voidSrc.indexOf("pg_advisory_xact_lock"));

    const settlement = sources.find((row) => row.proname === "apply_purchase_settlement")?.prosrc.toLowerCase() ?? "";
    const settlementPurchase = settlement.indexOf("from finance.purchases where id = p_purchase_id for update");
    expect(settlement.indexOf("for update")).toBe(settlementPurchase + "from finance.purchases where id = p_purchase_id ".length);
    expect(settlement.indexOf("from finance.invoice_obligations where purchase_id = p_purchase_id for update")).toBeGreaterThan(settlementPurchase);
    expect(settlement.indexOf("from finance.outlay_reimbursements where purchase_id = p_purchase_id for update")).toBeGreaterThan(settlementPurchase);
    expect(settlement).not.toContain("lock_current_budget");
    expect(settlement).not.toContain("from finance.requests");

    const review = sources.find((row) => row.proname === "review_purchase_exception")?.prosrc.toLowerCase() ?? "";
    expect(review.indexOf("from finance.purchases where id = purchase_id for update")).toBeLessThan(review.indexOf("from finance.exception_reviews where id = p_review_id for update"));
    expect(review).toContain("from finance.exception_reviews where id = p_review_id for update");
    expect(review).not.toContain("update finance.purchases");
    expect(review).not.toContain("lock_current_budget");
    expect(review).not.toContain("invoice_obligations");
  });

  it("records a review without changing exception facts, approval, or payment", async () => {
    await seasonWithBudget();
    const saved = await registerPurchase({
      paymentMethod: "invoice",
      documentKind: "invoice",
      documentNumber: "INV-1001",
      invoiceDueDate: "2026-11-01",
    }, "6000.00");
    expect(saved.status).toBe(200);
    const purchaseId = saved.body.id ?? "";
    const review = (await sql<{ id: string; facts: { totalOre?: string }; kind: string }>(
      "select id, facts, kind from finance.exception_reviews where purchase_id = $1::uuid",
      [purchaseId],
    ))[0];
    expect(review?.kind).toBe("missing_approval");
    const facts = JSON.stringify(review?.facts);
    const versionBefore = await version();
    const recorded = await call("finance", {
      action: "reviewException",
      requestId: requestId(),
      reviewId: review?.id,
      reason: "Accepted as a dated exception",
      expectedRevision: 1,
    });
    expect(recorded.status).toBe(200);
    expect(Number(await version())).toBeGreaterThan(Number(versionBefore));
    const stored = (await sql<{ facts: unknown; review_status: string; reason: string; actor_member_id: string; reviewed_at: string | null; paid: boolean }>(
      `select e.facts, e.review_status, e.reason, e.actor_member_id, e.reviewed_at::text as reviewed_at, i.paid
       from finance.exception_reviews e
       join finance.invoice_obligations i on i.purchase_id = e.purchase_id
       where e.id = $1::uuid`,
      [review?.id],
    ))[0];
    expect(JSON.stringify(stored?.facts)).toBe(facts);
    expect(stored?.review_status).toBe("reviewed");
    expect(stored?.reason).toBe("Accepted as a dated exception");
    expect(stored?.actor_member_id).toBe(financeId);
    expect(stored?.reviewed_at).toBeTruthy();
    expect(stored?.paid).toBe(false);
    const decisions = await sql<{ count: string }>("select count(*)::text as count from finance.request_decisions");
    expect(decisions[0]?.count).toBe("0");
    const repeatVersion = await version();
    const repeat = await call("finance", {
      action: "reviewException",
      requestId: requestId(),
      reviewId: review?.id,
      reason: "Accepted as a dated exception",
      expectedRevision: 4,
    });
    expect(repeat.status).toBe(409);
    expect(repeat.body.error).toBe("This exception is already reviewed.");
    expect(await version()).toBe(repeatVersion);
    const same = await call("finance", {
      action: "reviewException",
      requestId: (await sql<{ request_id: string }>("select request_id from finance.idempotency_keys where action = 'reviewException'"))[0]?.request_id ?? "",
      reviewId: review?.id,
      reason: "Accepted as a dated exception",
      expectedRevision: 0,
    });
    expect(same.status).toBe(200);
    expect(await version()).toBe(repeatVersion);
  });

  it("rejects review after void while retaining the original exception and evidence", async () => {
    await seasonWithBudget();
    const saved = await registerPurchase({}, "6000.00");
    const purchaseId = saved.body.id ?? "";
    const reviewId = (await sql<{ id: string }>("select id from finance.exception_reviews where purchase_id = $1::uuid", [purchaseId]))[0]?.id;
    expect((await call("finance", { action: "voidPurchase", requestId: requestId(), purchaseId, reason: "Wrong item", expectedRevision: 0 })).status).toBe(200);
    const before = await version();
    const result = await call("finance", { action: "reviewException", requestId: requestId(), reviewId, reason: "Reviewed after void" });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("A voided purchase cannot be reviewed.");
    expect(await version()).toBe(before);
    expect((await sql<{ review_status: string }>("select review_status from finance.exception_reviews where id = $1::uuid", [reviewId]))[0]?.review_status).toBe("open");
  });

  it("requires a due date for invoice payment even with receipt evidence", async () => {
    await seasonWithBudget();
    const invalid = await registerPurchase({ paymentMethod: "invoice", documentKind: "receipt" });
    expect(invalid.status).toBe(400);
    const valid = await registerPurchase({ paymentMethod: "invoice", documentKind: "receipt", invoiceDueDate: "2026-11-15" });
    expect(valid.status).toBe(200);
    expect((await sql<{ due_date: string }>("select due_date::text as due_date from finance.invoice_obligations where purchase_id = $1::uuid", [valid.body.id]))[0]?.due_date).toBe("2026-11-15");
    const receipt = await registerPurchase();
    await expect(sql("insert into finance.invoice_obligations (purchase_id, due_date) values ($1::uuid, null)", [receipt.body.id])).rejects.toThrow(/Enter an invoice due date/);
  });

  async function reviewedException() {
    await seasonWithBudget();
    const saved = await registerPurchase({
      paymentMethod: "invoice",
      documentKind: "invoice",
      documentNumber: "INV-1001",
      invoiceDueDate: "2026-11-01",
    }, "6000.00");
    const reviewId = (await sql<{ id: string }>(
      "select id from finance.exception_reviews where purchase_id = $1::uuid",
      [saved.body.id],
    ))[0]?.id ?? "";
    const request = requestId();
    const recorded = await call("finance", {
      action: "reviewException",
      requestId: request,
      reviewId,
      reason: "Accepted as a dated exception",
      expectedRevision: 0,
    });
    expect(recorded.status).toBe(200);
    return { reviewId, request, recorded };
  }

  async function reviewRows(reviewId: string) {
    const [rows] = await sql<{ reviews: string; audits: string; keys: string }>(
      `select
         (select count(*) from finance.exception_reviews where id = $1::uuid)::text as reviews,
         (select count(*) from finance.audit_log where entity = 'exception_review' and entity_id = $1::text)::text as audits,
         (select count(*) from finance.idempotency_keys where action = 'reviewException')::text as keys`,
      [reviewId],
    );
    return rows;
  }

  it("replays a review with the same request id and payload without a second row or version bump", async () => {
    const { reviewId, request, recorded } = await reviewedException();
    const before = await reviewRows(reviewId);
    const versionBefore = await version();
    const replay = await call("finance", {
      action: "reviewException",
      requestId: request,
      reviewId,
      reason: "Accepted as a dated exception",
      expectedRevision: 9,
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, viewVersion: recorded.body.viewVersion, id: recorded.body.id });
    expect(await version()).toBe(versionBefore);
    expect(await reviewRows(reviewId)).toEqual(before);
  });

  it("returns the recorded review decision when a different request id reviews it again", async () => {
    const { reviewId } = await reviewedException();
    const before = await reviewRows(reviewId);
    const versionBefore = await version();
    const stored = (await sql<{ reviewer: string; time: string; reason: string }>(
      `select actor_member_id::text as reviewer,
              (jsonb_build_object('time', reviewed_at) ->> 'time') as time,
              reason
       from finance.exception_reviews where id = $1::uuid`,
      [reviewId],
    ))[0];
    const again = await call("finance", {
      action: "reviewException",
      requestId: requestId(),
      reviewId,
      reason: "Trying to review the same exception again",
      expectedRevision: 3,
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("This exception is already reviewed.");
    expect(again.body.decision).toEqual(stored);
    expect(await version()).toBe(versionBefore);
    expect(await reviewRows(reviewId)).toEqual(before);
  });

  it("rejects a reused review request id when the payload differs", async () => {
    const { reviewId, request } = await reviewedException();
    const before = await reviewRows(reviewId);
    const versionBefore = await version();
    const mismatch = await call("finance", {
      action: "reviewException",
      requestId: request,
      reviewId,
      reason: "A different review reason",
      expectedRevision: 0,
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("This request ID was already used for a different change.");
    expect(mismatch.body.decision).toBeUndefined();
    expect(await version()).toBe(versionBefore);
    expect(await reviewRows(reviewId)).toEqual(before);
  });
});
