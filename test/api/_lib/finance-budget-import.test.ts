import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type {
  ProjectBudgetDetail,
  ProjectBudgetImportPreview,
  ProjectBudgetMutationResult,
} from "../../../src/features/Finance/project-budget-types.js";
import {
  applyProjectBudgetMigrations,
  submitProjectBudgetDepartmentPackage,
  projectBudgetFixture as f,
  projectBudgetIdentity,
  seedProjectBudgetLegacy,
  setupProjectBudgetBase,
  type ProjectBudgetFixtureRole,
  type ProjectBudgetTestDatabase,
} from "./project-budget-test-db.js";

// Coverage remap from retired department import:
// - Stable IDs/optional fields/lost-response replay: project-budget-revisions.test.ts.
// - Stale/source/catalog tokens and scope/priority: same suite and PostgreSQL races.
// - Approved edits now require a candidate and both decisions; no note-only bypass.
// - Spent-entry omission/history: revision and purchase-revision suites.
// Retain independent UTF-8/row/response limits, SQL atomicity, earmark full-result
// safety and public API retirement here against the actual scoped import workflow.
let pg: PGlite,
  db: ProjectBudgetTestDatabase,
  services: ReturnType<typeof createFinanceServices>,
  handler: ReturnType<typeof createFinanceHandler>,
  budget: ProjectBudgetDetail;
