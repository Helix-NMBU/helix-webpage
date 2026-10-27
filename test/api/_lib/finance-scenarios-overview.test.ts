import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { FinanceProfile, PublicBudgets, PublicOverview } from "../../../api/_lib/finance-types.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
import { addCalendarDays, osloToday } from "../../../src/features/Finance/money.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const businessId = "44444444-4444-4444-8444-444444444444";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  business: { userId: businessId, googleSub: "business-sub", email: "business@example.test", name: "Business Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;

function response() {
  let status = 0;
  let body: unknown;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body }) };
}

async function call(path: { method?: string; query?: Record<string, string>; body?: unknown; token?: string | null }) {
  const wrapped = response();
  const headers: Record<string, string> = {};
  if (path.token) headers.authorization = `Bearer ${path.token}`;
  await handler({
    method: path.method ?? (path.body ? "POST" : "GET"),
    query: path.query ?? {},
    body: path.body,
    headers,
  } as unknown as VercelRequest, wrapped.res);
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pg.query(text, params);
  return result.rows as T[];
}

async function version() {
  const rows = await sql<{ version: string }>("select version::text as version from finance.view_versions");
  return Number(rows[0]?.version ?? -1);
}

async function grant(profile: FinanceProfile, member = memberId) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function openSeason() {
  await sql("select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')", [operatorId]);
  const rows = await sql<{ id: string }>("select id from finance.seasons where code = 'S27'");
  return rows[0].id;
}

async function insertBudget(seasonId: string, status: "draft" | "approved") {
  await sql(
    `insert into finance.budgets (
       season_id, public_ref, status, approved_by_member_id, approved_on, created_by_member_id, updated_by_member_id
     ) values (
       $1::uuid, 'B-S27', $2, $3::uuid, $4::date, $5::uuid, $5::uuid
     )`,
    [seasonId, status, status === "approved" ? operatorId : null, status === "approved" ? "2026-10-01" : null, operatorId],
  );
  return (await sql<{ id: string }>("select id from finance.budgets"))[0].id;
}

async function insertSystem(departmentKey: string, code: string, name: string, active = true) {
  await sql(
    "insert into finance.systems (department_key, code, name, active) values ($1, $2, $3, $4)",
    [departmentKey, code, name, active],
  );
  return (await sql<{ id: string }>("select id from finance.systems where code = $1", [code]))[0].id;
}

async function insertItem(input: {
  budgetId: string;
  systemId: string;
  publicRef: string;
  description: string;
  plannedOre: number;
  priority?: string;
  status?: string;
  earmarkId?: string | null;
  protected?: boolean;
}) {
  await sql(
    `insert into finance.budget_items (
       budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, protected,
       created_by_member_id, updated_by_member_id
     ) values (
       $1::uuid, $2::uuid, $3, $4, 'material', $5, $6, 'new', $7, $8::uuid, $9, $10::uuid, $10::uuid
     )`,
    [
      input.budgetId,
      input.systemId,
      input.publicRef,
      input.description,
      input.plannedOre,
      input.priority ?? "P1",
      input.status ?? "planned",
      input.earmarkId ?? null,
      input.protected ?? false,
      operatorId,
    ],
  );
  return (await sql<{ id: string }>("select id from finance.budget_items where public_ref = $1", [input.publicRef]))[0].id;
}

async function insertRequest(input: {
  seasonId: string;
  itemId: string;
  publicRef: string;
  approvedOre: number;
  status?: "approved" | "closed" | "cancelled";
  ordinal?: number;
}) {
  const requestId = (await sql<{ id: string }>(
    `insert into finance.requests (season_id, requester_member_id, public_ref, status)
     values ($1::uuid, $2::uuid, $3, 'approved') returning id`,
    [input.seasonId, memberId, input.publicRef],
  ))[0].id;
  const revisionId = (await sql<{ id: string }>(
    `insert into finance.request_revisions (request_id, revision_number, supplier_name, justification, planned_date)
     values ($1::uuid, 1, 'Supplier Example', 'Workshop material', '2026-11-01') returning id`,
    [requestId],
  ))[0].id;
  const lineId = (await sql<{ id: string }>(
    `insert into finance.request_lines (revision_id, budget_item_id, ordinal, description, estimated_ore, approved_ore)
     values ($1::uuid, $2::uuid, $3, 'Request line', $4, $4) returning id`,
    [revisionId, input.itemId, input.ordinal ?? 1, input.approvedOre],
  ))[0].id;
  await sql(
    "update finance.requests set submitted_revision_id = $2::uuid, approved_revision_id = $2::uuid, status = $3 where id = $1::uuid",
    [requestId, revisionId, input.status ?? "approved"],
  );
  return lineId;
}

