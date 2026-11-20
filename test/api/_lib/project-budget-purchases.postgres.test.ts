import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage } from "./project-budget-test-db.js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import {
  applyProjectBudgetMigrations,
  projectBudgetFixture as f,
  projectBudgetIdentity,
  seedProjectBudgetLegacy,
  setupProjectBudgetBase,
  type ProjectBudgetFixtureRole,
  type ProjectBudgetTestDatabase,
} from "./project-budget-test-db.js";
import {
  createMemoryFinanceStorage,
  putMemoryPdf,
} from "./finance-storage-mock.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import type { PurchaseInput } from "../../../src/features/Finance/types.js";
import { osloToday } from "../../../src/features/Finance/money.js";

const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_pba_purchase_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Client,
  pool: pg.Pool,
  close: (() => Promise<void>) | undefined,
  db: ProjectBudgetTestDatabase,
  services: ReturnType<typeof createFinanceServices>;
const storage = createMemoryFinanceStorage();
const change = (
  role: ProjectBudgetFixtureRole,
  body: Record<string, unknown>,
) => services.mutate(role, { requestId: randomUUID(), ...body });
async function project() {
  const id = randomUUID();
  await db.query(
    "insert into project_management.projects values($1::uuid,'S27','Purchase frame',array[$2::uuid],array['Mechanical & Production'],1)",
    [id, f.lead],
  );
  return id;
}
async function approved(count = 1): Promise<ProjectBudgetDetail> {
  const projectId = await project();
  const created = await change("lead", {
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: f.department,
  });
  let budget = await services.projectBudget("lead", created.id!);
  for (let index = 0; index < count; index++) {
    await change("lead", {
      action: "saveProjectBudgetEntry",
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      entry: {
        systemId: f.system,
        description: `Frame tubes ${index + 1}`,
        category: "material",
        plannedNok: "100.00",
        ordinaryPriority: "P2",
        reuseStatus: "new",
        status: "planned",
      },
    });
    budget = await services.projectBudget("lead", budget.id);
  }
  await change("lead", { action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision });
  budget = await services.projectBudget("lead",budget.id);
  budget = (await submitProjectBudgetDepartmentPackage(services,budget)).budget;
  budget = await approveProjectBudgetDepartmentPackage(services,budget);
  return budget;
}
async function upload(
  projectId: string,
  role: ProjectBudgetFixtureRole = "departmentLead",
  departmentId: string = f.department,
) {
  const bind = { projectId, responsibleDepartmentId: departmentId };
  const created = await change(role, {
    action: "authorizeProjectPurchaseUpload",
    ...bind,
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: 8,
  });
  await putMemoryPdf(storage, created.stagingKey!);
  await change(role, {
    action: "finalizeProjectPurchaseUpload",
    ...bind,
    uploadId: created.id,
  });
  return created.id!;
}
function purchase(
  uploadId: string,
  item: string | null,
  amountNok = "60.00",
): PurchaseInput {
  return {
    buyerName: "Department buyer",
    supplierName: "Supplier",
    paymentMethod: "team_account",
    purchaseDate: osloToday(),
    justification: "Frame materials",
    documentKind: "receipt",
    uploadIds: [uploadId],
    lines: [
      {
        systemId: f.system,
        budgetItemId: item,
        unbudgeted: !item,
        description: "Tube order",
        quantity: "3",
        amountNok,
      },
    ],
  };
}
async function register(
  budget: ProjectBudgetDetail,
  amount = "60.00",
  role: ProjectBudgetFixtureRole = "departmentLead",
) {
  return change(role, {
    action: "registerProjectPurchase",
    projectId: budget.projectId,
    responsibleDepartmentId: budget.responsibleDepartmentId,
    purchase: purchase(
      await upload(budget.projectId, role),
      budget.approvedVersion!.entries[0].budgetItemId,
      amount,
    ),
  });
}
async function complete(
  budget: ProjectBudgetDetail,
  complete: boolean,
  reason = "All planned materials received",
) {
  return change("departmentLead", {
    action: "setProjectBudgetCompletion",
    projectBudgetId: budget.id,
    expectedRevision: budget.revision,
    entryId: budget.approvedVersion!.entries[0].entryId,
    complete,
    reason,
  });
}

