import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { FinanceProfile } from "../../../api/_lib/finance-types.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";

const identities: Record<string, WorkspaceIdentity> = {
  operator: { userId: operatorId, googleSub: "operator-sub", email: "operator@example.test", name: "Operator Example" },
  member: { userId: memberId, googleSub: "member-sub", email: "member@example.test", name: "Member Example" },
  admin: { userId: adminId, googleSub: "admin-sub", email: "admin@example.test", name: "Admin Example" },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let requestSequence = 0;

function nextRequestId() {
  requestSequence += 1;
  return `66666666-6666-4666-8666-${String(requestSequence).padStart(12, "0")}`;
}

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

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const result = await pg.query(text, params);
  return { rows: result.rows as T[] };
}

async function version() {
  const rows = await sql<{ version: string }>("select version::text as version from finance.view_versions");
  return Number(rows.rows[0]?.version ?? -1);
}

async function grant(profile: FinanceProfile, member = memberId) {
  await sql("select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')", [operatorId, member, profile]);
}

async function openSeason() {
  await sql(
    "select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')",
    [operatorId],
  );
}

const fundingFields = {
  sourceName: "Example source",
  ownerName: "Example owner",
  fundingType: "grant",
  amountNok: "1000.00",
  status: "secured",
  confidence: "high",
  expectedDate: "2027-03-01",
  receivedDate: null,
  ownerEmail: "owner@example.test",
  reportingRequired: true,
  agreementLink: "https://example.test/agreement",
  note: "Synthetic note",
};

function addFundingBody(requestId = nextRequestId(), funding: Record<string, unknown> = fundingFields) {
  return { action: "addFunding", requestId, funding };
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
      ('${memberId}', 'member-sub', 'member@example.test', 'Member Example', 'Head of Finance'),
      ('${adminId}', 'admin-sub', 'admin@example.test', 'Admin Example', 'Admin');
    insert into identity.platform_roles values ('platform_administrator'), ('team_member');
    insert into identity.member_roles values ('${adminId}', 'platform_administrator'), ('${operatorId}', 'platform_administrator');
    insert into identity.recruiter_grants values ('${adminId}');
    insert into identity.member_departments values ('${memberId}', 'finance');
    create role anon;
    create role authenticated;
    create role anonymous;
  `);
  await pg.exec(readFileSync(new URL("../../../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../db/migrations/013_finance_funding.sql", import.meta.url), "utf8"));
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

async function resetFinance() {
  await pg.exec(`
    alter table finance.audit_log disable trigger user;
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
    alter table finance.audit_log enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
}

beforeEach(async () => {
  await resetFinance();
});

afterAll(async () => { await pg.close(); });

async function financing(token = "member") {
  const result = await call({ query: { action: "financing" }, token });
  expect(result.status).toBe(200);
  return result.body as {
    funding: Array<Record<string, unknown>>;
    parts: Array<Record<string, unknown>>;
  };
}