async function insertPurchase(input: {
  seasonId: string;
  systemId: string;
  itemId: string;
  publicRef: string;
  purchaseDate: string;
  amountOre: number;
  requestLineId?: string | null;
  voided?: boolean;
}) {
  await pg.exec("begin");
  try {
  const purchaseId = (await sql<{ id: string }>(
    `insert into finance.purchases (
       season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind,
       void_reason, voided_at, voided_by_member_id
     ) values (
       $1::uuid, $2::uuid, $3, $4, 'Buyer Example', 'Supplier Example', 'team_account', $5::date, 'Workshop material', 'receipt',
       $6, $7::timestamptz, $8::uuid
     ) returning id`,
    [
      input.seasonId,
      memberId,
      input.publicRef,
      input.voided ? "voided" : "registered",
      input.purchaseDate,
      input.voided ? "Duplicate entry" : null,
      input.voided ? "2026-10-02T10:00:00Z" : null,
      input.voided ? operatorId : null,
    ],
  ))[0].id;
  const lineId = (await sql<{ id: string }>(
    `insert into finance.purchase_lines (
       purchase_id, public_ref, system_id, budget_item_id, description, quantity, amount_ore, request_line_id
     ) values ($1::uuid, $2, $3::uuid, $4::uuid, 'Recorded line', 1, $5, $6::uuid) returning id`,
    [purchaseId, `${input.publicRef}-L1`, input.systemId, input.itemId, input.amountOre, input.requestLineId ?? null],
  ))[0].id;
  await sql(
    `insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
     values ($1::uuid, $2::uuid, $3, $4)`,
    [lineId, input.itemId, `${input.publicRef}-L1-A1`, input.amountOre],
  );
  await pg.exec("commit");
  } catch (error) {
    await pg.exec("rollback");
    throw error;
  }
}

async function insertFunding(input: {
  seasonId: string;
  publicRef: string;
  sourceName: string;
  amountOre: number;
  status: string;
  confidence?: string | null;
}) {
  return (await sql<{ id: string }>(
    `insert into finance.funding (
       season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, confidence,
       created_by_member_id, updated_by_member_id
     ) values ($1::uuid, $2, $3, 'Example owner', 'grant', $4, $5, $6, $7::uuid, $7::uuid) returning id`,
    [input.seasonId, input.publicRef, input.sourceName, input.amountOre, input.status, input.confidence ?? null, operatorId],
  ))[0].id;
}

async function insertPart(input: {
  fundingId: string;
  publicRef: string;
  purpose: string;
  amountOre: number;
  spendBy?: string | null;
  conditions?: string | null;
}) {
  return (await sql<{ id: string }>(
    `insert into finance.funding_parts (
       funding_id, public_ref, purpose, amount_ore, spend_by, conditions, created_by_member_id, updated_by_member_id
     ) values ($1::uuid, $2, $3, $4, $5::date, $6, $7::uuid, $7::uuid) returning id`,
    [input.fundingId, input.publicRef, input.purpose, input.amountOre, input.spendBy ?? null, input.conditions ?? null, operatorId],
  ))[0].id;
}

async function readOverview(token = "member") {
  const result = await call({ query: { action: "overview" }, token });
  expect(result.status).toBe(200);
  return result.body as PublicOverview;
}

async function readBudgets(token = "member") {
  const result = await call({ query: { action: "budgets" }, token });
  expect(result.status).toBe(200);
  return result.body as PublicBudgets;
}