const csv = "system_id;description;planned_nok;note\nSYS-FR;Frame;1000;first";
async function call(
  role: ProjectBudgetFixtureRole,
  body: Record<string, unknown>,
) {
  let status = 0,
    value: unknown;
  const response = {
    setHeader() {},
    status(code: number) {
      status = code;
      return response;
    },
    json(body: unknown) {
      value = body;
      return response;
    },
  };
  await pg.exec("savepoint api_call");
  try {
    await handler(
      {
        method: "POST",
        query: {},
        body: { requestId: randomUUID(), ...body },
        headers: { authorization: `Bearer ${role}` },
      } as unknown as VercelRequest,
      response as unknown as VercelResponse,
    );
    if (status >= 400) await pg.exec("rollback to savepoint api_call");
    await pg.exec("release savepoint api_call");
    return {
      status,
      body: value as ProjectBudgetMutationResult & {
        error?: string;
        importPreview?: ProjectBudgetImportPreview;
      },
    };
  } catch (error) {
    await pg.exec("rollback to savepoint api_call; release savepoint api_call");
    throw error;
  }
}
async function mutate(
  action: string,
  extra: Record<string, unknown> = {},
  role: ProjectBudgetFixtureRole = "lead",
) {
  const result = await call(role, {
    action,
    projectBudgetId: budget.id,
    expectedRevision: budget.revision,
    ...extra,
  });
  if (result.status === 200 && action !== "previewProjectBudgetImport")
    budget = await services.projectBudget("lead", budget.id);
  return result;
}
async function preview(source = csv) {
  const result = await mutate("previewProjectBudgetImport", { csv: source });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.importPreview!;
}
async function apply(
  source: string,
  prepared: ProjectBudgetImportPreview,
  requestId = randomUUID(),
) {
  return mutate("importProjectBudgetEntries", {
    csv: source,
    requestId,
    expectedRevision: prepared.candidateRevision,
    previewToken: prepared.previewToken,
  });
}
async function snapshot() {
  return (
    await db.query(`select jsonb_build_object('headers',(select jsonb_agg(to_jsonb(h) order by h.id) from finance.project_budgets h),
    'entries',(select jsonb_agg(to_jsonb(e) order by e.id) from finance.project_budget_entries e),
    'candidate',(select jsonb_agg(to_jsonb(e) order by e.entry_id) from finance.project_budget_version_entries e),
    'decisions',(select jsonb_agg(to_jsonb(d) order by d.id) from finance.project_budget_decisions d),
    'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from finance.audit_log a),
    'idempotency',(select jsonb_agg(to_jsonb(i) order by i.request_id) from finance.idempotency_keys i),
    'version',(select version from finance.view_versions where singleton)) as snapshot`)
  ).rows;
}
async function approve() {
  expect((await mutate("submitProjectBudget")).status).toBe(200);
  budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget;
  expect((await approvePackage()).status).toBe(200);
}
async function approvePackage() {
  const packet = (await services.departmentBudgetPackages("head", budget.responsibleDepartmentId)).packages.find(packet => packet.status === "finance_pending")!;
  const result = await call("head", { action: "approveDepartmentBudgetPackage", packageId: packet.id, expectedRevision: packet.revision });
  if (result.status === 200) budget = await services.projectBudget("lead", budget.id);
  return result;
}
beforeAll(async () => {
  pg = new PGlite();
  db = {
    exec: (sql) => pg.exec(sql),
    query: async <T>(sql: string, params?: unknown[]) => ({
      rows: (await pg.query<T>(sql, params)).rows,
    }),
  };
  await setupProjectBudgetBase(db);
  await seedProjectBudgetLegacy(db);
  await applyProjectBudgetMigrations(db);
  services = createFinanceServices({
    db,
    authenticate: async (role) =>
      projectBudgetIdentity(role as ProjectBudgetFixtureRole),
  });
  handler = createFinanceHandler(() => services);
}, 30000);
beforeEach(async () => {
  await pg.exec("begin");
  const created = await services.mutate("lead", {
    action: "createProjectBudget",
    requestId: randomUUID(),
    projectId: f.project,
    responsibleDepartmentId: f.department,
  });
  budget = await services.projectBudget("lead", created.id!);
});
afterEach(() => pg.exec("rollback"));
afterAll(() => pg.close());
describe("scoped project CSV import and retired department endpoints", () => {
  it.each(["previewImport", "importItems"])(
    "rejects retired %s without writing even for Head of Finance",
    async (action) => {
      const before = await snapshot();
      expect(
        (
          await call("head", {
            action,
            departmentKey: "mechanical-production",
            csv,
            expectedRevision: 0,
            previewToken: "a".repeat(64),
          })
        ).status,
      ).toBe(400);
      expect(await snapshot()).toEqual(before);
    },
  );
  it("previews deterministically without writes, retains identity and replays an applied CSV once", async () => {
    const before = await snapshot(),
      first = await preview();
    expect(first.errors).toEqual([]);
    expect(first.counts.added).toBe(1);
    expect(first.totalNok).toBe("1000.00");
    expect(await snapshot()).toEqual(before);
    expect(await preview()).toEqual(first);
    const requestId = randomUUID();
    expect((await apply(csv, first, requestId)).status).toBe(200);
    const id = budget.pendingVersion!.entries[0].entryId;
    expect(budget.pendingVersion!.entries[0]).toMatchObject({
      note: "first",
      plannedNok: "1000.00",
    });
    const saved = await snapshot();
    expect((await apply(csv, first, requestId)).body.replayed).toBe(true);
    expect(await snapshot()).toEqual(saved);
    const changed =
      "system_id;description;planned_nok\nSYS-FR; FRAME ;2000\nSYS-FR;Brake;10";
    expect((await apply(changed, await preview(changed))).status).toBe(200);
    expect(
      budget.pendingVersion!.entries.find((e) => e.entryId === id),
    ).toMatchObject({ plannedNok: "2000.00", note: "first" });
    expect(budget.approvedVersionId).toBeNull();
    expect((await apply(csv, await preview())).status).toBe(200);
    expect(
      budget.pendingVersion!.entries.find((e) => e.description === "Brake"),
    ).toMatchObject({ removed: true });
  });
  it("bounds UTF-8 input and nonblank CSV data rows without modifying the candidate", async () => {
    const before = await snapshot(),
      header = "system_id;description;planned_nok\n";
    for (const source of [
      header + "SYS-FR;" + "ø".repeat(131072) + ";1",
      header +
        Array.from({ length: 501 }, (_, i) => `SYS-FR;Entry ${i};1`).join("\n"),
    ]) {
      const result = await mutate("previewProjectBudgetImport", {
        csv: source,
      });
      expect(result.status).toBe(413);
      expect(await snapshot()).toEqual(before);
    }
  });
  it("rejects oversized previews from large historical notes without exceeding the response limit", async () => {
    await db.query(
      `insert into finance.project_budget_entries(id,project_budget_id,created_by_member_id)
      select gen_random_uuid(),$1::uuid,$2::uuid from generate_series(1,280)`,
      [budget.id, f.lead],
    );
    await db.query(
      `insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,status,note)
      select $1::uuid,e.id,$2::uuid,'Old '||row_number() over(order by e.id),'other',1,'P2','new','planned',repeat('ø',2000)
      from finance.project_budget_entries e where e.project_budget_id=$3::uuid`,
      [budget.pendingVersionId, f.system, budget.id],
    );
    const before = await snapshot(),
      result = await mutate("previewProjectBudgetImport", { csv });
    expect(result.status).toBe(413);
    expect(result.body.error).toContain("1 MiB");
    expect(await snapshot()).toEqual(before);
  });
  it("rejects invalid CSV, foreign scope, changed source and stale previews without writes", async () => {
    const before = await snapshot(),
      bad =
        "system_id;description;planned_nok\nSYS-EL;Foreign;10\nSYS-FR;Bad;not-money";
    const invalid = await preview(bad);
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect((await apply(bad, invalid)).status).toBe(400);
    expect(await snapshot()).toEqual(before);
    const valid = await preview();
    expect((await apply(csv + " ", valid)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await mutate(
          "previewProjectBudgetImport",
          { csv },
          "otherDepartmentLead",
        )
      ).status,
    ).toBe(403);
    expect(
      (await mutate("previewProjectBudgetImport", { csv }, "finance")).status,
    ).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await mutate("saveProjectBudgetEntry", {
          entry: {
            systemId: f.system,
            description: "Manual",
            category: "other",
            plannedNok: "1",
            ordinaryPriority: "P2",
            reuseStatus: "new",
            status: "planned",
          },
        })
      ).status,
    ).toBe(200);
    const current = await snapshot();
    expect((await apply(csv, valid)).status).toBe(409);
    expect(await snapshot()).toEqual(current);
  });
  it("rolls back every prior candidate row, audit and version if a later SQL import row fails", async () => {
    const before = await snapshot(),
      token = (
        await db.query<{ token: string }>(
          "select finance.project_budget_import_snapshot_token($1::uuid) as token",
          [budget.id],
        )
      ).rows[0].token;
    const desired = {
      entryId: null,
      systemId: f.system,
      description: "Good",
      category: "other",
      plannedOre: "100",
      ordinaryPriority: "P2",
      reuseStatus: "new",
      expectedPurchaseDate: null,
      ownerMemberId: null,
      ownerEmail: null,
      status: "planned",
      note: null,
      earmarkId: null,
    };
    const body = {
      action: "importProjectBudgetEntries",
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      snapshotToken: token,
      entries: [
        desired,
        { ...desired, description: "Invalid later row", plannedOre: "-1" },
      ],
    };
    await pg.exec("savepoint atomic_import");
    try {
      await expect(
        db.query(
          "select finance.mutate_project_budget($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb)",
          [
            f.lead,
            projectBudgetIdentity("lead").googleSub,
            projectBudgetIdentity("lead").email,
            randomUUID(),
            "a".repeat(64),
            JSON.stringify(body),
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await pg.exec(
        "rollback to savepoint atomic_import; release savepoint atomic_import",
      );
    }
    expect(await snapshot()).toEqual(before);
  });
  it("keeps spent identities and invoices when CSV reduces or omits their candidate plan", async () => {
    expect(
      (
        await mutate("adoptProjectBudgetEntries", {
          entries: [{ budgetItemId: f.entry }],
        })
      ).status,
    ).toBe(200);
    const history = (
      await db.query(
        "select id,amount_ore::text from finance.allocations where budget_item_id=$1::uuid",
        [f.entry],
      )
    ).rows;
    const document = (
      await db.query(
        "select id,storage_key from finance.documents where id=$1::uuid",
        [f.document],
      )
    ).rows;
    const reduced = "system_id;description;planned_nok\nSYS-FR;Steel;900",
      proposal = await preview(reduced);
    expect(proposal.rows[0]).toMatchObject({
      actualNok: "1200.00",
      after: { planned_nok: "900.00" },
    });
    expect((await apply(reduced, proposal)).status).toBe(200);
    const removed = "system_id;description;planned_nok\nSYS-FR;Brake;10";
    expect(
      (await preview(removed)).rows.find((r) => r.kind === "removed"),
    ).toMatchObject({ actualNok: "1200.00" });
    expect((await apply(removed, await preview(removed))).status).toBe(200);
    expect(
      budget.pendingVersion!.entries.find((e) => e.entryId === f.entry),
    ).toMatchObject({ removed: true, actualNok: "1200.00" });
    expect(
      (
        await db.query(
          "select planned_ore::text from finance.effective_budget_entries where id=$1::uuid",
          [f.entry],
        )
      ).rows,
    ).toEqual([{ planned_ore: "1000000" }]);
    expect(
      (
        await db.query(
          "select id,amount_ore::text from finance.allocations where budget_item_id=$1::uuid",
          [f.entry],
        )
      ).rows,
    ).toEqual(history);
    expect(
      (
        await db.query(
          "select id,storage_key from finance.documents where id=$1::uuid",
          [f.document],
        )
      ).rows,
    ).toEqual(document);
  });
  it("checks restricted funding across the promoted result and can move its candidate link safely", async () => {
    const linked = (
      await db.query<{ id: string }>(
        "insert into finance.systems(department_key,code,name) values('mechanical-production','SYS-LV','Linkage') returning id",
      )
    ).rows[0].id;
    const funding = (
      await db.query<{ id: string }>(
        `insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,'F-S27-009','Source','Owner','grant',100000,'secured',$2::uuid,$2::uuid) returning id`,
        [f.season, f.head],
      )
    ).rows[0].id;
    await db.query(
      "insert into finance.funding_parts(funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,'FE-009','Restricted',100000,$2::uuid,$2::uuid)",
      [funding, f.head],
    );
    const split =
      "system_id;description;planned_nok;priority;earmark_id\nSYS-FR;Frame;10;P2;FE-009\nSYS-LV;Linkage;10;P2;FE-009";
    expect((await apply(split, await preview(split))).status).toBe(200);
    expect((await mutate("submitProjectBudget")).status).toBe(200);
    budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget;
    const before = await snapshot();
    expect((await approvePackage()).status).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect(budget.approvedVersionId).toBeNull();
    expect(
      (
        await mutate(
          "returnProjectBudget",
          { reason: "Use one system" },
          "head",
        )
      ).status,
    ).toBe(200);
    const moved =
      "system_id;description;planned_nok;priority;earmark_id\nSYS-LV;Linkage;10;P2;FE-009";
    expect((await apply(moved, await preview(moved))).status).toBe(200);
    await approve();
    expect(
      (
        await db.query(
          "select system_id from finance.effective_budget_entries where project_budget_id=$1::uuid and status<>'cancelled'",
          [budget.id],
        )
      ).rows,
    ).toEqual([{ system_id: linked }]);
  });
});