describe("financing and earmarked funding", () => {
  it("denies members, finance-department titles, and administrators until a finance profile is granted", async () => {
    await openSeason();
    const denied = await call({ token: "member", body: addFundingBody() });
    const admin = await call({ token: "admin", body: addFundingBody() });
    expect(denied.status).toBe(403);
    expect(admin.status).toBe(403);
    expect((await call({ query: { action: "financing" }, token: "member" })).status).toBe(403);
    expect(await sql<{ count: string }>("select count(*)::text as count from finance.funding")).toMatchObject({ rows: [{ count: "0" }] });
    expect(await version()).toBe(1);

    for (const profile of ["business", "finance", "head_of_finance"] as const) {
      await resetFinance();
      await openSeason();
      const actor = profile === "head_of_finance" ? adminId : memberId;
      const token = profile === "head_of_finance" ? "admin" : "member";
      await grant(profile, actor);
      const before = await version();
      const created = await call({ token, body: addFundingBody() });
      expect(created.status, profile).toBe(200);
      expect(created.body).toMatchObject({ ok: true, warnings: [], errors: [] });
      expect(await version(), profile).toBe(before + 1);
    }
  });

  it("keeps other finance mutations unavailable", async () => {
    await openSeason();
    await grant("finance");
    const before = await version();
    expect(await call({ token: "member", body: { action: "registerPurchase", requestId: nextRequestId(), purchase: {} } })).toMatchObject({
      status: 503,
      body: { error: "This finance operation is not available yet." },
    });
    expect(await call({ token: "member", body: { action: "createBudget", requestId: nextRequestId() } })).toMatchObject({ status: 403 });
    expect(await version()).toBe(before);
  });

  it("records funding before a budget exists and rejects invalid fields without a version bump", async () => {
    await openSeason();
    await grant("business");
    const before = await version();
    const invalid = await call({
      token: "member",
      body: addFundingBody(nextRequestId(), { sourceName: "", ownerName: "", amountNok: "0", ownerEmail: "not-an-email" }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: expect.any(String) });
    expect((invalid.body as { errors: Array<{ field: string }> }).errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["sourceName", "ownerName", "amountNok", "ownerEmail"]),
    );
    expect(await version()).toBe(before);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.budgets")).rows[0]?.count).toBe("0");

    const created = await call({ token: "member", body: addFundingBody() });
    expect(created.status).toBe(200);
    expect(await version()).toBe(before + 1);
    const view = await financing();
    expect(view.funding).toHaveLength(1);
    expect(view.funding[0]).toMatchObject({
      sourceName: "Example source",
      ownerName: "Example owner",
      fundingType: "grant",
      amountNok: "1000.00",
      status: "secured",
      confidence: "high",
      expectedDate: "2027-03-01",
      ownerEmail: "owner@example.test",
      reportingRequired: true,
      agreementLink: "https://example.test/agreement",
      note: "Synthetic note",
      earmarkedNok: "0.00",
      unrestrictedNok: "1000.00",
      linkedItemCount: 0,
    });
    const audit = await sql<{ field_name: string }>(
      "select field_name from finance.audit_log where entity = 'funding' order by field_name",
    );
    expect(audit.rows.map((row) => row.field_name)).toEqual(expect.arrayContaining([
      "source_name", "owner_name", "funding_type", "amount_nok", "status", "confidence", "expected_date", "owner_email", "reporting_required", "agreement_link", "note",
    ]));
  });

  it("saves an over-earmark and a reduced total with an exact warning and a negative remainder", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string; revision: number }).id;
    const fundingRevision = (created.body as { revision: number }).revision;
    const beforePart = await version();
    const part = await call({
      token: "member",
      body: {
        action: "addEarmark",
        requestId: nextRequestId(),
        expectedRevision: fundingRevision,
        part: { fundingId, purpose: "Frame work", amountNok: "1500.50", spendBy: "2026-01-01", conditions: "Private condition text" },
      },
    });
    expect(part.status).toBe(200);
    expect(part.body).toMatchObject({
      warnings: [{ message: "Earmarked parts exceed this funding by 500.50 NOK." }],
    });
    expect(await version()).toBe(beforePart + 1);
    const partId = (part.body as { id: string; revision: number }).id;
    const partRevision = (part.body as { revision: number }).revision;

    const beforeEdit = await version();
    const reduced = await call({
      token: "member",
      body: {
        action: "editFunding",
        requestId: nextRequestId(),
        fundingId,
        expectedRevision: fundingRevision + 1,
        patch: { amountNok: "100.00" },
      },
    });
    expect(reduced.status).toBe(200);
    expect(reduced.body).toMatchObject({
      warnings: [{ message: "Earmarked parts exceed this funding by 1400.50 NOK." }],
    });
    expect(await version()).toBe(beforeEdit + 1);

    const view = await financing();
    expect(view.funding[0]).toMatchObject({ amountNok: "100.00", earmarkedNok: "1500.50", unrestrictedNok: "-1400.50" });
    expect(view.parts[0]).toMatchObject({
      id: partId,
      purpose: "Frame work",
      amountNok: "1500.50",
      conditions: "Private condition text",
      revision: partRevision,
    });
    expect(await call({
      token: "member",
      body: { action: "deleteEarmark", requestId: nextRequestId(), partId, expectedRevision: partRevision },
    })).toMatchObject({ status: 400, body: { error: "Unknown request." } });
    expect(await call({
      token: "member",
      body: {
        action: "editEarmark",
        requestId: nextRequestId(),
        partId,
        expectedRevision: partRevision,
        patch: { fundingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", purpose: "Moved part" },
      },
    }).then((result) => result.status)).toBe(400);
    expect((await financing()).parts[0]).toMatchObject({ fundingId, purpose: "Frame work", amountNok: "1500.50" });
  });

  it("derives used, left, and must-return amounts from eligible purchases and hides private fields publicly", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string }).id;
    const added = await call({
      token: "member",
      body: {
        action: "addEarmark",
        requestId: nextRequestId(),
        expectedRevision: (created.body as { revision: number }).revision,
        part: { fundingId, purpose: "Frame work", amountNok: "1500.00", spendBy: "2000-01-01", conditions: "Private condition text" },
      },
    });
    const partId = (added.body as { id: string }).id;
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons where code = 'S27'")).rows[0]?.id;
    await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
    const systemId = (await sql<{ id: string }>("select id from finance.systems")).rows[0]?.id;
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, approved_by_member_id, approved_on, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'B-S27', 'approved', $2::uuid, '2026-10-01', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    const budgetId = (await sql<{ id: string }>("select id from finance.budgets")).rows[0]?.id;
    await sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       ) values
         ($1::uuid, $2::uuid, 'BI-S27-001', 'Frame tube', 'material', 250000, 'EM', 'new', 'active', $3::uuid, $4::uuid, $4::uuid),
         ($1::uuid, $2::uuid, 'BI-S27-002', 'Cancelled tube', 'material', 1000, 'EM', 'new', 'cancelled', $3::uuid, $4::uuid, $4::uuid)`,
      [budgetId, systemId, partId, operatorId],
    );
    const itemId = (await sql<{ id: string }>("select id from finance.budget_items where public_ref = 'BI-S27-001'")).rows[0]?.id;
    await pg.exec(`
      with eligible as (
        insert into finance.purchases (
          season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
        ) values ('${seasonId}'::uuid, '${memberId}'::uuid, '2026-0101', 'registered', 'Buyer Example', 'Supplier Example', 'invoice', '1999-12-01', 'Workshop material', 'invoice')
        returning id
      ), eligible_line as (
        insert into finance.purchase_lines (purchase_id, public_ref, system_id, budget_item_id, description, quantity, amount_ore)
        select id, '2026-0101-L1', '${systemId}'::uuid, '${itemId}'::uuid, 'Frame tube', 1, 40000 from eligible
        returning id
      ), late as (
        insert into finance.purchases (
          season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind
        ) values ('${seasonId}'::uuid, '${memberId}'::uuid, '2026-0102', 'registered', 'Buyer Example', 'Supplier Example', 'invoice', '2000-06-01', 'Workshop material', 'invoice')
        returning id
      ), late_line as (
        insert into finance.purchase_lines (purchase_id, public_ref, system_id, budget_item_id, description, quantity, amount_ore)
        select id, '2026-0102-L1', '${systemId}'::uuid, '${itemId}'::uuid, 'Late tube', 1, 25000 from late
        returning id
      )
      insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
      select id, '${itemId}'::uuid, '2026-0101-L1-A1', 40000 from eligible_line
      union all
      select id, '${itemId}'::uuid, '2026-0102-L1-A1', 25000 from late_line;
    `);

    const view = await financing();
    expect(view.parts[0]).toMatchObject({
      purpose: "Frame work",
      usedNok: "400.00",
      leftNok: "1100.00",
      mustReturnNok: "1100.00",
      overdue: true,
      systemName: "Frame",
    });
    expect(view.parts[0]?.linkedItems).toEqual([
      expect.objectContaining({ description: "Frame tube", publicRef: "BI-S27-001", systemName: "Frame" }),
    ]);
    expect(view.funding[0]).toMatchObject({ linkedItemCount: 1, unrestrictedNok: "-500.00" });

    const overview = JSON.stringify((await call({ query: { action: "overview" }, token: "member" })).body);
    expect(overview).toContain("Frame work");
    expect(overview).toContain("400.00");
    expect(overview).toContain("1100.00");
    expect(overview).toContain("Frame");
    expect(overview).not.toContain("Example source");
    expect(overview).not.toContain("Private condition text");
    expect(overview).not.toContain("owner@example.test");
    expect(overview).not.toContain("Synthetic note");

    await sql("update finance.budgets set status = 'draft', approved_by_member_id = null, approved_on = null");
    const businessView = await financing();
    expect(businessView.parts[0]?.linkedItems).toEqual([]);
    expect(businessView.parts[0]?.systemName).toBeNull();
    expect(JSON.stringify((await call({ query: { action: "overview" }, token: "member" })).body)).not.toContain("Frame tube");

    await sql("select finance.set_member_grant($1::uuid, $2::uuid, 'business', false, 'Coverage revoke')", [operatorId, memberId]);
    await grant("finance");
    const financeView = await financing();
    expect(financeView.parts[0]?.linkedItems).toEqual([
      expect.objectContaining({ description: "Frame tube" }),
    ]);
  });

  it("soft-deletes funding, warns about active links, and restores the previous status with parts and spend intact", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string; revision: number }).id;
    let revision = (created.body as { revision: number }).revision;
    const added = await call({
      token: "member",
      body: {
        action: "addEarmark",
        requestId: nextRequestId(),
        expectedRevision: revision,
        part: { fundingId, purpose: "Frame work", amountNok: "100.00", spendBy: null, conditions: "Private condition text" },
      },
    });
    revision += 1;
    const partId = (added.body as { id: string }).id;
    await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons where code = 'S27'")).rows[0]?.id;
    const systemId = (await sql<{ id: string }>("select id from finance.systems")).rows[0]?.id;
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, approved_by_member_id, approved_on, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'B-S27', 'approved', $2::uuid, '2026-10-01', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select id, $1::uuid, 'BI-S27-001', 'Frame tube', 'material', 10000, 'EM', 'new', 'active', $2::uuid, $3::uuid, $3::uuid
       from finance.budgets`,
      [systemId, partId, operatorId],
    );

    const beforeDelete = await version();
    const deleted = await call({
      token: "member",
      body: { action: "deleteFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({
      warnings: [{ message: "This funding still pays for 1 budget item that is not cancelled." }],
    });
    expect(await version()).toBe(beforeDelete + 1);
    expect((await financing()).funding[0]).toMatchObject({ status: "deleted" });
    expect((await financing()).parts).toHaveLength(1);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.budget_items where earmark_id = $1::uuid", [partId])).rows[0]?.count).toBe("1");

    const beforeRestore = await version();
    const restored = await call({
      token: "member",
      body: { action: "restoreFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision + 1 },
    });
    expect(restored.status).toBe(200);
    expect(await version()).toBe(beforeRestore + 1);
    expect((await financing()).funding[0]).toMatchObject({ status: "secured", linkedItemCount: 1 });
    expect((await financing()).parts[0]).toMatchObject({ id: partId, purpose: "Frame work", conditions: "Private condition text" });

    const history = await sql<{ old_value: string | null; new_value: string }>(
      "select old_value, new_value from finance.audit_log where entity = 'funding' and entity_id = $1 and field_name = 'status' order by occurred_at",
      [fundingId],
    );
    expect(history.rows).toEqual([
      { old_value: null, new_value: "secured" },
      { old_value: "secured", new_value: "deleted" },
      { old_value: "deleted", new_value: "secured" },
    ]);
  });

  it("gives a deleted status the same audit, view bump, warning, and previous status as delete", async () => {
    await openSeason();
    await grant("business");
    const fundingIds: string[] = [];
    const revisions: number[] = [];
    const partIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const created = await call({ token: "member", body: addFundingBody() });
      expect(created.status).toBe(200);
      const fundingId = (created.body as { id: string; revision: number }).id;
      const revision = (created.body as { revision: number }).revision;
      const added = await call({
        token: "member",
        body: {
          action: "addEarmark",
          requestId: nextRequestId(),
          expectedRevision: revision,
          part: { fundingId, purpose: "Frame work", amountNok: "100.00", spendBy: null, conditions: "Private condition text" },
        },
      });
      expect(added.status).toBe(200);
      fundingIds.push(fundingId);
      revisions.push(revision + 1);
      partIds.push((added.body as { id: string }).id);
    }
    await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
    const seasonId = (await sql<{ id: string }>("select id from finance.seasons where code = 'S27'")).rows[0]?.id;
    const systemId = (await sql<{ id: string }>("select id from finance.systems")).rows[0]?.id;
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, approved_by_member_id, approved_on, created_by_member_id, updated_by_member_id)
       values ($1::uuid, 'B-S27', 'approved', $2::uuid, '2026-10-01', $2::uuid, $2::uuid)`,
      [seasonId, operatorId],
    );
    await sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, $1::uuid, 'BI-S27-' || lpad(n.ordinal::text, 3, '0'), 'Frame tube', 'material', 10000, 'EM', 'new', 'active', n.part_id, $2::uuid, $2::uuid
       from finance.budgets b
       join (values (1, $3::uuid), (2, $4::uuid)) as n(ordinal, part_id) on true`,
      [systemId, operatorId, partIds[0], partIds[1]],
    );

    async function deletion(index: number, body: Record<string, unknown>) {
      const fundingId = fundingIds[index];
      const beforeVersion = await version();
      const beforeAudits = Number((await sql<{ count: string }>(
        "select count(*)::text as count from finance.audit_log where entity = 'funding' and entity_id = $1",
        [fundingId],
      )).rows[0]?.count);
      const result = await call({ token: "member", body });
      expect(result.status).toBe(200);
      const stored = await sql<{ status: string; prior_status: string | null }>(
        "select status, prior_status from finance.funding where id = $1::uuid",
        [fundingId],
      );
      const audits = await sql<{ field_name: string; old_value: string | null; new_value: string | null; reason: string | null }>(
        `select field_name, old_value, new_value, reason
         from finance.audit_log
         where entity = 'funding' and entity_id = $1 and field_name = 'status' and new_value = 'deleted'`,
        [fundingId],
      );
      const afterAudits = Number((await sql<{ count: string }>(
        "select count(*)::text as count from finance.audit_log where entity = 'funding' and entity_id = $1",
        [fundingId],
      )).rows[0]?.count);
      return {
        warnings: (result.body as { warnings: unknown }).warnings,
        viewDelta: (await version()) - beforeVersion,
        status: stored.rows[0]?.status,
        priorStatus: stored.rows[0]?.prior_status,
        auditDelta: afterAudits - beforeAudits,
        audit: audits.rows,
      };
    }

    const byAction = await deletion(0, {
      action: "deleteFunding",
      requestId: nextRequestId(),
      fundingId: fundingIds[0],
      expectedRevision: revisions[0],
    });
    const byStatus = await deletion(1, {
      action: "editFunding",
      requestId: nextRequestId(),
      fundingId: fundingIds[1],
      expectedRevision: revisions[1],
      patch: { ...fundingFields, status: "deleted" },
    });
    expect(byAction).toEqual({
      warnings: [{ message: "This funding still pays for 1 budget item that is not cancelled." }],
      viewDelta: 1,
      status: "deleted",
      priorStatus: "secured",
      auditDelta: 1,
      audit: [{ field_name: "status", old_value: "secured", new_value: "deleted", reason: null }],
    });
    expect(byStatus).toEqual(byAction);
  });

  it("restores from the audit trail when the remembered status is missing, otherwise falls back to applied", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string; revision: number }).id;
    const revision = (created.body as { revision: number }).revision;
    await call({
      token: "member",
      body: { action: "deleteFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision },
    });
    await sql("update finance.funding set prior_status = null where id = $1::uuid", [fundingId]);
    const fromAudit = await call({
      token: "member",
      body: { action: "restoreFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision + 1 },
    });
    expect(fromAudit.status).toBe(200);
    expect((await financing()).funding[0]?.status).toBe("secured");

    await sql(
      `insert into finance.funding (
         season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, prior_status,
         created_by_member_id, updated_by_member_id
       )
       select id, 'F-S27-009', 'Orphan source', 'Example owner', 'other', 1000, 'deleted', null, $1::uuid, $1::uuid
       from finance.seasons where code = 'S27'`,
      [operatorId],
    );
    const orphan = await sql<{ id: string; revision: number }>("select id, revision from finance.funding where public_ref = 'F-S27-009'");
    const before = await version();
    const fallback = await call({
      token: "member",
      body: {
        action: "restoreFunding",
        requestId: nextRequestId(),
        fundingId: orphan.rows[0]?.id,
        expectedRevision: orphan.rows[0]?.revision,
      },
    });
    expect(fallback.status).toBe(200);
    expect(await version()).toBe(before + 1);
    expect((await financing()).funding.find((row) => row.sourceName === "Orphan source")?.status).toBe("applied");
  });

  it("bumps the view once per mutation and replays an identical request without a second write", async () => {
    await openSeason();
    await grant("business");
    const requestId = nextRequestId();
    const before = await version();
    const first = await call({ token: "member", body: addFundingBody(requestId) });
    const second = await call({ token: "member", body: addFundingBody(requestId) });
    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await version()).toBe(before + 1);
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.funding")).rows[0]?.count).toBe("1");
    expect((await sql<{ count: string }>("select count(*)::text as count from finance.idempotency_keys")).rows[0]?.count).toBe("1");

    const conflict = await call({
      token: "member",
      body: addFundingBody(requestId, { ...fundingFields, amountNok: "50.00" }),
    });
    expect(conflict).toMatchObject({ status: 409, body: { error: "This request was already used with different details." } });
    expect(await version()).toBe(before + 1);
    expect((await financing()).funding).toHaveLength(1);
  });

  it("rejects a stale revision without changing the record or the view version", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string; revision: number }).id;
    const revision = (created.body as { revision: number }).revision;
    const firstEdit = await call({
      token: "member",
      body: { action: "editFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision, patch: { note: "First note" } },
    });
    expect(firstEdit.status).toBe(200);
    const before = await version();
    const stale = await call({
      token: "member",
      body: { action: "editFunding", requestId: nextRequestId(), fundingId, expectedRevision: revision, patch: { note: "Stale note" } },
    });
    expect(stale).toMatchObject({ status: 409, body: { error: "This record was updated by someone else. Reload the page and try again." } });
    expect(await version()).toBe(before);
    expect((await financing()).funding[0]?.note).toBe("First note");

    const part = await call({
      token: "member",
      body: {
        action: "addEarmark",
        requestId: nextRequestId(),
        expectedRevision: (firstEdit.body as { revision: number }).revision,
        part: { fundingId, purpose: "Frame work", amountNok: "10.00", spendBy: null, conditions: null },
      },
    });
    const partId = (part.body as { id: string }).id;
    await call({
      token: "member",
      body: { action: "editEarmark", requestId: nextRequestId(), partId, expectedRevision: 0, patch: { purpose: "Updated purpose" } },
    });
    const beforePart = await version();
    const stalePart = await call({
      token: "member",
      body: { action: "editEarmark", requestId: nextRequestId(), partId, expectedRevision: 0, patch: { purpose: "Stale purpose" } },
    });
    expect(stalePart.status).toBe(409);
    expect(await version()).toBe(beforePart);
    expect((await financing()).parts[0]?.purpose).toBe("Updated purpose");
  });

  it("keeps the same-season earmark rule and refuses a closed season", async () => {
    await openSeason();
    await grant("business");
    const created = await call({ token: "member", body: addFundingBody() });
    const fundingId = (created.body as { id: string }).id;
    const added = await call({
      token: "member",
      body: {
        action: "addEarmark",
        requestId: nextRequestId(),
        expectedRevision: (created.body as { revision: number }).revision,
        part: { fundingId, purpose: "Frame work", amountNok: "10.00", spendBy: null, conditions: null },
      },
    });
    const partId = (added.body as { id: string }).id;
    await sql(
      "insert into finance.seasons (code, name, start_date, end_date, created_by_member_id, updated_by_member_id) values ('S26', 'Earlier season', '2025-08-01', '2026-07-31', $1::uuid, $1::uuid)",
      [operatorId],
    );
    await sql(
      `insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
       select id, 'B-S26', 'draft', $1::uuid, $1::uuid from finance.seasons where code = 'S26'`,
      [operatorId],
    );
    await sql("insert into finance.systems (department_key, code, name) values ('mechanical-production', 'SYS-FR', 'Frame')");
    await expect(sql(
      `insert into finance.budget_items (
         budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, status, earmark_id, created_by_member_id, updated_by_member_id
       )
       select b.id, s.id, 'BI-S26-001', 'Other season tube', 'material', 1000, 'EM', 'new', 'planned', $2::uuid, $1::uuid, $1::uuid
       from finance.budgets b, finance.systems s
       where b.public_ref = 'B-S26'`,
      [operatorId, partId],
    )).rejects.toThrow(/same season/i);

    await sql("update finance.seasons set status = 'closed' where code = 'S27'");
    const before = await version();
    const closed = await call({
      token: "member",
      body: { action: "editFunding", requestId: nextRequestId(), fundingId, expectedRevision: 1, patch: { note: "Closed edit" } },
    });
    expect(closed).toMatchObject({ status: 403, body: { error: "This season is closed." } });
    expect(await version()).toBe(before);
  });

  it("requires a current season and reports a missing funding record", async () => {
    await grant("business");
    const missingSeason = await call({ token: "member", body: addFundingBody() });
    expect(missingSeason).toMatchObject({ status: 409, body: { error: "An operator has not configured the current season." } });
    await openSeason();
    const missing = await call({
      token: "member",
      body: {
        action: "editFunding",
        requestId: nextRequestId(),
        fundingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        expectedRevision: 0,
        patch: { note: "Missing" },
      },
    });
    expect(missing).toMatchObject({ status: 404, body: { error: "Funding was not found." } });
  });
});