async function commitmentOre(itemId: string) {
  const rows = await sql<{ ore: string }>("select finance.budget_item_open_commitment_ore($1::uuid)::text as ore", [itemId]);
  return rows[0].ore;
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
    create table identity.recruiter_grants (member_id uuid primary key);
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    insert into identity.members (id, google_sub, email, full_name, helix_role) values
      ('${operatorId}', 'operator-sub', 'operator@example.test', 'Operator Example', 'Member'),
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example', 'Member'),
      ('${businessId}', 'business-sub', 'business@example.test', 'Business Example', 'Member');
    insert into identity.platform_roles values ('platform_administrator'), ('team_member');
    insert into identity.member_roles values ('${operatorId}', 'platform_administrator');
    insert into identity.member_departments values ('${memberId}', 'finance');
    create role anon;
    create role authenticated;
    create role anonymous;
  `);
  for (const file of ["011_finance_core.sql", "012_finance_season_budgets.sql", "013_finance_funding.sql", "014_finance_register_purchases.sql", "015_finance_requests.sql", "016_finance_fulfillment.sql"]) {
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

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
    update finance.requests set submitted_revision_id = null, approved_revision_id = null;
    truncate table
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
    restart identity;
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
    update identity.departments set name = 'Mechanical' where department_key = 'mechanical-production';
    update identity.departments set name = 'Finance' where department_key = 'finance';
  `);
});

describe("FIN-09-A01 commitment sums", () => {
  it("sums several open lines before comparing them with remaining plan and ignores closed lines", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-SUM", "Frame");
    const itemId = await insertItem({ budgetId, systemId, publicRef: "BI-S27-001", description: "Frame tube", plannedOre: 200000 });
    await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-001", approvedOre: 220000, ordinal: 1 });
    await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-002", approvedOre: 180000, ordinal: 1 });
    await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-003", approvedOre: 90000, status: "closed" });
    await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-004", approvedOre: 70000, status: "cancelled" });
    await insertPurchase({ seasonId, systemId, itemId, publicRef: "2026-0301", purchaseDate: "2026-10-01", amountOre: 50000 });
    expect(await commitmentOre(itemId)).toBe("400000");
    const overview = await readOverview();
    expect(overview.scenarios).toBeUndefined();
    await grant("business");
    const privateView = await readOverview();
    expect(privateView.scenarios?.map((scenario) => scenario.needNok)).toEqual(["4500.00", "4500.00", "4500.00"]);
    expect(privateView.departments[0]?.commitmentNok).toBe("4000.00");
  });
});

describe("FIN-09-A02 golden commitment cases", () => {
  it("turns approved 10,000, actual 4,000, and eligible plan 12,000 into need 12,000", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-GD", "Frame");
    const itemId = await insertItem({ budgetId, systemId, publicRef: "BI-S27-001", description: "Frame tube", plannedOre: 1_200_000 });
    const lineId = await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-001", approvedOre: 1_000_000 });
    await insertPurchase({
      seasonId, systemId, itemId, publicRef: "2026-0401", purchaseDate: "2026-10-01", amountOre: 400_000, requestLineId: lineId,
    });
    expect(await commitmentOre(itemId)).toBe("600000");
    await grant("finance");
    const before = await version();
    const overview = await readOverview();
    const budgets = await readBudgets();
    await call({ query: { action: "financing" }, token: "member" });
    await call({ query: { action: "version" }, token: "member" });
    await call({ query: { action: "capabilities" }, token: "member" });
    expect(await version()).toBe(before);
    expect(overview.scenarios?.find((scenario) => scenario.key === "downside")?.needNok).toBe("12000.00");
    expect(overview.departments[0]?.systems[0]?.commitmentNok).toBe("6000.00");
    expect(budgets.departments[0]?.systems[0]?.commitmentNok).toBe("6000.00");
    expect(budgets.departments[0]?.systems[0]?.items[0]?.commitmentNok).toBe("6000.00");
  });

  it("still contributes 10,000 when the priority is outside the scenario", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-EX", "Frame");
    const itemId = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-001", description: "Optional tube", plannedOre: 1_200_000, priority: "P3",
    });
    const lineId = await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-001", approvedOre: 1_000_000 });
    await insertPurchase({
      seasonId, systemId, itemId, publicRef: "2026-0402", purchaseDate: "2026-10-01", amountOre: 400_000, requestLineId: lineId,
    });
    await grant("head_of_finance");
    const needs = (await readOverview()).scenarios?.map((scenario) => scenario.needNok);
    expect(needs).toEqual(["10000.00", "10000.00", "12000.00"]);
  });

  it("keeps actual 11,000 and zero remaining commitment in every scenario", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-OV", "Frame");
    const itemId = await insertItem({ budgetId, systemId, publicRef: "BI-S27-001", description: "Overrun tube", plannedOre: 1_000_000, priority: "P4" });
    const lineId = await insertRequest({ seasonId, itemId, publicRef: "RQ-S27-001", approvedOre: 1_000_000 });
    await insertPurchase({
      seasonId, systemId, itemId, publicRef: "2026-0403", purchaseDate: "2026-10-01", amountOre: 1_100_000, requestLineId: lineId,
    });
    expect(await commitmentOre(itemId)).toBe("0");
    await grant("business");
    const overview = await readOverview();
    expect(overview.scenarios?.map((scenario) => scenario.needNok)).toEqual(["11000.00", "11000.00", "11000.00"]);
    expect(overview.departments[0]?.commitmentNok).toBe("0.00");
    expect(overview.departments[0]?.actualNok).toBe("11000.00");
  });
});

