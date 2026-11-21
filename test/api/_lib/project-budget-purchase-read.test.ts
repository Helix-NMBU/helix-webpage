import { describe, expect, it } from "vitest";
import { loadProjectBudgetDetail } from "../../../api/_lib/finance-project-budgets.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";
import {
  projectBudgetFixture as f,
  projectBudgetIdentity,
} from "./project-budget-test-db.js";

describe("project purchase state projection", () => {
  it("uses registered purchase existence for partial state even when net actual is zero", async () => {
    const versionId = "81111111-1111-4111-8111-111111111111";
    const row = {
      header: {
        id: f.legacyBudget,
        project_id: f.project,
        project_name: "Frame",
        season_id: f.season,
        season_code: "S27",
        responsible_department_id: f.department,
        department_name: "Mechanical & Production",
        revision: 1,
        approved_version_id: versionId,
        pending_version_id: null,
        pending_stage: null,
        approved_total_ore: "0",
        pending_total_ore: null,
        capabilities: {},
      },
      versions: [
        {
          id: versionId,
          version_number: 1,
          revision: 1,
          status: "approved",
          entries: [
            {
              entry_id: f.entry,
              budget_item_id: f.entry,
              public_ref: "BI-S27-001",
              system_id: f.system,
              description: "Contributed material",
              category: "material",
              planned_ore: "0",
              actual_ore: "0",
              purchase_count: 1,
              complete: false,
              ordinary_priority: "P2",
              priority: "P2",
              reuse_status: "new",
              status: "planned",
              removed: false,
            },
          ],
        },
      ],
      decisions: [],
    };
    const db: CvDatabase = {
      query: async <T>(sql: string) => {
        if (sql.includes("to_regprocedure('finance.claim_invoice_transfer")) return { rows: [{ available: true }] as T[] };
        if (sql.includes("finance.documents")) {
          expect(sql).toContain("finance.invoice_document_access($1::uuid,$2,$3,d.id,false)");
          return { rows: [] as T[] };
        }
        expect(sql).toContain("count(distinct purchase.id)");
        return { rows: [row] as T[] };
      },
    };
    const detail = await loadProjectBudgetDetail(
      db,
      projectBudgetIdentity("departmentLead"),
      f.legacyBudget,
    );
    expect(detail.approvedVersion?.entries[0]).toMatchObject({
      actualNok: "0.00",
      completion: "partial",
    });
  });
});
