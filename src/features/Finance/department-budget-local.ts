import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import { localBudgetRole, localBudgetWorkspace } from "./project-budget-local";
import { localInvoiceReference } from "./local-invoice-reference";
import { assertLocalFundingEntry } from "./funding-application-local";
import {
  localDepartmentKey,
  loadLocalDepartmentHomeBudget,
  type LocalFinanceFixtureLedger,
} from "./local-finance-read";
import {
  departmentPlanVersion,
  invalidateLocalDepartmentPackage,
  localDepartmentPlanPin,
  type LocalDepartmentBudgetState,
  type LocalDepartmentPackage,
} from "./department-budget-local-model";
import { stableJson } from "./funding";
import { formatOre } from "./money";
import { nokToOre } from "./finance-calculations";
import type {
  DepartmentBudgetCapabilities,
  DepartmentBudgetPackageMutation,
  DepartmentBudgetPreview,
  DepartmentBudgetProject,
  DepartmentBudgetSnapshot,
} from "./department-budget-types";
import type { DepartmentBudgetRepository } from "./department-budget-repository";
import type { ProjectBudgetDetail } from "./project-budget-types";
import type { FinanceMutationResult } from "./types";
export { loadLocalDepartmentHomeBudget };
const KEY = "helix-project-budgets-local-v1",
  LEDGER = "helix-finance-local-ledger-v1",
  seasonId = "a1111111-1111-4111-8111-111111111111";
function fail(message: string, status = 403): never {
  throw Object.assign(new Error(message), { status });
}
const guard = () => {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    fail("Sign in to continue.", 401);
};
function read(): LocalDepartmentBudgetState {
  guard();
  return JSON.parse(
    localStorage.getItem(KEY) ?? '{"version":0,"budgets":[],"requests":{}}',
  ) as LocalDepartmentBudgetState;
}
function ledger(): LocalFinanceFixtureLedger {
  return JSON.parse(
    localStorage.getItem(LEDGER) ??
      '{"version":0,"seasonCode":"S27","budgetStatus":"absent","approvedOn":null,"items":[]}',
  ) as LocalFinanceFixtureLedger;
}
function authority(departmentId?: string) {
  guard();
  const workspace = localBudgetWorkspace(),
    profile = localBudgetRole(),
    finance = profile === "finance" || profile === "head_of_finance",
    head = profile === "head_of_finance";
  const departments = workspace.departments.filter(
    (department) =>
      finance ||
      (profile === "department_lead" &&
        (
          department.leadIds ?? (department.leadId ? [department.leadId] : [])
        ).includes(workspace.viewerId)),
  );
  if (
    departmentId &&
    !departments.some((department) => department.id === departmentId)
  )
    fail("Department budget review access is required.");
  if (!departmentId && !departments.length)
    fail("Department budget review access is required.");
  return {
    workspace,
    profile,
    finance,
    head,
    departments,
    actor:
      profile === "department_lead"
        ? "22222222-2222-4222-8222-222222222222"
        : head
          ? "44444444-4444-4444-8444-444444444444"
          : "33333333-3333-4333-8333-333333333333",
  };
}
const capabilities = (departmentId: string): DepartmentBudgetCapabilities => {
  const access = authority(departmentId),
    lead = access.profile === "department_lead";
  return {
    canSubmit: lead,
    canApproveFinance: access.head,
    canReturn: access.finance,
    canWithdraw: lead,
  };
};
const sum = (values: string[]) =>
  formatOre(values.reduce((total, value) => total + nokToOre(value), 0n));