describe("FIN-09-A03 earmarks, exclusions, and deadlines", () => {
  it("counts cancelled and unallocated spending, drops voided spending, and restores open commitment", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-EXC", "Frame");
    const cancelledId = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-001", description: "Cancelled tube", plannedOre: 800_000, status: "cancelled",
    });
    const unallocatedId = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-ZA-UNALLOC", description: "Unallocated spending", plannedOre: 0, protected: true,
    });
    const voidedId = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-002", description: "Voided tube", plannedOre: 0,
    });
    await insertPurchase({ seasonId, systemId, itemId: cancelledId, publicRef: "2026-0501", purchaseDate: "2026-10-01", amountOre: 125_000 });
    const openLine = await insertRequest({ seasonId, itemId: unallocatedId, publicRef: "RQ-S27-010", approvedOre: 20_000 });
    await insertPurchase({ seasonId, systemId, itemId: unallocatedId, publicRef: "2026-0502", purchaseDate: "2026-10-02", amountOre: 43_000 });
    const voidLine = await insertRequest({ seasonId, itemId: voidedId, publicRef: "RQ-S27-011", approvedOre: 50_000 });
    await insertPurchase({
      seasonId, systemId, itemId: voidedId, publicRef: "2026-0503", purchaseDate: "2026-10-03", amountOre: 90_000, requestLineId: voidLine, voided: true,
    });
    expect(await commitmentOre(cancelledId)).toBe("0");
    expect(await commitmentOre(unallocatedId)).toBe("20000");
    expect(await commitmentOre(voidedId)).toBe("50000");
    expect(openLine).toBeTruthy();
    await grant("finance");
    const overview = await readOverview();
    expect(overview.departments[0]).toMatchObject({
      plannedNok: "0.00",
      actualNok: "1680.00",
      unbudgetedNok: "430.00",
      commitmentNok: "700.00",
    });
    expect(overview.scenarios?.map((scenario) => scenario.needNok)).toEqual(["2380.00", "2380.00", "2380.00"]);
    const budgets = await readBudgets();
    expect(budgets.departments[0]?.unbudgetedNok).toBe("430.00");
    expect(budgets.departments[0]?.actualNok).toBe("1680.00");
  });

  it("excludes deleted funding, keeps a negative unrestricted remainder, and hides sources publicly", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-DL", "Frame");
    const deletedId = await insertFunding({
      seasonId, publicRef: "F-S27-001", sourceName: "Retired source", amountOre: 500_000, status: "deleted", confidence: "high",
    });
    const deletedPart = await insertPart({ fundingId: deletedId, publicRef: "FE-001", purpose: "Retired bracket", amountOre: 400_000, conditions: "Internal condition" });
    const securedId = await insertFunding({
      seasonId, publicRef: "F-S27-002", sourceName: "Synthetic source", amountOre: 10_000, status: "secured",
    });
    await insertPart({
      fundingId: securedId, publicRef: "FE-002", purpose: "Bracket work", amountOre: 25_000, conditions: "Internal condition",
    });
    const itemId = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-001", description: "Deleted funding tube", plannedOre: 400_000, priority: "EM", earmarkId: deletedPart,
    });
    await insertPurchase({ seasonId, systemId, itemId, publicRef: "2026-0601", purchaseDate: "2026-10-01", amountOre: 175_000 });
    const memberView = await readOverview();
    const memberJson = JSON.stringify(memberView);
    expect(memberView).not.toHaveProperty("scenarios");
    expect(memberView).not.toHaveProperty("earmarkSources");
    expect(memberJson).not.toContain("Synthetic source");
    expect(memberJson).not.toContain("Internal condition");
    expect(memberJson).not.toContain("Retired source");
    expect(memberJson).toContain("Bracket work");
    await grant("business");
    const businessView = await readOverview();
    expect(businessView.earmarkSources).toEqual([
      expect.objectContaining({ sourceName: "Synthetic source", conditions: "Internal condition" }),
    ]);
    expect(businessView.scenarios?.[0]).toMatchObject({
      eligibleFundingNok: "100.00",
      earmarkedNok: "250.00",
      unrestrictedNok: "-150.00",
      needNok: "1750.00",
      restrictedCoverNok: "0.00",
      generalNeedNok: "1750.00",
      shortfallNok: "1900.00",
    });
    expect(JSON.stringify(businessView)).not.toContain("bank");
  });

  it("counts purchases on the deadline, starts must-return the next Oslo day, and keeps scenario use separate", async () => {
    const today = osloToday();
    const yesterday = addCalendarDays(today, -1);
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const systemId = await insertSystem("mechanical-production", "SYS-DT", "Frame");
    const fundingId = await insertFunding({
      seasonId, publicRef: "F-S27-003", sourceName: "Synthetic source", amountOre: 520_000, status: "received",
    });
    const expiredPart = await insertPart({
      fundingId, publicRef: "FE-011", purpose: "Dated bracket", amountOre: 480_000, spendBy: yesterday,
    });
    const currentPart = await insertPart({
      fundingId, publicRef: "FE-012", purpose: "Open bracket", amountOre: 40_000, spendBy: today,
    });
    const expiredItem = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-001", description: "Dated tube", plannedOre: 0, priority: "EM", earmarkId: expiredPart,
    });
    const currentItem = await insertItem({
      budgetId, systemId, publicRef: "BI-S27-002", description: "Open tube", plannedOre: 0, priority: "EM", earmarkId: currentPart,
    });
    await insertPurchase({ seasonId, systemId, itemId: expiredItem, publicRef: "2026-0701", purchaseDate: yesterday, amountOre: 160_000 });
    await insertPurchase({ seasonId, systemId, itemId: expiredItem, publicRef: "2026-0702", purchaseDate: today, amountOre: 70_000 });
    await insertPurchase({ seasonId, systemId, itemId: currentItem, publicRef: "2026-0703", purchaseDate: today, amountOre: 5_000 });
    const overview = await readOverview();
    const dated = overview.publicEarmarks.find((earmark) => earmark.purpose === "Dated bracket");
    const open = overview.publicEarmarks.find((earmark) => earmark.purpose === "Open bracket");
    expect(dated).toMatchObject({ usedNok: "1600.00", leftNok: "3200.00", mustReturnNok: "3200.00", spendBy: yesterday, systemName: "Frame" });
    expect(open).toMatchObject({ usedNok: "50.00", leftNok: "350.00", mustReturnNok: "0.00", spendBy: today });
    await grant("business");
    const privateView = await readOverview();
    expect(privateView.scenarios?.[0]?.needNok).toBe("2350.00");
    expect(privateView.scenarios?.[0]?.restrictedCoverNok).toBe("2350.00");
    expect(privateView.scenarios?.[0]?.restrictedCoverNok).not.toBe(dated?.usedNok);
  });
});

