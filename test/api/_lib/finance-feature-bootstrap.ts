import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { applyProjectBudgetMigrations, setupFundingPipelineFixture, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";

const read = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8");

/** Complete a disposable legacy fixture with the actual finance feature migrations.
 * This helper never reads DATABASE_URL and never substitutes production functions.
 */
export async function bootstrapFinanceFeature(pg: ProjectBudgetTestDatabase) {
  await pg.exec(`
    create schema if not exists neon_auth;
    create table if not exists neon_auth."user"(id uuid primary key,email text not null,"emailVerified" boolean not null,banned boolean);
    create table if not exists neon_auth.account(id uuid primary key,"userId" uuid references neon_auth."user"(id),"providerId" text,"accountId" text);
    alter table identity.members add column if not exists auth_user_id uuid references neon_auth."user"(id);
    insert into neon_auth."user" select coalesce(auth_user_id,id),email,true,false from identity.members on conflict(id) do nothing;
    update identity.members set auth_user_id=id where auth_user_id is null;
    alter table neon_auth.account add column if not exists id uuid default gen_random_uuid();
    insert into neon_auth.account(id,"userId","providerId","accountId")
      select gen_random_uuid(),m.auth_user_id,'google',m.google_sub from identity.members m
      where not exists(select 1 from neon_auth.account a where a."userId"=m.auth_user_id and a."providerId"='google' and a."accountId"=m.google_sub);
    create schema if not exists project_management;
    create table if not exists project_management.projects(id uuid primary key,season text not null,name text not null,lead_ids uuid[] not null,departments text[] not null,revision integer not null default 1);
    create table if not exists project_management.departments(id uuid primary key,season text not null,name text not null,revision integer not null default 1);
    create table if not exists project_management.department_members(department_id uuid references project_management.departments(id),member_id uuid references identity.members(id),is_lead boolean not null default false,primary key(department_id,member_id));
    create schema if not exists partner_deals;
    create table if not exists partner_deals.deals(id uuid primary key);
  `);
  const db = { exec: (sql: string) => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  const exists = async (name: string) => (await pg.query<{ present: boolean }>("select to_regclass($1) is not null as present", [name])).rows[0].present;
  if (!(await exists("partner_deals.space_access"))) await setupFundingPipelineFixture(db);
  const canonical = read("016_fixed_departments.sql").match(/create or replace function project_management\.canonical_department[\s\S]*?\$\$;/)?.[0];
  if (!canonical) throw new Error("Missing actual canonical department function.");
  await pg.exec(canonical);
  // Some retained suites predate mail/export and immutable upload candidates.
  if (!(await pg.query<{ present: boolean }>("select to_regprocedure('finance.request_remaining_ore(uuid)') is not null as present")).rows[0].present) await pg.exec(read("016_finance_fulfillment.sql"));
  if (!(await exists("finance.export_objects"))) await pg.exec(read("017_finance_notifications_exports.sql"));
  if (!(await pg.query<{ present: boolean }>("select to_regprocedure('finance.purchase_has_unsettled_obligation(uuid)') is not null as present")).rows[0].present) await pg.exec(read("018_finance_unpaid_voids_reviews.sql"));
  if (!(await pg.query<{ present: boolean }>("select exists(select 1 from pg_trigger where tgname='invoice_obligation_due_date_guard') as present")).rows[0].present) await pg.exec(read("020_finance_processing_guards.sql"));
  if (!(await exists("finance.upload_final_candidates"))) await pg.exec(read("021_finance_final_candidate_ledger.sql"));
  if (!(await pg.query<{ present: boolean }>("select exists(select 1 from information_schema.columns where table_schema='finance' and table_name='purchases' and column_name='import_source') as present")).rows[0].present) await pg.exec(read("065_finance_historical_purchases.sql"));
  await applyProjectBudgetMigrations(db);
}

/** Insert an explicitly pre-071 private invoice without inventing import or payment facts.
 * Caller owns a disposable fixture transaction. New registration never uses this helper.
 */
export async function historicalPrivateInvoice<T>(pg: PGlite, insert: () => Promise<T>): Promise<T> {
  await pg.exec("savepoint historical_private_invoice; alter table finance.documents disable trigger documents_verified_transfer; alter table finance.documents disable trigger documents_enqueue_transfer;");
  try {
    const result = await insert();
    await pg.exec("alter table finance.documents enable trigger documents_verified_transfer; alter table finance.documents enable trigger documents_enqueue_transfer; release savepoint historical_private_invoice;");
    return result;
  } catch (error) {
    await pg.exec("rollback to savepoint historical_private_invoice; release savepoint historical_private_invoice;");
    throw error;
  }
}
