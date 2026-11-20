import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { localMemberHasPartnerSpace } from "../MemberPlatform/member-access-api";
import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import {
  readLocalPartnerState,
  writeLocalPartnerState,
  localSeasons,
} from "../PartnerDeals/local-fixture";
import type { ProjectWorkspace } from "../ProjectManagement/types";
import type {
  ProjectBudgetDetail,
  ProjectBudgetEntry,
  ProjectBudgetEntryInput,
} from "./project-budget-types";
import type {
  FundingApplicationCard,
  FundingApplicationDetail,
  FundingApplicationMutation,
  FundingApplicationMutationResult,
} from "./funding-application-types";
import type { FundingApplicationRepository } from "./funding-application-repository";
import { canonicalNokOre } from "./project-budget-diff";
import { formatOre, parseIsoDate, parseNokToOre } from "./money";
const KEY = "helix-funding-applications-local-v1",
  BUDGET_KEY = "helix-project-budgets-local-v1";
type Role =
  | "marketing"
  | "head_of_finance"
  | "project_lead"
  | "department_lead"
  | "finance";
interface State {
  version: number;
  applications: FundingApplicationDetail[];
  requests: Record<
    string,
    { fingerprint: string; result: FundingApplicationMutationResult }
  >;
}
function fail(message: string, status = 403): never {
  throw Object.assign(new Error(message), { status });
}
function enabled() {
  if (!isLocalMemberMode() || !localMemberSignedIn())
    fail("Sign in to continue.", 401);
}
export function localFundingRole(): Role {
  enabled();
  const query = new URLSearchParams(window.location.search);
  const value = query.get("fundingRole") ?? query.get("budgetRole");
  const valid = (text: string | null): text is Role =>
    !!text &&
    [
      "marketing",
      "head_of_finance",
      "project_lead",
      "department_lead",
      "finance",
    ].includes(text);
  if (valid(value)) {
    localStorage.setItem("helix-funding-applications-local-role-v1", value);
    return value;
  }
  const saved = localStorage.getItem(
    "helix-funding-applications-local-role-v1",
  );
  return valid(saved) ? saved : "marketing";
}
function read(): State {
  enabled();
  const saved = localStorage.getItem(KEY);
  return saved
    ? (JSON.parse(saved) as State)
    : { version: 0, applications: [], requests: {} };
}
function workspace(): ProjectWorkspace {
  enabled();
  const saved = localStorage.getItem("helix-member-local-projects-v1");
  return saved
    ? (JSON.parse(saved) as ProjectWorkspace)
    : initialLocalWorkspace();
}
function budgets(): {
  version: number;
  budgets: ProjectBudgetDetail[];
  requests: Record<string, unknown>;
} {
  enabled();
  const saved = localStorage.getItem(BUDGET_KEY);
  return saved ? JSON.parse(saved) : { version: 0, budgets: [], requests: {} };
}
function eligibleFundingEntries(budget: ProjectBudgetDetail): ProjectBudgetEntry[] {
  const approved = (budget.approvedVersion?.entries ?? []).filter(entry => !entry.removed && entry.status !== "cancelled");
  const submitted = ["department_pending", "finance_pending"].includes(budget.pendingVersion?.status ?? "")
    ? (budget.pendingVersion?.entries ?? []).filter(entry => !entry.removed && entry.status !== "cancelled") : [];
  const approvedIds = new Set(approved.map(entry => entry.entryId));
  return [...approved, ...submitted.filter(entry => !approvedIds.has(entry.entryId))];
}
function head() {
  if (localFundingRole() !== "head_of_finance")
    fail("Head of Finance access is required.");
}
function readBudget(id: string) {
  const state = budgets(),
    budget = state.budgets.find((item) => item.id === id);
  if (!budget) fail("This project budget is unavailable.", 404);
  return { state, budget };
}
function assertBudgetRead(budget: ProjectBudgetDetail) {
  const role = localFundingRole(),
    data = workspace(),
    project = data.projects.find((item) => item.id === budget.projectId);
  const dept = data.departments.find(
    (item) => item.id === budget.responsibleDepartmentId,
  );
  if (role === "head_of_finance" || role === "finance") return;
  if (
    role === "project_lead" &&
    (project?.leadIds ?? []).includes(data.viewerId)
  )
    return;
  if (role === "department_lead" && dept?.name === "Mechanical & Production")
    return;
  fail("You do not have access to this project's funding proposals.");
}
function mandatory(entryId: string, state = read()) {
  return state.applications.some(
    (app) =>
      !!app.award &&
      app.links.some((link) => link.entryId === entryId && !link.release),
  );
}
export function assertLocalFundingEntry(
  entryId: string,
  proposed: ProjectBudgetEntryInput,
) {
  enabled();
  const state = read();
  if (!mandatory(entryId, state)) return;
  const all = budgets().budgets;
  const old = all
    .flatMap((budget) => [
      ...(budget.approvedVersion?.entries ?? []),
      ...(budget.pendingVersion?.entries ?? []),
    ])
    .find((entry) => entry.entryId === entryId);
  const desired =
    old ??
    state.applications
      .flatMap((app) => app.proposals)
      .find((proposal) => proposal.entryId === entryId)?.desiredEntry;
  if (
    proposed.removed ||
    proposed.status === "cancelled" ||
    (desired &&
      (proposed.systemId !== desired.systemId ||
        canonicalNokOre(proposed.plannedNok) <
          canonicalNokOre(desired.plannedNok) ||
        Number(proposed.ordinaryPriority.slice(1)) >
          Number(desired.ordinaryPriority.slice(1))))
  )
    fail(
      "Release the active P0 obligation before reducing, moving or removing this purchase.",
      409,
    );
}
function synchronize(state: State) {
  const data = budgets();
  for (const budget of data.budgets)
    for (const version of [
      budget.approvedVersion,
      budget.pendingVersion,
      ...(budget.historyVersions ?? []),
    ])
      if (version)
        for (const entry of version.entries)
          entry.priority = mandatory(entry.entryId, state)
            ? "P0"
            : entry.ordinaryPriority;
  data.version++;
  localStorage.setItem(BUDGET_KEY, JSON.stringify(data));
}
function refresh(app: FundingApplicationDetail) {
  const data = budgets();
  for (const link of app.links) {
    const budget = data.budgets.find(
        (item) => item.id === link.projectBudgetId,
      ),
      entry = budget?.approvedVersion?.entries.find(
        (item) =>
          item.entryId === link.entryId &&
          !item.removed &&
          item.status !== "cancelled",
      );
    link.approvedNok = entry?.plannedNok ?? "0.00";
    link.mandatory = !!app.award && !link.release;
    link.description = entry?.description ?? link.description;
    link.ordinaryPriority = entry?.ordinaryPriority ?? link.ordinaryPriority;
  }
  for (const proposal of app.proposals) {
    const budget = data.budgets.find(
      (item) => item.id === proposal.projectBudgetId,
    );
    const entry = budget?.approvedVersion?.entries.find(
      (item) =>
        item.entryId === proposal.entryId &&
        !item.removed &&
        item.status !== "cancelled",
    );
    proposal.approvalStatus =
      entry &&
      canonicalNokOre(entry.plannedNok) >=
        canonicalNokOre(proposal.desiredEntry.plannedNok) &&
      (["systemId", "description", "category", "ordinaryPriority", "reuseStatus", "status",
        "expectedPurchaseDate", "ownerMemberId", "ownerEmail", "note", "earmarkId"] as const).every(
        key => (entry[key] || null) === (proposal.desiredEntry[key] || null),
      )
        ? "approved"
        : proposal.adoptedVersionId
          ? "awaiting_budget_approval"
          : "needs_project_lead";
    proposal.applicationRevision = app.revision;
    proposal.mandatory =
      !!app.award &&
      app.links.some(
        (link) => link.entryId === proposal.entryId && !link.release,
      );
  }
}
export function localFundingApplicationCard(
  dealId: string,
): FundingApplicationCard | undefined {
  if (!isLocalMemberMode() || !localMemberSignedIn()) return;
  const app = read().applications.find((item) => item.dealId === dealId);
  if (!app) return;
  const { links: _links, proposals: _proposals, ...card } = app;
  return card;
}
export function ensureLocalFundingFixtures() {
  if (
    !isLocalMemberMode() ||
    !localMemberSignedIn() ||
    new URLSearchParams(window.location.search).get("fundingRole") !==
      "marketing"
  )
    return;
  const state = readLocalPartnerState();
  if (
    state.deals.some(
      (deal) => deal.id === "f7000000-0000-4000-8000-000000000001",
    )
  )
    return;
  const org = "f7000000-0000-4000-8000-000000000010";
  state.organizations.push({
    id: org,
    name: "Workshop foundation",
    revision: 0,
  });
  state.deals.push({
    id: "f7000000-0000-4000-8000-000000000001",
    organizationId: org,
    organizationName: "Workshop foundation",
    title: "Workshop equipment application",
    stage: "proposal",
    ownerMemberId: null,
    seasonId: "s27",
    contactName: "Private contact",
    contactEmail: "private@example.invalid",
    startsOn: null,
    endsOn: null,
    agreementLink: "",
    negotiationNotes: "Private negotiation details",
    revision: 0,
    contributions: [],
    deliverables: [],
  });
  writeLocalPartnerState(state);
}
export function createLocalFundingApplicationRepository(): FundingApplicationRepository {
  enabled();
  return {
    async queue() {
      head();
      const state = read();
      return {
        viewVersion: state.version,
        applications: state.applications.map(
          ({ links: _links, proposals: _proposals, ...card }) => card,
        ),
      };
    },
    async detail(id) {
      head();
      const state = read(),
        app = state.applications.find((item) => item.id === id);
      if (!app) fail("This funding application is unavailable.", 404);
      refresh(app);
      return structuredClone(app);
    },
    async context(id) {
      head();
      const state = read();
      const application = state.applications.find((app) => app.id === id);
      if (!application) fail("This funding application is unavailable.", 404);
      const data = budgets();
      data.budgets = data.budgets.filter(
        (budget) => budget.seasonCode === application.seasonCode,
      );
      const projects = workspace();
      return {
        applicationId: id,
        viewVersion: state.version,
        budgets: data.budgets.map((budget) => ({
          id: budget.id,
          projectId: budget.projectId,
          projectName: budget.projectName,
          responsibleDepartmentName: budget.responsibleDepartmentName,
          revision: budget.revision,
          approvedVersionId: budget.approvedVersionId,
          systemIds: projects.departments.flatMap((department, index) =>
            projects.projects
              .find((project) => project.id === budget.projectId)
              ?.departments.includes(department.name)
              ? [
                  `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
                ]
              : [],
          ),
        })),
        entries: data.budgets.flatMap((budget) =>
          eligibleFundingEntries(budget)
            .map((entry) => ({
              entryId: entry.entryId,
              projectBudgetId: budget.id,
              projectName: budget.projectName,
              description: entry.description,
              plannedNok: entry.plannedNok,
              ordinaryPriority: entry.ordinaryPriority,
              effectivePriority: budget.approvedVersion?.entries.some(item => item.entryId === entry.entryId && !item.removed && item.status !== "cancelled") ? entry.priority : "Pending approval",
              approved: budget.approvedVersion?.entries.some(item => item.entryId === entry.entryId && !item.removed && item.status !== "cancelled") ?? false,
              entry,
            })),
        ),
        systems: projects.departments.map((department, index) => ({
          id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          code: `SYS-${index + 1}`,
          name: department.name,
          departmentName: department.name,
        })),
      };
    },
    async card(dealId) {
      if (
        localFundingRole() !== "marketing" ||
        !localMemberHasPartnerSpace("pipeline")
      )
        fail("Pipeline access is required.");
      return { application: localFundingApplicationCard(dealId) ?? null };
    },
    async proposals(id) {
      const { budget } = readBudget(id);
      assertBudgetRead(budget);
      const state = read();
      for (const app of state.applications) refresh(app);
      return {
        viewVersion: state.version,
        projectBudgetId: id,
        budgetRevision: budget.revision,
        proposals: state.applications
          .flatMap((app) => app.proposals)
          .filter((proposal) => proposal.projectBudgetId === id),
      };
    },
    async mutate(change: FundingApplicationMutation) {
      const state = read(),
        role = localFundingRole();
      if (change.action === "saveFundingApplication") {
        if (role !== "marketing" || !localMemberHasPartnerSpace("pipeline"))
          fail("Pipeline management access is required.");
      } else if (change.action !== "adoptFundingProposal") head();
      if (change.action === "adoptFundingProposal") {
        const { budget } = readBudget(change.projectBudgetId);
        assertBudgetRead(budget);
        if (
          role !== "project_lead" ||
          !(
            workspace().projects.find((item) => item.id === budget.projectId)
              ?.leadIds ?? []
          ).includes(workspace().viewerId)
        )
          fail("Only an assigned project lead can adopt a funding proposal.");
      }
      const key = `${role}:${change.requestId}`,
        fingerprint = JSON.stringify(change),
        prior = state.requests[key];
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          fail("Use a new request for this change.", 409);
        return prior.result;
      }
      let app: FundingApplicationDetail;
      if (change.action === "saveFundingApplication") {
        const pipeline = readLocalPartnerState(),
          deal = pipeline.deals.find((item) => item.id === change.dealId);
        if (!deal) fail("This pipeline card is unavailable.", 404);
        if (deal.revision !== change.dealExpectedRevision)
          fail("This pipeline card changed. Refresh before saving.", 409);
        const found = state.applications.find(
          (item) => item.dealId === deal.id,
        );
        if ((found?.revision ?? 0) !== change.expectedRevision)
          fail("The application changed. Refresh before saving.", 409);
        if (!change.purchaseConditions.trim())
          fail("Describe the purchase conditions.", 400);
        if (found?.award)
          fail(
            "Awarded conditions must remain available in the application history.",
            409,
          );
        app = found ?? {
          id: crypto.randomUUID(),
          dealId: deal.id,
          title: deal.title,
          seasonId: change.seasonId,
          seasonCode:
            localSeasons.find((item) => item.id === change.seasonId)?.code ??
            "",
          purchaseConditions: "",
          fundingId: null,
          revision: 0,
          award: null,
          links: [],
          proposals: [],
        };
        if (!found) state.applications.push(app);
        app.title = deal.title;
        app.purchaseConditions = change.purchaseConditions.trim();
        app.seasonId = change.seasonId;
        app.seasonCode =
          localSeasons.find((item) => item.id === change.seasonId)?.code ?? "";
        app.fundingId = change.fundingId ?? app.fundingId;
        deal.revision++;
        writeLocalPartnerState(pipeline);
      } else {
        const found = state.applications.find(
          (item) => item.id === change.applicationId,
        );
        if (!found) fail("This funding application is unavailable.", 404);
        app = found;
        if (change.expectedRevision !== app.revision)
          fail("This application changed. Refresh before saving.", 409);
        if (change.action === "recordFundingAward") {
          parseIsoDate(change.awardDate);
          if (!change.awardReference.trim())
            fail("Enter the award reference.", 400);
          if (app.award) fail("This award has already been recorded.", 409);
          app.award = {
            actorMemberId: "head-of-finance",
            recordedAt: new Date().toISOString(),
            date: change.awardDate,
            reference: change.awardReference.trim(),
          };
        } else if (change.action === "releaseFundingObligation") {
          if (!change.reason.trim()) fail("Enter a release reason.", 400);
          const link = app.links.find(
            (item) => item.id === change.obligationId,
          );
          if (!link || link.release)
            fail("This obligation is no longer available.", 409);
          link.release = {
            actorMemberId: "head-of-finance",
            recordedAt: new Date().toISOString(),
            reason: change.reason.trim(),
          };
        } else if (change.action === "adoptFundingProposal") {
          const { state: budgetState, budget } = readBudget(
            change.projectBudgetId,
          );
          assertBudgetRead(budget);
          const data = workspace();
          if (
            role !== "project_lead" ||
            !(
              data.projects.find((item) => item.id === budget.projectId)
                ?.leadIds ?? []
            ).includes(data.viewerId)
          )
            fail("Only an assigned project lead can adopt a funding proposal.");
          if (budget.revision !== change.expectedBudgetRevision)
            fail("The budget changed. Refresh before adopting.", 409);
          if (budget.pendingVersion && budget.pendingVersion.status !== "draft")
            fail(
              "Return or withdraw the proposed budget to Draft before adopting.",
              409,
            );
          const proposal = app.proposals.find(
            (item) =>
              item.id === change.proposalId &&
              item.projectBudgetId === budget.id,
          );
          if (!proposal) fail("This proposal is unavailable.", 404);
          if (!budget.pendingVersion) {
            if (!budget.approvedVersion)
              fail("Create a Draft budget first.", 409);
            budget.pendingVersion = {
              ...structuredClone(budget.approvedVersion),
              id: crypto.randomUUID(),
              versionNumber: budget.approvedVersion.versionNumber + 1,
              status: "draft",
              submittedAt: null,
              departmentApprovedBy: null,
              departmentApprovedAt: null,
              approvedBy: null,
              approvedAt: null,
            };
            budget.pendingVersionId = budget.pendingVersion.id;
          }
          const previous = budget.pendingVersion.entries.find(
            (entry) => entry.entryId === proposal.entryId,
          );
          const entry: ProjectBudgetEntry = {
            ...previous,
            ...proposal.desiredEntry,
            entryId: proposal.entryId,
            budgetItemId: previous?.budgetItemId ?? null,
            publicRef: previous?.publicRef ?? null,
            priority: mandatory(proposal.entryId, state)
              ? "P0"
              : proposal.desiredEntry.ordinaryPriority,
            actualNok: previous?.actualNok ?? "0.00",
            completion: previous?.completion ?? "not_purchased",
            removed: false,
          };
          assertLocalFundingEntry(entry.entryId, entry);
          budget.pendingVersion.entries = [
            ...budget.pendingVersion.entries.filter(
              (item) => item.entryId !== entry.entryId,
            ),
            entry,
          ];
          budget.pendingVersion.totalNok = formatOre(
            budget.pendingVersion.entries
              .filter((item) => !item.removed && item.status !== "cancelled")
              .reduce(
                (sum, item) => sum + canonicalNokOre(item.plannedNok),
                0n,
              ),
          );
          budget.pendingTotalNok = budget.pendingVersion.totalNok;
          budget.pendingStage = "draft";
          budget.revision++;
          budget.pendingVersion.revision++;
          proposal.adoptedVersionId = budget.pendingVersion.id;
          proposal.approvalStatus = "awaiting_budget_approval";
          budgetState.version++;
          localStorage.setItem(BUDGET_KEY, JSON.stringify(budgetState));
        } else {
          const data = budgets();
          let budget: ProjectBudgetDetail | undefined,
            entryId: string,
            entry: ProjectBudgetEntryInput;
          if (change.action === "linkFundingApplicationEntry") {
            budget = data.budgets.find((item) =>
              eligibleFundingEntries(item).some((entry) => entry.entryId === change.entryId),
            );
            const found = (budget ? eligibleFundingEntries(budget) : []).find(
              (entry) => entry.entryId === change.entryId && !entry.removed,
            );
            if (!found || !budget)
              fail("Choose an existing budget entry.", 400);
            entryId = found.entryId;
            entry = found;
          } else {
            budget = data.budgets.find(
              (item) => item.id === change.projectBudgetId,
            );
            entryId = change.entry.entryId ?? crypto.randomUUID();
            entry = { ...change.entry, entryId };
            const amount = parseNokToOre(entry.plannedNok);
            if (
              !entry.description.trim() ||
              amount === null ||
              amount < 0n ||
              !["P1", "P2", "P3", "P4"].includes(entry.ordinaryPriority)
            )
              fail("Enter valid proposal details.", 400);
            entry = { ...entry, plannedNok: formatOre(amount) };
          }
          if (
            !budget ||
            budget.seasonCode !== app.seasonCode ||
            budget.revision !== change.expectedBudgetRevision
          )
            fail("The budget changed. Refresh before saving.", 409);
          if (change.action === "proposeFundingBudgetEntry") {
            const project = workspace().projects.find(
              (item) => item.id === budget.projectId,
            );
            const allowedSystems = workspace().departments.flatMap(
              (department, index) =>
                project?.departments.includes(department.name)
                  ? [
                      `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
                    ]
                  : [],
            );
            if (!allowedSystems.includes(entry.systemId))
              fail("Choose a system in the selected project.", 400);
            if (
              change.entry.entryId &&
              ![
                ...(budget.approvedVersion?.entries ?? []),
                ...(budget.pendingVersion?.entries ?? []),
              ].some((item) => item.entryId === change.entry.entryId)
            )
              fail("Choose an entry in the selected project budget.", 400);
          }
          if (
            change.action === "linkFundingApplicationEntry" &&
            app.links.some((link) => link.entryId === entryId && !link.release)
          )
            fail("This application already links that entry.", 409);
          if (
            !app.links.some((link) => link.entryId === entryId && !link.release)
          )
            app.links.push({
              id: crypto.randomUUID(),
              entryId,
              projectBudgetId: budget.id,
              projectName: budget.projectName,
              description: entry.description,
              approvedNok:
                budget.approvedVersion?.entries.find(
                  (item) => item.entryId === entryId,
                )?.plannedNok ?? "0.00",
              ordinaryPriority: entry.ordinaryPriority,
              mandatory: !!app.award,
              createdByMemberId: "head-of-finance",
              createdAt: new Date().toISOString(),
              release: null,
            });
          if (change.action === "proposeFundingBudgetEntry")
            app.proposals.push({
              id: crypto.randomUUID(),
              applicationId: app.id,
              applicationTitle: app.title,
              applicationRevision: app.revision + 1,
              projectBudgetId: budget.id,
              entryId,
              desiredEntry: entry,
              note: change.note ?? "",
              approvalStatus: "needs_project_lead",
              adoptedVersionId: null,
              mandatory: !!app.award,
              createdByMemberId: "head-of-finance",
              createdAt: new Date().toISOString(),
            });
        }
      }
      app.revision++;
      state.version++;
      const result: FundingApplicationMutationResult = {
        ok: true,
        id: app.id,
        revision: app.revision,
        viewVersion: state.version,
      };
      state.requests[key] = { fingerprint, result };
      localStorage.setItem(KEY, JSON.stringify(state));
      synchronize(state);
      return result;
    },
  };
}
