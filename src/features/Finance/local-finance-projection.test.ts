import { describe, expect, it } from "vitest";
import {
  projectLocalFinance,
  type LocalFinanceProjectionInput,
  type LocalRecordedPurchase,
} from "./local-finance-projection";
import type {
  ProjectBudgetDetail,
  ProjectBudgetEntry,
} from "./project-budget-types";
import type { FundingApplicationDetail } from "./funding-application-types";
import type { PublicBudgetItem } from "./types";
const systemId = "00000000-0000-4000-8000-000000000001";
const entry = (
  id: string,
  values: Partial<ProjectBudgetEntry> = {},
): ProjectBudgetEntry => ({
  entryId: id,
  budgetItemId: id,
  publicRef: id,
  systemId,
  description: id,
  category: "material",
  plannedNok: "200.00",
  ordinaryPriority: "P1",
  priority: "P1",
  reuseStatus: "new",
  status: "planned",
  actualNok: "0.00",
  completion: "not_purchased",
  ...values,
});
function budget(entries: ProjectBudgetEntry[]): ProjectBudgetDetail {
  return {
    id: "header",
    projectId: "project",
    projectName: "Project",
    seasonId: "season",
    seasonCode: "S27",
    responsibleDepartmentId: "department",
    responsibleDepartmentName: "Mechanical",
    revision: 8,
    approvedVersionId: "v1",
    pendingVersionId: "v2",
    pendingStage: "draft",
    approvedTotalNok: "200.00",
    pendingTotalNok: "99999.00",
    capabilities: {
      canRead: true,
      canDraft: true,
      canReviewDepartment: false,
      canApproveFinance: false,
      canRequestChanges: true,
      canRegisterPurchase: true,
      canReadFinance: true,
      canRecordAward: false,
      canReleaseObligation: false,
    },
    approvedVersion: {
      id: "v1",
      versionNumber: 1,
      revision: 1,
      status: "approved",
      submittedAt: null,
      departmentApprovedBy: null,
      departmentApprovedAt: null,
      approvedBy: "finance",
      approvedAt: "2026-01-01",
      entries,
      totalNok: "200.00",
    },
    pendingVersion: {
      id: "v2",
      versionNumber: 2,
      revision: 1,
      status: "draft",
      submittedAt: null,
      departmentApprovedBy: null,
      departmentApprovedAt: null,
      approvedBy: null,
      approvedAt: null,
      entries: [
        entry("00000000-0000-4000-8000-000000000105", {
          plannedNok: "99999.00",
        }),
      ],
      totalNok: "99999.00",
    },
    decisions: [],
  };
}
const purchase = (
  id: string,
  item: string | null,
  amountNok: string,
  values: Partial<LocalRecordedPurchase> = {},
): LocalRecordedPurchase => ({
  id,
  publicRef: id,
  projectId: "project",
  responsibleDepartmentId: "department",
  requesterMemberId: "member",
  purchase: {
    buyerName: "Buyer",
    supplierName: "Supplier",
    paymentMethod: "team_account",
    purchaseDate: "2026-05-01",
    justification: "Materials for the project",
    documentKind: "receipt",
    uploadIds: [crypto.randomUUID()],
    lines: [
      {
        systemId,
        budgetItemId: item,
        unbudgeted: !item,
        description: "Materials",
        quantity: "3",
        amountNok,
      },
    ],
  },
  ...values,
});
function input(
  budgets: ProjectBudgetDetail[] = [],
): LocalFinanceProjectionInput {
  return {
    viewVersion: 9,
    seasonCode: "S27",
    today: "2026-12-01",
    systems: [
      {
        id: systemId,
        code: "SYS",
        name: "Mechanical",
        active: true,
        departmentKey: "mechanical",
        departmentName: "Mechanical",
        sortOrder: 0,
      },
    ],
    budgets,
    purchases: [],
    invoices: [],
    applications: [],
    legacy: { budgetStatus: "draft", approvedOn: null, items: [] },
    funding: [],
    parts: [],
  };
}
const legacy = (values: Partial<PublicBudgetItem> = {}): PublicBudgetItem => ({
  id: "00000000-0000-4000-8000-000000000100",
  publicRef: "00000000-0000-4000-8000-000000000100",
  systemId,
  systemCode: "SYS",
  description: "Old frame",
  category: "material",
  plannedNok: "300.00",
  effectivePlanNok: "300.00",
  actualNok: "50.00",
  differenceNok: "250.00",
  priority: "P2",
  reuseStatus: "new",
  expectedPurchaseDate: null,
  status: "planned",
  revision: 1,
  earmarked: false,
  earmarkPurpose: null,
  earmarkAmountNok: null,
  ...values,
});

