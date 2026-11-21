import {
  allocatedSystemCatalog,
  financeAllocationDepartment,
} from "./department-allocation";
import { differenceOre, effectivePlanOre } from "./budget-domain";
import {
  buildBudgetHierarchy,
  type BudgetHierarchySystem,
} from "./budget-hierarchy";
import {
  buildDepartmentSummaries,
  calculateScenarios,
  deadlineAwareUsage,
  nokToOre,
  presentFinanceOverview,
  usedFraction,
  type BudgetItemFact,
  type FundingFact,
} from "./finance-calculations";
import { earmarkedOre } from "./funding";
import { formatOre } from "./money";
import { normalizePurchaseInput } from "./purchase-domain";
import { localInvoiceReference } from "./local-invoice-reference";
import type {
  ProjectBudgetDetail,
  ProjectBudgetInvoiceReference,
} from "./project-budget-types";
import type { FundingApplicationDetail } from "./funding-application-types";
import type {
  FinancePurchaseSummary,
  FundingPartRecord,
  FundingRecord,
  PublicBudgetItem,
  PurchaseInput,
  PurchaseStatus,
} from "./types";

export interface LocalRecordedPurchase {
  id: string;
  publicRef: string;
  projectId: string;
  responsibleDepartmentId: string;
  requesterMemberId: string | null;
  purchase: PurchaseInput;
  /** Recorded at registration. Null means no approved entry, never a retrospective approval. */
  approval?: Array<{
    entryId: string;
    approvedVersionId: string | null;
    earmarkId: string | null;
  }>;
  status?: PurchaseStatus;
  revision?: number;
  voidReason?: string | null;
  invoicePaid?: boolean;
  invoicePaidOn?: string | null;
  refundPaid?: boolean;
  refundPaidOn?: string | null;
  reviewFacts?: FinancePurchaseSummary["exceptions"];
}
export interface LocalFinanceProjectionInput {
  viewVersion: number;
  seasonCode: string | null;
  today: string;
  systems: BudgetHierarchySystem[];
  departments?: Array<{
    id: string;
    departmentKey: string;
    departmentName: string;
    sortOrder: number;
  }>;
  budgets: ProjectBudgetDetail[];
  purchases: LocalRecordedPurchase[];
  invoices: ProjectBudgetInvoiceReference[];
  applications: FundingApplicationDetail[];
  legacy: {
    budgetStatus: "absent" | "draft" | "approved";
    approvedOn: string | null;
    items: PublicBudgetItem[];
  };
  funding: FundingRecord[];
  parts: FundingPartRecord[];
  commitments?: Array<{ entryId: string; remainingNok: string }>;
}
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + nokToOre(value), 0n);
/** Mirror the independent obligation rows created by migration 070. */
export function localPurchaseObligations(
  purchase: Pick<PurchaseInput, "documentKind" | "paymentMethod">,
) {
  return {
    invoice:
      purchase.documentKind === "invoice" ||
      purchase.paymentMethod === "invoice",
    reimbursement: purchase.paymentMethod === "outlay",
  };
}
/** Build canonical read facts, then use exactly the same hierarchy/scenario presenters as the server. */
export function projectLocalFinance(input: LocalFinanceProjectionInput) {
  const departmentsById = new Map(
    (input.departments ?? []).map((department) => [department.id, department]),
  );
  const allocatedKey = (
    systemId: string,
    source: "legacy" | "project",
    projectId: string | null,
    responsibleDepartmentId: string | null,
    unbudgeted = false,
  ) => {
    const physical = input.systems.find((system) => system.id === systemId);
    if (!physical)
      throw new Error(
        "The physical system is missing from the financial catalog.",
      );
    if (!input.departments) return physical.departmentKey;
    return financeAllocationDepartment(
      { source, projectId, responsibleDepartmentId, unbudgeted },
      physical,
      departmentsById,
    ).departmentKey;
  };
  const registered = input.purchases.filter(
    (p) => !p.status || p.status === "registered",
  );
  const normalized = new Map(
    input.purchases.map((p) => {
      const value = normalizePurchaseInput(p.purchase);
      if (!value.purchase || value.errors.length)
        throw new Error("Stored purchase data could not be read.");
      return [p.id, value.purchase] as const;
    }),
  );
  const invoiceMap = new Map(
    input.invoices.map((ref) => [
      ref.documentId,
      localInvoiceReference(ref, true),
    ]),
  );
  const activeObligation = (id: string) =>
    input.applications.some(
      (app) =>
        !!app.award &&
        app.links.some((link) => link.entryId === id && !link.release),
    );
  const commitment = (id: string, fallback = "0.00") =>
    input.commitments
      ? formatOre(
          sum(
            input.commitments
              .filter((c) => c.entryId === id)
              .map((c) => c.remainingNok),
          ),
        )
      : fallback;
  const items = new Map<string, PublicBudgetItem>(
    input.legacy.items.map((item) => [
      item.id,
      {
        ...item,
        source: "legacy" as const,
        approved: input.legacy.budgetStatus === "approved",
        effectivePlanNok:
          input.legacy.budgetStatus === "approved" &&
          item.status !== "cancelled"
            ? item.effectivePlanNok
            : "0.00",
        invoices: item.invoices?.map((ref) => localInvoiceReference(ref, true)),
      },
    ]),
  );
  for (const budget of input.budgets) {
    const versions = [
      ...(budget.historyVersions ?? []),
      ...(budget.approvedVersion ? [budget.approvedVersion] : []),
    ].sort((a, b) => a.versionNumber - b.versionNumber);
    // A mapped legacy plan remains effective until the first genuine project approval.
    for (const candidate of budget.pendingVersion?.entries ?? []) {
      const legacy = items.get(candidate.budgetItemId ?? candidate.entryId);
      if (legacy && !budget.approvedVersion)
        Object.assign(legacy, {
          projectBudgetId: budget.id,
          projectId: budget.projectId,
          projectName: budget.projectName,
          responsibleDepartmentId: budget.responsibleDepartmentId,
          ordinaryPriority: candidate.ordinaryPriority,
          priority: activeObligation(candidate.entryId)
            ? "P0"
            : legacy.priority,
        });
    }
    if (!budget.approvedVersion) continue;
    const current = new Map(
      budget.approvedVersion.entries.map((entry) => [entry.entryId, entry]),
    );
    const retained = new Map(
      versions.flatMap((version) =>
        version.entries.map((entry) => [entry.entryId, entry] as const),
      ),
    );
    for (const [id, old] of retained) {
      const entry = current.get(id) ?? { ...old, removed: true },
        cancelled = entry.removed || entry.status === "cancelled";
      const actual = entry.actualNok,
        plan = formatOre(
          effectivePlanOre(
            nokToOre(entry.plannedNok),
            cancelled ? "cancelled" : entry.status,
            false,
          ),
        );
      const refs = new Map(
        (entry.invoices ?? []).map((ref) => [
          ref.documentId,
          localInvoiceReference(invoiceMap.get(ref.documentId) ?? ref, true),
        ]),
      );
      for (const purchase of input.purchases)
        if (
          normalized
            .get(purchase.id)!
            .lines.some((line) => line.budgetItemId === id)
        )
          for (const documentId of purchase.purchase.uploadIds) {
            const ref = invoiceMap.get(documentId);
            if (ref) refs.set(documentId, ref);
          }
      items.set(id, {
        id,
        publicRef: entry.publicRef ?? id,
        systemId: entry.systemId,
        systemCode:
          input.systems.find((s) => s.id === entry.systemId)?.code ?? "",
        description: entry.description,
        category: entry.category,
        plannedNok: entry.plannedNok,
        effectivePlanNok: plan,
        actualNok: actual,
        differenceNok: formatOre(
          differenceOre(nokToOre(plan), nokToOre(actual)),
        ),
        priority: activeObligation(id) ? "P0" : entry.ordinaryPriority,
        ordinaryPriority: entry.ordinaryPriority,
        approved: true,
        source: "project",
        projectBudgetId: budget.id,
        projectId: budget.projectId,
        projectName: budget.projectName,
        responsibleDepartmentId: budget.responsibleDepartmentId,
        approvedVersionId: budget.approvedVersionId,
        completion: entry.completion,
        invoices: [...refs.values()],
        reuseStatus: entry.reuseStatus,
        expectedPurchaseDate: entry.expectedPurchaseDate ?? null,
        status: cancelled ? "cancelled" : entry.status,
        revision: budget.revision,
        earmarked: !!entry.earmarkId,
        earmarkId: entry.earmarkId ?? null,
        earmarkPurpose:
          input.parts.find((p) => p.id === entry.earmarkId)?.purpose ?? null,
        earmarkAmountNok:
          input.parts.find((p) => p.id === entry.earmarkId)?.amountNok ?? null,
        note: entry.note ?? null,
        ownerEmail: entry.ownerEmail ?? null,
        commitmentNok: commitment(id),
        usedFraction: usedFraction(nokToOre(actual), nokToOre(plan)),
      });
    }
  }
  for (const item of items.values()) {
    item.allocationDepartmentKey = allocatedKey(
      item.systemId,
      item.source ?? "legacy",
      item.projectId ?? null,
      item.responsibleDepartmentId ?? null,
    );
    if (activeObligation(item.id)) item.priority = "P0";
    item.commitmentNok = commitment(item.id, item.commitmentNok);
  }
  const unbudgeted = new Map<
    string,
    { systemId: string; allocationDepartmentKey: string; actualOre: bigint }
  >();
  for (const purchase of registered)
    for (const line of normalized.get(purchase.id)!.lines)
      if (
        line.unbudgeted ||
        !line.budgetItemId ||
        !items.has(line.budgetItemId)
      ) {
        const allocationDepartmentKey = allocatedKey(
            line.systemId,
            "project",
            purchase.projectId,
            input.budgets.find(
              (budget) =>
                budget.projectId === purchase.projectId &&
                budget.seasonCode === input.seasonCode,
            )?.responsibleDepartmentId ?? purchase.responsibleDepartmentId,
            true,
          ),
          key = `${line.systemId}:${allocationDepartmentKey}`,
          previous = unbudgeted.get(key);
        unbudgeted.set(key, {
          systemId: line.systemId,
          allocationDepartmentKey,
          actualOre: (previous?.actualOre ?? 0n) + line.amountOre,
        });
      }
  const unallocated = [...unbudgeted.values()].map((row) => ({
    id: `unallocated:${row.systemId}`,
    publicRef: `UNALLOCATED-${input.systems.find((system) => system.id === row.systemId)?.code ?? row.systemId}`,
    systemId: row.systemId,
    allocationDepartmentKey: row.allocationDepartmentKey,
    actualNok: formatOre(row.actualOre),
    note: null,
    revision: 0,
  }));
  const actualAttribution = (
    item: PublicBudgetItem,
    spendBy?: string | null,
  ) => {
    const result: Array<{ partId: string; amountOre: bigint }> = [];
    for (const purchase of registered)
      for (const line of normalized.get(purchase.id)!.lines) {
        if (
          line.budgetItemId !== item.id ||
          (spendBy && purchase.purchase.purchaseDate > spendBy)
        )
          continue;
        const record = purchase.approval?.find((a) => a.entryId === item.id);
        let part = record?.earmarkId;
        if (record === undefined) {
          const header = input.budgets.find(
            (b) => b.projectId === purchase.projectId,
          );
          const version = [
            ...(header?.historyVersions ?? []),
            ...(header?.approvedVersion ? [header.approvedVersion] : []),
          ]
            .sort((a, b) => a.versionNumber - b.versionNumber)
            .find((v) =>
              v.entries.some(
                (e) =>
                  e.entryId === item.id &&
                  e.invoices?.some((ref) => ref.purchaseId === purchase.id),
              ),
            );
          part = version?.entries.find((e) => e.entryId === item.id)?.earmarkId;
        }
        if (part) result.push({ partId: part, amountOre: line.amountOre });
      }
    // Genuine legacy anchors retain their original restricted attribution until project replacement.
    if (
      !spendBy &&
      item.source === "legacy" &&
      result.length === 0 &&
      item.earmarkId
    )
      result.push({
        partId: item.earmarkId,
        amountOre: nokToOre(item.actualNok),
      });
    return result;
  };
  const fundingFacts: FundingFact[] = input.funding.map((f) => ({
    id: f.id,
    status: f.status,
    confidence: f.confidence,
    amountOre: nokToOre(f.amountNok),
  }));
  const facts: BudgetItemFact[] = [...items.values()].map((item) => ({
    id: item.id,
    priority: item.priority,
    status: item.status,
    plannedOre: nokToOre(item.effectivePlanNok),
    actualOre: nokToOre(item.actualNok),
    commitmentOre: nokToOre(item.commitmentNok ?? "0.00"),
    unallocated: false,
    earmarkId: item.earmarkId ?? null,
    earmarkAmountOre: item.earmarkAmountNok
      ? nokToOre(item.earmarkAmountNok)
      : null,
    funding:
      fundingFacts.find(
        (f) =>
          f.id === input.parts.find((p) => p.id === item.earmarkId)?.fundingId,
      ) ?? null,
    restrictedActual: actualAttribution(item),
  }));
  for (const row of unallocated)
    facts.push({
      id: `${row.id}:${row.allocationDepartmentKey}`,
      priority: "P1",
      status: "active",
      plannedOre: 0n,
      actualOre: nokToOre(row.actualNok),
      commitmentOre: 0n,
      unallocated: true,
      earmarkId: null,
      earmarkAmountOre: null,
      funding: null,
      restrictedActual: [],
    });
  const catalog = allocatedSystemCatalog(
    input.systems,
    (input.departments ?? input.systems).map(
      ({ departmentKey, departmentName, sortOrder }) => ({
        departmentKey,
        departmentName,
        sortOrder,
      }),
    ),
    [
      ...[...items.values()].map((item) => ({
        systemId: item.systemId,
        departmentKey: item.allocationDepartmentKey!,
      })),
      ...unallocated.map((row) => ({
        systemId: row.systemId,
        departmentKey: row.allocationDepartmentKey,
      })),
    ],
  );
  const hierarchy = buildBudgetHierarchy({
    systems: catalog,
    items: [...items.values()],
    unallocated,
    includePrivateUnallocated: true,
  });
  const departments = buildDepartmentSummaries(
    catalog.map((system) => ({
      ...system,
      items: facts.filter((item) => {
        const entry = items.get(item.id);
        return entry
          ? entry.systemId === system.id &&
              entry.allocationDepartmentKey === system.departmentKey
          : unallocated.some(
              (row) =>
                `${row.id}:${row.allocationDepartmentKey}` === item.id &&
                row.systemId === system.id &&
                row.allocationDepartmentKey === system.departmentKey,
            );
      }),
    })),
  );
  const computations = calculateScenarios(
    facts,
    fundingFacts,
    input.parts.map((part) => ({
      id: part.id,
      fundingId: part.fundingId,
      amountOre: nokToOre(part.amountNok),
    })),
  );
  const scenarios = computations.map(
    ({
      key,
      label,
      eligibleFundingNok,
      earmarkedNok,
      unrestrictedNok,
      needNok,
      restrictedCoverNok,
      generalNeedNok,
      shortfallNok,
    }) => ({
      key,
      label,
      eligibleFundingNok,
      earmarkedNok,
      unrestrictedNok,
      needNok,
      restrictedCoverNok,
      generalNeedNok,
      shortfallNok,
    }),
  );
  const parts = input.parts.map((part) => {
    const spent = [...items.values()]
      .flatMap((item) => actualAttribution(item, part.spendBy))
      .filter((record) => record.partId === part.id)
      .reduce((total, record) => total + record.amountOre, 0n);
    const usage = deadlineAwareUsage(
      nokToOre(part.amountNok),
      spent,
      part.spendBy,
      input.today,
    );
    const linked = [...items.values()].filter(
      (item) => item.earmarkId === part.id && item.status !== "cancelled",
    );
    return {
      ...part,
      usedNok: formatOre(usage.usedOre),
      leftNok: formatOre(usage.leftOre),
      mustReturnNok: formatOre(usage.mustReturnOre),
      overdue: usage.overdue,
      systemName:
        linked.length === 1
          ? (input.systems.find((s) => s.id === linked[0].systemId)?.name ??
            null)
          : null,
      linkedItems: linked.map((item) => ({
        id: item.id,
        publicRef: item.publicRef,
        description: item.description,
        systemId: item.systemId,
        systemCode: item.systemCode,
        systemName:
          input.systems.find((s) => s.id === item.systemId)?.name ?? "",
        status: item.status,
      })),
    };
  });
  const funding = input.funding.map((record) => {
    const linkedParts = parts.filter((part) => part.fundingId === record.id),
      earmarked = earmarkedOre(
        linkedParts.map((part) => nokToOre(part.amountNok)),
      );
    return {
      ...record,
      earmarkedNok: formatOre(earmarked),
      unrestrictedNok: formatOre(nokToOre(record.amountNok) - earmarked),
      linkedItemCount: new Set(
        linkedParts.flatMap((part) => part.linkedItems.map((item) => item.id)),
      ).size,
    };
  });
  const approvedPresence = {
    legacyBudget: input.legacy.budgetStatus === "approved",
    projectBudgets: input.budgets.some((b) => b.approvedVersionId !== null),
  };
  const hasRecordedActuals =
    registered.length > 0 || facts.some((item) => item.actualOre !== 0n);
  const basis = {
    viewVersion: input.viewVersion,
    seasonCode: input.seasonCode,
    budgetStatus: input.legacy.budgetStatus,
    approvedOn: input.legacy.approvedOn,
    approvedPresence,
    hasRecordedActuals,
  };
  const publicEarmarks = parts
    .filter((part) =>
      funding.some(
        (record) =>
          record.id === part.fundingId &&
          (record.status === "secured" || record.status === "received"),
      ),
    )
    .map((part) => ({
      id: part.id,
      publicRef: part.publicRef,
      purpose: part.purpose,
      amountNok: part.amountNok,
      usedNok: part.usedNok,
      leftNok: part.leftNok,
      mustReturnNok: part.mustReturnNok,
      spendBy: part.spendBy,
      systemName: part.systemName,
    }));
  const overview = presentFinanceOverview({
    ...basis,
    departments,
    publicEarmarks,
    scenarios,
    earmarkSources: parts.map((part) => ({
      id: part.id,
      sourceName:
        funding.find((record) => record.id === part.fundingId)?.sourceName ??
        "",
      conditions: part.conditions,
    })),
    showAggregates:
      approvedPresence.legacyBudget ||
      approvedPresence.projectBudgets ||
      hasRecordedActuals,
    showPrivate: true,
  });
  const register: FinancePurchaseSummary[] = input.purchases.map((record) => {
    const purchase = normalized.get(record.id)!,
      obligations = localPurchaseObligations(purchase),
      invoice = obligations.invoice
        ? {
            dueDate: record.purchase.invoiceDueDate ?? null,
            paid: record.invoicePaid === true,
            paidOn: record.invoicePaidOn ?? null,
          }
        : null,
      reimbursement = obligations.reimbursement
        ? {
            paid: record.refundPaid === true,
            paidOn: record.refundPaidOn ?? null,
          }
        : null;
    return {
      id: record.id,
      publicRef: record.publicRef,
      status: record.status ?? "registered",
      buyerName: purchase.buyerName,
      supplierName: purchase.supplierName,
      requesterMemberId: record.requesterMemberId,
      requesterName: null,
      paymentMethod: purchase.paymentMethod,
      purchaseDate: purchase.purchaseDate,
      justification: purchase.justification,
      documentKind: purchase.documentKind,
      documentNumber: purchase.documentNumber,
      revision: record.revision ?? 0,
      voidReason: record.voidReason ?? null,
      totalNok: formatOre(
        purchase.lines.reduce((total, line) => total + line.amountOre, 0n),
      ),
      refundAccount: purchase.refundAccount,
      refundPhone: purchase.refundPhone,
      unpaid:
        (record.status ?? "registered") === "registered" &&
        !!(
          (invoice && !invoice.paid) ||
          (reimbursement && !reimbursement.paid)
        ),
      invoice,
      reimbursement,
      lines: purchase.lines.map((line, index) => ({
        id: `${record.id}-line-${index + 1}`,
        publicRef: `${record.publicRef}-L${index + 1}`,
        systemName:
          input.systems.find((s) => s.id === line.systemId)?.name ?? "",
        itemName: line.budgetItemId
          ? (items.get(line.budgetItemId)?.description ?? null)
          : null,
        description: line.description,
        amountNok: formatOre(line.amountOre),
        allocationNok: formatOre(line.amountOre),
      })),
      documents: purchase.uploadIds.flatMap((id, index) => {
        const ref = invoiceMap.get(id);
        return ref
          ? [
              {
                id,
                publicRef: `${record.publicRef}-D${index + 1}`,
                kind: purchase.documentKind,
                documentNumber: purchase.documentNumber,
                originalName: ref.originalName,
                backend: ref.backend,
                transferStatus: ref.transferStatus,
                transferRevision: ref.transferRevision,
                viewerUrl: ref.viewerUrl,
                canRetry: ref.canRetry,
              },
            ]
          : [];
      }),
      exceptions: record.reviewFacts ?? [],
    };
  });
  return {
    overview,
    budgets: { ...basis, revision: 0, ...hierarchy },
    purchases: {
      viewVersion: input.viewVersion,
      ownRequests: [],
      register,
      unpaidCount: register.filter((p) => p.status === "registered" && p.unpaid)
        .length,
    },
    financing: {
      viewVersion: input.viewVersion,
      seasonCode: input.seasonCode,
      funding,
      parts,
      scenarios,
    },
    items: [...items.values()],
  };
}
