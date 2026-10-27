import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { BudgetImportPreview, FinanceMutationResult } from "../../../api/_lib/finance-types.js";
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
  await pg.exec(readFileSync(new URL("../../../db/migrations/016_finance_fulfillment.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/018_finance_unpaid_voids_reviews.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/019_finance_budget_import.sql", import.meta.url), "utf8"));
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


describe("department budget import", () => {
  const csv = "system_id;description;planned_nok;note\nSYS-FR;Frame;1000;first";
  async function prepare(input = csv, token = "head") {
    const r = await call(token, { action: "previewImport", requestId: requestId(), departmentKey: "mechanical-production", csv: input });
    expect(r.status).toBe(200);
    return (r.body as FinanceMutationResult).importPreview as BudgetImportPreview;
  }
  async function apply(input: string, preview: BudgetImportPreview, token = "head", reason = "", request = requestId()) {
    return call(token, { action: "importItems", requestId: request, departmentKey: "mechanical-production", csv: input, expectedRevision: preview.viewVersion, previewToken: preview.previewToken, reason });
  }
  beforeEach(async () => {
    await season(); await grant(headId, "head_of_finance"); await grant(financeId, "finance");
    expect((await call("head", { action: "createBudget", requestId: requestId() })).status).toBe(200);
  });
  it("previews without writes and reimports with stable IDs, optional fields and cancellation", async () => {
    const before = await version(); const first = await prepare();
    expect(first.errors).toEqual([]); expect(first.counts.added).toBe(1); expect(first.totalNok).toBe("1000.00"); expect(await version()).toBe(before);
    expect((await apply(csv, first)).status).toBe(200);
    const initial = await sql<{ id: string; note: string }>("select id,note from finance.budget_items where not protected");
    const secondCsv = "system_id;description;planned_nok\nSYS-FR; FRAME ;2000\nSYS-FR;Brake;10";
    const second = await prepare(secondCsv); expect(second.counts).toEqual({ added: 1, changed: 1, unchanged: 0, removed: 0 });
    expect((await apply(secondCsv, second)).status).toBe(200);
    const updated = await sql<{ id: string; note: string; planned_ore: string }>("select id,note,planned_ore::text from finance.budget_items where lower(description) = 'frame'");
    expect(updated[0]).toMatchObject({ id: initial[0].id, note: "first", planned_ore: "200000" });
    const third = await prepare(secondCsv); expect(third.counts.unchanged).toBe(2);
    const v = await version(); expect((await apply(secondCsv, third)).status).toBe(200); expect(await version()).toBe(v);
    const fourth = await prepare(csv); expect(fourth.counts.removed).toBe(1); expect((await apply(csv, fourth)).status).toBe(200);
    expect((await sql<{status:string}>("select status from finance.budget_items where description='Brake'"))[0].status).toBe("cancelled");
  });
  it("rejects foreign systems, invalid CSV, stale or changed previews without writes", async () => {
    const before = await version();
    const invalid = await prepare("system_id;description;planned_nok\nSYS-TR;Travel;10\nSYS-FR;A;not-money");
    expect(invalid.errors.length).toBeGreaterThan(0); expect((await apply("system_id;description;planned_nok\nSYS-TR;Travel;10\nSYS-FR;A;not-money", invalid)).status).toBe(400);
    const valid = await prepare(); expect((await apply(csv + " ", valid)).status).toBe(409);
    await call("head", { action: "addItem", requestId: requestId(), expectedRevision: 0, item: { systemId: (await sql<{id:string}>("select id from finance.systems where code='SYS-FR'"))[0].id, description: "Other", plannedNok: "1" } });
    expect((await apply(csv, valid)).status).toBe(409);
    expect(Number(await version())).toBe(Number(before) + 1);
  });
  it("enforces protected approved changes and permits a finance note-only import", async () => {
    const initial = await prepare(); expect((await apply(csv, initial)).status).toBe(200);
    expect((await call("head", { action: "approveBudget", requestId: requestId(), expectedRevision: 0 })).status).toBe(200);
    const noteCsv = "system_id;description;planned_nok;note\nSYS-FR;Frame;1000;new note";
    const notePreview = await prepare(noteCsv, "finance"); expect((await apply(noteCsv, notePreview, "finance")).status).toBe(200);
    const protectedCsv = "system_id;description;planned_nok\nSYS-FR;Frame;2000";
    const protectedPreview = await prepare(protectedCsv, "finance");
    expect((await apply(protectedCsv, protectedPreview, "finance", "Update" )).status).toBe(403);
    const headPreview = await prepare(protectedCsv); expect((await apply(protectedCsv, headPreview)).status).toBe(400);
    expect((await apply(protectedCsv, headPreview, "head", "Update" )).status).toBe(200);
  });
  it("rolls back every prior row and audit if any later operation fails", async () => {
    const before = await version();
    const budget = (await sql<{id:string}>("select id from finance.budgets"))[0].id;
    const system = (await sql<{id:string}>("select id from finance.systems where code='SYS-FR'"))[0].id;
    const desired = { systemId: system, description: "Good", category: "other", plannedOre: "100", priority: "P2", reuseStatus: "new", expectedPurchaseDate: null, note: null, earmarkId: null, status: "planned" };
    const operations = [{ kind: "add", desired }, { kind: "add", desired: { ...desired, description: "Bad", plannedOre: "-1" } }];
    const priorAudit = await sql<{n:string}>("select count(*)::text as n from finance.audit_log");
    await expect(sql("select finance.apply_budget_import($1::uuid,$2::uuid,$3,$4::bigint,$5::uuid,$6,$7::jsonb,$8)", [headId, requestId(), "a".repeat(64), before, budget, "mechanical-production", JSON.stringify(operations), ""])).rejects.toThrow();
    expect((await sql<{n:string}>("select count(*)::text as n from finance.budget_items where not protected"))[0].n).toBe("0");
    expect(await sql("select count(*)::text as n from finance.audit_log")).toEqual(priorAudit);
    expect(await version()).toBe(before);
  });
  it("replays a lost successful response without writing again and restores a cancelled ID", async () => {
    const first = await prepare(); const id = requestId();
    expect((await apply(csv, first, "head", "", id)).status).toBe(200);
    const saved = await sql<{id:string}>("select id from finance.budget_items where not protected");
    const after = await version(); expect((await apply(csv, first, "head", "", id)).status).toBe(200); expect(await version()).toBe(after);
    const replacement = "system_id;description;planned_nok\nSYS-FR;Other;20";
    expect((await apply(replacement, await prepare(replacement))).status).toBe(200);
    const restore = await prepare(); expect((await apply(csv, restore)).status).toBe(200);
    const restored = await sql<{id:string;status:string}>("select id,status from finance.budget_items where description='Frame'");
    expect(restored[0]).toEqual({ id: saved[0].id, status: "planned" });
  });

  it("validates earmarks across the full result and can move one when its old item is removed", async () => {
    await sql("update finance.systems set active = true where code='SYS-LV'");
    const seasonId = (await sql<{id:string}>("select id from finance.seasons where code='S27'"))[0].id;
    const funding = (await sql<{id:string}>(`insert into finance.funding (season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values ($1::uuid,'F-S27-001','Example','Owner','grant',100000,'secured',$2::uuid,$2::uuid) returning id`, [seasonId, headId]))[0].id;
    await sql(`insert into finance.funding_parts (funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values ($1::uuid,'FE-001','Restricted',100000,$2::uuid,$2::uuid)`, [funding, headId]);
    const split = "system_id;description;planned_nok;priority;earmark_id\nSYS-FR;A;10;EM;FE-001\nSYS-LV;B;10;EM;FE-001";
    const invalid = await prepare(split); expect(invalid.errors.some((e) => e.field === "earmark_id")).toBe(true);
    expect((await apply(split, invalid)).status).toBe(400);
    const firstCsv = "system_id;description;planned_nok;priority;earmark_id\nSYS-FR;A;10;EM;FE-001";
    expect((await apply(firstCsv, await prepare(firstCsv))).status).toBe(200);
    const moving = "system_id;description;planned_nok;priority;earmark_id\nSYS-LV;B;10;EM;FE-001";
    const ready = await prepare(moving); expect(ready.errors).toEqual([]); expect((await apply(moving, ready)).status).toBe(200);
    expect(await sql("select s.code, i.status from finance.budget_items i join finance.systems s on s.id=i.system_id where not i.protected order by s.code")).toEqual([{code:"SYS-FR",status:"cancelled"},{code:"SYS-LV",status:"planned"}]);
  });

  it("warns when imported plan is below registered spending and when a spent item is removed", async () => {
    const initial = await prepare();
    expect((await apply(csv, initial)).status).toBe(200);
    const item = (await sql<{id:string; system_id:string; season_id:string}>(
      `select i.id, i.system_id, b.season_id from finance.budget_items i join finance.budgets b on b.id=i.budget_id where not i.protected`,
    ))[0];
    await pg.exec("begin");
    await sql(
      `insert into finance.purchases (season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind)
       values ($1::uuid, $2::uuid, '2026-0042', 'registered', 'Buyer', 'Supplier', 'team_account', '2026-10-01', 'Workshop material', 'receipt')`,
      [item.season_id, memberId],
    );
    await sql(
      `insert into finance.purchase_lines (purchase_id, public_ref, system_id, budget_item_id, description, quantity, amount_ore)
       select id, '2026-0042-L1', $1::uuid, $2::uuid, 'Frame', 1, 150000 from finance.purchases where public_ref = '2026-0042'`,
      [item.system_id, item.id],
    );
    await sql(
      `insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
       select id, $1::uuid, '2026-0042-L1-A1', 150000 from finance.purchase_lines where public_ref = '2026-0042-L1'`,
      [item.id],
    );
    await pg.exec("commit");
    const versionBefore = await version();
    const unchanged = await prepare();
    expect(unchanged.counts.unchanged).toBe(1);
    expect(unchanged.warnings).toContain("Line 2: Frame (SYS-FR) has 1500.00 NOK of spending, exceeding the imported plan of 1000.00 NOK by 500.00 NOK.");
    const reducedCsv = "system_id;description;planned_nok\nSYS-FR;Frame;900";
    const reduced = await prepare(reducedCsv);
    expect(reduced.warnings).toContain("Line 2: Frame (SYS-FR) has 1500.00 NOK of spending, exceeding the imported plan of 900.00 NOK by 600.00 NOK.");
    expect(reduced.errors).toEqual([]);
    const equalCsv = "system_id;description;planned_nok\nSYS-FR;Frame;1500";
    expect((await prepare(equalCsv)).warnings).toHaveLength(1); // Description-identity advice only.
    const removedCsv = "system_id;description;planned_nok\nSYS-FR;Brake;10";
    expect((await prepare(removedCsv)).warnings).toContain("Frame (SYS-FR) will be cancelled but retains 1500.00 NOK of spending.");
    expect(await version()).toBe(versionBefore);
    expect((await call("head", { action: "cancelItem", requestId: requestId(), itemId: item.id, expectedRevision: 0 })).status).toBe(200);
    const restored = await prepare();
    expect(restored.rows[0].after?.status).toBe("planned");
    expect(restored.warnings).toContain("Line 2: Frame (SYS-FR) has 1500.00 NOK of spending, exceeding the imported plan of 1000.00 NOK by 500.00 NOK.");
    await sql("update finance.purchases set status='voided', void_reason='Cancelled', voided_at=clock_timestamp(), voided_by_member_id=$1::uuid", [headId]);
    expect((await prepare()).warnings).toHaveLength(1);
  });

});
