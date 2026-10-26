import pg from "pg";
import { isFinanceAction, isFinanceProfile, mutationCapability, mutationRequiresRevision, presentPurchases } from "./finance-access.js";
import { FinanceError } from "./finance-error.js";
import { formatOre, osloToday } from "./finance-money.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { createCvServices } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import type {
  FinanceCapabilitiesResponse,
  FinanceCapabilitySet,
  FinanceMutationResult,
  FinanceProfile,
  FinancePurchaseSummary,
  FinanceUnchanged,
  FinancingView,
  FundingPartRecord,
  FundingRecord,
  OwnRequestSummary,
  PublicBudgetItem,
  PublicBudgets,
  PublicDepartmentBudget,
  PublicEarmarkSummary,
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
  purchases(token: string, knownVersion?: number): Promise<PurchasesView | FinanceUnchanged>;
  financing(token: string, knownVersion?: number): Promise<FinancingView | FinanceUnchanged>;
  mutate(token: string, body: Record<string, unknown>): Promise<FinanceMutationResult>;
}

export function createFinanceServices(deps: { db: CvDatabase; authenticate: (token: string) => Promise<WorkspaceIdentity> }): FinanceServices {
  const { db } = deps;

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

  async function budgetState(seasonCode: string | null): Promise<{ status: "absent" | "draft" | "approved"; approvedOn: string | null; budgetId: string | null }> {
    if (!seasonCode) return { status: "absent", approvedOn: null, budgetId: null };
    const [row] = await rows<{ status: "draft" | "approved" | null; approved_on: string | null; id: string | null }>(
      `select b.status, b.approved_on::text as approved_on, b.id
       from finance.seasons s
       left join finance.budgets b on b.season_id = s.id
       where s.code = $1`,
      [seasonCode],
    );
    if (!row?.status || !row.id) return { status: "absent", approvedOn: null, budgetId: null };
    return { status: row.status, approvedOn: row.approved_on, budgetId: row.id };
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
        ? (await rows<{ id: string; public_ref: string; purpose: string; amount_ore: string; spend_by: string | null }>(
          `select p.id, p.public_ref, p.purpose, p.amount_ore::text as amount_ore, p.spend_by::text as spend_by
           from finance.funding_parts p
           join finance.funding f on f.id = p.funding_id
           join finance.seasons s on s.id = f.season_id
           where s.code = $1 and f.status in ('secured', 'received')
           order by p.public_ref`,
          [current.seasonCode],
        )).map((row): PublicEarmarkSummary => ({
          id: row.id,
          publicRef: row.public_ref,
          purpose: row.purpose,
          amountNok: formatOre(BigInt(row.amount_ore)),
          usedNok: formatOre(0n),
          spendBy: row.spend_by,
        }))
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
      const items = budget.budgetId && showItems
        ? await rows<{
          id: string; public_ref: string; system_id: string; system_code: string; system_name: string; active: boolean;
          department_key: string; department_name: string; description: string; category: string; planned_ore: string;
          priority: PublicBudgetItem["priority"]; reuse_status: PublicBudgetItem["reuseStatus"];
          expected_purchase_date: string | null; status: PublicBudgetItem["status"];
        }>(
          `select i.id, i.public_ref, i.system_id, sys.code as system_code, sys.name as system_name, sys.active,
                  d.department_key, d.name as department_name, i.description, i.category, i.planned_ore::text as planned_ore,
                  i.priority, i.reuse_status, i.expected_purchase_date::text as expected_purchase_date, i.status
           from finance.budget_items i
           join finance.systems sys on sys.id = i.system_id
           join identity.departments d on d.department_key = sys.department_key
           where i.budget_id = $1::uuid
           order by d.sort_order, sys.name, i.public_ref`,
          [budget.budgetId],
        )
        : [];
      const departments: PublicDepartmentBudget[] = [];
      for (const item of items) {
        let department = departments.find((entry) => entry.departmentKey === item.department_key);
        if (!department) {
          department = { departmentKey: item.department_key, name: item.department_name, systems: [] };
          departments.push(department);
        }
        let system = department.systems.find((entry) => entry.id === item.system_id);
        if (!system) {
          system = { id: item.system_id, code: item.system_code, name: item.system_name, active: item.active, items: [] };
          department.systems.push(system);
        }
        system.items.push({
          id: item.id,
          publicRef: item.public_ref,
          systemId: item.system_id,
          systemCode: item.system_code,
          description: item.description,
          category: item.category,
          plannedNok: formatOre(BigInt(item.planned_ore)),
          priority: item.priority,
          reuseStatus: item.reuse_status,
          expectedPurchaseDate: item.expected_purchase_date,
          status: item.status,
        });
      }
      return { viewVersion: current.viewVersion, seasonCode: current.seasonCode, budgetStatus: budget.status, departments };
    },
    async purchases(token, knownVersion) {
      const current = await context(token);
      const same = unchanged(current, knownVersion);
      if (same) return same;
      const ownRequests = (await rows<{ id: string; public_ref: string; status: OwnRequestSummary["status"]; planned_date: string | null }>(
        `select id, public_ref, status, planned_date::text as planned_date
         from finance.requests
         where requester_member_id = $1::uuid
         order by public_ref`,
        [current.memberId],
      )).map((row): OwnRequestSummary => ({
        id: row.id,
        publicRef: row.public_ref,
        status: row.status,
        plannedDate: row.planned_date,
        approvedNok: null,
        fulfilledNok: formatOre(0n),
        remainingNok: formatOre(0n),
        releasedNok: formatOre(0n),
      }));
      const view: PurchasesView = { viewVersion: current.viewVersion, ownRequests };
      if (current.capabilities.purchaseRegister) {
        view.register = current.seasonCode ? (await rows<{
          id: string; public_ref: string; status: FinancePurchaseSummary["status"]; buyer_name: string; supplier_name: string;
          payment_method: FinancePurchaseSummary["paymentMethod"]; purchase_date: string; total_ore: string;
          refund_account: string | null; refund_phone: string | null;
        }>(
          `select p.id, p.public_ref, p.status, p.buyer_name, p.supplier_name, p.payment_method,
                  p.purchase_date::text as purchase_date, coalesce(sum(l.amount_ore), 0)::text as total_ore,
                  p.refund_account, p.refund_phone
           from finance.purchases p
           join finance.seasons s on s.id = p.season_id
           left join finance.purchase_lines l on l.purchase_id = p.id
           where s.code = $1
           group by p.id
           order by p.public_ref`,
          [current.seasonCode],
        )).map((row): FinancePurchaseSummary => ({
          id: row.id,
          publicRef: row.public_ref,
          status: row.status,
          buyerName: row.buyer_name,
          supplierName: row.supplier_name,
          paymentMethod: row.payment_method,
          purchaseDate: row.purchase_date,
          totalNok: formatOre(BigInt(row.total_ore)),
          refundAccount: row.refund_account,
          refundPhone: row.refund_phone,
        })) : [];
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
      const funding = (await rows<{
        id: string; public_ref: string; source_name: string; owner_name: string; funding_type: FundingRecord["fundingType"];
        amount_ore: string; status: FundingRecord["status"]; confidence: FundingRecord["confidence"];
        expected_date: string | null; received_date: string | null; owner_email: string | null;
        reporting_required: boolean; agreement_link: string | null; note: string | null; revision: number;
      }>(
        `select f.id, f.public_ref, f.source_name, f.owner_name, f.funding_type, f.amount_ore::text as amount_ore,
                f.status, f.confidence, f.expected_date::text as expected_date, f.received_date::text as received_date,
                f.owner_email, f.reporting_required, f.agreement_link, f.note, f.revision
         from finance.funding f
         join finance.seasons s on s.id = f.season_id
         where s.code = $1
         order by f.public_ref`,
        [current.seasonCode],
      )).map((row): FundingRecord => ({
        id: row.id,
        publicRef: row.public_ref,
        sourceName: row.source_name,
        ownerName: row.owner_name,
        fundingType: row.funding_type,
        amountNok: formatOre(BigInt(row.amount_ore)),
        status: row.status,
        confidence: row.confidence,
        expectedDate: row.expected_date,
        receivedDate: row.received_date,
        ownerEmail: row.owner_email,
        reportingRequired: row.reporting_required,
        agreementLink: row.agreement_link,
        note: row.note,
        revision: row.revision,
      }));
      const parts = (await rows<{
        id: string; public_ref: string; funding_id: string; purpose: string; amount_ore: string;
        spend_by: string | null; conditions: string | null; revision: number;
      }>(
        `select p.id, p.public_ref, p.funding_id, p.purpose, p.amount_ore::text as amount_ore,
                p.spend_by::text as spend_by, p.conditions, p.revision
         from finance.funding_parts p
         join finance.funding f on f.id = p.funding_id
         join finance.seasons s on s.id = f.season_id
         where s.code = $1
         order by p.public_ref`,
        [current.seasonCode],
      )).map((row): FundingPartRecord => ({
        id: row.id,
        publicRef: row.public_ref,
        fundingId: row.funding_id,
        purpose: row.purpose,
        amountNok: formatOre(BigInt(row.amount_ore)),
        spendBy: row.spend_by,
        conditions: row.conditions,
        revision: row.revision,
      }));
      return { viewVersion: current.viewVersion, seasonCode: current.seasonCode, funding, parts, scenarios: [] };
    },
    async mutate(token, body) {
      const current = await context(token);
      const action = body.action;
      if (typeof action !== "string" || !isFinanceAction(action)) throw new FinanceError(400, "Unknown request.");
      if (!current.capabilities[mutationCapability(action)]) throw new FinanceError(403, "Finance access is required.");
      if (typeof body.requestId !== "string" || !UUID.test(body.requestId)) throw new FinanceError(400, "A valid request ID is required.");
      if (mutationRequiresRevision(action)) {
        const revision = body.expectedRevision;
        if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
          throw new FinanceError(400, "A valid revision is required.");
        }
      }
      // Later slices perform the write. This slice proves denial and leaves no side effects.
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
  return createFinanceServices({ db, authenticate: (token) => cv.authenticate(token) });
}
