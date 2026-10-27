import pg from "pg";
import { isFinanceAction, isFinanceProfile, mutationAllowed, mutationRequiresRevision, presentPurchases } from "./finance-access.js";
import { applyRequestMutation } from "./finance-requests.js";
import { loadDecisionQueue, loadFinanceRequestContext, loadOwnRequestDetail, loadRequestChoices, summarizeOwnRequests } from "./finance-requests-read.js";
import { isBudgetMutation, loadBudgetHierarchy, performBudgetMutation } from "./finance-budgets.js";
import { isPurchaseMutation, performPurchaseMutation } from "./finance-purchases.js";
import { isProcessingMutation, performProcessingMutation } from "./finance-processing.js";
import { loadPurchaseRegister } from "./finance-register.js";
import { createFinanceStorage, type FinanceObjectStorage } from "./finance-storage.js";
import { FinanceError } from "./finance-error.js";
import { applyFundingMutation } from "./finance-funding.js";
import { loadFundingRecords, loadPublicEarmarks } from "./finance-funding-read.js";
import { formatOre, osloToday } from "./finance-money.js";
import { isFundingAction } from "../../src/features/Finance/funding.js";
import { isRequestAction } from "../../src/features/Finance/requests.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { createCvServices } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import type {
  FinanceCapabilitiesResponse,
  FinanceCapabilitySet,
  FinanceMutationResult,
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
type Context = { memberId: string; viewVersion: number; seasonCode: string | null; approvalThresholdNok: string | null; capabilities: FinanceCapabilitySet; profiles: FinanceProfile[] };

export interface FinanceServices {
  capabilities(token: string): Promise<FinanceCapabilitiesResponse>;
  version(token: string, knownVersion?: number): Promise<{ viewVersion: number; unchanged?: boolean }>;
  overview(token: string, knownVersion?: number): Promise<PublicOverview | FinanceUnchanged>;
  budgets(token: string, knownVersion?: number): Promise<PublicBudgets | FinanceUnchanged>;
  purchases(token: string, knownVersion?: number, requestRecordId?: string, unpaidOnly?: boolean): Promise<PurchasesView | FinanceUnchanged>;
  financing(token: string, knownVersion?: number): Promise<FinancingView | FinanceUnchanged>;
  mutate(token: string, body: Record<string, unknown>): Promise<FinanceMutationResult>;
}

