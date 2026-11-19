import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import {
  setupProjectBudgetBase,
  seedProjectBudgetLegacy,
  projectBudgetFixture as f,
  projectBudgetIdentity,
} from "./project-budget-test-db.js";
import { osloToday } from "../../../src/features/Finance/money.js";
import { randomUUID } from "node:crypto";
describe("invoice migration readiness", () => {
  it("fails before a new actual write when071 is absent rather than creating private-only evidence", async () => {
    const pg = new PGlite();
    const db = {
      exec: (sql: string) => pg.exec(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pg.query<T>(sql, params)).rows,
      }),
    };
    try {
      await setupProjectBudgetBase(db);
      await seedProjectBudgetLegacy(db);
      const directory = new URL("../../../db/migrations/", import.meta.url);
      for (const name of readdirSync(directory)
        .filter((n) => /^0(6[6-9]|70|72)_.*\.sql$/.test(n))
        .sort())
        await db.exec(readFileSync(new URL(name, directory), "utf8"));
      await db.query(
        "insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid)",
        [f.head],
      );
      const count = async () =>
        (
          await db.query<{ count: string }>(
            "select count(*)::text from finance.purchases",
          )
        ).rows[0].count;
      const before = await count();
      const services = createFinanceServices({
        db,
        authenticate: async () => projectBudgetIdentity("finance"),
      });
      await expect(
        services.mutate("finance", {
          action: "registerPurchase",
          requestId: randomUUID(),
          purchase: {
            buyerName: "Buyer",
            supplierName: "Supplier",
            paymentMethod: "team_account",
            purchaseDate: osloToday(),
            justification: "Incurred materials",
            documentKind: "receipt",
            uploadIds: [randomUUID()],
            lines: [
              {
                systemId: f.system,
                unbudgeted: true,
                description: "Materials",
                quantity: "1",
                amountNok: "10.00",
              },
            ],
          },
        }),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("setup is incomplete"),
      });
      expect(await count()).toBe(before);
    } finally {
      await pg.close();
    }
  }, 30000);
});
