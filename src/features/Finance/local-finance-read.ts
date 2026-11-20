import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import {
  localMemberHasFinancials,
  localMemberHasSeasonOverview,
} from "../MemberPlatform/member-access-api";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import { localSponsorFunding } from "../PartnerDeals/local-fixture";
import { canonicalDepartment } from "../ProjectManagement/departments";
import {
  projectLocalFinance,
  localPurchaseObligations,
  type LocalFinanceProjectionInput,
  type LocalRecordedPurchase,
} from "./local-finance-projection";
import { localInvoiceReference } from "./local-invoice-reference";
import { formatOre, osloToday, parseIsoDate } from "./money";
import { hasVisibleApprovedFinances, nokToOre } from "./finance-calculations";
import type { ProjectWorkspace } from "../ProjectManagement/types";
import type { SeasonFinancialSummary } from "../ProjectManagement/season-financials-types";
import type {
  ProjectBudgetDetail,
  ProjectBudgetInvoiceReference,
} from "./project-budget-types";
import type { FundingApplicationDetail } from "./funding-application-types";
import { normalizePurchaseInput } from "./purchase-domain";
import { stableJson } from "./funding";
import type {
  FinanceMutationResult,
  FundingPartRecord,
  FundingRecord,
  PublicBudgetItem,
} from "./types";
import type { LocalInvoiceFact } from "./invoice-local";
const BUDGETS = "helix-project-budgets-local-v1",
  PURCHASES = "helix-project-purchases-local-v1",
  AWARDS = "helix-funding-applications-local-v1",
  LEDGER = "helix-finance-local-ledger-v1";
