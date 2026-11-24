import { isLocalPlatformTester } from "../MemberPlatform/local-platform-profile";
import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import { localMemberHasPartnerSpace } from "../MemberPlatform/member-access-api";
import { createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { localSeasons, readLocalPartnerState, writeLocalPartnerState } from "../PartnerDeals/local-fixture";
import { createLocalDepartmentHomeRepository } from "../Workspace/local-department-home";
import { createLocalProjectBudgetRepository, localBudgetRole } from "./project-budget-local";
import { createLocalDepartmentBudgetRepository } from "./department-budget-local";
import { createLocalProjectPurchaseRepository } from "./project-purchase-local";
import { createLocalFundingApplicationRepository, localFundingRole } from "./funding-application-local";
import { createFinanceApi } from "./repository";
import { canonicalNokOre } from "./project-budget-diff";
import { formatOre, osloToday } from "./money";
import { publishFinanceUpdate } from "./finance-events";
import { SCENARIO_INCOME, SCENARIO_PROJECTS, type ScenarioProject } from "./local-season-scenario-data";
import type { LocalFinanceFixtureLedger } from "./local-finance-read";
import type { FundingRecord } from "./types";

export const SEASON_SCENARIO_KEY = "helix-finance-season-scenario-v1";
export const SEASON_SCENARIO_BACKUP = "helix-finance-season-scenario-backup-v1";
const DATA_KEYS = ["helix-member-local-projects-v1", "helix-project-budgets-local-v1", "helix-project-purchases-local-v1", "helix-funding-applications-local-v1", "helix-finance-local-ledger-v1", "helix-member-local-partner-deals-v1", "helix-member-local-department-homes-v1"];
const ROLE_KEYS = ["helix-project-budgets-local-role-v1", "helix-funding-applications-local-role-v1", "helix-member-local-profile-v1", "helix-member-local-space-access-v1", "helix-member-local-partner-spaces-v1"];
const id = (group: number, index: number) => `bada${String(group).padStart(4, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const money = (amount: number) => formatOre(BigInt(amount) * 100n);
const GRANT_ID = id(8000, 4), PART_ID = id(8001, 1);
export interface SeasonScenarioSummary { projects: number; budgets: number; purchases: number; pendingDepartments: string[]; receivedNok: string; approvedNok: string; bankNok: string; createdAt: string }
let running: Promise<SeasonScenarioSummary> | null = null;
function guard() {
  if (!isLocalMemberMode() || !localMemberSignedIn()) throw new Error("Season fixtures require signed-in member-local mode on loopback.");
}
function restore(values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
}
/** An explicit, additive local scenario. Does not write member grants or contact a service. */
export function prepareLocalSeasonScenario(): Promise<SeasonScenarioSummary> {
  guard();
  const previous = localStorage.getItem(SEASON_SCENARIO_KEY);
  if (previous) return Promise.resolve(JSON.parse(previous) as SeasonScenarioSummary);
  if (!running) running = seed().finally(() => { running = null; });
  return running;
}
async function seed(): Promise<SeasonScenarioSummary> {
  guard();
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const backup = Object.fromEntries(DATA_KEYS.map(key => [key, localStorage.getItem(key)]));
  const roles = Object.fromEntries(ROLE_KEYS.map(key => [key, localStorage.getItem(key)]));
  const priorBackup = localStorage.getItem(SEASON_SCENARIO_BACKUP);
  localStorage.setItem(SEASON_SCENARIO_BACKUP, JSON.stringify({ createdAt: new Date().toISOString(), values: backup }));
  const platformTester = isLocalPlatformTester();
  const select = (role: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("memberRole", platformTester ? "platform_tester" : "default"); url.searchParams.set("budgetRole", role); url.searchParams.set("fundingRole", role);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const projects = createLocalProjectRepository(), budgets = createLocalProjectBudgetRepository(), departments = createLocalDepartmentBudgetRepository(), purchases = createLocalProjectPurchaseRepository();
  const finance = createFinanceApi({ current: null });
  let purchaseCount = 0;
  try {
    select("project_lead");
    let workspace = await projects.load();
    if (workspace.projects.some(project => project.id === id(0, 1))) throw new Error("A partial season scenario already exists. Restore its backup before retrying.");
    for (const department of workspace.departments) {
      workspace = await projects.mutate({ action: "save_department", id: department.id, expectedRevision: department.revision, department: { ...department, memberIds: [...new Set([...department.memberIds, ...workspace.members.map(member => member.id)])], leadId: department.leadId ?? workspace.viewerId, leadIds: [...new Set([...(department.leadIds ?? (department.leadId ? [department.leadId] : [])), workspace.viewerId])], viewerIds: (department.viewerIds ?? []).filter(member => member !== workspace.viewerId) } });
    }
    const ledger: LocalFinanceFixtureLedger = JSON.parse(localStorage.getItem("helix-finance-local-ledger-v1") ?? '{"version":0,"seasonCode":"S27","budgetStatus":"absent","approvedOn":null,"items":[]}');
    const funding: FundingRecord[] = SCENARIO_INCOME.map(([sourceName, amount, receivedDate, fundingType], index) => ({ id: id(8000, index + 1), publicRef: `F-S27-${String(index + 101).padStart(3, "0")}`, sourceName, ownerName: "Alex Example", fundingType, amountNok: money(amount), status: "received", confidence: null, expectedDate: receivedDate, receivedDate, ownerEmail: null, reportingRequired: fundingType === "grant", agreementLink: null, note: null, revision: 1, earmarkedNok: index === 3 ? "135000.00" : "0.00", unrestrictedNok: money(index === 3 ? amount - 135000 : amount), linkedItemCount: index === 3 ? 2 : 0 }));
    funding.push({ ...funding[0], id: id(8000, 8), publicRef: "F-S27-108", sourceName: "Competition equipment grant", amountNok: "250000.00", status: "secured", expectedDate: "2027-01-20", receivedDate: null, earmarkedNok: "0.00", unrestrictedNok: "250000.00", linkedItemCount: 0 });
    funding.push({ ...funding[1], id: id(8000, 9), publicRef: "F-S27-109", sourceName: "Autonomy research partnership", amountNok: "180000.00", status: "applied", confidence: "high", expectedDate: "2027-02-15", receivedDate: null, earmarkedNok: "0.00", unrestrictedNok: "180000.00", linkedItemCount: 0 });
    ledger.funding = [...(ledger.funding ?? []), ...funding];
    ledger.parts = [...(ledger.parts ?? []), ...([[PART_ID, "Brake systems", "65000.00"], [id(8001, 2), "High-voltage safety", "70000.00"]] as const).map(([partId, purpose, amountNok], index) => ({ id: partId, publicRef: `EM-S27-${index + 101}`, fundingId: GRANT_ID, purpose, amountNok, spendBy: "2027-05-01", conditions: "Purchase and validate the awarded safety components.", revision: 1, usedNok: "0.00", leftNok: amountNok, mustReturnNok: "0.00", overdue: false, systemName: null, linkedItems: [] }))];
    ledger.version++;
    localStorage.setItem("helix-finance-local-ledger-v1", JSON.stringify(ledger));

    const createProject = async (spec: ScenarioProject, index: number) => {
      const projectId = id(0, index + 1), milestoneId = id(1, index + 1);
      workspace = await projects.mutate({ action: "save_project", id: projectId, expectedRevision: 0, project: { name: spec.name, description: `Plan, procure and deliver ${spec.name.toLowerCase()} for the S27 vehicle programme.`, category: spec.category, departments: [spec.department], leadIds: [workspace.viewerId], startDate: "2026-08-10", deadline: "2027-05-15", status: "in_progress", priority: "high" }, milestones: [{ id: milestoneId, title: "Ready for integration", description: "Complete purchasing, verification and handover.", deadline: "2027-04-15", partnerName: "" }] });
      for (let task = 0; task < 3; task++) workspace = await projects.mutate({ action: "save_task", id: id(2, index * 3 + task + 1), expectedRevision: 0, task: { title: ["Confirm requirements and cost estimates", "Purchase and verify components", "Complete integration and handover"][task], description: "Coordinate the project scope, purchasing and delivery with the department.", category: spec.category, projectId, milestoneId, assigneeIds: [workspace.members[task % workspace.members.length].id], startDate: "2026-09-01", deadline: ["2026-10-15", "2027-02-20", "2027-04-10"][task], status: task === 0 ? "done" : task === 1 ? "in_progress" : "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "" } });
      return { projectId, departmentId: workspace.departments.find(department => department.name === spec.department)!.id };
    };
    const bindings: { projectId: string; departmentId: string; budgetId: string; spec: ScenarioProject }[] = [];
    for (const [index, spec] of SCENARIO_PROJECTS.entries()) {
      const binding = await createProject(spec, index);
      const created = await budgets.mutate({ action: "createProjectBudget", requestId: crypto.randomUUID(), projectId: binding.projectId, responsibleDepartmentId: binding.departmentId });
      const system = (await budgets.load()).systems!.find(system => system.departmentName === spec.department)!;
      for (const [description, amount, ordinaryPriority] of spec.entries) {
        const detail = await budgets.detail(created.id);
        await budgets.mutate({ action: "saveProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: created.id, expectedRevision: detail.revision, entry: { systemId: system.id, description, plannedNok: money(amount), ordinaryPriority, category: "other", reuseStatus: "new", status: "planned", expectedPurchaseDate: "2027-02-01", earmarkId: description === "Brake systems" ? PART_ID : description === "High-voltage safety" ? id(8001, 2) : null } });
      }
      const detail = await budgets.detail(created.id);
      await budgets.mutate({ action: "submitProjectBudget", requestId: crypto.randomUUID(), projectBudgetId: created.id, expectedRevision: detail.revision });
      bindings.push({ ...binding, budgetId: created.id, spec });
    }
    const send = async (departmentId: string, approve: boolean) => {
      select("department_lead");
      const preview = await departments.preview(departmentId);
      const packet = await departments.mutate({ action: "sendDepartmentBudgetPackage", requestId: crypto.randomUUID(), departmentId, previewToken: preview.previewToken });
      if (approve) { select("head_of_finance"); await departments.mutate({ action: "approveDepartmentBudgetPackage", requestId: crypto.randomUUID(), packageId: packet.id!, expectedRevision: packet.revision! }); }
    };
    for (const departmentId of new Set(bindings.map(binding => binding.departmentId))) await send(departmentId, true);

    select("head_of_finance");
    const register = async (binding: typeof bindings[number], entryIndex: number | null, amountNok: string, paymentMethod: "invoice" | "team_account", date: string) => {
      const context = await purchases.load({ projectId: binding.projectId, responsibleDepartmentId: binding.departmentId });
      const entry = entryIndex === null ? null : context.entries.find(entry => entry.description === binding.spec.entries[entryIndex][0])!;
      const fileName = `${binding.spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${purchaseCount + 1}.pdf`;
      const uploadId = await purchases.upload({ projectId: binding.projectId, responsibleDepartmentId: binding.departmentId }, new File([`%PDF-1.4\nS27 purchase reference: ${binding.spec.name}; NOK ${amountNok}\n%%EOF`], fileName, { type: "application/pdf" }));
      const result = await purchases.mutate({ action: "registerProjectPurchase", requestId: crypto.randomUUID(), projectId: binding.projectId, responsibleDepartmentId: binding.departmentId, purchase: { buyerName: "Alex Example", supplierName: `${binding.spec.department} supplier`, paymentMethod, purchaseDate: date, justification: entry ? `Scheduled purchase for ${binding.spec.name}.` : "An additional incurred cost needs Finance review.", documentKind: paymentMethod === "invoice" ? "invoice" : "receipt", documentNumber: `S27-${String(purchaseCount + 101).padStart(4, "0")}`, invoiceDueDate: paymentMethod === "invoice" ? "2026-12-10" : null, uploadIds: [uploadId], lines: [{ systemId: entry?.systemId ?? context.systems[0].id, budgetItemId: entry?.budgetItemId ?? null, unbudgeted: !entry, description: entry?.description ?? "Urgent delivery and handling", quantity: "1", amountNok }] } });
      purchaseCount++;
      return result;
    };
    for (const [index, binding] of bindings.entries()) {
      const half = canonicalNokOre(money(binding.spec.entries[0][1])) / 2n;
      const partial = await register(binding, 0, formatOre(half), "invoice", "2026-10-20");
      if (index % 2 === 0) await finance.mutate({ action: "markInvoicePaid", purchaseId: partial.id, expectedRevision: 0, paidOn: "2026-11-05", requestId: crypto.randomUUID() });
      await register(binding, 1, money(binding.spec.entries[1][1]), "team_account", "2026-11-10");
      const detail = await budgets.detail(binding.budgetId);
      const completed = detail.approvedVersion!.entries.find(entry => entry.description === binding.spec.entries[1][0])!;
      await purchases.complete({ action: "setProjectBudgetCompletion", requestId: crypto.randomUUID(), projectBudgetId: detail.id, expectedRevision: detail.revision, entryId: completed.entryId, complete: true, reason: "The complete order was received and checked." });
    }
    await register(bindings[2], 0, "45000.00", "invoice", "2026-11-18");
    await register(bindings[10], 0, "52500.00", "invoice", "2026-11-19");
    await register(bindings[12], null, "6200.00", "team_account", "2026-11-20");

    if (localMemberHasPartnerSpace("pipeline")) {
      select("marketing");
      const pipeline = readLocalPartnerState(), organizationId = id(9000, 1), dealId = id(9001, 1);
      pipeline.organizations.push({ id: organizationId, name: "Student innovation fund", revision: 0 });
      pipeline.deals.push({ id: dealId, organizationId, organizationName: "Student innovation fund", opportunityKind: "grant", title: "Student innovation grant S27", stage: "proposal", ownerMemberId: workspace.viewerId, seasonId: "s27", contactName: "Grants office", contactEmail: "grants@example.invalid", startsOn: "2026-08-01", endsOn: "2027-07-31", agreementLink: "", negotiationNotes: "The award funds brake-system and high-voltage safety purchases.", revision: 0, contributions: [], deliverables: [] });
      writeLocalPartnerState(pipeline);
      const applications = createLocalFundingApplicationRepository();
      let application = await applications.mutate({ action: "saveFundingApplication", requestId: crypto.randomUUID(), dealId, dealExpectedRevision: 0, expectedRevision: 0, seasonId: "s27", purchaseConditions: "Purchase and validate the brake systems and high-voltage safety components.", fundingId: GRANT_ID });
      select("head_of_finance");
      for (const [bindingIndex, description] of [[2, "Brake systems"], [4, "High-voltage safety"]] as const) {
        const detail = await budgets.detail(bindings[bindingIndex].budgetId), entry = detail.approvedVersion!.entries.find(entry => entry.description === description)!;
        application = await applications.mutate({ action: "linkFundingApplicationEntry", requestId: crypto.randomUUID(), applicationId: application.id, expectedRevision: application.revision, entryId: entry.entryId, expectedBudgetRevision: detail.revision });
      }
      await applications.mutate({ action: "recordFundingAward", requestId: crypto.randomUUID(), applicationId: application.id, expectedRevision: application.revision, awardDate: "2026-10-01", awardReference: "S27-INNOVATION-101" });
    }
    const revise = async (binding: typeof bindings[number]) => {
      select("project_lead"); const detail = await budgets.detail(binding.budgetId);
      await budgets.mutate({ action: "requestProjectBudgetChanges", requestId: crypto.randomUUID(), projectBudgetId: detail.id, expectedRevision: detail.revision, reason: "Update the supplier quotations and delivery scope." });
    };
    const changeEntry = async (binding: typeof bindings[number], description: string, amount: number) => {
      const detail = await budgets.detail(binding.budgetId), entry = detail.pendingVersion!.entries.find(entry => entry.description === description)!;
      await budgets.mutate({ action: "saveProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: detail.id, expectedRevision: detail.revision, entry: { ...entry, plannedNok: money(amount) } });
    };
    const addEntry = async (binding: typeof bindings[number], description: string, amount: number) => {
      const detail = await budgets.detail(binding.budgetId), systemId = detail.pendingVersion!.entries[0].systemId;
      await budgets.mutate({ action: "saveProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: detail.id, expectedRevision: detail.revision, entry: { systemId, description, plannedNok: money(amount), ordinaryPriority: "P2", category: "other", reuseStatus: "new", status: "planned" } });
    };
    await revise(bindings[4]); await changeEntry(bindings[4], "Wiring harness", 72000); await addEntry(bindings[4], "Safety relay spares", 30000);
    let changed = await budgets.detail(bindings[4].budgetId);
    await budgets.mutate({ action: "removeProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: changed.id, expectedRevision: changed.revision, entryId: changed.pendingVersion!.entries.find(entry => entry.description === "Telemetry modules")!.entryId });
    changed = await budgets.detail(changed.id); await budgets.mutate({ action: "submitProjectBudget", requestId: crypto.randomUUID(), projectBudgetId: changed.id, expectedRevision: changed.revision });
    await send(bindings[4].departmentId, false);
    await revise(bindings[10]); await changeEntry(bindings[10], "Competition accommodation", 125000); await addEntry(bindings[10], "Border clearance", 3200);
    changed = await budgets.detail(bindings[10].budgetId); await budgets.mutate({ action: "submitProjectBudget", requestId: crypto.randomUUID(), projectBudgetId: changed.id, expectedRevision: changed.revision });
    await send(bindings[10].departmentId, false);
    await revise(bindings[6]); await changeEntry(bindings[6], "Onboard compute", 92000); await addEntry(bindings[6], "GPU validation time", 18000);
    select("project_lead");
    await createProject({ department: "Management", name: "Facilities planning", category: "operations", entries: [] }, 14);
    const draftBinding = await createProject({ department: "Business & Marketing", name: "Community events", category: "marketing", entries: [] }, 15);
    const draft = await budgets.mutate({ action: "createProjectBudget", requestId: crypto.randomUUID(), projectId: draftBinding.projectId, responsibleDepartmentId: draftBinding.departmentId });
    const marketingSystem = (await budgets.load()).systems!.find(system => system.departmentName === "Business & Marketing")!;
    await budgets.mutate({ action: "saveProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: draft.id, expectedRevision: draft.revision, entry: { systemId: marketingSystem.id, description: "Campus community event", plannedNok: "65000.00", ordinaryPriority: "P3", category: "other", reuseStatus: "new", status: "planned" } });
    for (const department of workspace.departments) {
      const homes = createLocalDepartmentHomeRepository(), home = await homes.load(department.id);
      if (!home.description) await homes.save({ action: "save_department_home", departmentId: department.id, expectedRevision: home.revision, description: `Coordinate the ${department.name.toLowerCase()} projects, budget and S27 delivery milestones.`, driveFolderUrl: home.driveFolderUrl });
    }
    select("head_of_finance"); localBudgetRole(); localFundingRole();
    const views = await Promise.all([finance.budgets(), finance.purchases()]);
    const received = SCENARIO_INCOME.reduce((sum, row) => sum + BigInt(row[1]) * 100n, 0n);
    const paid = (views[1].register ?? []).filter(row => row.status === "registered" && !row.unpaid).reduce((sum, row) => sum + canonicalNokOre(row.totalNok), 0n);
    const bankNok = formatOre(received - paid);
    const bank = await finance.bankSnapshot();
    const approvedNok = formatOre(views[0].departments.reduce((sum, department) => sum + department.systems.flatMap(system => system.items).filter(item => item.approved).reduce((total, item) => total + canonicalNokOre(item.effectivePlanNok), 0n), 0n));
    const summary = { projects: 16, budgets: 15, purchases: purchaseCount, pendingDepartments: ["Electronics", "Logistics"], receivedNok: formatOre(received), approvedNok, bankNok, createdAt: new Date().toISOString() };
    localStorage.setItem(SEASON_SCENARIO_KEY, JSON.stringify(summary));
    if (!bank) await finance.mutate({ action: "setBankSnapshot", requestId: crypto.randomUUID(), expectedRevision: 0, amountNok: bankNok, asOfDate: osloToday() });
    publishFinanceUpdate();
    return summary;
  } catch (error) {
    localStorage.removeItem(SEASON_SCENARIO_KEY);
    restore(backup);
    if (priorBackup === null) localStorage.removeItem(SEASON_SCENARIO_BACKUP); else localStorage.setItem(SEASON_SCENARIO_BACKUP, priorBackup);
    throw error;
  } finally { restore(roles); window.history.replaceState({}, "", originalUrl); }
}

/** Explicit additive pipeline fixtures for the 30-day income projection. */
export async function prepareLocalPipelineForecastScenario() {
  guard();
  const marker = "helix-finance-pipeline-forecast-scenario-v1";
  if (localStorage.getItem(marker)) return;
  const key = "helix-member-local-partner-deals-v1";
  const before = localStorage.getItem(key);
  const state = readLocalPartnerState();
  const season = localSeasons.find(item => item.status === "active")!;
  const today = osloToday();
  const examples = [
    { name: "Aurora vehicle support", probability: 100, amountOre: "18000000", days: 7, stage: "proposal" as const },
    { name: "Northstar systems partnership", probability: 75, amountOre: "12000000", days: 15, stage: "discussion" as const },
    { name: "Fjord mobility programme", probability: 25, amountOre: "10000000", days: 24, stage: "contacted" as const },
  ];
  for (const [index, example] of examples.entries()) {
    const organizationId = id(9500, index + 1), dealId = id(9501, index + 1);
    if (state.deals.some(deal => deal.id === dealId)) continue;
    if (!state.organizations.some(org => org.id === organizationId)) state.organizations.push({ id: organizationId, name: example.name, revision: 0 });
    const invoiceDate = new Date(Date.parse(`${today}T12:00:00Z`) + example.days * 86400000).toISOString().slice(0, 10);
    state.deals.push({ id: dealId, organizationId, organizationName: example.name, title: example.name, stage: example.stage, probability: example.probability, ownerMemberId: null, seasonId: season.id, contactName: "", contactEmail: "", startsOn: season.startDate, endsOn: season.endDate, agreementLink: "", negotiationNotes: "", revision: 0,
      contributions: [{ id: id(9502, index + 1), seasonId: season.id, kind: "cash", description: "Season partnership", amountOre: example.amountOre, invoiceDate }], deliverables: [] });
  }
  localStorage.setItem("helix-finance-pipeline-forecast-backup-v1", JSON.stringify({ createdAt: new Date().toISOString(), value: before }));
  writeLocalPartnerState(state);
  localStorage.setItem(marker, JSON.stringify({ createdAt: new Date().toISOString(), count: examples.length }));
}
