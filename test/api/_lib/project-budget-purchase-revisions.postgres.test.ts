import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import type { PurchaseInput } from "../../../src/features/Finance/types.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import {
  createMemoryFinanceStorage,
  putMemoryPdf,
} from "./finance-storage-mock.js";
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

const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_purchase_revision_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Client,
  pool: pg.Pool,
  close: (() => Promise<void>) | undefined,
  db: ProjectBudgetTestDatabase;
let services: ReturnType<typeof createFinanceServices>;
const storage = createMemoryFinanceStorage();
const failures: Array<{ code?: string; constraint?: string; message: string }> =
  [];
function database(connection: Pick<pg.PoolClient, "query">): CvDatabase {
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      try {
        return { rows: (await connection.query(sql, params)).rows as T[] };
      } catch (error) {
        const value = error as {
          code?: string;
          constraint?: string;
          message: string;
        };
        failures.push({
          code: value.code,
          constraint: value.constraint,
          message: value.message,
        });
        throw error;
      }
    },
  };
}
function service(connection: CvDatabase) {
  return createFinanceServices({
    db: connection,
    financeStorage: storage,
    authenticate: async (token) =>
      projectBudgetIdentity(token as ProjectBudgetFixtureRole),
  });
}
const change = (
  role: ProjectBudgetFixtureRole,
  body: Record<string, unknown>,
  instance = services,
) => instance.mutate(role, { requestId: randomUUID(), ...body });
const entry = {
  systemId: f.system,
  description: "Revision frame tubes",
  category: "material",
  plannedNok: "100",
  ordinaryPriority: "P2",
  reuseStatus: "new",
  status: "planned",
};
async function write(
  budget: ProjectBudgetDetail,
  role: ProjectBudgetFixtureRole,
  action: string,
  fields: Record<string, unknown> = {},
) {
  await change(role, {
    action,
    projectBudgetId: budget.id,
    expectedRevision: budget.revision,
    ...fields,
  });
  return services.projectBudget("lead", budget.id);
}
async function approved() {
  const projectId = randomUUID();
  await db.query(
    "insert into project_management.projects values($1::uuid,'S27','Purchase revision race',array[$2::uuid],array['Mechanical & Production'],1)",
    [projectId, f.lead],
  );
  const created = await change("lead", {
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: f.department,
  });
  let budget = await services.projectBudget("lead", created.id!);
  for (const [role, action, extra] of [
    ["lead", "saveProjectBudgetEntry", { entry }],
    ["lead", "submitProjectBudget", {}],
    ["departmentLead", "approveDepartmentBudget", {}],
    ["head", "approveProjectBudget", {}],
  ] as const)
    budget = await write(budget, role, action, extra);
  return budget;
}
async function registration(
  budget: ProjectBudgetDetail,
  amountNok: string,
  invoice = false,
) {
  const binding = {
    projectId: budget.projectId,
    responsibleDepartmentId: budget.responsibleDepartmentId,
  };
  const authorized = await change("departmentLead", {
    action: "authorizeProjectPurchaseUpload",
    ...binding,
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: 8,
  });
  await putMemoryPdf(storage, authorized.stagingKey!);
  await change("departmentLead", {
    action: "finalizeProjectPurchaseUpload",
    ...binding,
    uploadId: authorized.id,
  });
  const purchase: PurchaseInput = {
    buyerName: "Department buyer",
    supplierName: "Supplier",
    paymentMethod: invoice ? "invoice" : "team_account",
    purchaseDate: osloToday(),
    justification: "Materials for frame",
    documentKind: invoice ? "invoice" : "receipt",
    ...(invoice ? { invoiceDueDate: osloToday() } : {}),
    uploadIds: [authorized.id!],
    lines: [
      {
        systemId: f.system,
        budgetItemId:
          budget.approvedVersion?.entries[0].entryId ??
          budget.pendingVersion!.entries[0].entryId,
        description: "Frame order",
        quantity: "3",
        amountNok,
      },
    ],
  };
  return {
    action: "registerProjectPurchase",
    requestId: randomUUID(),
    ...binding,
    purchase,
  };
}
async function documentSnapshot(purchaseIds: string[]) {
  return (
    await db.query<{
      id: string;
      purchase_id: string;
      public_ref: string;
      storage_key: string;
      content_sha256: string;
    }>(
      "select d.id,d.purchase_id,d.public_ref,d.storage_key,d.content_sha256 from finance.documents d where d.purchase_id=any($1::uuid[]) order by d.id",
      [purchaseIds],
    )
  ).rows;
}
async function auditSnapshot(entryId: string, purchaseId: string) {
  return (
    await db.query<{
      id: string;
      entity: string;
      entity_id: string;
      field_name: string;
      reason: string | null;
    }>(
      "select id,entity,entity_id,field_name,reason from finance.audit_log where (entity='project_budget_entry' and entity_id=$1) or (entity='purchase' and entity_id=$2) order by id",
      [entryId, purchaseId],
    )
  ).rows;
}
async function blockedBy(blocker: pg.PoolClient, routine: string) {
  const pid = Number(
    (await blocker.query("select pg_backend_pid() as pid")).rows[0].pid,
  );
  await expect
    .poll(
      async () =>
        Number(
          (
            await pool.query(
              "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and $1::integer=any(pg_blocking_pids(pid)) and position($2 in query)>0",
              [pid, routine],
            )
          ).rows[0].count,
        ),
      {
        timeout: 5000,
        message: `Expected blocked ${routine}; SQL failures: ${JSON.stringify(failures)}`,
      },
    )
    .toBeGreaterThan(0);
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value }),
    (error) => ({ error: error as { status?: number; message: string } }),
  );
}