function snapshot(
  state: LocalDepartmentBudgetState,
  departmentId: string,
): DepartmentBudgetSnapshot {
  const access = authority(departmentId),
    department = access.departments.find(
      (department) => department.id === departmentId,
    )!,
    legacy = ledger();
  const plan = (version: ProjectBudgetDetail["approvedVersion"]) => {
    const value = departmentPlanVersion(version);
    return value
      ? {
          ...value,
          entries: value.entries.map((entry) => ({
            ...entry,
            systemName:
              access.workspace.departments[
                Number(entry.systemId.slice(-12)) - 1
              ]?.name ?? entry.systemId,
            systemCode: `SYS-${Number(entry.systemId.slice(-12))}`,
          })),
        }
      : null;
  };
  const active = state.packages?.find(
    (packet) =>
      packet.snapshot.departmentId === departmentId &&
      packet.status === "finance_pending",
  );
  const projects: DepartmentBudgetProject[] = access.workspace.projects
    .filter((project) => project.departments.includes(department.name))
    .map((project) => {
      const budget = state.budgets.find(
          (budget) => budget.projectId === project.id,
        ),
        associated = access.workspace.departments.filter((department) =>
          project.departments.includes(department.name),
        ),
        owner = budget?.responsibleDepartmentId ?? null,
        owned = owner === departmentId;
      const candidate = budget?.pendingVersion,
        included =
          owned &&
          !!candidate &&
          ["department_pending", "finance_pending"].includes(
            candidate.status,
          ) &&
          !active;
      const approved = owned ? plan(budget?.approvedVersion ?? null) : null,
        proposed = included ? plan(candidate ?? null) : null,
        approvedTotalNok = approved?.totalNok ?? "0.00",
        proposedTotalNok = proposed?.totalNok ?? approvedTotalNok;
      return {
        projectId: project.id,
        projectName: project.name,
        projectLeadIds: project.leadIds ?? [],
        projectBudgetId: budget?.id ?? null,
        responsibleDepartmentId: owner,
        responsibleDepartmentName:
          access.workspace.departments.find(
            (department) => department.id === owner,
          )?.name ?? null,
        readiness: !budget
          ? associated.length === 1
            ? "no_budget"
            : "unallocated"
          : !owner
            ? "unallocated"
            : !owned
              ? "other_department"
              : (candidate?.status ?? "approved"),
        included,
        approvedVersion: approved,
        proposedVersion: proposed,
        approvedTotalNok,
        proposedTotalNok,
        deltaNok: formatOre(
          nokToOre(proposedTotalNok) - nokToOre(approvedTotalNok),
        ),
      };
    });
  const effectiveReplacement = new Set(
      state.budgets.flatMap(
        (budget) =>
          budget.approvedVersion?.entries.map((entry) => entry.entryId) ?? [],
      ),
    ),
    replacements = new Map(
      projects
        .filter((project) => project.included)
        .flatMap((project) =>
          project.proposedVersion!.entries.map(
            (entry) => [entry.entryId, project.projectId] as const,
          ),
        ),
    );
  const workspace = initialLocalWorkspace(),
    allDepartments = access.workspace.departments;
  const legacyEntries =
    legacy.budgetStatus !== "approved"
      ? []
      : legacy.items
          .filter(
            (item) =>
              !effectiveReplacement.has(item.id) &&
              item.status !== "cancelled" &&
              allDepartments[Number(item.systemId.slice(-12)) - 1]?.id ===
                departmentId,
          )
          .map((item) => ({
            entryId: item.id,
            publicRef: item.publicRef,
            description: item.description,
            systemId: item.systemId,
            systemName:
              workspace.departments[Number(item.systemId.slice(-12)) - 1]
                ?.name ?? item.systemCode,
            plannedNok: item.effectivePlanNok,
            proposedNok: replacements.has(item.id)
              ? "0.00"
              : item.effectivePlanNok,
            replacementProjectId: replacements.get(item.id) ?? null,
          }));
  const legacyTotalNok = sum(legacyEntries.map((entry) => entry.plannedNok)),
    proposedLegacyTotalNok = sum(
      legacyEntries.map((entry) => entry.proposedNok),
    ),
    approvedTotalNok = sum([
      ...projects.map((project) => project.approvedTotalNok),
      legacyTotalNok,
    ]),
    proposedTotalNok = sum([
      ...projects.map((project) => project.proposedTotalNok),
      proposedLegacyTotalNok,
    ]);
  return {
    departmentId,
    departmentName: department.name,
    departmentKey: localDepartmentKey(department.name),
    seasonId,
    seasonCode: access.workspace.season,
    projects,
    legacyEntries,
    approvedTotalNok,
    proposedTotalNok,
    deltaNok: formatOre(
      nokToOre(proposedTotalNok) - nokToOre(approvedTotalNok),
    ),
    legacyTotalNok,
    proposedLegacyTotalNok,
  };
}
/** Readiness is pinned, while mutable revisions and derived priority are excluded from plan freshness. */
function snapshotPin(value: DepartmentBudgetSnapshot) {
  return stableJson({
    ...value,
    projects: value.projects.map((project) => ({
      ...project,
      approvedVersion: localDepartmentPlanPin(project.approvedVersion),
      proposedVersion: localDepartmentPlanPin(project.proposedVersion),
    })),
  });
}
function validatePackage(
  state: LocalDepartmentBudgetState,
  packet: LocalDepartmentPackage,
) {
  const access = authority(packet.snapshot.departmentId);
  if (access.workspace.season !== packet.snapshot.seasonCode)
    fail("The department season changed. Send a new package.", 409);
  const approvedLegacy = (value: DepartmentBudgetSnapshot) =>
    value.legacyEntries
      .map((entry) => {
        const {
          proposedNok: _proposed,
          replacementProjectId: _replacement,
          ...plan
        } = entry;
        return plan;
      })
      .sort((a, b) => a.entryId.localeCompare(b.entryId));
  if (
    stableJson(
      approvedLegacy(snapshot(state, packet.snapshot.departmentId)),
    ) !== stableJson(approvedLegacy(packet.snapshot))
  )
    fail(
      "The legacy transition baseline changed. Send a new department package.",
      409,
    );
  for (const project of packet.snapshot.projects) {
    const budget = state.budgets.find(
        (budget) => budget.id === project.projectBudgetId,
      ),
      currentProject = access.workspace.projects.find(
        (item) => item.id === project.projectId,
      ),
      departments = access.workspace.departments.filter((department) =>
        currentProject?.departments.includes(department.name),
      ),
      owner = budget?.responsibleDepartmentId ?? null;
    if (
      !currentProject ||
      currentProject.season !== packet.snapshot.seasonCode ||
      (budget && budget.seasonCode !== packet.snapshot.seasonCode) ||
      (owner && !departments.some((department) => department.id === owner)) ||
      owner !== project.responsibleDepartmentId
    )
      fail(
        "Project budget ownership changed. Send a new department package.",
        409,
      );
    if (
      project.responsibleDepartmentId === packet.snapshot.departmentId &&
      localDepartmentPlanPin(
        departmentPlanVersion(budget?.approvedVersion ?? null),
      ) !== localDepartmentPlanPin(project.approvedVersion)
    )
      fail("An approved baseline changed. Send a new department package.", 409);
    if (
      project.included &&
      (!budget?.pendingVersion ||
        budget.pendingVersion.status !== "finance_pending" ||
        localDepartmentPlanPin(departmentPlanVersion(budget.pendingVersion)) !==
          localDepartmentPlanPin(project.proposedVersion))
    )
      fail("An included proposal changed. Send a new department package.", 409);
  }
}
function promote(budget: ProjectBudgetDetail, actor: string, now: string) {
  const candidate = budget.pendingVersion!;
  for (const entry of candidate.entries)
    assertLocalFundingEntry(entry.entryId, entry);
  for (const entry of budget.approvedVersion?.entries ?? [])
    if (!candidate.entries.some((item) => item.entryId === entry.entryId))
      assertLocalFundingEntry(entry.entryId, { ...entry, removed: true });
  candidate.status = "approved";
  candidate.approvedBy = actor;
  candidate.approvedAt = now;
  candidate.revision++;
  candidate.entries = candidate.entries.map((entry, index) => {
    const effective = budget.approvedVersion?.entries.find(
      (item) => item.entryId === entry.entryId,
    );
    return {
      ...entry,
      actualNok: effective?.actualNok ?? entry.actualNok,
      completion: effective?.completion ?? entry.completion,
      invoices: effective?.invoices ?? entry.invoices,
      budgetItemId: entry.removed ? entry.budgetItemId : entry.entryId,
      publicRef:
        entry.publicRef ??
        (entry.removed
          ? null
          : `BI-${budget.seasonCode}-${entry.entryId.slice(0, 8)}-${index + 1}`),
    };
  });
  if (
    budget.approvedVersion &&
    !(budget.historyVersions ?? []).some(
      (version) => version.id === budget.approvedVersion!.id,
    )
  )
    budget.historyVersions = [
      ...(budget.historyVersions ?? []),
      structuredClone(budget.approvedVersion),
    ];
  budget.approvedVersion = structuredClone(candidate);
  budget.approvedVersionId = candidate.id;
  budget.approvedTotalNok = candidate.totalNok;
  budget.pendingVersion = null;
  budget.pendingVersionId = null;
  budget.pendingTotalNok = null;
  budget.pendingStage = null;
  budget.revision++;
  budget.decisions.push({
    id: crypto.randomUUID(),
    versionId: candidate.id,
    action: "approveDepartmentBudgetPackage",
    actorMemberId: actor,
    reason: null,
    createdAt: now,
    snapshot: structuredClone(candidate.entries),
  });
}
function validateReplacementUnion(
  state: LocalDepartmentBudgetState,
  packet: LocalDepartmentPackage,
) {
  const included = new Set(
      packet.snapshot.projects
        .filter((project) => project.included)
        .map((project) => project.projectBudgetId),
    ),
    entries = state.budgets.flatMap(
      (budget) =>
        (included.has(budget.id)
          ? budget.pendingVersion
          : budget.approvedVersion
        )?.entries ?? [],
    ),
    parts = new Map<string, Set<string>>(),
    seen = new Set<string>();
  const replaced = new Set(entries.map((entry) => entry.entryId)),
    legacy = ledger();
  for (const entry of [
    ...entries,
    ...(legacy.budgetStatus === "approved"
      ? legacy.items
          .filter((item) => !replaced.has(item.id))
          .map((item) => ({
            entryId: item.id,
            systemId: item.systemId,
            earmarkId: item.earmarkId,
            removed: false,
            status: item.status,
          }))
      : []),
  ]) {
    if (seen.has(entry.entryId))
      fail("An entry cannot belong to more than one project budget.", 409);
    seen.add(entry.entryId);
    if (!entry.earmarkId || entry.removed || entry.status === "cancelled")
      continue;
    const systems = parts.get(entry.earmarkId) ?? new Set<string>();
    systems.add(entry.systemId);
    parts.set(entry.earmarkId, systems);
    if (systems.size > 1)
      fail("Restricted funding cannot span different physical systems.", 409);
  }
}
export function createLocalDepartmentBudgetRepository(): DepartmentBudgetRepository {
  guard();
  return {
    async queue(departmentId) {
      const access = authority(departmentId),
        state = read(),
        ids = new Set(access.departments.map((department) => department.id));
      return structuredClone({
        viewVersion: state.version,
        departments: access.departments
          .filter(
            (department) => !departmentId || department.id === departmentId,
          )
          .map((department) => ({
            id: department.id,
            name: department.name,
            seasonId,
            seasonCode: access.workspace.season,
            canSubmit: access.profile === "department_lead",
          })),
        packages: (state.packages ?? [])
          .filter(
            (packet) =>
              ids.has(packet.snapshot.departmentId) &&
              (!departmentId || packet.snapshot.departmentId === departmentId),
          )
          .map(({ decisions: _decisions, ...packet }) => packet)
          .reverse(),
      });
    },
    async preview(departmentId) {
      const state = read(),
        access = authority(departmentId);
      if (access.profile !== "department_lead")
        fail("Only the current department lead can prepare this submission.");
      const value = snapshot(state, departmentId),
        previewToken = crypto.randomUUID(),
        preview: DepartmentBudgetPreview = {
          ...value,
          viewVersion: state.version,
          previewToken,
          activePackageId:
            state.packages?.find(
              (packet) =>
                packet.snapshot.departmentId === departmentId &&
                packet.status === "finance_pending",
            )?.id ?? null,
          capabilities: capabilities(departmentId),
        };
      state.packagePreviews ??= {};
      state.packagePreviews[previewToken] = {
        fingerprint: snapshotPin(value),
        preview,
      };
      localStorage.setItem(KEY, JSON.stringify(state));
      return structuredClone(preview);
    },
    async detail(id) {
      const state = read(),
        packet = state.packages?.find((packet) => packet.id === id);
      if (!packet) fail("Department package was not found.", 404);
      authority(packet!.snapshot.departmentId);
      const ids = new Set(
          packet!.snapshot.projects.flatMap((project) =>
            [
              ...(project.approvedVersion?.entries ?? []),
              ...(project.proposedVersion?.entries ?? []),
            ].map((entry) => entry.entryId),
          ),
        ),
        evidence = new Map(
          state.budgets
            .flatMap((budget) =>
              [
                ...(budget.historyVersions ?? []),
                budget.pendingVersion,
                budget.approvedVersion,
              ].flatMap((version) => version?.entries ?? []),
            )
            .filter((entry) => ids.has(entry.entryId))
            .map((entry) => [entry.entryId, entry]),
        );
      return structuredClone({
        ...packet!,
        viewVersion: state.version,
        capabilities: capabilities(packet!.snapshot.departmentId),
        evidence: [...evidence.values()].map((entry) => ({
          ...entry,
          invoices: entry.invoices?.map((invoice) =>
            localInvoiceReference(invoice, true),
          ),
        })),
      });
    },
    async mutate(
      change: DepartmentBudgetPackageMutation,
    ): Promise<FinanceMutationResult> {
      const state = read(),
        packet =
          change.action === "sendDepartmentBudgetPackage"
            ? null
            : state.packages?.find((packet) => packet.id === change.packageId),
        departmentId =
          change.action === "sendDepartmentBudgetPackage"
            ? change.departmentId
            : packet?.snapshot.departmentId;
      if (!departmentId) fail("Department package was not found.", 404);
      const access = authority(departmentId),
        caps = capabilities(departmentId),
        key = `${access.profile}:${change.requestId}`,
        fingerprint = stableJson({ ...change, requestId: undefined }),
        previous = state.packageRequests?.[key];
      const permitted =
        change.action === "sendDepartmentBudgetPackage"
          ? caps.canSubmit
          : change.action === "approveDepartmentBudgetPackage"
            ? caps.canApproveFinance
            : change.action === "returnDepartmentBudgetPackage"
              ? caps.canReturn
              : caps.canWithdraw;
      if (!permitted)
        fail("Your current assignment cannot make this department decision.");
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail("Use a new request ID for this change.", 409);
        return previous.result;
      }
      let target: LocalDepartmentPackage;
      const now = new Date().toISOString();
      if (change.action === "sendDepartmentBudgetPackage") {
        if (
          state.packages?.some(
            (packet) =>
              packet.snapshot.departmentId === departmentId &&
              packet.status === "finance_pending",
          )
        )
          fail("A department package is already awaiting Finance.", 409);
        const preview = state.packagePreviews?.[change.previewToken],
          current = snapshot(state, departmentId);
        if (
          !preview ||
          preview.preview.departmentId !== departmentId ||
          preview.fingerprint !== snapshotPin(current)
        )
          fail(
            "The readiness preview changed. Load the latest preview before sending.",
            409,
          );
        if (!current.projects.some((project) => project.included))
          fail(
            "Submit at least one project candidate to department review first.",
            400,
          );
        target = {
          id: crypto.randomUUID(),
          revision: 1,
          status: "finance_pending",
          submittedBy: access.actor,
          submittedAt: now,
          decidedBy: null,
          decidedAt: null,
          reason: null,
          snapshot: structuredClone(current),
          decisions: [
            {
              id: crypto.randomUUID(),
              action: change.action,
              actorMemberId: access.actor,
              createdAt: now,
              reason: null,
            },
          ],
        };
        for (const project of current.projects.filter(
          (project) => project.included,
        )) {
          const budget = state.budgets.find(
              (budget) => budget.id === project.projectBudgetId,
            )!,
            candidate = budget.pendingVersion!;
          candidate.status = "finance_pending";
          candidate.departmentApprovedBy = access.actor;
          candidate.departmentApprovedAt = now;
          candidate.revision++;
          budget.pendingStage = "finance_pending";
          budget.revision++;
          budget.decisions.push({
            id: crypto.randomUUID(),
            versionId: candidate.id,
            action: change.action,
            actorMemberId: access.actor,
            createdAt: now,
            reason: null,
            snapshot: structuredClone(candidate.entries),
          });
        }
        state.packages ??= [];
        state.packages.push(target);
      } else {
        target = packet!;
        if (
          target.status !== "finance_pending" ||
          target.revision !== change.expectedRevision
        )
          fail(
            "The department package changed. Load it again before deciding.",
            409,
          );
        if (change.action === "approveDepartmentBudgetPackage") {
          validatePackage(state, target);
          validateReplacementUnion(state, target);
          for (const project of target.snapshot.projects.filter(
            (project) => project.included,
          ))
            promote(
              state.budgets.find(
                (budget) => budget.id === project.projectBudgetId,
              )!,
              access.actor,
              now,
            );
          target.status = "approved";
          target.revision++;
          target.decidedBy = access.actor;
          target.decidedAt = now;
          target.decisions.push({
            id: crypto.randomUUID(),
            action: change.action,
            actorMemberId: access.actor,
            createdAt: now,
            reason: null,
          });
        } else {
          if (!change.reason.trim() || change.reason.length > 500)
            fail("Enter a reason of up to 500 characters.", 400);
          const included = target.snapshot.projects.find(
            (project) => project.included,
          );
          if (!included?.projectBudgetId)
            fail("The package has no included candidates.", 409);
          invalidateLocalDepartmentPackage(
            state,
            included.projectBudgetId,
            access.actor,
            change.reason.trim(),
            change.action === "withdrawDepartmentBudgetPackage",
          );
        }
      }
      state.version++;
      const result: FinanceMutationResult = {
        ok: true,
        id: target.id,
        revision: target.revision,
        viewVersion: state.version,
        warnings: [],
        errors: [],
      };
      state.packageRequests ??= {};
      state.packageRequests[key] = { fingerprint, result };
      localStorage.setItem(KEY, JSON.stringify(state));
      window.dispatchEvent(new Event("helix-workspace-updated"));
      return structuredClone(result);
    },
  };
}