export function createFinanceServices(deps: {
  db: CvDatabase;
  authenticate: (token: string) => Promise<WorkspaceIdentity>;
  financeStorage?: FinanceObjectStorage | null;
}): FinanceServices {
  const { db } = deps;
  const financeStorage = deps.financeStorage === undefined ? null : deps.financeStorage;

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
    const [row] = await rows<{ flags: FlagsRow; version: string | number; season_code: string | null; threshold_ore: string | null }>(
      `select finance.capability_flags($1::uuid) as flags,
              v.version,
              (select setting_value #>> '{}' from finance.settings where setting_key = 'current_season') as season_code,
              (select setting_value::text from finance.settings where setting_key = 'approval_threshold_ore') as threshold_ore
       from finance.view_versions v
       where v.singleton`,
      [memberId],
    );
    const flags = row?.flags;
    const viewVersion = Number(row?.version);
    if (!flags || !Array.isArray(flags.profiles) || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
    let approvalThresholdNok: string | null = null;
    if (row.threshold_ore != null) {
      if (!/^[0-9]+$/.test(row.threshold_ore)) throw new FinanceError(503, UNAVAILABLE);
      approvalThresholdNok = formatOre(BigInt(row.threshold_ore));
    }
    const { profiles: _ignored, ...capabilities } = flags;
    return {
      memberId,
      viewVersion,
      seasonCode: row.season_code,
      approvalThresholdNok,
      capabilities,
      profiles: flags.profiles.filter(isFinanceProfile),
    };
  }

  function unchanged(current: Context, knownVersion: number | undefined): FinanceUnchanged | null {
    if (knownVersion === undefined || knownVersion !== current.viewVersion) return null;
    return { unchanged: true, viewVersion: current.viewVersion };
  }

  async function budgetState(seasonCode: string | null): Promise<{ status: "absent" | "draft" | "approved"; approvedOn: string | null; budgetId: string | null; revision: number }> {
    if (!seasonCode) return { status: "absent", approvedOn: null, budgetId: null, revision: 0 };
    const [row] = await rows<{ status: "draft" | "approved" | null; approved_on: string | null; id: string | null; revision: number | null }>(
      `select b.status, b.approved_on::text as approved_on, b.id, b.revision
       from finance.seasons s
       left join finance.budgets b on b.season_id = s.id
       where s.code = $1`,
      [seasonCode],
    );
    if (!row?.status || !row.id) return { status: "absent", approvedOn: null, budgetId: null, revision: 0 };
    return { status: row.status, approvedOn: row.approved_on, budgetId: row.id, revision: Number(row.revision ?? 0) };
  }

  return {
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
      const current = await context(token);
      const same = unchanged(current, knownVersion);
      if (same) return same;
      const budget = await budgetState(current.seasonCode);
      const publicEarmarks = current.seasonCode
        ? await loadPublicEarmarks(db.query.bind(db), current.seasonCode, osloToday())
        : [];
      return {
        viewVersion: current.viewVersion,
        seasonCode: current.seasonCode,
        budgetStatus: budget.status,
        approvedOn: budget.approvedOn,
        departments: [],
        publicEarmarks,
      };
    },
    async budgets(token, knownVersion) {
      const current = await context(token);
      const same = unchanged(current, knownVersion);
      if (same) return same;
      const budget = await budgetState(current.seasonCode);
      const showItems = budget.status !== "draft" || current.capabilities.draftBudgetItems;
      if (!budget.budgetId || !showItems) {
        return {
          viewVersion: current.viewVersion,
          seasonCode: current.seasonCode,
          budgetStatus: budget.status,
          approvedOn: budget.approvedOn,
          revision: budget.revision,
          departments: [],
          choices: { systems: [], items: [] },
        };
      }
      return loadBudgetHierarchy(db, current, budget);
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
          view.register = loaded.register;
          view.unpaidCount = loaded.unpaidCount;
        } else {
          view.register = [];
          view.unpaidCount = 0;
        }
      }
      return presentPurchases(view, current.capabilities);
    },
    async financing(token, knownVersion) {
      const current = await context(token);
      if (!current.capabilities.financing) throw new FinanceError(403, "Financing access is required.");
      const same = unchanged(current, knownVersion);
      if (same) return same;
      if (!current.seasonCode) {
        return { viewVersion: current.viewVersion, seasonCode: null, funding: [], parts: [], scenarios: [] };
      }
      try {
        const loaded = await loadFundingRecords(db.query.bind(db), current.seasonCode, osloToday(), current.capabilities.draftBudgetItems);
        return { viewVersion: current.viewVersion, seasonCode: current.seasonCode, ...loaded, scenarios: [] };
      } catch (error) {
        if (error instanceof FinanceError) throw error;
        throw new FinanceError(503, UNAVAILABLE);
      }
    },
    async mutate(token, body) {
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
      if (isFundingAction(action)) return applyFundingMutation(db, current.memberId, body, current.capabilities.draftBudgetItems);
      if (isBudgetMutation(action)) return performBudgetMutation(db, current, body);
      if (isRequestAction(action)) return applyRequestMutation(db, current.memberId, body);
      if (isPurchaseMutation(action)) {
        return performPurchaseMutation(db, financeStorage, current, body);
      }
      if (isProcessingMutation(action)) {
        return performProcessingMutation(db, current, body);
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
  return createFinanceServices({ db, authenticate: (token) => cv.authenticate(token), financeStorage });
}
