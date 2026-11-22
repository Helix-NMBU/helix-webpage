import { linkPurchaseInvoice } from "./finance-invoice-links.js";
import { hasPrivateProjectBudgetReadScope, loadMemberApprovedProjectBudgetWorkspace, loadMemberApprovedProjectBudgetDetail } from "./finance-project-budget-member-read.js";
import {loadDepartmentHomeBudget} from "./finance-department-home.js";
import {isDepartmentBudgetPackageMutation,loadDepartmentBudgetPreview,loadDepartmentBudgetPackages,loadDepartmentBudgetPackage,mutateDepartmentBudgetPackage} from "./finance-department-packages.js";
import type {DepartmentHomeBudget,DepartmentBudgetPreview,DepartmentBudgetPackageQueue,DepartmentBudgetPackageDetail} from "../../src/features/Finance/department-budget-types.js";
import { loadEffectiveFinancePresence, type EffectiveFinancePresence } from "./finance-effective-read.js";
import { hasVisibleApprovedFinances } from "../../src/features/Finance/finance-calculations.js";
import { createFinanceDrive, type FinanceDrive } from "./finance-drive.js";
import { dispatchPurchaseInvoices, loadInvoiceRecovery, loadPurchaseInvoiceReferences, mutateInvoice } from "./finance-invoices.js";
import { isProjectPurchaseMutation, loadProjectPurchaseContext, mutateProjectPurchase, setProjectBudgetCompletion } from "./finance-project-purchases.js";
import type { ProjectPurchaseContext } from "../../src/features/Finance/project-purchase-types.js";
import { isFundingApplicationMutation, loadFundingApplications, loadFundingApplication, loadFundingApplicationBudgetContext, loadProjectFundingProposals, mutateFundingApplication } from "./finance-funding-applications.js";
import type { FundingApplicationQueue, FundingApplicationDetail, FundingApplicationBudgetContext, ProjectFundingProposals } from "../../src/features/Finance/funding-application-types.js";
import { isProjectBudgetMutation, loadProjectBudgetWorkspace, loadProjectBudgetDetail, mutateProjectBudget } from "./finance-project-budgets.js";
import type { ProjectBudgetWorkspace, ProjectBudgetDetail } from "../../src/features/Finance/project-budget-types.js";
import { loadBankSnapshot, setBankSnapshot } from "./finance-bank.js";
import pg from "pg";
import { isFinanceAction, isFinanceProfile, mutationAllowed, mutationRequiresRevision, presentPurchases } from "./finance-access.js";
import { applyRequestMutation } from "./finance-requests.js";
import { loadDecisionQueue, loadFinanceRequestContext, loadOwnRequestDetail, loadRequestChoices, summarizeOwnRequests } from "./finance-requests-read.js";
import { isBudgetMutation, loadBudgetHierarchy, performBudgetMutation } from "./finance-budgets.js";
import { isPurchaseMutation, performPurchaseMutation } from "./finance-purchases.js";
import { isProcessingMutation, performProcessingMutation } from "./finance-processing.js";
import { loadPurchaseRegister } from "./finance-register.js";
import { createFinanceStorage, type FinanceObjectStorage } from "./finance-storage.js";
import { createLiveFinanceSender, type FinanceMailSender } from "./finance-mail.js";
import { loadFinanceRecovery, performDeliveryMutation } from "./finance-recovery.js";
import { deliverPending } from "./finance-outbox.js";
import { FinanceError } from "./finance-error.js";
import { applyFundingMutation } from "./finance-funding.js";
import { loadWonIncome } from "./finance-income-read.js";
import { loadPipelineIncomeForecast } from "./finance-pipeline-forecast.js";
import { loadFundingRecords } from "./finance-funding-read.js";
import { loadFundingScenarios, loadOverview } from "./finance-summary.js";
import { osloToday } from "./finance-money.js";
import { isFundingAction } from "../../src/features/Finance/funding.js";
import { isRequestAction } from "../../src/features/Finance/requests.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { createCvServices } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import type {
  BankSnapshot,
  FinanceCapabilitiesResponse,
  FinanceCapabilitySet,
  FinanceMutationResult,
  FinanceRecoveryView,
  FinanceProfile,
  FinanceUnchanged,
  FinancingView,
  PublicBudgets,
  PublicOverview,
  PurchasesView,
} from "./finance-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";