describe.skipIf(!url)("project purchase transactions on PostgreSQL", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) ||
      connection.pathname !== "/postgres"
    )
      throw new Error("Use the loopback postgres maintenance database.");
    admin = new pg.Client({ connectionString: connection.toString() });
    await admin.connect();
    await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({
      connectionString: connection.toString(),
      max: 8,
    });
    pool = resource.pool;
    close = resource.close;
    db = {
      exec: (sql) => pool.query(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pool.query(sql, params)).rows as T[],
      }),
    };
    await setupProjectBudgetBase(db);
    await seedProjectBudgetLegacy(db);
    await applyProjectBudgetMigrations(db);
    await db.query(
      "insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid),('approval_threshold_ore','1','Retired test',$1::uuid)",
      [f.head],
    );
    services = createFinanceServices({
      db,
      financeStorage: storage,
      authenticate: async (token) =>
        projectBudgetIdentity(token as ProjectBudgetFixtureRole),
    });
  }, 30000);
  afterAll(async () => {
    try {
      await close?.();
      if (admin) await admin.query(`drop database if exists ${name}`);
    } finally {
      await admin?.end();
    }
  });

  it("registers scoped partial purchases, stores stable approved provenance and treats quantity as metadata", async () => {
    const budget = await approved();
    await expect(
      services.projectPurchaseContext("lead", budget.projectId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      services.projectPurchaseContext("otherDepartmentLead", budget.projectId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(services.capabilities("departmentLead")).rejects.toMatchObject(
      { status: 403 },
    );
    const result = await register(budget);
    expect(
      (
        await db.query(
          "select project_budget_id,approved_version_id,amount_ore::text,quantity::text from finance.purchase_lines where purchase_id=$1::uuid",
          [result.id],
        )
      ).rows,
    ).toEqual([
      {
        project_budget_id: budget.id,
        approved_version_id: budget.approvedVersionId,
        amount_ore: "6000",
        quantity: "3",
      },
    ]);
    expect(
      (await services.projectBudget("lead", budget.id)).approvedVersion!
        .entries[0],
    ).toMatchObject({ actualNok: "60.00", completion: "partial" });
    expect(
      (
        await db.query(
          "select kind from finance.exception_reviews where purchase_id=$1::uuid",
          [result.id],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "select storage_key from finance.documents where purchase_id=$1::uuid",
          [result.id],
        )
      ).rows[0],
    ).toMatchObject({ storage_key: expect.stringContaining("/final/") });
  });
  it("serializes concurrent purchases, records cumulative overrun facts and replays a lost response once", async () => {
    const budget = await approved();
    const input = async () => ({
      action: "registerProjectPurchase",
      requestId: randomUUID(),
      projectId: budget.projectId,
      responsibleDepartmentId: f.department,
      purchase: purchase(
        await upload(budget.projectId),
        budget.approvedVersion!.entries[0].entryId,
      ),
    });
    const [a, b] = await Promise.all([input(), input()]);
    const saved = await Promise.all([
      services.mutate("departmentLead", a),
      services.mutate("departmentLead", b),
    ]);
    const replay = await services.mutate("departmentLead", a);
    expect(replay.id).toBe(saved[0].id);
    expect(
      (
        await db.query(
          "select sum(l.amount_ore)::text as actual,count(*)::int as count from finance.purchase_lines l where l.purchase_id=any($1::uuid[])",
          [saved.map((s) => s.id)],
        )
      ).rows,
    ).toEqual([{ actual: "12000", count: 2 }]);
    const exceptions = (
      await db.query<{
        facts: { entries: Array<{ approvedOre: string; actualOre: string }> };
      }>(
        "select facts from finance.exception_reviews where purchase_id=any($1::uuid[]) and kind='budget_overrun'",
        [saved.map((s) => s.id)],
      )
    ).rows;
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].facts.entries[0]).toMatchObject({
      approvedOre: "10000",
      actualOre: "12000",
    });
    await expect(
      services.mutate("departmentLead", { ...a, projectId: f.project }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("records unbudgeted incurred costs before project approval and rejects forged entries/systems/evidence", async () => {
    const projectId = await project();
    const bind = { projectId, responsibleDepartmentId: f.department };
    const uploadId = await upload(projectId);
    const result = await change("departmentLead", {
      action: "registerProjectPurchase",
      ...bind,
      purchase: purchase(uploadId, null, "7000"),
    });
    expect(
      (
        await db.query(
          "select project_id,responsible_department_id from finance.purchases where id=$1::uuid",
          [result.id],
        )
      ).rows[0],
    ).toEqual({
      project_id: projectId,
      responsible_department_id: f.department,
    });
    expect(
      (
        await db.query(
          "select kind from finance.exception_reviews where purchase_id=$1::uuid",
          [result.id],
        )
      ).rows,
    ).toEqual([{ kind: "unbudgeted" }]);
    expect(
      (
        await db.query(
          "select approved_version_id from finance.purchase_lines where purchase_id=$1::uuid",
          [result.id],
        )
      ).rows[0],
    ).toEqual({ approved_version_id: null });
    expect(
      (await services.projectPurchaseContext("departmentLead", projectId))
        .entries,
    ).toEqual([]);
    const outside = await approved();
    await expect(
      change("departmentLead", {
        action: "registerProjectPurchase",
        ...bind,
        purchase: purchase(
          await upload(projectId),
          outside.approvedVersion!.entries[0].entryId,
        ),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const forged = purchase(await upload(projectId), null);
    forged.lines[0].systemId = f.electronicSystem;
    await expect(
      change("departmentLead", {
        action: "registerProjectPurchase",
        ...bind,
        purchase: forged,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      change("departmentLead", {
        action: "finalizeProjectPurchaseUpload",
        projectId: outside.projectId,
        responsibleDepartmentId: f.department,
        uploadId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("records complete/reopen reasons, and new purchases and voids reopen independently of payment", async () => {
    let budget = await approved();
    await register(budget, "10");
    budget = await services.projectBudget("departmentLead", budget.id);
    await complete(budget, true);
    budget = await services.projectBudget("departmentLead", budget.id);
    expect(budget.approvedVersion!.entries[0].completion).toBe("complete");
    await complete(budget, false, "More material needed");
    budget = await services.projectBudget("departmentLead", budget.id);
    await complete(budget, true);
    const second = await register(budget, "20");
    budget = await services.projectBudget("departmentLead", budget.id);
    expect(budget.approvedVersion!.entries[0].completion).toBe("partial");
    await complete(budget, true);
    await change("head", {
      action: "voidPurchase",
      id: second.id,
      purchaseId: second.id,
      expectedRevision: 0,
      reason: "Duplicate supplier order",
    });
    budget = await services.projectBudget("departmentLead", budget.id);
    expect(budget.approvedVersion!.entries[0]).toMatchObject({
      completion: "partial",
      actualNok: "10.00",
    });
    expect(
      (
        await db.query(
          "select reason from finance.project_budget_completion where entry_id=$1::uuid",
          [budget.approvedVersion!.entries[0].entryId],
        )
      ).rows[0].reason,
    ).toContain("voided");
  });
  it("records actuals before any season ledger exists without inventing approval and protects its project history", async () => {
    const projectId = randomUUID(),
      departmentId = randomUUID();
    await db.query(
      "insert into project_management.departments(id,season,name) values($1::uuid,'S28','Mechanical & Production')",
      [departmentId],
    );
    await db.query(
      "insert into project_management.department_members values($1::uuid,$2::uuid,true)",
      [departmentId, f.departmentLead],
    );
    await db.query(
      "insert into project_management.projects values($1::uuid,'S28','Unapproved next frame',array[$2::uuid],array['Mechanical & Production'],1)",
      [projectId, f.lead],
    );
    await db.query(
      "update finance.settings set setting_value='\"S28\"' where setting_key='current_season'",
    );
    try {
      const uploadId = await upload(projectId, "departmentLead", departmentId);
      const saved = await change("departmentLead", {
        action: "registerProjectPurchase",
        projectId,
        responsibleDepartmentId: departmentId,
        purchase: purchase(uploadId, null, "8000"),
      });
      expect(
        (
          await db.query(
            "select status,approved_by_member_id,approved_on from finance.budgets where season_id=$1::uuid",
            [f.nextSeason],
          )
        ).rows,
      ).toEqual([
        { status: "draft", approved_by_member_id: null, approved_on: null },
      ]);
      expect(
        (
          await db.query(
            "select kind from finance.exception_reviews where purchase_id=$1::uuid",
            [saved.id],
          )
        ).rows,
      ).toEqual([{ kind: "unbudgeted" }]);
      await expect(
        db.query(
          "select finance.assert_project_financial_assignment($1::uuid,'S27',array['Mechanical & Production'])",
          [projectId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.query(
          "select finance.assert_project_financial_assignment($1::uuid,'S28',array['Electronics'])",
          [projectId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db.query(
        "update finance.settings set setting_value='\"S27\"' where setting_key='current_season'",
      );
    }
  });
  it("lets Finance register one purchase across several entries and rejects upload byte tampering", async () => {
    const budget = await approved(2),
      ids = budget.approvedVersion!.entries.map((e) => e.entryId);
    const input = purchase(
      await upload(budget.projectId, "finance"),
      ids[0],
      "40",
    );
    input.lines.push({
      ...input.lines[0],
      budgetItemId: ids[1],
      amountNok: "70",
      quantity: "5",
    });
    const saved = await change("finance", {
      action: "registerProjectPurchase",
      projectId: budget.projectId,
      responsibleDepartmentId: f.department,
      purchase: input,
    });
    expect(
      (
        await db.query(
          "select sum(amount_ore)::text as actual,count(*)::int as count from finance.purchase_lines where purchase_id=$1::uuid",
          [saved.id],
        )
      ).rows,
    ).toEqual([{ actual: "11000", count: 2 }]);
    const tampered = await upload(budget.projectId);
    const key = (
      await db.query<{ final_key: string }>(
        "select final_key from finance.uploads where id=$1::uuid",
        [tampered],
      )
    ).rows[0].final_key;
    storage.objects.set(key, new Uint8Array([1, 2, 3]));
    await expect(
      change("departmentLead", {
        action: "registerProjectPurchase",
        projectId: budget.projectId,
        responsibleDepartmentId: f.department,
        purchase: purchase(tampered, ids[0]),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const original = (
      await db.query(
        "select status,import_source from finance.purchases where id=$1::uuid",
        [f.importedPurchase],
      )
    ).rows[0];
    expect(original).toEqual({
      status: "registered",
      import_source: "synthetic-historical-export",
    });
  });
  it("exposes scoped reads and incurred-cost writes through the existing Finance API without broad access", async () => {
    const projectId = await project(),
      handler = createFinanceHandler(() => services);
    async function request(
      role: ProjectBudgetFixtureRole,
      method: string,
      query: Record<string, unknown>,
      body?: Record<string, unknown>,
    ) {
      let status = 0,
        result: unknown;
      const response = {
        setHeader() {},
        status(code: number) {
          status = code;
          return response;
        },
        json(value: unknown) {
          result = value;
          return response;
        },
      };
      await handler(
        {
          method,
          query,
          body,
          headers: { authorization: `Bearer ${role}` },
        } as unknown as VercelRequest,
        response as unknown as VercelResponse,
      );
      return { status, result };
    }
    expect(
      await request("departmentLead", "GET", {
        action: "projectPurchaseContext",
        projectId,
      }),
    ).toMatchObject({ status: 200, result: { entries: [] } });
    expect(
      await request("otherDepartmentLead", "GET", {
        action: "projectPurchaseContext",
        projectId,
      }),
    ).toMatchObject({ status: 403 });
    expect(
      await request("departmentLead", "GET", { action: "purchases" }),
    ).toMatchObject({ status: 403 });
    expect(
      await request(
        "departmentLead",
        "POST",
        {},
        {
          action: "registerProjectPurchase",
          requestId: randomUUID(),
          projectId,
          responsibleDepartmentId: f.department,
          purchase: purchase(await upload(projectId), null, "9000"),
        },
      ),
    ).toMatchObject({ status: 200, result: { ok: true } });
  });
  it("waits for in-flight department revocation and denies a formerly authorized upload inside its write lock", async () => {
    const projectId = await project(),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "delete from project_management.department_members where department_id=$1::uuid and member_id=$2::uuid",
        [f.department, f.departmentLead],
      );
      const outcome = upload(projectId).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await expect
        .poll(async () =>
          Number(
            (
              await pool.query(
                "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%create_project_upload_authorization%'",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      await client.query("commit");
      expect(await outcome).toMatchObject({ error: { status: 403 } });
    } finally {
      await client.query("rollback");
      client.release();
      await db.query(
        "insert into project_management.department_members values($1::uuid,$2::uuid,true) on conflict do nothing",
        [f.department, f.departmentLead],
      );
    }
  });
  it("keeps genuine legacy approval usable while its mapped candidate is still Draft", async () => {
    const created = await change("lead", {
      action: "createProjectBudget",
      projectId: f.project,
      responsibleDepartmentId: f.department,
    });
    const draft = await services.projectBudget("lead", created.id!);
    await db.query(
      "insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values($1::uuid,$2::uuid,$1::uuid,$3::uuid)",
      [f.entry, draft.id, f.lead],
    );
    await db.query(
      `insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,status)
      select $1::uuid,id,system_id,description,category,planned_ore,priority,reuse_status,status from finance.budget_items where id=$2::uuid`,
      [draft.pendingVersionId, f.entry],
    );
    expect(
      (await services.projectPurchaseContext("departmentLead", f.project))
        .entries,
    ).toMatchObject([{ entryId: f.entry, approvedVersionId: null }]);
    const legacyUpload = await change("finance", {
      action: "authorizeUpload",
      fileName: "legacy.pdf",
      contentType: "application/pdf",
      byteSize: 8,
    });
    await putMemoryPdf(storage, legacyUpload.stagingKey!);
    await change("finance", {
      action: "finalizeUpload",
      uploadId: legacyUpload.id,
    });
    const legacy = await change("finance", {
      action: "registerPurchase",
      purchase: purchase(legacyUpload.id!, f.entry, "9500"),
    });
    const scoped = await change("departmentLead", {
      action: "registerProjectPurchase",
      projectId: f.project,
      responsibleDepartmentId: f.department,
      purchase: purchase(await upload(f.project), f.entry, "10"),
    });
    expect(
      (
        await db.query(
          "select distinct project_budget_id,approved_version_id,budget_authority,legacy_budget_id,legacy_approved_on::text from finance.purchase_lines where purchase_id=any($1::uuid[])",
          [[legacy.id, scoped.id]],
        )
      ).rows,
    ).toEqual([
      {
        project_budget_id: draft.id,
        approved_version_id: null,
        budget_authority: "legacy_approved",
        legacy_budget_id: f.legacyBudget,
        legacy_approved_on: "2026-10-01",
      },
    ]);
    const reviews = (
      await db.query<{
        facts: {
          entries: Array<{ authority: string; approvedVersionId: null }>;
        };
      }>(
        "select facts from finance.exception_reviews where purchase_id=any($1::uuid[]) and kind='budget_overrun'",
        [[legacy.id, scoped.id]],
      )
    ).rows;
    expect(reviews).toHaveLength(2);
    expect(reviews[0].facts.entries[0]).toMatchObject({
      authority: "legacy_approved",
      approvedVersionId: null,
    });
    expect(
      (await services.projectBudget("lead", draft.id)).approvedVersionId,
    ).toBeNull();
  });
  it("creates one Draft ledger when two projects record the first incurred costs concurrently", async () => {
    const seasonId = randomUUID(),
      departmentId = randomUUID(),
      projects = [randomUUID(), randomUUID()];
    await db.query(
      "insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values($1::uuid,'S29','Concurrent ledger','2026-01-01','2027-12-31','active',$2::uuid,$2::uuid)",
      [seasonId, f.head],
    );
    await db.query(
      "insert into project_management.departments(id,season,name) values($1::uuid,'S29','Mechanical & Production')",
      [departmentId],
    );
    await db.query(
      "insert into project_management.department_members values($1::uuid,$2::uuid,true)",
      [departmentId, f.departmentLead],
    );
    for (const projectId of projects)
      await db.query(
        "insert into project_management.projects values($1::uuid,'S29','First actual',array[$2::uuid],array['Mechanical & Production'],1)",
        [projectId, f.lead],
      );
    await db.query(
      "update finance.settings set setting_value='\"S29\"' where setting_key='current_season'",
    );
    try {
      const inputs = await Promise.all(
        projects.map(async (projectId) => ({
          action: "registerProjectPurchase",
          requestId: randomUUID(),
          projectId,
          responsibleDepartmentId: departmentId,
          purchase: purchase(
            await upload(projectId, "departmentLead", departmentId),
            null,
            "10",
          ),
        })),
      );
      const results = await Promise.all(
        inputs.map((input) => services.mutate("departmentLead", input)),
      );
      expect(results).toHaveLength(2);
      expect(
        (
          await db.query(
            "select status,approved_on from finance.budgets where season_id=$1::uuid",
            [seasonId],
          )
        ).rows,
      ).toEqual([{ status: "draft", approved_on: null }]);
      expect(
        (
          await db.query(
            "select sum(amount_ore)::text as actual from finance.purchase_lines where purchase_id=any($1::uuid[])",
            [results.map((r) => r.id)],
          )
        ).rows,
      ).toEqual([{ actual: "2000" }]);
    } finally {
      await db.query(
        "update finance.settings set setting_value='\"S27\"' where setting_key='current_season'",
      );
    }
  });
  it("blocks generic registration behind Google unlink and refuses the expense after unlink commits", async () => {
    const authorization = await change("finance", {
      action: "authorizeUpload",
      fileName: "generic.pdf",
      contentType: "application/pdf",
      byteSize: 8,
    });
    await putMemoryPdf(storage, authorization.stagingKey!);
    await change("finance", {
      action: "finalizeUpload",
      uploadId: authorization.id,
    });
    const requestId = randomUUID(),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        'delete from neon_auth.account where "userId"=$1::uuid and "providerId"=\'google\'',
        [f.finance],
      );
      const outcome = change("finance", {
        action: "registerPurchase",
        requestId,
        purchase: purchase(authorization.id!, f.entry, "10"),
      }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await expect
        .poll(async () =>
          Number(
            (
              await pool.query(
                "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%finance.register_purchase(%'",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      await client.query("commit");
      expect(await outcome).toMatchObject({ error: { status: 403 } });
      expect(
        (
          await db.query(
            "select response from finance.idempotency_keys where member_id=$1::uuid and request_id=$2::uuid",
            [f.finance, requestId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "select purchase_id from finance.uploads where id=$1::uuid",
            [authorization.id],
          )
        ).rows,
      ).toEqual([{ purchase_id: null }]);
    } finally {
      await client.query("rollback");
      client.release();
      await db.query(
        "insert into neon_auth.account values($1::uuid,$1::uuid,'google',$2)",
        [f.finance, projectBudgetIdentity("finance").googleSub],
      );
    }
  });
  it("blocks generic void behind Finance access revocation and preserves the registered expense", async () => {
    const budget = await approved(),
      saved = await register(budget, "10"),
      requestId = randomUUID(),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "delete from identity.member_roles where member_id=$1::uuid and role_key='financials'",
        [f.finance],
      );
      const outcome = change("finance", {
        action: "voidPurchase",
        requestId,
        purchaseId: saved.id,
        expectedRevision: 0,
        reason: "Order cancelled",
      }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await expect
        .poll(async () =>
          Number(
            (
              await pool.query(
                "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%finance.void_registered_purchase(%'",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      await client.query("commit");
      expect(await outcome).toMatchObject({ error: { status: 403 } });
      expect(
        (
          await db.query(
            "select status,revision from finance.purchases where id=$1::uuid",
            [saved.id],
          )
        ).rows,
      ).toEqual([{ status: "registered", revision: 0 }]);
      expect(
        (
          await db.query(
            "select response from finance.idempotency_keys where member_id=$1::uuid and request_id=$2::uuid",
            [f.finance, requestId],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await client.query("rollback");
      client.release();
      await db.query(
        "insert into identity.member_roles values($1::uuid,'financials') on conflict do nothing",
        [f.finance],
      );
    }
  });
  it("rechecks revoked Google linkage for upload, registration replay and completion", async () => {
    let budget = await approved();
    const saved = await register(budget);
    budget = await services.projectBudget("departmentLead", budget.id);
    await db.query(
      'update neon_auth."user" set banned=true where id=$1::uuid',
      [f.departmentLead],
    );
    try {
      await expect(upload(budget.projectId)).rejects.toMatchObject({
        status: 403,
      });
      await expect(complete(budget, true)).rejects.toMatchObject({
        status: 403,
      });
      expect(saved.id).toBeTruthy();
    } finally {
      await db.query(
        'update neon_auth."user" set banned=false where id=$1::uuid',
        [f.departmentLead],
      );
    }
  });
});