interface BudgetState {
  version: number;
  budgets: ProjectBudgetDetail[];
}
export interface LocalPurchaseState {
  evidence?: Record<string, LocalInvoiceFact>;
  records?: Record<string, LocalRecordedPurchase>;
  uploads?: Record<
    string,
    { projectId: string; name: string; purchaseId?: string }
  >;
  requests?: Record<
    string,
    { fingerprint?: string; result: { id?: string; publicRef?: string } }
  >;
  audit?: Array<{
    action: string;
    entryId?: string;
    purchaseId?: string;
    reason?: string;
  }>;
  mutations?: Record<
    string,
    { fingerprint: string; result: FinanceMutationResult }
  >;
  overrides?: Record<
    string,
    Partial<
      Pick<
        LocalRecordedPurchase,
        | "status"
        | "revision"
        | "voidReason"
        | "invoicePaid"
        | "invoicePaidOn"
        | "refundPaid"
        | "refundPaidOn"
      >
    >
  >;
}
export interface LocalFinanceFixtureLedger {
  version: number;
  seasonCode: string;
  budgetStatus: "absent" | "draft" | "approved";
  approvedOn: string | null;
  items: PublicBudgetItem[];
  funding?: FundingRecord[];
  parts?: FundingPartRecord[];
  commitments?: LocalFinanceProjectionInput["commitments"];
}
function guard(permission: "finance" | "season") {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  if (
    !(permission === "finance"
      ? localMemberHasFinancials()
      : localMemberHasSeasonOverview())
  )
    throw Object.assign(
      new Error(
        permission === "finance"
          ? "Finance access is required."
          : "Season Overview access is required.",
      ),
      { status: 403 },
    );
}
function saved<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}
/** Monotonic clocks are metadata only. The dated bank amount never changes with spending or funding. */
export function localFinanceVersion(bankVersion: number): number {
  guard("finance");
  return combinedVersion(bankVersion);
}
function combinedVersion(bankVersion: number) {
  return (
    bankVersion +
    saved(BUDGETS, { version: 0 }).version +
    saved(AWARDS, { version: 0 }).version +
    saved(LEDGER, { version: 0 }).version +
    saved("helix-member-local-partner-deals-v1", { version: 0 }).version
  );
}
const departmentKey = (name: string) =>
  ({
    Management: "management",
    "Mechanical & Production": "mechanical-production",
    Electronics: "electrical",
    "Software & Autonomous": "software",
    "Business & Marketing": "business",
    Logistics: "logistics",
    Finance: "finance",
  })[canonicalDepartment(name) ?? name] ??
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
function readFacts(bankVersion: number): LocalFinanceProjectionInput {
  const workspace = saved<ProjectWorkspace>(
    "helix-member-local-projects-v1",
    initialLocalWorkspace(),
  );
  const budgets = saved<BudgetState>(BUDGETS, { version: 0, budgets: [] });
  const purchaseState = saved<LocalPurchaseState>(PURCHASES, {}),
    awards = saved<{ applications: FundingApplicationDetail[] }>(AWARDS, {
      applications: [],
    });
  const ledger = saved<LocalFinanceFixtureLedger>(LEDGER, {
    version: 0,
    seasonCode: workspace.season,
    budgetStatus: "absent",
    approvedOn: null,
    items: [],
  });
  const purchases = new Map<string, LocalRecordedPurchase>(
    Object.entries(purchaseState.records ?? {}).map(([id, record]) => [
      id,
      { ...record, ...purchaseState.overrides?.[id] },
    ]),
  );
  // Older synthetic registrations retain their exact input in the durable idempotency record.
  for (const [key, request] of Object.entries(purchaseState.requests ?? {})) {
    if (
      !request.fingerprint ||
      !request.result.id ||
      purchases.has(request.result.id)
    )
      continue;
    const action = JSON.parse(request.fingerprint) as {
      action: string;
      projectId: string;
      responsibleDepartmentId: string;
      purchase?: LocalRecordedPurchase["purchase"];
    };
    if (action.action !== "registerProjectPurchase" || !action.purchase)
      continue;
    const record: LocalRecordedPurchase = {
      id: request.result.id,
      publicRef: request.result.publicRef ?? request.result.id,
      projectId: action.projectId,
      responsibleDepartmentId: action.responsibleDepartmentId,
      requesterMemberId: key.split(":")[0] ?? null,
      purchase: action.purchase,
      ...purchaseState.overrides?.[request.result.id],
    };
    purchases.set(record.id, record);
  }
  const invoices = new Map<string, ProjectBudgetInvoiceReference>();
  for (const budget of budgets.budgets)
    for (const version of [
      ...(budget.historyVersions ?? []),
      budget.approvedVersion,
      budget.pendingVersion,
    ])
      for (const entry of version?.entries ?? [])
        for (const ref of entry.invoices ?? [])
          invoices.set(
            ref.documentId,
            localInvoiceReference(
              purchaseState.evidence?.[ref.documentId] ?? ref,
              true,
            ),
          );
  for (const row of Object.values(purchaseState.evidence ?? {}))
    invoices.set(row.documentId, localInvoiceReference(row, true));
  for (const purchase of purchases.values())
    for (const documentId of purchase.purchase.uploadIds) {
      if (invoices.has(documentId)) continue;
      const upload = purchaseState.uploads?.[documentId];
      if (upload)
        invoices.set(documentId, {
          documentId,
          purchaseId: purchase.id,
          purchaseRef: purchase.publicRef,
          originalName: upload.name,
          backend: "private_storage",
          transferStatus: "stored",
          viewerUrl: null,
          canRetry: false,
        });
    }
  const hasApproval = budgets.budgets.some((b) => b.approvedVersionId !== null),
    hasActual = [...purchases.values()].some(
      (p) => !p.status || p.status === "registered",
    );
  return {
    viewVersion: combinedVersion(bankVersion),
    seasonCode: ledger.seasonCode ?? workspace.season,
    today: osloToday(),
    systems: workspace.departments.map((department, index) => ({
      id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      code: `SYS-${index + 1}`,
      name: department.name,
      active: true,
      departmentName: department.name,
      departmentKey: departmentKey(department.name),
      sortOrder: index,
    })),
    budgets: budgets.budgets,
    purchases: [...purchases.values()],
    invoices: [...invoices.values()],
    applications: awards.applications,
    legacy: {
      budgetStatus:
        ledger.budgetStatus === "absent" && (hasApproval || hasActual)
          ? "draft"
          : ledger.budgetStatus,
      approvedOn: ledger.budgetStatus === "approved" ? ledger.approvedOn : null,
      items: ledger.items,
    },
    funding: [...localSponsorFunding(), ...(ledger.funding ?? [])],
    parts: ledger.parts ?? [],
    commitments: ledger.commitments,
  };
}
export function loadLocalFinanceViews(bankVersion: number) {
  guard("finance");
  return projectLocalFinance(readFacts(bankVersion));
}
/** Explicit allowlist: no invoice references, item IDs, application context or private funding fields. */
export function loadLocalSeasonFinances(
  bankVersion: number,
): Omit<SeasonFinancialSummary, "bank"> {
  guard("season");
  const projected = projectLocalFinance(readFacts(bankVersion)),
    overview = projected.overview,
    visible = hasVisibleApprovedFinances(overview);
  const departments = overview.departments.map((department) => ({
    departmentKey: department.departmentKey,
    name: department.name,
    plannedNok: department.plannedNok,
    actualNok: department.actualNok,
    unbudgetedNok: department.unbudgetedNok,
    systems: department.systems.map((system) => ({
      id: system.id,
      code: system.code,
      name: system.name,
      active: system.active,
      plannedNok: system.plannedNok,
      actualNok: system.actualNok,
      unbudgetedNok: system.unbudgetedNok,
    })),
  }));
  const total = (key: "plannedNok" | "actualNok") =>
    formatOre(
      departments.reduce(
        (sum, department) => sum + nokToOre(department[key]),
        0n,
      ),
    );
  return {
    seasonCode: overview.seasonCode,
    budgetStatus:
      overview.budgetStatus === "draft" && !visible
        ? "draft-hidden"
        : overview.budgetStatus,
    approvedPresence: overview.approvedPresence,
    hasRecordedActuals: overview.hasRecordedActuals,
    plannedNok: visible ? total("plannedNok") : null,
    actualNok: visible ? total("actualNok") : null,
    departments: visible ? departments : [],
    canOpenFinancials: localMemberHasFinancials(),
    viewVersion: overview.viewVersion,
    moneyFlow: overview.seasonCode
      ? { status: "unavailable" }
      : { status: "no-season" },
  };
}

