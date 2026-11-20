import { invalidateLocalDepartmentPackage } from "./department-budget-local-model";
import { localInvoiceReference } from "./local-invoice-reference";
import { assertLocalFundingEntry } from "./funding-application-local";
import { planLocalProjectBudgetImport } from "./project-budget-import-model";
import { canonicalDepartment } from "../ProjectManagement/departments";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import type { ProjectWorkspace } from "../ProjectManagement/types";
import { formatOre, parseNokToOre } from "./money";
import type {
  ProjectBudgetCapabilities,
  ProjectBudgetDetail,
  ProjectBudgetEntry,
  ProjectBudgetMutation,
  ProjectBudgetMutationResult,
  ProjectBudgetScope,
} from "./project-budget-types";
import type {
  ProjectBudgetFilters,
  ProjectBudgetRepository,
  ProjectBudgetWorkspaceView,
} from "./project-budget-repository";

const KEY = "helix-project-budgets-local-v1";
const PROJECT_KEY = "helix-member-local-projects-v1";
type Role = "project_lead" | "department_lead" | "finance" | "head_of_finance";
interface State {
  previews?: Record<
    string,
    {
      projectBudgetId: string;
      revision: number;
      csv: string;
      entries: ProjectBudgetEntry[];
    }
  >;
  version: number;
  budgets: ProjectBudgetDetail[];
  requests: Record<
    string,
    { fingerprint: string; result: ProjectBudgetMutationResult }
  >;
}
function fail(message: string, status = 403): never {
  throw Object.assign(new Error(message), { status });
}
function enabled() {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    fail("Sign in to continue.", 401);
}
export function localBudgetRole(): Role {
  enabled();
  const selected = new URLSearchParams(window.location.search).get(
    "budgetRole",
  );
  const valid = (value: string | null): value is Role =>
    value !== null &&
    ["project_lead", "department_lead", "finance", "head_of_finance"].includes(
      value,
    );
  if (valid(selected)) {
    localStorage.setItem("helix-project-budgets-local-role-v1", selected);
    return selected;
  }
  const saved = localStorage.getItem("helix-project-budgets-local-role-v1");
  return valid(saved) ? saved : "project_lead";
}
export function localBudgetWorkspace(): ProjectWorkspace {
  enabled();
  const saved = localStorage.getItem(PROJECT_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as ProjectWorkspace;
    } catch {
      /* Start from this mode's normal fixtures. */
    }
  }
  return initialLocalWorkspace();
}
function read(): State {
  enabled();
  const saved = localStorage.getItem(KEY);
  if (saved) {
    try {
      const state = JSON.parse(saved) as State;
      if (Array.isArray(state.budgets) && state.requests) return state;
    } catch {
      /* Ignore an incomplete development fixture. */
    }
  }
  return { version: 0, budgets: [], requests: {} };
}
function total(entries: ProjectBudgetEntry[]) {
  return formatOre(
    entries
      .filter((entry) => !entry.removed && entry.status !== "cancelled")
      .reduce(
        (sum, entry) => sum + (parseNokToOre(entry.plannedNok) ?? 0n),
        0n,
      ),
  );
}
function scopes(state: State): ProjectBudgetScope[] {
  const data = localBudgetWorkspace(),
    profile = localBudgetRole();
  const finance = profile === "finance" || profile === "head_of_finance",
    head = profile === "head_of_finance";
  const reviewerDepartments = data.departments.filter(department=>(department.leadIds??(department.leadId?[department.leadId]:[])).includes(data.viewerId));
  return data.projects.flatMap((project) => {
    const departments = data.departments.filter((department) =>
      project.departments.includes(department.name),
    );
    const budget = state.budgets.find((item) => item.projectId === project.id);
    const responsible =
      budget?.responsibleDepartmentId ??
      (departments.length === 1 ? departments[0].id :
        profile === "department_lead" ? departments.find(item => reviewerDepartments.some(department=>department.id===item.id))?.id ?? null :
        finance ? departments[0]?.id ?? null : null);
    const author =
      profile === "project_lead" &&
      (project.leadIds ?? []).includes(data.viewerId);
    const reviewer =
      profile === "department_lead" && reviewerDepartments.some(department=>department.id===responsible);
    if (!finance && !author && !reviewer) return [];
    const capabilities: ProjectBudgetCapabilities = {
      canRead: true,
      canDraft: author,
      canReviewDepartment: reviewer,
      canApproveFinance: head,
      canRequestChanges: author || reviewer || finance,
      canRegisterPurchase: reviewer || finance,
      canReadFinance: finance,
      canRecordAward: head,
      canReleaseObligation: head,
    };
    return [
      {
        memberId: author
          ? data.viewerId
          : reviewer
            ? "22222222-2222-4222-8222-222222222222"
            : head
              ? "44444444-4444-4444-8444-444444444444"
              : "33333333-3333-4333-8333-333333333333",
        projectId: project.id,
        seasonId: "a1111111-1111-4111-8111-111111111111",
        seasonCode: data.season,
        projectName: project.name,
        projectLeadIds: project.leadIds ?? [],
        responsibleDepartmentId: responsible,
        departments: departments.map((department) => ({
          id: department.id,
          name: department.name,
          leadIds:
            department.leadIds ??
            (department.leadId ? [department.leadId] : []),
        })),
        capabilities,
      },
    ];
  });
}
function view(
  state: State,
  filters: ProjectBudgetFilters = {},
): ProjectBudgetWorkspaceView {
  const data = localBudgetWorkspace();
  const visible = scopes(state).filter(
    (scope) =>
      (!filters.projectId || scope.projectId === filters.projectId) &&
      (!filters.departmentId ||
        scope.responsibleDepartmentId === filters.departmentId),
  );
  const byProject = new Map(visible.map((scope) => [scope.projectId, scope]));
  return {
    viewVersion: state.version,
    scopes: visible,
    budgets: state.budgets
      .filter(
        (budget) =>
          byProject.has(budget.projectId) &&
          (!byProject.get(budget.projectId)!.capabilities.canReadFinance ||
            budget.pendingStage !== "draft" ||
            budget.approvedVersionId !== null),
      )
      .map((budget) => ({
        ...budget,
        capabilities: byProject.get(budget.projectId)!.capabilities,
      })),
    systems: data.departments.map((department, index) => ({
      id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      code: `SYS-${index + 1}`,
      name: department.name,
      departmentName: department.name,
    })),
  };
}
export function createLocalProjectBudgetRepository(): ProjectBudgetRepository {
  enabled();
  return {
    async load(filters) {
      return structuredClone(view(read(), filters));
    },
    async detail(id) {
      const state = read(),
        budget = state.budgets.find((item) => item.id === id);
      const scope =
        budget &&
        scopes(state).find((item) => item.projectId === budget.projectId);
      if (!budget || !scope)
        fail("You do not have access to this project budget.");
      const detail=structuredClone({ ...budget, capabilities: scope.capabilities });
      for(const version of [detail.approvedVersion,detail.pendingVersion,...(detail.historyVersions??[])])for(const entry of version?.entries??[])for(const invoice of entry.invoices??[])Object.assign(invoice,localInvoiceReference(invoice,scope.capabilities.canRegisterPurchase));
      return detail;
    },
    async mutate(change: ProjectBudgetMutation) {
      const state = read(),
        fingerprint = JSON.stringify(change),
        profile = localBudgetRole();
      if(change.action==="approveDepartmentBudget"||change.action==="approveProjectBudget")fail("Use the department package preview and decision workflow.",409);
      const requestKey = `${profile}:${change.requestId}`;
      const previous = state.requests[requestKey];
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail("Use a new request for this change.", 409);
        return { ...previous.result, warnings: [], errors: [] };
      }
      let budget: ProjectBudgetDetail;
      if (change.action === "createProjectBudget") {
        const scope = scopes(state).find(
          (item) => item.projectId === change.projectId,
        );
        if (!scope?.capabilities.canDraft)
          fail("Only an assigned project lead can draft this budget.");
        const department = scope.departments.find(
          (item) => item.id === change.responsibleDepartmentId,
        );
        if (!department) fail("Choose one of the project's departments.", 400);
        if (
          state.budgets.some(
            (item) =>
              item.projectId === change.projectId &&
              item.seasonId === scope.seasonId,
          )
        )
          fail("This project already has a budget.", 409);
        const versionId = crypto.randomUUID();
        budget = {
          id: crypto.randomUUID(),
          projectId: scope.projectId,
          projectName: scope.projectName,
          seasonId: scope.seasonId,
          seasonCode: scope.seasonCode,
          responsibleDepartmentId: department.id,
          responsibleDepartmentName: department.name,
          revision: 1,
          approvedVersionId: null,
          pendingVersionId: versionId,
          pendingStage: "draft",
          approvedTotalNok: "0.00",
          pendingTotalNok: "0.00",
          capabilities: scope.capabilities,
          approvedVersion: null,
          pendingVersion: {
            id: versionId,
            versionNumber: 1,
            revision: 0,
            status: "draft",
            submittedAt: null,
            departmentApprovedBy: null,
            departmentApprovedAt: null,
            approvedBy: null,
            approvedAt: null,
            entries: [],
            totalNok: "0.00",
          },
          decisions: [],
        };
        state.budgets.push(budget);
      } else {
        const found = state.budgets.find(
          (item) => item.id === change.projectBudgetId,
        );
        if (!found) fail("This project budget is no longer available.", 404);
        budget = found;
        const scope = scopes(state).find(
          (item) => item.projectId === budget.projectId,
        );
        if (!scope) fail("You do not have access to this project budget.");
        budget.capabilities = scope.capabilities;
        if (change.expectedRevision !== budget.revision)
          fail("The budget changed. Refresh it before saving again.", 409);
        if (change.action === "requestProjectBudgetChanges") {
          if (!scope.capabilities.canRequestChanges || !budget.approvedVersion)
            fail("You cannot request changes to this budget.");
          if (!change.reason.trim()) fail("Enter a reason.", 400);
          invalidateLocalDepartmentPackage(state,budget.id,scope.memberId,change.reason.trim());
          if (!budget.pendingVersion) {
            budget.pendingVersion = {
              ...structuredClone(budget.approvedVersion),
              id: crypto.randomUUID(),
              versionNumber: budget.approvedVersion.versionNumber + 1,
              revision: 0,
            };
            budget.pendingVersionId = budget.pendingVersion.id;
            budget.pendingTotalNok = budget.pendingVersion.totalNok;
          }
        }
        const candidate = budget.pendingVersion;
        if (!candidate) fail("There is no pending budget version.", 409);
        if (
          change.action === "previewProjectBudgetImport" ||
          change.action === "importProjectBudgetEntries"
        ) {
          if (!scope.capabilities.canDraft || candidate.status !== "draft")
            fail(
              "Only an assigned project lead can import into a Draft candidate.",
            );
          if (change.action === "previewProjectBudgetImport") {
            const systems = (view(state).systems ?? []).filter((system) =>
              scope.departments.some(
                (department) =>
                  canonicalDepartment(department.name) ===
                  canonicalDepartment(system.departmentName),
              ),
            );
            const plan = planLocalProjectBudgetImport(
              budget,
              change.csv,
              systems,
              state.version,
            );
            state.previews ??= {};
            state.previews[plan.preview.previewToken] = {
              projectBudgetId: budget.id,
              revision: budget.revision,
              csv: change.csv,
              entries: plan.entries,
            };
            const result: ProjectBudgetMutationResult = {
              ok: true,
              id: budget.id,
              revision: budget.revision,
              viewVersion: state.version,
              warnings: [],
              errors: [],
              importPreview: plan.preview,
            };
            state.requests[requestKey] = { fingerprint, result };
            localStorage.setItem(KEY, JSON.stringify(state));
            return result;
          }
          const preview = state.previews?.[change.previewToken ?? ""];
          if (
            !preview ||
            preview.projectBudgetId !== budget.id ||
            preview.revision !== budget.revision ||
            preview.csv !== change.csv
          )
            fail("The import preview changed. Preview this CSV again.", 409);
          const systems = (view(state).systems ?? []).filter((system) =>
            scope.departments.some(
              (department) =>
                canonicalDepartment(department.name) ===
                canonicalDepartment(system.departmentName),
            ),
          );
          if (
            planLocalProjectBudgetImport(
              budget,
              change.csv,
              systems,
              state.version,
            ).preview.errors.length
          )
            fail("Correct the CSV before importing.", 400);
          for (const entry of preview.entries) assertLocalFundingEntry(entry.entryId, entry);
          candidate.entries = structuredClone(preview.entries);
          candidate.totalNok = total(candidate.entries);
          budget.pendingTotalNok = candidate.totalNok;
          delete state.previews![change.previewToken!];
        } else if (change.action === "requestProjectBudgetChanges") {
          candidate.status = "draft";
          candidate.submittedAt = null;
          candidate.departmentApprovedBy = null;
          candidate.departmentApprovedAt = null;
          candidate.approvedBy = null;
          candidate.approvedAt = null;
        } else if (
          change.action === "saveProjectBudgetEntry" ||
          change.action === "removeProjectBudgetEntry"
        ) {
          if (!scope.capabilities.canDraft || candidate.status !== "draft")
            fail("Only the project lead can edit a Draft budget.");
          if (change.action === "removeProjectBudgetEntry") {
            const entry = candidate.entries.find(
              (item) => item.entryId === change.entryId,
            );
            if (!entry) fail("This entry is no longer available.", 404);
            if (entry.priority === "P0")
              fail("A mandatory P0 purchase cannot be removed.", 409);
            assertLocalFundingEntry(entry.entryId, { ...entry, removed: true });
            entry.removed = true;
          } else {
            const input = change.entry,
              amount = parseNokToOre(input.plannedNok);
            const system = view(state).systems?.find(
              (item) => item.id === input.systemId,
            );
            if (
              !input.description.trim() ||
              amount === null ||
              amount < 0n ||
              !["P1", "P2", "P3", "P4"].includes(input.ordinaryPriority) ||
              !system ||
              !scope.departments.some(
                (department) =>
                  canonicalDepartment(department.name) !== null &&
                  canonicalDepartment(department.name) ===
                    canonicalDepartment(system.departmentName),
              )
            )
              fail(
                "Enter a description, valid amount, priority and project system.",
                400,
              );
            if (
              input.entryId &&
              !candidate.entries.some(
                (entry) => entry.entryId === input.entryId,
              )
            )
              fail("This entry is no longer available.", 404);
            if (input.entryId) assertLocalFundingEntry(input.entryId, input);
            const previousEntry = candidate.entries.find(
              (entry) => entry.entryId === input.entryId,
            );
            const entry: ProjectBudgetEntry = {
              ...previousEntry,
              ...input,
              description: input.description.trim(),
              plannedNok: formatOre(amount),
              entryId: input.entryId ?? crypto.randomUUID(),
              budgetItemId: previousEntry?.budgetItemId ?? null,
              publicRef: previousEntry?.publicRef ?? null,
              priority:
                previousEntry?.priority === "P0"
                  ? "P0"
                  : input.ordinaryPriority,
              actualNok: previousEntry?.actualNok ?? "0.00",
              completion: previousEntry?.completion ?? "not_purchased",
              removed: false,
            };
            candidate.entries = [
              ...candidate.entries.filter(
                (item) => item.entryId !== entry.entryId,
              ),
              entry,
            ];
          }
          candidate.totalNok = total(candidate.entries);
          budget.pendingTotalNok = candidate.totalNok;
        } else if (change.action === "submitProjectBudget") {
          if (!scope.capabilities.canDraft || candidate.status !== "draft")
            fail("Only the assigned project lead can submit this Draft.");
          if (
            !budget.approvedVersion &&
            !candidate.entries.some((entry) => !entry.removed)
          )
            fail("Add a budget entry before submitting.", 400);
          if (
            !scope.departments.find(
              (department) => department.id === budget.responsibleDepartmentId,
            )?.leadIds.length
          )
            fail("Assign a department lead before submitting.", 400);
          candidate.status = "department_pending";
          candidate.submittedAt = new Date().toISOString();
        } else if (
          change.action === "returnProjectBudget" ||
          change.action === "withdrawProjectBudget"
        ) {
          const allowed =
            change.action === "withdrawProjectBudget"
              ? scope.capabilities.canDraft && candidate.status !== "draft"
              : (candidate.status === "department_pending" &&
                  scope.capabilities.canReviewDepartment) ||
                (candidate.status === "finance_pending" &&
                  scope.capabilities.canApproveFinance);
          if (!allowed)
            fail("You cannot return this budget at its current stage.");
          if (!change.reason.trim()) fail("Enter a reason.", 400);
          invalidateLocalDepartmentPackage(state,budget.id,scope.memberId,change.reason.trim(),change.action==="withdrawProjectBudget");
          candidate.status = "draft";
          candidate.submittedAt = null;
          candidate.departmentApprovedBy = null;
          candidate.departmentApprovedAt = null;
          candidate.approvedBy = null;
          candidate.approvedAt = null;
        } else
          fail(
            "This operation is not available for the initial budget approval.",
            400,
          );
        candidate.revision++;
        budget.revision++;
        if (budget.pendingVersion) budget.pendingStage = candidate.status;
        if (
          !["saveProjectBudgetEntry", "removeProjectBudgetEntry"].includes(
            change.action,
          )
        )
          budget.decisions.push({
            id: crypto.randomUUID(),
            versionId: candidate.id,
            action: change.action,
            actorMemberId: scope.memberId,
            reason: "reason" in change ? change.reason.trim() : null,
            createdAt: new Date().toISOString(),
            snapshot: structuredClone(candidate.entries),
          });
      }
      state.version++;
      const result = {
        ok: true as const,
        id: budget.id,
        revision: budget.revision,
        viewVersion: state.version,
        warnings: [],
        errors: [],
      };
      state.requests[requestKey] = { fingerprint, result };
      localStorage.setItem(KEY, JSON.stringify(state));
      return result;
    },
  };
}
