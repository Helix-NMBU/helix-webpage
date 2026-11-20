import { bootstrapFinanceFeature } from "./finance-feature-bootstrap.js";
import { seedHistoricalSeasonBudget } from "./finance-historical-fixture.js";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { PublicBudgets } from "../../../api/_lib/finance-types.js";
import {
  MemberCvError,
  type CvDatabase,
  type WorkspaceIdentity,
} from "../../../api/_lib/member-cv-service.js";

const operatorId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const headId = "33333333-3333-4333-8333-333333333333";
const financeId = "66666666-6666-4666-8666-666666666666";

const identities: Record<string, WorkspaceIdentity> = {
  operator: {
    userId: operatorId,
    googleSub: "operator-sub",
    email: "operator@example.test",
    name: "Operator Example",
  },
  member: {
    userId: memberId,
    googleSub: "member-sub",
    email: "member@example.test",
    name: "Member Example",
  },
  head: {
    userId: headId,
    googleSub: "head-sub",
    email: "head@example.test",
    name: "Head Example",
  },
  finance: {
    userId: financeId,
    googleSub: "finance-sub",
    email: "finance@example.test",
    name: "Finance Example",
  },
};

let pg: PGlite;
let handler: ReturnType<typeof createFinanceHandler>;
let sequence = 0;

function response() {
  let status = 0;
  let body: unknown;
  const res = {
    setHeader: () => {},
    status: (code: number) => {
      status = code;
      return res;
    },
    json: (value: unknown) => {
      body = value;
      return res;
    },
  };
  return {
    res: res as unknown as VercelResponse,
    result: () => ({ status, body }),
  };
}

async function call(token: string, body: Record<string, unknown>) {
  const wrapped = response();
  await handler(
    {
      method: "POST",
      query: {},
      body,
      headers: { authorization: `Bearer ${token}` },
    } as unknown as VercelRequest,
    wrapped.res,
  );
  return wrapped.result();
}

async function read(token: string, action = "budgets") {
  const wrapped = response();
  await handler(
    {
      method: "GET",
      query: { action },
      body: undefined,
      headers: { authorization: `Bearer ${token}` },
    } as unknown as VercelRequest,
    wrapped.res,
  );
  return wrapped.result();
}

async function sql<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  const result = await pg.query(text, params);
  return result.rows as T[];
}

function requestId() {
  sequence += 1;
  return `77777777-7777-4777-8777-${String(sequence).padStart(12, "0")}`;
}

async function version() {
  const rows = await sql<{ version: string }>(
    "select version::text as version from finance.view_versions",
  );
  return rows[0]?.version ?? "0";
}

async function grant(member: string, profile: string) {
  await sql(
    "select finance.set_member_grant($1::uuid, $2::uuid, $3, true, 'Test profile')",
    [operatorId, member, profile],
  );
}

async function season() {
  await sql(
    "select finance.configure_current_season($1::uuid, 'S27', 'Planning season', '2026-08-01', '2027-07-31')",
    [operatorId],
  );
  await sql(
    `insert into finance.systems (department_key, code, name, active) values
      ('mechanical-production', 'SYS-FR', 'Frame', true),
      ('mechanical-production', 'SYS-LV', 'Linkage', false),
      ('finance', 'SYS-TR', 'Travel', true)`,
  );
}