/** Processing uses the same persisted purchase facts; it never edits the dated bank balance. */
export function mutateLocalPurchase(
  action: Record<string, unknown>,
  bankVersion: number,
): FinanceMutationResult {
  guard("finance");
  const purchaseActions = [
    "voidPurchase",
    "markInvoicePaid",
    "unmarkInvoicePaid",
    "markRefundPaid",
    "unmarkRefundPaid",
    "reviewException",
  ];
  if (!purchaseActions.includes(String(action.action)))
    throw Object.assign(
      new Error("This operation is unavailable. Try again later."),
      { status: 503 },
    );
  const fail = (message: string, status = 400): never => {
    throw Object.assign(new Error(message), { status });
  };
  if (typeof action.requestId !== "string" || !action.requestId)
    fail("A request ID is required.");
  const state = saved<LocalPurchaseState>(PURCHASES, {}),
    budgets = saved<BudgetState>(BUDGETS, { version: 0, budgets: [] });
  const fingerprint = stableJson({ ...action, expectedRevision: undefined }),
    key = String(action.requestId),
    prior = state.mutations?.[key];
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail("This request ID was already used for a different change.", 409);
    return prior.result;
  }
  const facts = readFacts(bankVersion),
    record = facts.purchases.find((p) =>
      action.action === "reviewException"
        ? p.reviewFacts?.some((r) => r.id === action.reviewId)
        : p.id === action.purchaseId,
    );
  if (!record) fail("Purchase was not found.", 404);
  const current = record!;
  if (
    action.action !== "reviewException" &&
    (current.revision ?? 0) !== action.expectedRevision
  )
    fail("This record changed. Reload it before saving.", 409);
  if (
    action.action !== "reviewException" &&
    (current.status ?? "registered") !== "registered"
  )
    fail("Only a registered purchase can be updated.", 409);
  const reason = typeof action.reason === "string" ? action.reason.trim() : "";
  if (action.action === "voidPurchase" || action.action === "reviewException")
    if (reason.length < 3 || reason.length > 500)
      fail("Enter a reason of up to 500 characters.");
  if (action.action === "reviewException") {
    const review = current.reviewFacts!.find((r) => r.id === action.reviewId)!;
    if (review.reviewStatus !== "open")
      fail("This exception has already been reviewed.", 409);
    Object.assign(review, {
      reviewStatus: "reviewed",
      reason,
      actorMemberId: "local-member",
      reviewedAt: new Date().toISOString(),
    });
  } else if (action.action === "voidPurchase") {
    const normalized = normalizePurchaseInput(current.purchase).purchase!;
    for (const budget of budgets.budgets) {
      const versions = [
        ...(budget.historyVersions ?? []),
        budget.approvedVersion,
        budget.pendingVersion,
      ].filter((v) => v !== null && v !== undefined);
      const ids = new Set(
        versions.flatMap((v) => v.entries.map((e) => e.entryId)),
      );
      let touched = false;
      for (const id of ids) {
        const lines = normalized.lines.filter(
          (line) => line.budgetItemId === id,
        );
        if (!lines.length) continue;
        const latest =
          budget.approvedVersion?.entries.find((e) => e.entryId === id) ??
          [...versions]
            .reverse()
            .flatMap((v) => v.entries)
            .find((e) => e.entryId === id)!;
        const amount =
          nokToOre(latest.actualNok) -
          lines.reduce((sum, line) => sum + line.amountOre, 0n);
        if (amount < 0n)
          fail("Stored purchase amounts could not be reconciled.", 409);
        const other = facts.purchases.some(
          (p) =>
            p.id !== current.id &&
            (p.status ?? "registered") === "registered" &&
            p.purchase.lines.some((line) => line.budgetItemId === id),
        );
        const historical = latest.invoices?.some(
          (ref) =>
            ref.purchaseId !== current.id &&
            !facts.purchases.some(
              (p) => p.id === ref.purchaseId && p.status === "voided",
            ),
        );
        for (const version of versions)
          for (const entry of version.entries)
            if (entry.entryId === id) {
              entry.actualNok = formatOre(amount);
              entry.completion =
                other || historical || amount > 0n
                  ? "partial"
                  : "not_purchased";
            }
        state.audit ??= [];
        state.audit.push({
          action: "completion_reopened",
          entryId: id,
          purchaseId: current.id,
          reason,
        });
        touched = true;
      }
      if (touched) budget.revision++;
    }
    current.status = "voided";
    current.voidReason = reason;
  } else {
    const invoice = String(action.action).includes("Invoice"),
      marking = String(action.action).startsWith("mark");
    const obligations = localPurchaseObligations(current.purchase);
    if (!(invoice ? obligations.invoice : obligations.reimbursement))
      fail("This purchase has no matching payment obligation.");
    if (
      ((invoice ? current.invoicePaid : current.refundPaid) ?? false) ===
      marking
    )
      fail(
        marking
          ? "This payment is already recorded."
          : "This payment is not recorded.",
        409,
      );
    let date: string | null = null;
    if (marking) {
      try {
        date = parseIsoDate(String(action.paidOn ?? ""));
      } catch {
        fail("Enter a valid payment date.");
      }
      if (date && date > osloToday())
        fail("Payment date cannot be after today.");
    }
    if (invoice) {
      current.invoicePaid = marking;
      current.invoicePaidOn = date;
    } else {
      current.refundPaid = marking;
      current.refundPaidOn = date;
    }
  }
  if (action.action !== "reviewException")
    current.revision = (current.revision ?? 0) + 1;
  state.records ??= {};
  state.records[current.id] = current;
  state.audit ??= [];
  state.audit.push({
    action: String(action.action),
    purchaseId: current.id,
    ...(reason ? { reason } : {}),
  });
  budgets.version++;
  const result: FinanceMutationResult = {
    ok: true,
    id:
      action.action === "reviewException"
        ? String(action.reviewId)
        : current.id,
    publicRef: current.publicRef,
    revision: current.revision,
    viewVersion: facts.viewVersion + 1,
    warnings: [],
    errors: [],
  };
  state.mutations ??= {};
  state.mutations[key] = { fingerprint, result };
  localStorage.setItem(PURCHASES, JSON.stringify(state));
  localStorage.setItem(BUDGETS, JSON.stringify(budgets));
  return result;
}