describe.skipIf(!url)(
  "purchases composed with actual budget revisions on PostgreSQL",
  () => {
    beforeAll(async () => {
      const connection = new URL(url!);
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) ||
        connection.pathname !== "/postgres"
      )
        throw new Error(
          "Use the isolated loopback postgres maintenance database.",
        );
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
      db = { ...database(pool), exec: (sql) => pool.query(sql) };
      await setupProjectBudgetBase(db);
      await seedProjectBudgetLegacy(db);
      const migrations = await applyProjectBudgetMigrations(db);
      expect(migrations).toContain("069_project_budget_revisions.sql");
      expect(migrations).toContain("070_project_budget_purchases.sql");
      await db.query(
        "insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid)",
        [f.head],
      );
      services = service(db);
    }, 30000);
    afterAll(async () => {
      try {
        await close?.();
        if (admin) await admin.query(`drop database if exists ${name}`);
      } finally {
        await admin?.end();
      }
    });

    it.each(["purchase", "promotion"] as const)(
      "preserves v1 purchases during Draft/pending and serializes when %s wins promotion overlap",
      async (first) => {
        let budget = await approved();
        const v1 = budget.approvedVersionId!,
          entryId = budget.approvedVersion!.entries[0].entryId;
        budget = await write(budget, "lead", "requestProjectBudgetChanges", {
          reason: "Larger material quote",
        });
        budget = await write(budget, "lead", "saveProjectBudgetEntry", {
          entry: { ...entry, entryId, plannedNok: "300" },
        });
        const draftPurchase = await change(
          "departmentLead",
          await registration(budget, "60"),
        );
        budget = await services.projectBudget("lead", budget.id);
        expect(budget.pendingStage).toBe("draft");
        expect(budget.approvedVersionId).toBe(v1);
        budget = await write(budget, "lead", "submitProjectBudget");
        const pendingPurchase = await change(
          "departmentLead",
          await registration(budget, "10"),
        );
        budget = await services.projectBudget("lead", budget.id);
        expect(budget.pendingStage).toBe("department_pending");
        budget = await write(
          budget,
          "departmentLead",
          "approveDepartmentBudget",
        );
        const v2 = budget.pendingVersionId!,
          registerBody = await registration(budget, "60"),
          promoteBody = {
            action: "approveProjectBudget",
            requestId: randomUUID(),
            projectBudgetId: budget.id,
            expectedRevision: budget.revision,
          };
        const earlierIds = [draftPurchase.id!, pendingPurchase.id!];
        const earlierDocuments = await documentSnapshot(earlierIds);
        expect(earlierDocuments).toHaveLength(2);
        const preview = await services.mutate("departmentLead", {
          ...registerBody,
          action: "checkProjectPurchase",
        });
        expect(preview.warnings).toContainEqual({
          message:
            "Line totals exceed the plan for one budget item by 30.00 NOK.",
        });
        const client = await pool.connect(),
          held = service(database(client));
        let racingId: string;
        try {
          await client.query("begin");
          if (first === "purchase") {
            const registered = await change(
              "departmentLead",
              registerBody,
              held,
            );
            racingId = registered.id!;
            const promotion = outcome(services.mutate("head", promoteBody));
            await blockedBy(client, "finance.mutate_project_budget");
            expect(
              (await services.projectBudget("lead", budget.id))
                .approvedVersionId,
            ).toBe(v1);
            await client.query("commit");
            expect(await promotion, JSON.stringify(failures)).toMatchObject({
              error: { status: 409 },
            });
            const original = (
              await db.query(
                "select facts,review_status from finance.exception_reviews where purchase_id=$1::uuid and kind='budget_overrun'",
                [racingId],
              )
            ).rows;
            expect(original).toMatchObject([
              {
                facts: {
                  entries: [
                    {
                      entryId,
                      approvedVersionId: v1,
                      approvedOre: "10000",
                      actualOre: "13000",
                    },
                  ],
                },
                review_status: "open",
              },
            ]);
            budget = await services.projectBudget("lead", budget.id);
            budget = await write(budget, "head", "approveProjectBudget");
            expect(
              (
                await db.query(
                  "select facts,review_status from finance.exception_reviews where purchase_id=$1::uuid and kind='budget_overrun'",
                  [racingId],
                )
              ).rows,
            ).toEqual(original);
          } else {
            await change("head", promoteBody, held);
            const registrationResult = outcome(
              services.mutate("departmentLead", registerBody),
            );
            await blockedBy(client, "finance.replay_project_purchase");
            expect(
              (await services.projectBudget("lead", budget.id))
                .approvedVersionId,
            ).toBe(v1);
            await client.query("commit");
            const registered = await registrationResult;
            expect(registered, JSON.stringify(failures)).toHaveProperty(
              "value",
            );
            if (!("value" in registered)) throw registered.error;
            racingId = registered.value.id!;
            expect(registered.value.warnings).toEqual([]);
            expect(
              (
                await db.query(
                  "select kind from finance.exception_reviews where purchase_id=$1::uuid",
                  [racingId],
                )
              ).rows,
            ).toEqual([]);
            budget = await services.projectBudget("lead", budget.id);
          }
        } finally {
          await client.query("rollback");
          client.release();
        }
        const ids = [draftPurchase.id!, pendingPurchase.id!, racingId!],
          documents = await documentSnapshot(ids);
        expect(documents).toHaveLength(3);
        expect(await documentSnapshot(earlierIds)).toEqual(earlierDocuments);
        expect(
          (
            await db.query(
              "select purchase_id,approved_version_id,budget_item_id from finance.purchase_lines where purchase_id=any($1::uuid[]) order by purchase_id",
              [ids],
            )
          ).rows,
        ).toEqual(
          ids
            .map((purchase_id, index) => ({
              purchase_id,
              approved_version_id: index < 2 || first === "purchase" ? v1 : v2,
              budget_item_id: entryId,
            }))
            .sort((a, b) => a.purchase_id.localeCompare(b.purchase_id)),
        );
        expect(budget).toMatchObject({
          approvedVersionId: v2,
          approvedTotalNok: "300.00",
          pendingVersionId: null,
          approvedVersion: {
            entries: [{ entryId, actualNok: "130.00", completion: "partial" }],
          },
        });
        expect(budget.historyVersions?.find((v) => v.id === v1)).toMatchObject({
          totalNok: "100.00",
          entries: [{ entryId, actualNok: "130.00" }],
        });
        const replay = await services.mutate("departmentLead", registerBody);
        expect(replay.id).toBe(racingId!);
        expect(await documentSnapshot(ids)).toEqual(documents);
        expect(
          (
            await db.query(
              "select count(*)::int as count,sum(amount_ore)::text as actual from finance.allocations where budget_item_id=$1::uuid",
              [entryId],
            )
          ).rows,
        ).toEqual([{ count: 3, actual: "13000" }]);
      },
    );

    it("uses locked v2 authority for generic Finance registration when promotion wins", async () => {
      let budget = await approved();
      const v1 = budget.approvedVersionId!,
        entryId = budget.approvedVersion!.entries[0].entryId;
      const earlier = await change(
        "departmentLead",
        await registration(budget, "70"),
      );
      budget = await services.projectBudget("lead", budget.id);
      budget = await write(budget, "lead", "requestProjectBudgetChanges", {
        reason: "Larger generic purchase quote",
      });
      budget = await write(budget, "lead", "saveProjectBudgetEntry", {
        entry: { ...entry, entryId, plannedNok: "300" },
      });
      budget = await write(budget, "lead", "submitProjectBudget");
      budget = await write(budget, "departmentLead", "approveDepartmentBudget");
      const v2 = budget.pendingVersionId!,
        authorized = await change("finance", {
          action: "authorizeUpload",
          fileName: "generic-invoice.pdf",
          contentType: "application/pdf",
          byteSize: 8,
        });
      await putMemoryPdf(storage, authorized.stagingKey!);
      await change("finance", {
        action: "finalizeUpload",
        uploadId: authorized.id,
      });
      const purchase: PurchaseInput = {
        buyerName: "Finance buyer",
        supplierName: "Supplier",
        paymentMethod: "team_account",
        purchaseDate: osloToday(),
        justification: "Material for the frame",
        documentKind: "receipt",
        uploadIds: [authorized.id!],
        lines: [
          {
            systemId: f.system,
            budgetItemId: entryId,
            description: "Generic frame order",
            quantity: "3",
            amountNok: "60",
          },
        ],
      };
      const body = {
        action: "registerPurchase",
        requestId: randomUUID(),
        purchase,
      };
      const advisory = await change("finance", {
        action: "checkPurchase",
        purchase,
      });
      expect(advisory.warnings).toContainEqual({
        message:
          "Line totals exceed the plan for one budget item by 30.00 NOK.",
      });
      const before = await documentSnapshot([earlier.id!]),
        client = await pool.connect(),
        held = service(database(client));
      let savedId: string;
      try {
        await client.query("begin");
        await change(
          "head",
          {
            action: "approveProjectBudget",
            projectBudgetId: budget.id,
            expectedRevision: budget.revision,
          },
          held,
        );
        const pending = outcome(services.mutate("finance", body));
        await blockedBy(client, "finance.register_purchase(");
        await client.query("commit");
        const saved = await pending;
        expect(saved, JSON.stringify(failures)).toHaveProperty("value");
        if (!("value" in saved)) throw saved.error;
        savedId = saved.value.id!;
        expect(saved.value.warnings).toEqual([]);
      } finally {
        await client.query("rollback");
        client.release();
      }
      expect(
        (
          await db.query(
            "select approved_version_id,budget_authority,budget_item_id from finance.purchase_lines where purchase_id=$1::uuid",
            [savedId!],
          )
        ).rows,
      ).toEqual([
        {
          approved_version_id: v2,
          budget_authority: "project_approved",
          budget_item_id: entryId,
        },
      ]);
      expect(
        (
          await db.query(
            "select approved_version_id from finance.purchase_lines where purchase_id=$1::uuid",
            [earlier.id],
          )
        ).rows,
      ).toEqual([{ approved_version_id: v1 }]);
      expect(
        (
          await db.query(
            "select kind from finance.exception_reviews where purchase_id=$1::uuid",
            [savedId!],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await services.projectBudget("lead", budget.id)).approvedVersion!
          .entries[0],
      ).toMatchObject({ actualNok: "130.00", plannedNok: "300.00" });
      expect(await documentSnapshot([earlier.id!])).toEqual(before);
      const invoices = await documentSnapshot([earlier.id!, savedId!]);
      expect(invoices).toHaveLength(2);
      const replay = await services.mutate("finance", body);
      expect(replay.id).toBe(savedId!);
      expect(replay.warnings).toEqual([]);
      expect(await documentSnapshot([earlier.id!, savedId!])).toEqual(invoices);
      expect(
        (
          await db.query<{ response: { warnings: unknown[] } }>(
            "select response from finance.idempotency_keys where member_id=$1::uuid and request_id=$2::uuid",
            [f.finance, body.requestId],
          )
        ).rows[0].response.warnings,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "select count(*)::int as count,sum(amount_ore)::text as actual from finance.allocations where budget_item_id=$1::uuid",
            [entryId],
          )
        ).rows,
      ).toEqual([{ count: 2, actual: "13000" }]);
    });

    it.each(["completion", "void"] as const)(
      "never leaves completion after linked void when %s wins the header lock",
      async (first) => {
        let budget = await approved();
        const entryId = budget.approvedVersion!.entries[0].entryId;
        const registered = await change(
            "departmentLead",
            await registration(budget, "10", true),
          ),
          purchaseId = registered.id!;
        await change("head", {
          action: "markInvoicePaid",
          purchaseId,
          expectedRevision: 0,
          paidOn: osloToday(),
        });
        budget = await services.projectBudget("lead", budget.id);
        expect(budget.approvedVersion!.entries[0].completion).toBe("partial");
        const documents = await documentSnapshot([purchaseId]),
          completionBody = {
            action: "setProjectBudgetCompletion",
            requestId: randomUUID(),
            projectBudgetId: budget.id,
            expectedRevision: budget.revision,
            entryId,
            complete: true,
            reason: "Everything received",
          },
          voidBody = {
            action: "voidPurchase",
            requestId: randomUUID(),
            purchaseId,
            expectedRevision: 1,
            reason: "Supplier cancelled the order",
          };
        const client = await pool.connect(),
          held = service(database(client));
        try {
          await client.query("begin");
          if (first === "completion") {
            await change("departmentLead", completionBody, held);
            const voided = outcome(services.mutate("head", voidBody));
            await blockedBy(client, "finance.void_registered_purchase");
            await client.query("commit");
            expect(await voided, JSON.stringify(failures)).toHaveProperty(
              "value",
            );
            await services.mutate("departmentLead", completionBody);
          } else {
            await change("head", voidBody, held);
            const completed = outcome(
              services.mutate("departmentLead", completionBody),
            );
            await blockedBy(client, "finance.set_project_budget_completion");
            await client.query("commit");
            expect(await completed, JSON.stringify(failures)).toMatchObject({
              error: { status: 409 },
            });
          }
        } finally {
          await client.query("rollback");
          client.release();
        }
        budget = await services.projectBudget("lead", budget.id);
        expect(budget.approvedVersion!.entries[0]).toMatchObject({
          completion: "not_purchased",
          actualNok: "0.00",
        });
        expect(
          (
            await db.query(
              "select p.status,p.revision,i.paid,i.paid_on::text,i.paid_by_member_id from finance.purchases p join finance.invoice_obligations i on i.purchase_id=p.id where p.id=$1::uuid",
              [purchaseId],
            )
          ).rows,
        ).toEqual([
          {
            status: "voided",
            revision: 2,
            paid: true,
            paid_on: osloToday(),
            paid_by_member_id: f.head,
          },
        ]);
        expect(await documentSnapshot([purchaseId])).toEqual(documents);
        expect(
          (
            await db.query(
              "select amount_ore::text as amount from finance.allocations where line_id in(select id from finance.purchase_lines where purchase_id=$1::uuid)",
              [purchaseId],
            )
          ).rows,
        ).toEqual([{ amount: "1000" }]);
        const audit = await auditSnapshot(entryId, purchaseId);
        expect(audit.filter((row) => row.field_name === "voided")).toHaveLength(
          1,
        );
        expect(
          audit.filter((row) => row.field_name === "completed"),
        ).toHaveLength(first === "completion" ? 1 : 0);
        expect(
          audit.filter((row) => row.field_name === "completion_reopened"),
        ).toHaveLength(1);
        await services.mutate("head", voidBody);
        expect(await auditSnapshot(entryId, purchaseId)).toEqual(audit);
        expect(
          (
            await db.query<{ complete: boolean }>(
              "select complete from finance.project_budget_completion where entry_id=$1::uuid",
              [entryId],
            )
          ).rows.every((row) => row.complete === false),
        ).toBe(true);
      },
    );

    it("adopts a genuine legacy plan through069 API and retains purchases/invoices through both first approvals", async () => {
      const created = await change("lead", {
        action: "createProjectBudget",
        projectId: f.project,
        responsibleDepartmentId: f.department,
      });
      let budget = await services.projectBudget("lead", created.id!);
      budget = await write(budget, "lead", "adoptProjectBudgetEntries", {
        entries: [{ budgetItemId: f.entry }],
      });
      expect(budget).toMatchObject({
        approvedVersionId: null,
        pendingStage: "draft",
        pendingVersion: {
          entries: [
            { entryId: f.entry, budgetItemId: f.entry, actualNok: "1200.00" },
          ],
        },
      });
      const body = await registration(budget, "50"),
        registered = await change("departmentLead", body),
        purchaseId = registered.id!;
      const historyBefore = (
        await db.query(
          "select a.id,a.line_id,a.amount_ore::text,d.id as document_id,d.storage_key from finance.allocations a join finance.purchase_lines l on l.id=a.line_id join finance.documents d on d.purchase_id=l.purchase_id where a.budget_item_id=$1::uuid order by a.id,d.id",
          [f.entry],
        )
      ).rows;
      const sourceBefore = (
        await db.query(
          "select project_budget_id,approved_version_id,budget_authority,legacy_budget_id,legacy_approved_on::text from finance.purchase_lines where purchase_id=$1::uuid",
          [purchaseId],
        )
      ).rows;
      expect(sourceBefore).toEqual([
        {
          project_budget_id: budget.id,
          approved_version_id: null,
          budget_authority: "legacy_approved",
          legacy_budget_id: f.legacyBudget,
          legacy_approved_on: "2026-10-01",
        },
      ]);
      budget = await services.projectBudget("lead", budget.id);
      for (const [role, action] of [
        ["lead", "submitProjectBudget"],
        ["departmentLead", "approveDepartmentBudget"],
        ["head", "approveProjectBudget"],
      ] as const)
        budget = await write(budget, role, action);
      expect(budget.approvedVersion!.entries[0]).toMatchObject({
        entryId: f.entry,
        budgetItemId: f.entry,
        publicRef: "BI-S27-001",
        actualNok: "1250.00",
        completion: "partial",
      });
      expect(
        budget.decisions.filter((d) => d.action === "approveDepartmentBudget"),
      ).toHaveLength(1);
      expect(
        budget.decisions.filter((d) => d.action === "approveProjectBudget"),
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            "select a.id,a.line_id,a.amount_ore::text,d.id as document_id,d.storage_key from finance.allocations a join finance.purchase_lines l on l.id=a.line_id join finance.documents d on d.purchase_id=l.purchase_id where a.budget_item_id=$1::uuid order by a.id,d.id",
            [f.entry],
          )
        ).rows,
      ).toEqual(historyBefore);
      expect(
        (
          await db.query(
            "select project_budget_id,approved_version_id,budget_authority,legacy_budget_id,legacy_approved_on::text from finance.purchase_lines where purchase_id=$1::uuid",
            [purchaseId],
          )
        ).rows,
      ).toEqual(sourceBefore);
      expect((await services.mutate("departmentLead", body)).id).toBe(
        purchaseId,
      );
    });
  },
);