type FlagsRow = FinanceCapabilitySet & { profiles: FinanceProfile[] };
type Context = { memberId: string; viewVersion: number; seasonCode: string | null; approvalThresholdNok: null; capabilities: FinanceCapabilitySet; profiles: FinanceProfile[] };

export interface FinanceServices {
  departmentHomeBudget(token:string,departmentId:unknown):Promise<DepartmentHomeBudget>;
  departmentBudgetPreview(token:string,departmentId:unknown):Promise<DepartmentBudgetPreview>;
  departmentBudgetPackages(token:string,departmentId?:unknown):Promise<DepartmentBudgetPackageQueue>;
  departmentBudgetPackage(token:string,packageId:unknown):Promise<DepartmentBudgetPackageDetail>;
  fundingApplications(token: string): Promise<FundingApplicationQueue>;
  fundingApplication(token: string, applicationId: unknown): Promise<FundingApplicationDetail>;
  fundingApplicationBudgetContext(token: string, applicationId: unknown): Promise<FundingApplicationBudgetContext>;
  projectFundingProposals(token: string, projectBudgetId: unknown): Promise<ProjectFundingProposals>;
  projectBudgets(token: string, projectId?: string, departmentId?: string): Promise<ProjectBudgetWorkspace>;
  projectBudget(token: string, projectBudgetId: string): Promise<ProjectBudgetDetail>;
  projectPurchaseContext(token: string, projectId: string, responsibleDepartmentId?: string): Promise<ProjectPurchaseContext>;
  bankSnapshot(token: string): Promise<BankSnapshot | null>;
  capabilities(token: string): Promise<FinanceCapabilitiesResponse>;
  version(token: string, knownVersion?: number): Promise<{ viewVersion: number; unchanged?: boolean }>;
  overview(token: string, knownVersion?: number): Promise<PublicOverview | FinanceUnchanged>;
  budgets(token: string, knownVersion?: number): Promise<PublicBudgets | FinanceUnchanged>;
  purchases(token: string, knownVersion?: number, requestRecordId?: string, unpaidOnly?: boolean): Promise<PurchasesView | FinanceUnchanged>;
  financing(token: string, knownVersion?: number): Promise<FinancingView | FinanceUnchanged>;
  recovery(token: string, deliveryAfter?: string, uploadAfter?: string, invoiceAfter?: string): Promise<FinanceRecoveryView>;
  mutate(token: string, body: Record<string, unknown>): Promise<FinanceMutationResult>;
}

