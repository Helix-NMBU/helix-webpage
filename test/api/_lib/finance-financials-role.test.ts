import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";

const member = "20000000-0000-4000-8000-000000000001";
let pg: PGlite;
let db: CvDatabase;
let services: ReturnType<typeof createFinanceServices>;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity;
    create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
    create table identity.departments (department_key text primary key, name text not null, sort_order smallint);
    create table identity.platform_roles (role_key text primary key, label text not null, sort_order smallint not null unique);
    create table identity.member_roles (member_id uuid not null, role_key text not null, primary key (member_id, role_key));
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    insert into identity.members values ('${member}', 'member-sub', 'member@example.test', 'Member');
    insert into identity.members values ('10000000-0000-4000-8000-000000000001', 'admin-sub', 'admin@example.test', 'Admin');
    insert into identity.departments values ('finance', 'Finance', 1);
    insert into identity.member_departments values ('${member}', 'finance');
  `);
  for (const file of ["011_finance_core.sql", "024_financials_member_role.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  db = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query<T>(text, params)).rows }) };
  services = createFinanceServices({ db, authenticate: async () => ({ userId: member, googleSub: "member-sub", email: "member@example.test", name: "Member" }) });
});
afterAll(async () => { await pg.close(); });

it("requires Financials for every finance API, independent of department and other grants", async () => {
  await db.query("insert into finance.member_grants (member_id, profile, active, operator_member_id, reason) values ($1, 'head_of_finance', true, '10000000-0000-4000-8000-000000000001', 'test')", [member]);
  for (const action of [
    () => services.capabilities("member"), () => services.version("member"), () => services.overview("member"),
    () => services.budgets("member"), () => services.purchases("member"), () => services.financing("member"),
    () => services.recovery("member"), () => services.mutate("member", { action: "registerPurchase" }),
  ]) await expect(action()).rejects.toMatchObject({ status: 403 });
  const before = (await pg.query<{ version: number }>("select version from finance.view_versions")).rows[0].version;
  await db.query("insert into identity.member_roles values ($1, 'financials')", [member]);
  const allowed = await services.capabilities("member");
  expect(allowed.profiles).toEqual(["finance", "head_of_finance"]);
  expect(allowed.capabilities).toMatchObject({ publicBudgets: true, purchaseRegister: true, decideRequests: true });
  expect(Number(allowed.viewVersion)).toBe(Number(before) + 1);
  await db.query("delete from identity.member_roles where member_id = $1 and role_key = 'financials'", [member]);
  await expect(services.overview("member")).rejects.toMatchObject({ status: 403 });
  const after = (await pg.query<{ version: number }>("select version from finance.view_versions")).rows[0].version;
  expect(Number(after)).toBe(Number(before) + 2);
});

it("creates one transactional purchase notification for the Financials role", async () => {
  await db.query("insert into identity.member_roles values ($1, 'financials')", [member]);
  const season = "30000000-0000-4000-8000-000000000001";
  const purchase = "40000000-0000-4000-8000-000000000001";
  await pg.exec(`
    begin;
    insert into finance.seasons (id, code, name, start_date, end_date, created_by_member_id, updated_by_member_id)
      values ('${season}', 'S27', 'S27', '2026-01-01', '2027-12-31', '${member}', '${member}');
    insert into finance.purchases (id, season_id, requester_member_id, public_ref, status, buyer_name, supplier_name, payment_method, purchase_date, justification, document_kind)
      values ('${purchase}', '${season}', '${member}', '2026-0001', 'registered', 'Buyer', 'Supplier', 'team_account', '2026-10-01', 'Valid justification', 'receipt');
    commit;
  `);
  const messages = await pg.query<{ recipient_member_id: string; payload: Record<string, string> }>("select recipient_member_id, payload from finance.outbox where entity_id = $1", [purchase]);
  expect(messages.rows).toHaveLength(1);
  expect(messages.rows[0]).toMatchObject({ recipient_member_id: member, payload: { publicRef: "2026-0001", supplierName: "Supplier", totalOre: "0" } });
});