describe("FIN-09-A04 overview ordering and retention", () => {
  it("orders configured departments, keeps meaningful inactive systems, and shows unassigned parts", async () => {
    await sql("update identity.departments set name = 'Zebra workshop' where department_key = 'mechanical-production'");
    await sql("update identity.departments set name = 'Alpha workshop' where department_key = 'finance'");
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "approved");
    const zebraId = await insertSystem("mechanical-production", "SYS-ZB", "Beta");
    const dormantId = await insertSystem("mechanical-production", "SYS-DM", "Dormant", false);
    await insertSystem("finance", "SYS-AL", "Alpha", true);
    await insertSystem("finance", "SYS-EM", "Empty", false);
    await insertItem({ budgetId, systemId: zebraId, publicRef: "BI-S27-001", description: "Beta tube", plannedOre: 2_000 });
    const dormantItem = await insertItem({ budgetId, systemId: dormantId, publicRef: "BI-S27-002", description: "Dormant tube", plannedOre: 0 });
    await insertPurchase({ seasonId, systemId: dormantId, itemId: dormantItem, publicRef: "2026-0801", purchaseDate: "2026-10-01", amountOre: 64_000 });
    const fundingId = await insertFunding({
      seasonId, publicRef: "F-S27-004", sourceName: "Synthetic source", amountOre: 90_000, status: "secured",
    });
    const loose = await insertPart({ fundingId, publicRef: "FE-021", purpose: "Loose bracket", amountOre: 30_000 });
    const retired = await insertPart({ fundingId, publicRef: "FE-022", purpose: "Retired bracket", amountOre: 15_000 });
    await insertItem({
      budgetId, systemId: zebraId, publicRef: "BI-S27-003", description: "Cancelled link", plannedOre: 15_000, priority: "EM", status: "cancelled", earmarkId: retired,
    });
    const overview = await readOverview();
    expect(overview.departments.map((department) => department.name)).toEqual(["Zebra workshop", "Alpha workshop"]);
    expect(overview.departments[0]?.systems.map((system) => system.name)).toEqual(["Beta", "Dormant"]);
    expect(overview.departments[1]?.systems.map((system) => system.name)).toEqual(["Alpha"]);
    expect(overview.departments[0]?.systems.find((system) => system.name === "Dormant")).toMatchObject({ active: false, actualNok: "640.00" });
    expect(overview.departments.flatMap((department) => department.systems).map((system) => system.name)).not.toContain("Empty");
    const looseSummary = overview.publicEarmarks.find((earmark) => earmark.purpose === "Loose bracket");
    const retiredSummary = overview.publicEarmarks.find((earmark) => earmark.purpose === "Retired bracket");
    expect(looseSummary?.systemName).toBeNull();
    expect(retiredSummary?.systemName).toBeNull();
    expect(loose).toBeTruthy();
  });
});