export function createFinanceServices(deps: {
  db: CvDatabase;
  authenticate: (token: string) => Promise<WorkspaceIdentity>;
  financeStorage?: FinanceObjectStorage | null;
  financeDrive?: FinanceDrive | null;
  invoiceBudgetMs?: number;
  financeDelivery?: {
    send?: FinanceMailSender;
    env?: NodeJS.ProcessEnv;
    inlineLimit?: number;
    log?: (line: string) => void;
    now?: () => Date;
    autoDispatch?: boolean;
  };
}): FinanceServices {
  const { db } = deps;
  const financeStorage = deps.financeStorage === undefined ? null : deps.financeStorage;
  const invoiceDispatcher = { storage: financeStorage, drive: deps.financeDrive ?? null, budgetMs: deps.invoiceBudgetMs };
  async function dispatchInvoices(identity: WorkspaceIdentity, result: FinanceMutationResult) {
    if (!result.id) return result;
    try { return {...result, invoiceEvidence: await dispatchPurchaseInvoices(db, identity, result.id, invoiceDispatcher)}; }
    catch { return {...result, warnings: [...result.warnings, {message: "The purchase is saved. Invoice transfers need Finance attention; check Recovery."}]}; }
  }
  const deliveryEnv = deps.financeDelivery?.env ?? { WEBSITE_EMAIL_ENABLED: "false", HELIX_ENVIRONMENT: "local" };
  const deliverySend = deps.financeDelivery?.send ?? (async () => ({ outcome: "failed" as const, safeError: "delivery_disabled" as const }));

  // Called only after the business transaction returns. A provider failure must never undo it.
  async function dispatchEvent(result: FinanceMutationResult, eventType: string): Promise<void> {
    if (!result.id || deps.financeDelivery?.autoDispatch === false || !deps.financeDelivery?.send ||
        deliveryEnv.WEBSITE_EMAIL_ENABLED !== "true" || !deliveryEnv.RESEND_API_KEY) return;
    try {
      let after: string | null = null;
      for (;;) {
        const waiting: { rows: { id: string }[] } = await db.query<{ id: string }>(
          "select id::text from finance.outbox where entity_id = $1::uuid and event_type = $2 and status = 'pending' and ($3::uuid is null or id > $3::uuid) order by id limit 25",
          [result.id, eventType, after],
        );
        if (!waiting.rows.length) break;
        for (const row of waiting.rows) {
          try {
            await deliverPending(db, { send: deliverySend, env: deliveryEnv, log: deps.financeDelivery?.log, outboxId: row.id });
          } catch {
            // A concurrently claimed or failed row must not strand later recipients.
            deps.financeDelivery?.log?.("finance_delivery_dispatch_failed");
          }
        }
        after = waiting.rows[waiting.rows.length - 1].id;
        if (waiting.rows.length < 25) break;
      }
    } catch {
      // Pending or uncertain rows remain visible in recovery for a Finance operator.
      deps.financeDelivery?.log?.("finance_delivery_dispatch_failed");
    }
  }

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      return (await db.query<T>(sql, params)).rows;
    } catch (error) {
      if (error instanceof FinanceError) throw error;
      throw new FinanceError(503, UNAVAILABLE);
    }
  }

  async function memberIdFor(token: string): Promise<string> {
    const identity = await deps.authenticate(token);
    if (!UUID.test(identity.userId)) throw new FinanceError(403, "A verified Helix member account is required.");
    const found = await rows<{ id: string }>("select id from identity.members where id = $1::uuid", [identity.userId]);
    if (!found[0]) throw new FinanceError(403, "A verified Helix member account is required.");
    const matched = await rows<{ id: string }>(
      "select id from identity.members where id = $1::uuid and google_sub = $2 and lower(email) = lower($3)",
      [identity.userId, identity.googleSub, identity.email],
    );
    if (!matched[0]) throw new FinanceError(403, "Your Google identity no longer matches this profile.");
    return matched[0].id;
  }

  async function context(token: string): Promise<Context> {
    const memberId = await memberIdFor(token);
    // One statement, so the flags and the version come from the same snapshot.
    const [row] = await rows<{ flags: FlagsRow; version: string | number; season_code: string | null }>(
      `select finance.capability_flags($1::uuid) as flags,
              v.version,
              (select setting_value #>> '{}' from finance.settings where setting_key = 'current_season') as season_code
       from finance.view_versions v
       where v.singleton`,
      [memberId],
    );
    const flags = row?.flags;
    const viewVersion = Number(row?.version);
    if (!flags || !Array.isArray(flags.profiles) || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
    if (!flags.publicBudgets) throw new FinanceError(403, "Financials access is required.");
    const { profiles: _ignored, ...capabilities } = flags;
    return {
      memberId,
      viewVersion,
      seasonCode: row.season_code,
      approvalThresholdNok: null,
      capabilities,
      profiles: flags.profiles.filter(isFinanceProfile),
    };
  }

  function unchanged(current: Context, knownVersion: number | undefined): FinanceUnchanged | null {
    if (knownVersion === undefined || knownVersion !== current.viewVersion) return null;
    return { unchanged: true, viewVersion: current.viewVersion };
  }

  async function budgetState(seasonCode: string | null): Promise<{ status: "absent" | "draft" | "approved"; approvedOn: string | null; budgetId: string | null; revision: number } & EffectiveFinancePresence> {
    const presence = await loadEffectiveFinancePresence(db.query.bind(db), seasonCode);
    if (!seasonCode) return { status: "absent", approvedOn: null, budgetId: null, revision: 0, ...presence };
    const [row] = await rows<{ status: "draft" | "approved" | null; approved_on: string | null; id: string | null; revision: number | null }>(
      `select b.status, b.approved_on::text as approved_on, b.id, b.revision
       from finance.seasons s
       left join finance.budgets b on b.season_id = s.id
       where s.code = $1`,
      [seasonCode],
    );
    if (!row?.status || !row.id) return { status: "absent", approvedOn: null, budgetId: null, revision: 0, ...presence };
    return { status: row.status, approvedOn: row.approved_on, budgetId: row.id, revision: Number(row.revision ?? 0), ...presence };
  }

  return {
    async fundingApplications(token) { return loadFundingApplications(db, await deps.authenticate(token)); },
    async fundingApplication(token, applicationId) { return loadFundingApplication(db, await deps.authenticate(token), applicationId); },
    async fundingApplicationBudgetContext(token, applicationId) { return loadFundingApplicationBudgetContext(db, await deps.authenticate(token), applicationId); },
    async projectFundingProposals(token, projectBudgetId) { return loadProjectFundingProposals(db, await deps.authenticate(token), projectBudgetId); },
    async projectBudgets(token, projectId, departmentId) {
      const identity = await deps.authenticate(token);
      if (projectId && !departmentId && !await hasPrivateProjectBudgetReadScope(db, identity, projectId, false)) {
        return loadMemberApprovedProjectBudgetWorkspace(db, identity, projectId);
      }
      return loadProjectBudgetWorkspace(db, identity, projectId, departmentId);
    },
    async departmentHomeBudget(token,departmentId){return loadDepartmentHomeBudget(db,await deps.authenticate(token),departmentId);},
    async departmentBudgetPreview(token,departmentId){return loadDepartmentBudgetPreview(db,await deps.authenticate(token),departmentId);},
    async departmentBudgetPackages(token,departmentId){return loadDepartmentBudgetPackages(db,await deps.authenticate(token),departmentId);},
    async departmentBudgetPackage(token,packageId){return loadDepartmentBudgetPackage(db,await deps.authenticate(token),packageId);},
    async projectBudget(token, projectBudgetId) {
      const identity = await deps.authenticate(token);
      if (!await hasPrivateProjectBudgetReadScope(db, identity, projectBudgetId, true)) {
        return loadMemberApprovedProjectBudgetDetail(db, identity, projectBudgetId);
      }
      return loadProjectBudgetDetail(db, identity, projectBudgetId);
    },
    async projectPurchaseContext(token, projectId, departmentId) {
      return loadProjectPurchaseContext(db, await deps.authenticate(token), projectId, departmentId);
    },
    async bankSnapshot(token) {
      await context(token);
      return loadBankSnapshot(db);
    },
    async recovery(token, deliveryAfter, uploadAfter, invoiceAfter) {
      const current = await context(token);
      return { ...await loadFinanceRecovery(db, current, { deliveryAfter, uploadAfter }), ...await loadInvoiceRecovery(db, await deps.authenticate(token), invoiceAfter) };
    },
    async capabilities(token) {
      const current = await context(token);
      return {
        memberId: current.memberId,
        viewVersion: current.viewVersion,
        profiles: current.profiles,
        capabilities: current.capabilities,
        seasonCode: current.seasonCode,
        approvalThresholdNok: current.approvalThresholdNok,
        today: osloToday(),
      };
    },
    async version(token, knownVersion) {
      const current = await context(token);
      const same = unchanged(current, knownVersion);
      return same ?? { viewVersion: current.viewVersion };
    },
    async overview(token, knownVersion) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await context(token);
        const same = unchanged(current, knownVersion);
        if (same) return same;
        const budget = await budgetState(current.seasonCode);
        const view = await loadOverview(db.query.bind(db), {
          viewVersion: current.viewVersion,
          seasonCode: current.seasonCode,
          budgetStatus: budget.status,
          approvedOn: budget.approvedOn,
          approvedPresence: budget.approvedPresence,
          hasRecordedActuals: budget.hasRecordedActuals,
          showAggregates: hasVisibleApprovedFinances({ ...budget, budgetStatus: budget.status }) || (budget.status === "draft" && current.capabilities.draftBudgetItems),
          showPrivate: current.capabilities.financing,
          includeDraftItems: current.capabilities.draftBudgetItems,
          today: osloToday(),
        });
        // The other overview inputs use separate queries. Retry if any committed
        // Finance change or capability revocation occurred while gathering them.
        if ((await context(token)).viewVersion === current.viewVersion) return view;
      }
      throw new FinanceError(409, "Finance changed while loading the overview. Please try again.");
    },
    async budgets(token, knownVersion) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await context(token);
        const same = unchanged(current, knownVersion);
        if (same) return same;
        const budget = await budgetState(current.seasonCode);
        const showItems = hasVisibleApprovedFinances({ ...budget, budgetStatus: budget.status }) || current.capabilities.draftBudgetItems;
        const view: PublicBudgets = !budget.budgetId || !showItems
          ? {
            viewVersion: current.viewVersion,
            seasonCode: current.seasonCode,
            budgetStatus: budget.status,
            approvedOn: budget.approvedOn,
            revision: budget.revision,
            approvedPresence: budget.approvedPresence,
            hasRecordedActuals: budget.hasRecordedActuals,
            departments: [],
            choices: { systems: [], items: [] },
          }
          : await loadBudgetHierarchy(db, current, budget, await deps.authenticate(token));
        if ((await context(token)).viewVersion === current.viewVersion) return view;
      }
      throw new FinanceError(409, "Finance changed while loading budgets. Please try again.");
    },
    async purchases(token, knownVersion, requestRecordId, unpaidOnly = false) {
      const current = await context(token);
      const same = unchanged(current, knownVersion);
      if (same) return same;
      const query = db.query.bind(db);
      const ownRequests = await summarizeOwnRequests(query, current.memberId);
      const view: PurchasesView = { viewVersion: current.viewVersion, ownRequests };
      if (current.seasonCode && current.capabilities.ownRequests) {
        view.choices = await loadRequestChoices(db, current.seasonCode);
      }
      if (requestRecordId && UUID.test(requestRecordId)) {
        const detail = await loadOwnRequestDetail(query, current.memberId, requestRecordId, current.capabilities);
        if (detail) view.detail = detail;
        else throw new FinanceError(404, "Request was not found.");
      }
      if (current.capabilities.decideRequests && current.seasonCode) {
        view.decisionQueue = await loadDecisionQueue(query, current.seasonCode);
      }
      if (current.capabilities.purchaseRegister && current.seasonCode) {
        view.requestContext = await loadFinanceRequestContext(query, current.seasonCode);
      }
      if (current.capabilities.purchaseRegister) {
        if (current.seasonCode) {
          const loaded = await loadPurchaseRegister(query, current.seasonCode, unpaidOnly);
          const evidence = await loadPurchaseInvoiceReferences(db, await deps.authenticate(token), loaded.register.map(p => p.id));
          for (const purchase of loaded.register) for (const document of purchase.documents) { const ref = evidence.get(document.id); if (ref) Object.assign(document, ref); }
          for (const purchase of loaded.register) {
            const linked = evidence.get(`purchase:${purchase.id}`);
            if (linked) purchase.documents.push({ id: linked.documentId, publicRef: `${purchase.publicRef}-link`, kind: purchase.documentKind, documentNumber: purchase.documentNumber, ...linked });
          }
          view.register = loaded.register;
          view.unpaidCount = loaded.unpaidCount;
        } else {
          view.register = [];
          view.unpaidCount = 0;
        }
      }
      return presentPurchases(view, current.capabilities);
    },
    async financing(token, _knownVersion) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await context(token);
        if (!current.capabilities.financing) throw new FinanceError(403, "Financing access is required.");
        if (!current.seasonCode) {
          return { viewVersion: current.viewVersion, seasonCode: null, funding: [], parts: [], scenarios: [], pipelineForecast: [], wonIncome: [] };
        }
        try {
          const today = osloToday();
          const [loaded, scenarios, pipelineForecast, wonIncome] = await Promise.all([
            loadFundingRecords(db.query.bind(db), current.seasonCode, today, current.capabilities.draftBudgetItems),
            loadFundingScenarios(db.query.bind(db), current.seasonCode, current.capabilities.draftBudgetItems),
            loadPipelineIncomeForecast(db.query.bind(db), current.seasonCode),
            loadWonIncome(db.query.bind(db), current.seasonCode),
          ]);
          if ((await context(token)).viewVersion === current.viewVersion) {
            return { viewVersion: current.viewVersion, seasonCode: current.seasonCode, ...loaded, scenarios, pipelineForecast, wonIncome };
          }
        } catch (error) {
          if (error instanceof FinanceError) throw error;
          throw new FinanceError(503, UNAVAILABLE);
        }
      }
      throw new FinanceError(409, "Finance changed while loading financing. Please try again.");
    },
    async mutate(token, body) {
      if (body.action === "linkPurchaseInvoice") return linkPurchaseInvoice(db, await deps.authenticate(token), body);
      if(isDepartmentBudgetPackageMutation(body.action)){
        const result=await mutateDepartmentBudgetPackage(db,await deps.authenticate(token),body);
        await dispatchEvent(result,body.action==="sendDepartmentBudgetPackage"?"department_package.submitted":body.action==="approveDepartmentBudgetPackage"?"department_package.approved":"department_package.returned");return result;
      }
      if (["downloadDocument", "retryInvoiceTransfer", "continueInvoiceTransfers"].includes(String(body.action))) return mutateInvoice(db, await deps.authenticate(token), body, invoiceDispatcher);
      if (body.action === "setProjectBudgetCompletion") return setProjectBudgetCompletion(db, await deps.authenticate(token), body);
      if (isProjectPurchaseMutation(body.action)) {
        const identity = await deps.authenticate(token);
        let result = await mutateProjectPurchase(db, financeStorage, identity, body);
        if (body.action === "registerProjectPurchase") result = await dispatchInvoices(identity, result);
        if (body.action === "registerProjectPurchase") await dispatchEvent(result, "purchase_registered");
        return result;
      }
      if (isFundingApplicationMutation(body.action)) return { ...await mutateFundingApplication(db, await deps.authenticate(token), body), warnings: [], errors: [] };
      // Only explicitly scoped budget actions bypass the broad Financials context.
      if (isProjectBudgetMutation(body.action)) {
        const result = await mutateProjectBudget(db, await deps.authenticate(token), body);
        const event = body.action === "submitProjectBudget" ? "project_budget.department_pending"
          : body.action === "approveDepartmentBudget" ? "project_budget.finance_pending"
          : body.action === "approveProjectBudget" ? "project_budget.approved"
          : body.action === "returnProjectBudget" || body.action === "withdrawProjectBudget" || body.action === "requestProjectBudgetChanges" ? "project_budget.returned" : null;
        if (event) await dispatchEvent(result, event);
        if(result.departmentPackageId)await dispatchEvent({...result,id:result.departmentPackageId},"department_package.returned");
        return result;
      }
      const current = await context(token);
      const action = body.action;
      if (typeof action !== "string" || !isFinanceAction(action)) throw new FinanceError(400, "Unknown request.");
      if (!mutationAllowed(action, current.capabilities)) throw new FinanceError(403, "Finance access is required.");
      if (typeof body.requestId !== "string" || !UUID.test(body.requestId)) throw new FinanceError(400, "A valid request ID is required.");
      if (mutationRequiresRevision(action)) {
        const revision = body.expectedRevision;
        if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
          throw new FinanceError(400, "A valid revision is required.");
        }
      }
      if (action === "setBankSnapshot") return setBankSnapshot(db, current.memberId, body);
      if (isFundingAction(action)) return applyFundingMutation(db, current.memberId, body, current.capabilities.draftBudgetItems);
      if (["createBudget", "approveBudget", "addItem", "editItem", "cancelItem", "restoreItem"].includes(action)) throw new FinanceError(409, "Edit a project Draft and submit it for both approvals. Season budget history is read-only.");
      if (isBudgetMutation(action)) return performBudgetMutation(db, current, body);
      if (isRequestAction(action)) {
        const result = await applyRequestMutation(db, current.memberId, body);
        if (action === "submitRequest" || action === "decideRequest") {
          await dispatchEvent(result, action === "submitRequest" ? "request.submitted" : "request.decided");
        }
        return result;
      }
      if (isPurchaseMutation(action)) {
        let result = await performPurchaseMutation(db, financeStorage, current, body);
        if (action === "registerPurchase") result = await dispatchInvoices(await deps.authenticate(token), result);
        if (action === "registerPurchase") await dispatchEvent(result, "purchase_registered");
        return result;
      }
      if (isProcessingMutation(action)) {
        return performProcessingMutation(db, current, body);
      }
      if (action === "exportPurchases" || action === "downloadExport" || action === "retryOutbox" || action === "cleanupUploads") {
        return performDeliveryMutation(db, financeStorage, current, body, {
          send: deliverySend,
          env: deliveryEnv,
          inlineLimit: deps.financeDelivery?.inlineLimit,
          log: deps.financeDelivery?.log,
          now: deps.financeDelivery?.now,
        });
      }
      throw new FinanceError(503, "This finance operation is not available yet.");
    },
  };
}

let pool: pg.Pool | undefined;
export function neonFinanceServices(): FinanceServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new FinanceError(503, UNAVAILABLE);
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  const db: CvDatabase = {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pool!.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
  const cv = createCvServices({
    db,
    storage: {
      putPdf: async () => { throw new Error("Not used"); },
      remove: async () => {},
      presign: async () => { throw new Error("Not used"); },
    },
  });
  let financeStorage: FinanceObjectStorage | null = null;
  try {
    financeStorage = createFinanceStorage();
  } catch {
    financeStorage = null;
  }
  return createFinanceServices({
    db,
    authenticate: (token) => cv.authenticate(token),
    financeStorage,
    financeDrive: createFinanceDrive(),
    financeDelivery: { send: createLiveFinanceSender(process.env), env: process.env },
  });
}
