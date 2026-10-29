import pg from "pg";
import type { SeasonFinancialDepartment, SeasonFinancialSummary } from "../../src/features/ProjectManagement/season-financials-types.js";
import { loadBankSnapshot } from "./finance-bank.js";
import { nokToOre } from "../../src/features/Finance/finance-calculations.js";
import { formatOre } from "./finance-money.js";
import { loadDepartmentSummaries } from "./finance-summary.js";
import { MemberCvError, neonCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

type Context = {
  season_code: string | null;
  budget_status: "draft" | "approved" | null;
  view_version: string | number;
  draft_allowed: boolean;
  financials_allowed: boolean;
};

// Season Overview is an independent space: department access is not sufficient.
// Recheck the linked Google account and grant in the database, including after reading data.
const contextSql = `select
  (select setting_value #>> '{}' from finance.settings where setting_key='current_season') as season_code,
  (select b.status from finance.budgets b join finance.seasons s on s.id=b.season_id
    where s.code=(select setting_value #>> '{}' from finance.settings where setting_key='current_season')) as budget_status,
  v.version as view_version,
  coalesce((finance.capability_flags(m.id)->>'draftBudgetItems')::boolean, false) as draft_allowed,
  coalesce((finance.capability_flags(m.id)->>'publicBudgets')::boolean, false) as financials_allowed
  from identity.members m
  join neon_auth."user" u on u.id=m.auth_user_id
  join project_management.access a on a.member_id=m.id and a.active
  cross join finance.view_versions v
  where v.singleton and m.id=$1::uuid and m.google_sub=$2 and lower(m.email)=lower($3)
    and lower(u.email)=lower(m.email) and u."emailVerified" is true and u.banned is not true
    and exists (select 1 from neon_auth.account linked where linked."userId"=u.id
      and linked."providerId"='google' and linked."accountId"=m.google_sub)`;

export interface SeasonFinancialServices { summary(token: string): Promise<SeasonFinancialSummary> }

export function createSeasonFinancialServices(deps: {
  db: CvDatabase;
  authenticate(token: string): Promise<WorkspaceIdentity>;
}): SeasonFinancialServices {
  async function context(identity: WorkspaceIdentity): Promise<Context> {
    const row = (await deps.db.query<Context>(contextSql, [identity.userId, identity.googleSub, identity.email])).rows[0];
    if (!row) throw new MemberCvError(403, "Season Overview access is required.");
    if (!Number.isSafeInteger(Number(row.view_version))) throw new MemberCvError(503, "Financial summary is temporarily unavailable.");
    return row;
  }
  return {
    async summary(token) {
      try {
        const identity = await deps.authenticate(token);
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = await context(identity);
          const visible = before.season_code !== null && (before.budget_status === "approved" || (before.budget_status === "draft" && before.draft_allowed));
          const budgetStatus = before.budget_status === "draft" && !before.draft_allowed ? "draft-hidden" : before.budget_status ?? "absent";
          let departments: SeasonFinancialDepartment[] = [];
          let plannedNok: string | null = null;
          let actualNok: string | null = null;
          if (visible && before.season_code) {
            const summaries = await loadDepartmentSummaries(deps.db.query.bind(deps.db), before.season_code, before.draft_allowed);
            const catalog = (await deps.db.query<{ department_key: string; name: string }>(
              "select department_key, name from identity.departments order by sort_order, name, department_key",
            )).rows;
            const byKey = new Map(summaries.map((entry) => [entry.departmentKey, entry]));
            departments = catalog.map(({ department_key: departmentKey, name }) => {
              const entry = byKey.get(departmentKey);
              return {
                departmentKey, name,
                plannedNok: entry?.plannedNok ?? "0.00",
                actualNok: entry?.actualNok ?? "0.00",
                unbudgetedNok: entry?.unbudgetedNok ?? "0.00",
                systems: (entry?.systems ?? []).map(({ id, code, name: systemName, active, plannedNok, actualNok, unbudgetedNok }) => ({ id, code, name: systemName, active, plannedNok, actualNok, unbudgetedNok })),
              };
            });
            plannedNok = formatOre(departments.reduce((sum, item) => sum + nokToOre(item.plannedNok), 0n));
            actualNok = formatOre(departments.reduce((sum, item) => sum + nokToOre(item.actualNok), 0n));
          }
          // The snapshot is independent of the season and its absence is not a zero.
          // A bank read failure must not suppress otherwise available budget totals.
          let bank: SeasonFinancialSummary["bank"];
          try {
            const snapshot = await loadBankSnapshot(deps.db);
            bank = { status: "available", snapshot: snapshot ? { amountNok: snapshot.amountNok, asOfDate: snapshot.asOfDate, updatedAt: snapshot.updatedAt } : null };
          } catch {
            bank = { status: "unavailable" };
          }
          const after = await context(identity);
          if (before.view_version === after.view_version && before.season_code === after.season_code && before.budget_status === after.budget_status && before.draft_allowed === after.draft_allowed && before.financials_allowed === after.financials_allowed) {
            return { bank, seasonCode: before.season_code, budgetStatus, plannedNok, actualNok, departments, canOpenFinancials: before.financials_allowed, viewVersion: Number(before.view_version) };
          }
        }
        throw new MemberCvError(409, "Financial data changed while loading. Please try again.");
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        throw new MemberCvError(503, "Financial summary is temporarily unavailable. Please try again.");
      }
    },
  };
}

let pool: pg.Pool | undefined;
export function neonSeasonFinancialServices(): SeasonFinancialServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "Financial summary is not configured.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  return createSeasonFinancialServices({
    db: { async query<T>(sql: string, params?: unknown[]) { return { rows: (await pool!.query(sql, params)).rows as T[] }; } },
    authenticate: (token) => neonCvServices().authenticate(token),
  });
}