async function counters() {
  return sql<{
    counter_key: string;
    configured_next: string;
    last_issued: string | null;
  }>(
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
  await pg.exec(
    readFileSync(
      new URL("../../../db/migrations/011_finance_core.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/012_finance_season_budgets.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/013_finance_funding.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/014_finance_register_purchases.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/015_finance_requests.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/016_finance_fulfillment.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../../db/migrations/018_finance_unpaid_voids_reviews.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await bootstrapFinanceFeature(pg);
  const db: CvDatabase = {
    query: async <T>(query: string, params?: unknown[]) => ({
      rows: (await pg.query<T>(query, params)).rows,
    }),
  };
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
    alter table finance.project_budget_decisions disable trigger user;
    alter table finance.funding_application_events disable trigger user;
    update finance.requests set submitted_revision_id = null, approved_revision_id = null;
    truncate table
      finance.department_budget_package_decisions, finance.department_budget_package_members, finance.department_budget_packages, finance.invoice_retry_requests, finance.invoice_transfer_events, finance.invoice_transfers, finance.funding_application_events, finance.funding_budget_proposals, finance.budget_obligations, finance.funding_applications, finance.project_budget_completion, finance.project_budget_decisions, finance.project_budget_version_entries, finance.project_budget_entries, finance.project_budget_versions, finance.project_budgets, finance.upload_final_candidates, finance.outbox_attempts, finance.export_objects,
      finance.allocations, finance.purchase_lines, finance.outlay_reimbursements, finance.invoice_obligations,
      finance.documents, finance.uploads, finance.exception_reviews, finance.purchases,
      finance.request_draft_lines, finance.request_lines, finance.request_decisions, finance.request_revisions, finance.requests,
      finance.budget_items, finance.budgets, finance.funding_parts, finance.funding, finance.systems,
      finance.seasons, finance.idempotency_keys, finance.outbox, finance.member_grants, finance.settings,
      finance.reference_counters, finance.audit_log
    restart identity;
    alter table finance.audit_log enable trigger user;
    alter table finance.project_budget_decisions enable trigger user;
    alter table finance.funding_application_events enable trigger user;
    update finance.view_versions set version = 0 where singleton;
  `);
});

afterAll(async () => {
  await pg.close();
});

// Active manual validation/two-step decisions moved to project-budget-approval.test.ts.
// Candidate stale writes, omission/history, restricted funding and atomic revisions
// are covered by project-budget-revisions.test.ts and its PostgreSQL companion.
// This suite retains historical read privacy and asserts that raw season writes retire.
async function historicalItem(
  description = "Frame tube",
  plannedOre = "2000",
  earmarkId: string | null = null,
  note: string | null = null,
  status = "planned",
) {
  return (
    await sql<{ id: string }>(
      `insert into finance.budget_items(
    budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,earmark_id,note,created_by_member_id,updated_by_member_id)
    select b.id,s.id,'BI-S27-'||lpad((10+(select count(*) from finance.budget_items where not protected))::text,3,'0'),$2,'material',$3::bigint,
      case when $4::uuid is null then 'P2' else 'EM' end,'new',$6,$4::uuid,$5,$1::uuid,$1::uuid
    from finance.budgets b cross join finance.systems s where s.code='SYS-FR' returning id`,
      [headId, description, plannedOre, earmarkId, note, status],
    )
  )[0].id;
}
async function historicalActual(itemId: string) {
  await pg.exec("begin");
  try {
    const purchase = (
      await sql<{ id: string }>(
        `insert into finance.purchases(season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind)
    select season_id,$1::uuid,'2026-0042','registered','Private buyer','Hidden Supplier','team_account','2026-10-01','Workshop material','receipt' from finance.budgets returning id`,
        [memberId],
      )
    )[0].id;
    const line = (
      await sql<{ id: string }>(
        `insert into finance.purchase_lines(purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
    select $1::uuid,'2026-0042-L1',system_id,id,'Tube',3,900 from finance.budget_items where id=$2::uuid returning id`,
        [purchase, itemId],
      )
    )[0].id;
    await sql(
      "insert into finance.allocations(line_id,budget_item_id,public_ref,amount_ore) values($1::uuid,$2::uuid,'2026-0042-L1-A1',900)",
      [line, itemId],
    );
    await pg.exec("commit");
  } catch (error) {
    await pg.exec("rollback");
    throw error;
  }
}
async function initialized(approved = true) {
  await season();
  await grant(headId, "head_of_finance");
  await grant(financeId, "finance");
  await seedHistoricalSeasonBudget(sql, headId, approved);
}
async function snapshot() {
  return {
    version: await version(),
    counters: await counters(),
    budgets: await sql("select * from finance.budgets order by id"),
    items: await sql("select * from finance.budget_items order by id"),
    audit: await sql("select * from finance.audit_log order by id"),
    outbox: await sql("select * from finance.outbox order by id"),
    requests: await sql(
      "select * from finance.idempotency_keys order by request_id",
    ),
  };
}
describe("retained season budget history", () => {
  it.each([
    "createBudget",
    "approveBudget",
    "addItem",
    "editItem",
    "cancelItem",
    "restoreItem",
  ])(
    "rejects retired %s without changing history, counters, audit or view",
    async (action) => {
      await initialized();
      const id = await historicalItem();
      const systemId = (
        await sql<{ id: string }>(
          "select id from finance.systems where code='SYS-FR'",
        )
      )[0].id;
      const before = await snapshot();
      const result = await call("head", {
        action,
        requestId: requestId(),
        expectedRevision: 0,
        itemId: id,
        item: {
          systemId,
          description: "New plan",
          plannedNok: "10",
          priority: "P2",
        },
        patch: { plannedNok: "1" },
        reason: "Update plan",
      });
      expect(result).toMatchObject({
        status: 409,
        body: { error: expect.stringContaining("project Draft") },
      });
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await call("member", {
            action,
            requestId: requestId(),
            expectedRevision: 0,
            itemId: id,
          })
        ).status,
      ).toBe(403);
      expect(await snapshot()).toEqual(before);
    },
  );
  it("cannot create an approved season through the retired creation endpoint even when no ledger exists", async () => {
    await season();
    await grant(headId, "head_of_finance");
    const before = await snapshot();
    expect(
      (await call("head", { action: "createBudget", requestId: requestId() }))
        .status,
    ).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect(await sql("select id from finance.budgets")).toEqual([]);
  });
  it("keeps historical approval actor/date and refuses reapproval", async () => {
    await initialized();
    const before = await snapshot();
    expect(
      (
        await sql(
          "select status,approved_by_member_id,approved_on::text from finance.budgets",
        )
      )[0],
    ).toEqual({
      status: "approved",
      approved_by_member_id: headId,
      approved_on: "2026-10-01",
    });
    expect(
      (
        await call("head", {
          action: "approveBudget",
          requestId: requestId(),
          expectedRevision: 0,
        })
      ).status,
    ).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  it("retains cancelled identity, original plan and actuals while raw restore remains retired", async () => {
    await initialized();
    const id = await historicalItem(
      "Frame tube",
      "5000",
      null,
      null,
      "cancelled",
    );
    await historicalActual(id);
    const body = (await read("finance")).body as PublicBudgets;
    const rows = body.departments
      .flatMap((d) => d.systems)
      .flatMap((s) => s.items);
    expect(rows.find((i) => i.id === id)).toMatchObject({
      plannedNok: "50.00",
      effectivePlanNok: "0.00",
      actualNok: "9.00",
      differenceNok: "-9.00",
      status: "cancelled",
    });
    const before = await snapshot();
    expect(
      (
        await call("finance", {
          action: "restoreItem",
          requestId: requestId(),
          expectedRevision: 0,
          itemId: id,
        })
      ).status,
    ).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  it("keeps protected zero-plan anchors and ensures one for a newly active system", async () => {
    await initialized();
    const existing = (
      await sql<{ id: string; system_id: string }>(
        "select id,system_id from finance.budget_items where public_ref='BI-S27-FR-UNALLOC'",
      )
    )[0];
    const reused = await call("finance", {
      action: "ensureUnallocated",
      requestId: requestId(),
      systemId: existing.system_id,
    });
    expect(reused).toMatchObject({ status: 200, body: { id: existing.id } });
    await sql("update finance.systems set active=true where code='SYS-LV'");
    const system = (
      await sql<{ id: string }>(
        "select id from finance.systems where code='SYS-LV'",
      )
    )[0].id;
    const created = await call("finance", {
      action: "ensureUnallocated",
      requestId: requestId(),
      systemId: system,
    });
    expect(created.status).toBe(200);
    expect(
      await sql(
        "select public_ref,planned_ore::text,protected from finance.budget_items where system_id=$1::uuid",
        [system],
      ),
    ).toEqual([
      { public_ref: "BI-S27-LV-UNALLOC", planned_ore: "0", protected: true },
    ]);
    await call("finance", {
      action: "ensureUnallocated",
      requestId: requestId(),
      systemId: system,
    });
    expect(
      await sql(
        "select count(*)::int as count from finance.budget_items where system_id=$1::uuid",
        [system],
      ),
    ).toEqual([{ count: 1 }]);
    const before = await snapshot();
    expect(
      (
        await call("head", {
          action: "editItem",
          requestId: requestId(),
          expectedRevision: 0,
          itemId: existing.id,
          patch: { plannedNok: "10" },
        })
      ).status,
    ).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
  it("does not lock an existing unallocated anchor in the retained ensure helper", async () => {
    const source = (
      await sql<{ prosrc: string }>(
        "select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname='ensure_unallocated_item'",
      )
    )[0].prosrc.toLowerCase();
    const itemRead = source.indexOf("from finance.budget_items");
    expect(itemRead).toBeGreaterThan(-1);
    expect(source.slice(itemRead)).not.toContain("for update");
    await initialized();
    const item = (
      await sql<{ id: string; system_id: string }>(
        "select id,system_id from finance.budget_items where public_ref='BI-S27-FR-UNALLOC'",
      )
    )[0];
    expect(
      await call("finance", {
        action: "ensureUnallocated",
        requestId: requestId(),
        systemId: item.system_id,
      }),
    ).toMatchObject({ status: 200, body: { id: item.id } });
  });
  it("shows member plan/actual/difference while hiding private purchase, funding and item fields", async () => {
    await initialized();
    const funding = (
      await sql<{ id: string }>(
        `insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id)
      select id,'F-S27-001','Example source','Example owner','other',100000,'secured',$1::uuid,$1::uuid from finance.seasons returning id`,
        [headId],
      )
    )[0].id;
    const part = (
      await sql<{ id: string }>(
        "insert into finance.funding_parts(funding_id,public_ref,purpose,amount_ore,conditions,created_by_member_id,updated_by_member_id) values($1::uuid,'FE-001','Frame work',80000,'private condition',$2::uuid,$2::uuid) returning id",
        [funding, headId],
      )
    )[0].id;
    const id = await historicalItem(
      "Frame tube",
      "2000",
      part,
      "private item note",
    );
    await historicalActual(id);
    const member = (await read("member")).body as PublicBudgets;
    const item = member.departments
      .flatMap((d) => d.systems)
      .flatMap((s) => s.items)
      .find((i) => i.id === id);
    expect(item).toMatchObject({
      plannedNok: "20.00",
      actualNok: "9.00",
      differenceNok: "11.00",
      earmarkPurpose: "Frame work",
    });
    const publicJson = JSON.stringify(member);
    for (const secret of [
      "private item note",
      "private condition",
      "Example source",
      "Hidden Supplier",
      "Private buyer",
    ])
      expect(publicJson).not.toContain(secret);
    expect(publicJson).toContain("BI-S27-FR-UNALLOC");
    const privateJson = JSON.stringify((await read("finance")).body);
    for (const detail of [
      "private item note",
      "private condition",
      "Example source",
    ])
      expect(privateJson).toContain(detail);
    await sql(
      "update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null",
    );
    const hidden = JSON.stringify((await read("member")).body);
    expect(hidden).not.toContain("Frame tube");
    expect(hidden).not.toContain("private item note");
  });
  it("hides prospect/deleted earmark details from members and retains financing visibility", async () => {
    await initialized();
    for (const [index, status] of [
      [10, "prospect"],
      [11, "secured"],
    ] as const) {
      const funding = (
        await sql<{ id: string }>(
          `insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id)
        select id,$2,$3,'Owner','other',20000,$4,$1::uuid,$1::uuid from finance.seasons returning id`,
          [headId, `F-S27-0${index}`, `Source ${index}`, status],
        )
      )[0].id;
      const part = (
        await sql<{ id: string }>(
          "insert into finance.funding_parts(funding_id,public_ref,purpose,amount_ore,conditions,created_by_member_id,updated_by_member_id) values($1::uuid,$2,$3,1234,$4,$5::uuid,$5::uuid) returning id",
          [
            funding,
            `FE-0${index}`,
            `Work ${index}`,
            `Condition ${index}`,
            headId,
          ],
        )
      )[0].id;
      await historicalItem(`Tube ${index}`, "1000", part);
    }
    await sql(
      "update finance.funding set status='deleted' where public_ref='F-S27-011'",
    );
    const member = (await read("member")).body as PublicBudgets;
    const items = member.departments
      .flatMap((d) => d.systems)
      .flatMap((s) => s.items);
    for (const i of items.filter((i) => i.description.startsWith("Tube")))
      expect(i).toMatchObject({ earmarkPurpose: null, earmarkAmountNok: null });
    for (const secret of [
      "Work 10",
      "Work 11",
      "Source 10",
      "Source 11",
      "Condition 10",
      "Condition 11",
    ])
      expect(JSON.stringify(member)).not.toContain(secret);
    const privateJson = JSON.stringify((await read("finance")).body);
    for (const detail of [
      "Work 10",
      "Work 11",
      "Source 10",
      "Source 11",
      "Condition 10",
      "Condition 11",
    ])
      expect(privateJson).toContain(detail);
  });
});