describe("FIN-09-A05 role filtered overview", () => {
  it("shows draft aggregates only to finance and head, and scenarios without draft plans to business", async () => {
    const seasonId = await openSeason();
    const budgetId = await insertBudget(seasonId, "draft");
    const systemId = await insertSystem("mechanical-production", "SYS-DR", "Frame");
    await insertItem({ budgetId, systemId, publicRef: "BI-S27-001", description: "Draft tube", plannedOre: 7_700 });
    await insertFunding({
      seasonId, publicRef: "F-S27-005", sourceName: "Synthetic source", amountOre: 50_000, status: "prospect", confidence: "high",
    });
    const memberJson = JSON.stringify(await readOverview());
    expect(memberJson).not.toContain("Draft tube");
    expect(memberJson).not.toContain("scenarios");
    expect(memberJson).not.toContain("Synthetic source");
    const memberView = await readOverview();
    expect(memberView.departments).toEqual([]);
    expect(memberView.budgetStatus).toBe("draft");

    await grant("business", businessId);
    const businessView = await readOverview("business");
    expect(businessView.departments).toEqual([]);
    expect(businessView.scenarios).toHaveLength(3);
    expect(businessView.scenarios?.map((scenario) => scenario.needNok)).toEqual(["0.00", "0.00", "0.00"]);
    expect(businessView.scenarios?.map((scenario) => scenario.eligibleFundingNok)).toEqual(["0.00", "0.00", "500.00"]);

    await grant("finance");
    const financeView = await readOverview();
    expect(financeView.departments[0]?.plannedNok).toBe("77.00");
    expect(financeView.scenarios?.[0]?.needNok).toBe("77.00");
    expect(financeView.earmarkSources).toEqual([]);

    await grant("head_of_finance");
    const headView = await readOverview();
    expect(headView.departments[0]?.systems[0]?.plannedNok).toBe("77.00");
    expect(headView.scenarios?.[2]?.eligibleFundingNok).toBe("500.00");
    expect(JSON.stringify(headView)).not.toContain("bank");
  });
});
