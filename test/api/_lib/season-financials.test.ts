import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createSeasonFinancialServices } from "../../../api/_lib/season-financials-service.js";
import { MemberCvError, type CvDatabase, type WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const user = "22222222-2222-4222-8222-222222222222";
const admin = "11111111-1111-4111-8111-111111111111";
const auth = "33333333-3333-4333-8333-333333333333";
const identity: WorkspaceIdentity = { userId: user, googleSub: "user-sub", email: "user@example.test", name: "User" };
let pg: PGlite;
let db: CvDatabase;
let services: ReturnType<typeof createSeasonFinancialServices>;
let afterQuery: ((text: string) => Promise<void>) | null = null;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema identity; create schema project_management; create schema neon_auth;
    create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null, auth_user_id uuid);
    create table identity.departments (department_key text primary key, name text not null unique, sort_order smallint not null unique);
    create table identity.platform_roles (role_key text primary key, label text not null, sort_order smallint not null unique);
    create table identity.member_roles (member_id uuid not null, role_key text not null, primary key (member_id, role_key));
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    create table project_management.access (member_id uuid primary key, active boolean not null);
    create table neon_auth."user" (id uuid primary key, email text, "emailVerified" boolean, banned boolean);
    create table neon_auth.account ("userId" uuid, "providerId" text, "accountId" text);
    insert into identity.members values ('${admin}','admin-sub','admin@example.test','Admin',null), ('${user}','user-sub','user@example.test','User','${auth}');
    insert into identity.departments values ('mech','Mechanical',1), ('finance','Finance',2), ('empty','Empty',3);
    insert into identity.platform_roles values ('platform_administrator','Admin',1), ('team_member','Member',2);
    insert into identity.member_roles values ('${admin}','platform_administrator');
    insert into project_management.access values ('${user}', true);
    insert into neon_auth."user" values ('${auth}','user@example.test',true,false);
    insert into neon_auth.account values ('${auth}','google','user-sub');
    create role anon; create role authenticated; create role anonymous;
  `);
  for (const file of ["011_finance_core.sql", "012_finance_season_budgets.sql", "013_finance_funding.sql", "014_finance_register_purchases.sql", "015_finance_requests.sql", "016_finance_fulfillment.sql", "024_financials_member_role.sql", "034_finance_bank_snapshot.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  db = { query: async <T>(text: string, params?: unknown[]) => {
    const rows = (await pg.query<T>(text, params)).rows;
    if (afterQuery) await afterQuery(text);
    return { rows };
  } };
  services = createSeasonFinancialServices({ db, authenticate: async token => {
    if (token !== "user") throw new MemberCvError(401, "Log in to continue.");
    return identity;
  } });
});
afterAll(async () => { await pg.close(); });

it("requires the independent Season Overview grant and a verified linked account", async () => {
  await expect(services.summary("missing")).rejects.toMatchObject({ status: 401 });
  await pg.exec(`update project_management.access set active=false where member_id='${user}';`);
  await expect(services.summary("user")).rejects.toMatchObject({ status: 403 });
  await pg.exec(`update project_management.access set active=true where member_id='${user}'; update neon_auth."user" set banned=true where id='${auth}';`);
  await expect(services.summary("user")).rejects.toMatchObject({ status: 403 });
  await pg.exec(`update neon_auth."user" set banned=false where id='${auth}';`);
  expect(await services.summary("user")).toMatchObject({ budgetStatus: "absent", plannedNok: null, actualNok: null, departments: [], canOpenFinancials: false, bank: { status: "available", snapshot: null } });
});

it("hides draft amounts until the Financials capability is granted", async () => {
  await pg.exec(`
    select finance.configure_current_season('${admin}', 'S27', 'Season', '2026-08-01', '2027-07-31');
    insert into finance.budgets (season_id,public_ref,status,created_by_member_id,updated_by_member_id)
      select id,'B-S27','draft','${admin}','${admin}' from finance.seasons where code='S27';
    insert into finance.systems (department_key,code,name,active) values ('mech','SYS-A','Frame',true);
    insert into finance.budget_items (budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,protected,created_by_member_id,updated_by_member_id)
      select b.id,s.id,'BI-S27-001','Private detail','material',12345,'P1','new','active',false,'${admin}','${admin}' from finance.budgets b, finance.systems s where s.code='SYS-A';
  `);
  const hidden = await services.summary("user");
  expect(hidden).toMatchObject({ seasonCode: "S27", budgetStatus: "draft-hidden", plannedNok: null, actualNok: null, departments: [] });
  await pg.exec(`insert into identity.member_roles values ('${user}','financials');`);
  const visible = await services.summary("user");
  expect(visible).toMatchObject({ budgetStatus: "draft", plannedNok: "123.45", actualNok: "0.00", canOpenFinancials: true });
  expect(visible.departments).toHaveLength(3);
  expect(visible.departments[0]).toMatchObject({ name: "Mechanical", plannedNok: "123.45", systems: [{ name: "Frame" }] });
  expect(visible.departments[2]).toMatchObject({ name: "Empty", plannedNok: "0.00", actualNok: "0.00", systems: [] });
  expect(JSON.stringify(visible)).not.toMatch(/Private detail|commitment|earmark|funding|scenario/i);
  await pg.exec(`delete from identity.member_roles where member_id='${user}' and role_key='financials';`);
});

it("allows approved aggregates without Financials and rechecks a revoked grant during the read", async () => {
  await pg.exec(`update finance.budgets set status='approved',approved_by_member_id='${admin}',approved_on='2026-10-01'; select finance.bump_view_version();`);
  const view = await services.summary("user");
  expect(view).toMatchObject({ budgetStatus: "approved", plannedNok: "123.45", actualNok: "0.00", canOpenFinancials: false });
  afterQuery = async text => {
    if (!text.includes("jsonb_agg(to_jsonb(items)")) return;
    afterQuery = null;
    await pg.exec(`update project_management.access set active=false where member_id='${user}';`);
  };
  await expect(services.summary("user")).rejects.toMatchObject({ status: 403 });
  await pg.exec(`update project_management.access set active=true where member_id='${user}';`);
});

it("uses registered allocations, retains cancelled and inactive spending, and excludes voids", async () => {
  await pg.exec(`
    update finance.systems set active=false where code='SYS-A';
    update finance.budget_items set status='cancelled' where public_ref='BI-S27-001';
    begin;
    insert into finance.purchases (season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind)
      select id,'${user}','2026-0001','registered','Buyer','Private supplier','team_account','2026-10-01','Workshop material','invoice' from finance.seasons where code='S27';
    insert into finance.purchase_lines (purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
      select p.id,'2026-0001-L1',s.id,i.id,'Private line',1,2000 from finance.purchases p, finance.systems s, finance.budget_items i where p.public_ref='2026-0001' and s.code='SYS-A' and i.public_ref='BI-S27-001';
    insert into finance.allocations (line_id,budget_item_id,public_ref,amount_ore)
      select l.id,i.id,'2026-0001-L1-A1',2000 from finance.purchase_lines l, finance.budget_items i where l.public_ref='2026-0001-L1' and i.public_ref='BI-S27-001';
    insert into finance.purchases (season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind,void_reason,voided_at,voided_by_member_id)
      select id,'${user}','2026-0002','voided','Buyer','Supplier','team_account','2026-10-01','Workshop material','receipt','Duplicate','2026-10-02','${admin}' from finance.seasons where code='S27';
    insert into finance.purchase_lines (purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
      select p.id,'2026-0002-L1',s.id,i.id,'Private line',1,9999 from finance.purchases p, finance.systems s, finance.budget_items i where p.public_ref='2026-0002' and s.code='SYS-A' and i.public_ref='BI-S27-001';
    insert into finance.allocations (line_id,budget_item_id,public_ref,amount_ore)
      select l.id,i.id,'2026-0002-L1-A1',9999 from finance.purchase_lines l, finance.budget_items i where l.public_ref='2026-0002-L1' and i.public_ref='BI-S27-001';
    commit;
    select finance.bump_view_version();
  `);
  const view = await services.summary("user");
  expect(view).toMatchObject({ plannedNok: "0.00", actualNok: "20.00" });
  expect(view.departments[0].systems[0]).toMatchObject({ active: false, plannedNok: "0.00", actualNok: "20.00" });
  expect(JSON.stringify(view)).not.toMatch(/Private supplier|Private line|2026-0001/);
});

it("reports unbudgeted allocations separately and retries if finance changes during reading", async () => {
  await pg.exec(`
    insert into finance.budget_items (budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,protected,created_by_member_id,updated_by_member_id)
      select b.id,s.id,'BI-S27-A-UNALLOC','Unallocated','material',0,'P1','new','planned',true,'${admin}','${admin}' from finance.budgets b, finance.systems s where s.code='SYS-A';
    begin;
    insert into finance.purchases (season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind)
      select id,'${user}','2026-0003','registered','Buyer','Supplier','team_account','2026-10-01','Workshop material','receipt' from finance.seasons where code='S27';
    insert into finance.purchase_lines (purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
      select p.id,'2026-0003-L1',s.id,i.id,'Unplanned',1,500 from finance.purchases p, finance.systems s, finance.budget_items i where p.public_ref='2026-0003' and s.code='SYS-A' and i.public_ref='BI-S27-A-UNALLOC';
    insert into finance.allocations (line_id,budget_item_id,public_ref,amount_ore)
      select l.id,i.id,'2026-0003-L1-A1',500 from finance.purchase_lines l, finance.budget_items i where l.public_ref='2026-0003-L1' and i.public_ref='BI-S27-A-UNALLOC';
    commit;
    select finance.bump_view_version();
  `);
  let changes = 0;
  afterQuery = async text => {
    if (!text.includes("jsonb_agg(to_jsonb(items)")) return;
    afterQuery = null;
    changes++;
    await pg.exec(`update finance.budget_items set status='planned',planned_ore=3000 where public_ref='BI-S27-001'; select finance.bump_view_version();`);
  };
  const view = await services.summary("user");
  expect(changes).toBe(1);
  expect(view).toMatchObject({ plannedNok: "30.00", actualNok: "25.00" });
  expect(view.departments[0]).toMatchObject({ unbudgetedNok: "5.00", systems: [{ unbudgetedNok: "5.00" }] });
});

it("requires bearer authentication on the read-only HTTP endpoint", async () => {
  const { createSeasonFinancialHandler } = await import("../../../api/_lib/season-financials-handler.js");
  const handler = createSeasonFinancialHandler(() => services);
  const { vi } = await import("vitest");
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: "GET", headers: {} } as never, res as never);
  expect(res.status).toHaveBeenLastCalledWith(401);
  await handler({ method: "POST", headers: { authorization: "Bearer user" } } as never, res as never);
  expect(res.status).toHaveBeenLastCalledWith(405);
  await handler({ method: "GET", headers: { authorization: "Bearer user" } } as never, res as never);
  expect(res.status).toHaveBeenLastCalledWith(200);
  expect(res.json.mock.lastCall?.[0]).toMatchObject({ budgetStatus: "approved", actualNok: "25.00" });
});


it("provides only a dated manual balance to an authorized Season Overview reader", async () => {
  await pg.exec(`update finance.bank_snapshot set amount_ore=0, as_of_date='2026-10-28', updated_at=now(), updated_by='${admin}', revision=1; select finance.bump_view_version();`);
  const view = await services.summary("user");
  expect(view.bank).toMatchObject({ status: "available", snapshot: { amountNok: "0.00", asOfDate: "2026-10-28" } });
  expect(Object.keys(view.bank.status === "available" ? view.bank.snapshot ?? {} : {})).toEqual(["amountNok", "asOfDate", "updatedAt"]);
  await pg.exec(`delete from finance.settings where setting_key='current_season';`);
  const noSeason = await services.summary("user");
  expect(noSeason.seasonCode).toBeNull();
  expect(noSeason.bank).toMatchObject({ status: "available", snapshot: { amountNok: "0.00" } });
  await pg.exec(`update project_management.access set active=false where member_id='${user}';`);
  await expect(services.summary("user")).rejects.toMatchObject({ status: 403 });
  await pg.exec(`update project_management.access set active=true where member_id='${user}';`);
});

it("isolates a bank read failure and rechecks authorization after the snapshot read", async () => {
  const unavailable: CvDatabase = { query: async <T>(text: string, params?: unknown[]) => {
    if (text.includes("from finance.bank_snapshot")) throw new Error("database offline");
    return db.query<T>(text, params);
  } };
  const failing = createSeasonFinancialServices({ db: unavailable, authenticate: async () => identity });
  expect((await failing.summary("user")).bank).toEqual({ status: "unavailable" });
  afterQuery = async text => {
    if (!text.includes("from finance.bank_snapshot")) return;
    afterQuery = null;
    await pg.exec(`update project_management.access set active=false where member_id='${user}';`);
  };
  await expect(services.summary("user")).rejects.toMatchObject({ status: 403 });
  await pg.exec(`update project_management.access set active=true where member_id='${user}';`);
});