describe("canonical local Finance projection", () => {
  it("uses approved entries exactly once while pending proposals stay outside totals and purchase choices", () => {
    const b = budget([
      entry("00000000-0000-4000-8000-000000000100", {
        plannedNok: "8250.50",
        actualNok: "8500.00",
        completion: "partial",
      }),
      entry("00000000-0000-4000-8000-000000000101", {
        plannedNok: "400.00",
        ordinaryPriority: "P2",
      }),
      entry("00000000-0000-4000-8000-000000000102", {
        plannedNok: "250.25",
        ordinaryPriority: "P4",
      }),
    ]);
    const data = input([b]);
    data.purchases = [
      purchase("registered", "00000000-0000-4000-8000-000000000100", "3500.00"),
    ];
    data.applications = [
      {
        award: { reference: "Award" },
        links: [
          { entryId: "00000000-0000-4000-8000-000000000102", release: null },
        ],
      } as FundingApplicationDetail,
    ];
    const view = projectLocalFinance(data);
    expect(view.overview).toMatchObject({
      budgetStatus: "draft",
      approvedOn: null,
      approvedPresence: { legacyBudget: false, projectBudgets: true },
      hasRecordedActuals: true,
    });
    expect(view.budgets.departments[0]).toMatchObject({
      plannedNok: "8900.75",
      actualNok: "8500.00",
    });
    expect(view.budgets.choices.items.map((i) => i.id)).toEqual([
      "00000000-0000-4000-8000-000000000100",
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ]);
    expect(
      view.items.find((i) => i.id === "00000000-0000-4000-8000-000000000102")
        ?.priority,
    ).toBe("P0");
    expect(view.financing.scenarios.map((s) => s.needNok)).toEqual([
      "8750.25",
      "9150.25",
      "9150.25",
    ]);
    expect(JSON.stringify(view)).not.toContain("99999.00");
    expect(view.purchases.register[0].totalNok).toBe("3500.00"); // Quantity is not multiplied into line totals.
  });
  it("keeps genuine legacy approval until first project approval, then replaces the same stable anchor", () => {
    const b = budget([
      entry("00000000-0000-4000-8000-000000000100", { actualNok: "50.00" }),
    ]);
    const data = input([b]);
    data.legacy = {
      budgetStatus: "approved",
      approvedOn: "2026-01-01",
      items: [legacy()],
    };
    b.approvedVersion = null;
    b.approvedVersionId = null;
    b.pendingVersion!.entries = [entry("00000000-0000-4000-8000-000000000100")];
    expect(projectLocalFinance(data).budgets.departments[0]).toMatchObject({
      plannedNok: "300.00",
      actualNok: "50.00",
    });
    b.approvedVersion = budget([
      entry("00000000-0000-4000-8000-000000000100", { actualNok: "50.00" }),
    ]).approvedVersion;
    b.approvedVersionId = "v1";
    const replaced = projectLocalFinance(data);
    expect(replaced.items).toHaveLength(1);
    expect(replaced.budgets.departments[0]).toMatchObject({
      plannedNok: "200.00",
      actualNok: "50.00",
    });
  });
  it("retains removed actuals, unbudgeted costs and all evidence without reintroducing removed choices", () => {
    const b = budget([
      entry("00000000-0000-4000-8000-000000000104", { completion: "partial" }),
    ]);
    b.historyVersions = [
      {
        ...b.approvedVersion!,
        id: "old",
        versionNumber: 0,
        entries: [
          entry("00000000-0000-4000-8000-000000000103", {
            actualNok: "75.00",
            invoices: [
              {
                documentId: "old",
                purchaseId: "old-purchase",
                purchaseRef: "old",
                originalName: "Old invoice.pdf",
                backend: "private_storage",
                transferStatus: "pending",
                viewerUrl: null,
              },
            ],
          }),
        ],
      },
    ];
    const data = input([b]);
    data.purchases = [purchase("unbudgeted", null, "25.00")];
    const view = projectLocalFinance(data);
    expect(view.budgets.departments[0]).toMatchObject({
      plannedNok: "200.00",
      actualNok: "100.00",
      unbudgetedNok: "25.00",
    });
    expect(view.budgets.choices.items.map((i) => i.id)).toEqual([
      "00000000-0000-4000-8000-000000000104",
    ]);
    expect(view.items.find(item=>item.id==="00000000-0000-4000-8000-000000000104")).toMatchObject({actualNok:"0.00",completion:"partial"});
    expect(
      view.items.find((i) => i.id === "00000000-0000-4000-8000-000000000103"),
    ).toMatchObject({
      status: "cancelled",
      effectivePlanNok: "0.00",
      actualNok: "75.00",
      invoices: [
        {
          backend: "private_storage",
          transferStatus: "stored",
          viewerUrl: null,
        },
      ],
    });
  });
  it("shows incurred actuals before a budget exists without fabricating any approval", () => {
    const data = input();
    data.purchases = [purchase("incurred", null, "85.25")];
    const view = projectLocalFinance(data);
    expect(view.overview).toMatchObject({
      approvedPresence: { legacyBudget: false, projectBudgets: false },
      hasRecordedActuals: true,
      budgetStatus: "draft",
      approvedOn: null,
    });
    expect(view.budgets.choices.items).toEqual([]);
    expect(view.budgets.departments[0]).toMatchObject({
      plannedNok: "0.00",
      actualNok: "85.25",
    });
  });
  it("separates historical funding coverage from current links and deadline-aware usage", () => {
    const b = budget([
      entry("00000000-0000-4000-8000-000000000100", {
        earmarkId: "part-new",
        actualNok: "60.00",
        plannedNok: "100.00",
      }),
      entry("00000000-0000-4000-8000-000000000103", {
        removed: true,
        earmarkId: "part-old",
        actualNok: "20.00",
      }),
    ]);
    const data = input([b]);
    data.funding = [
      {
        id: "fund",
        publicRef: "fund",
        sourceName: "Grant",
        ownerName: "Owner",
        fundingType: "grant",
        amountNok: "500.00",
        status: "secured",
        confidence: null,
        expectedDate: null,
        receivedDate: null,
        ownerEmail: null,
        reportingRequired: false,
        agreementLink: null,
        note: null,
        revision: 0,
        earmarkedNok: "0.00",
        unrestrictedNok: "500.00",
        linkedItemCount: 0,
      },
    ];
    data.parts = ["part-old", "part-new"].map((id) => ({
      id,
      publicRef: id,
      fundingId: "fund",
      purpose: id,
      amountNok: "100.00",
      spendBy: "2026-04-01",
      conditions: null,
      revision: 0,
      usedNok: "0.00",
      leftNok: "100.00",
      mustReturnNok: "0.00",
      overdue: false,
      systemName: null,
      linkedItems: [],
    }));
    const late = purchase(
      "late",
      "00000000-0000-4000-8000-000000000100",
      "60.00",
      {
        approval: [
          {
            entryId: "00000000-0000-4000-8000-000000000100",
            approvedVersionId: "old",
            earmarkId: "part-old",
          },
        ],
      },
    );
    const ontime = purchase(
      "ontime",
      "00000000-0000-4000-8000-000000000103",
      "20.00",
      {
        approval: [
          {
            entryId: "00000000-0000-4000-8000-000000000103",
            approvedVersionId: "old",
            earmarkId: "part-old",
          },
        ],
      },
    );
    ontime.purchase.purchaseDate = "2026-03-01";
    data.purchases = [late, ontime];
    const view = projectLocalFinance(data),
      old = view.financing.parts[0],
      next = view.financing.parts[1];
    expect(old).toMatchObject({
      usedNok: "20.00",
      linkedItems: [],
      systemName: null,
    });
    expect(next).toMatchObject({
      usedNok: "0.00",
      linkedItems: [{ id: "00000000-0000-4000-8000-000000000100" }],
    });
    expect(view.financing.scenarios[0].restrictedCoverNok).toBe("120.00"); // All 80 incurred + current remaining 40, regardless of spend deadline.
  });
});
