import { readdirSync, readFileSync } from "node:fs";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

export const projectBudgetFixture = {
  lead: "11111111-1111-4111-8111-111111111111",
  departmentLead: "22222222-2222-4222-8222-222222222222",
  finance: "33333333-3333-4333-8333-333333333333",
  head: "44444444-4444-4444-8444-444444444444",
  outsider: "55555555-5555-4555-8555-555555555555",
  otherDepartmentLead: "66666666-6666-4666-8666-666666666666",
  season: "a1111111-1111-4111-8111-111111111111",
  nextSeason: "a2222222-2222-4222-8222-222222222222",
  project: "b1111111-1111-4111-8111-111111111111",
  electronicProject: "b2222222-2222-4222-8222-222222222222",
  department: "c1111111-1111-4111-8111-111111111111",
  electronicDepartment: "c2222222-2222-4222-8222-222222222222",
  system: "d1111111-1111-4111-8111-111111111111",
  electronicSystem: "d2222222-2222-4222-8222-222222222222",
  legacyBudget: "e1111111-1111-4111-8111-111111111111",
  entry: "f1111111-1111-4111-8111-111111111111",
  electronicEntry: "f2222222-2222-4222-8222-222222222222",
  unallocatedEntry: "f3333333-3333-4333-8333-333333333333",
  purchase: "71111111-1111-4111-8111-111111111111",
  line: "72222222-2222-4222-8222-222222222222",
  allocation: "73333333-3333-4333-8333-333333333333",
  document: "74444444-4444-4444-8444-444444444444",
  request: "75555555-5555-4555-8555-555555555555",
  importedPurchase: "76666666-6666-4666-8666-666666666666",
  importedLine: "77777777-7777-4777-8777-777777777777",
  importedAllocation: "78888888-8888-4888-8888-888888888888",
  importedInvoice: "79999999-9999-4999-8999-999999999999",
} as const;
export type ProjectBudgetFixtureRole = "lead" | "departmentLead" | "finance" | "head" | "outsider" | "otherDepartmentLead";
export function projectBudgetIdentity(role: ProjectBudgetFixtureRole): WorkspaceIdentity {
  return { userId: projectBudgetFixture[role], googleSub: role + "-google", email: role.toLowerCase() + "@example.test", name: role };
}

export interface ProjectBudgetTestDatabase extends CvDatabase { exec(sql: string): Promise<unknown> }
const migrationDirectory = new URL("../../../db/migrations/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, migrationDirectory), "utf8");


/** The minimal budget fixture uses the real verified pipeline permission functions. */
export async function setupFundingPipelineFixture(db: ProjectBudgetTestDatabase) {
  await db.exec(`alter table partner_deals.deals add column if not exists title text not null default 'Synthetic application',add column if not exists revision integer not null default 0,
    add column if not exists primary_season_id uuid,add column if not exists stage text not null default 'proposal',add column if not exists negotiation_notes text not null default 'Private negotiation';
    create table if not exists partner_deals.space_access(member_id uuid primary key references identity.members(id),pipeline boolean not null default false,agreements boolean not null default false);
    create table if not exists partner_deals.member_grants(member_id uuid references identity.members(id),capability text,active boolean);
  `);
  const source = read("058_partner_deal_space_access.sql");
  for (const name of ["capabilities", "lock_actor"]) {
    const definition = source.match(new RegExp(`create or replace function partner_deals\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
    if (!definition) throw new Error(`Missing verified pipeline function ${name}`);
    await db.exec(definition);
  }
}

/** Own synthetic identity/project schemas; this helper never targets a configured service. */
export async function setupProjectBudgetBase(db: ProjectBudgetTestDatabase) {
  await db.exec(`
    create schema neon_auth;
    create table neon_auth."user"(id uuid primary key,email text not null,"emailVerified" boolean not null,banned boolean);
    create table neon_auth.account(id uuid primary key,"userId" uuid references neon_auth."user"(id),"providerId" text,"accountId" text);
    create schema identity;
    create table identity.members(id uuid primary key,auth_user_id uuid references neon_auth."user"(id),google_sub text,email text,full_name text);
    create table identity.departments(department_key text primary key,name text not null unique,sort_order smallint not null unique);
    create table identity.platform_roles(role_key text primary key,label text,sort_order smallint);
    create table identity.member_roles(member_id uuid references identity.members(id),role_key text,primary key(member_id,role_key));
    create schema project_management;
    create table project_management.projects(id uuid primary key,season text not null,name text not null,lead_ids uuid[] not null,departments text[] not null,revision integer not null default 1);
    create table project_management.departments(id uuid primary key,season text not null,name text not null,revision integer not null default 1);
    create table project_management.department_members(department_id uuid references project_management.departments(id),member_id uuid references identity.members(id),is_lead boolean not null default false,primary key(department_id,member_id));
    create schema partner_deals;
    create table partner_deals.deals(id uuid primary key);
  `);
  await setupFundingPipelineFixture(db);
  const canonical = read("016_fixed_departments.sql").match(/create or replace function project_management\.canonical_department[\s\S]*?\$\$;/)?.[0];
  if (!canonical) throw new Error("Canonical department migration function was not found.");
  await db.exec(canonical);
  for (const file of readdirSync(migrationDirectory).filter(name => /^0(1[1-9]|2[01])_finance_.*\.sql$/.test(name)).sort()) await db.exec(read(file));
  await db.exec(read("024_financials_member_role.sql"));
  await db.exec(read("065_finance_historical_purchases.sql"));
}

export async function seedProjectBudgetLegacy(db: ProjectBudgetTestDatabase) {
  const f = projectBudgetFixture;
  for (const role of ["lead", "departmentLead", "finance", "head", "outsider", "otherDepartmentLead"] as const) {
    const actor = projectBudgetIdentity(role);
    await db.query('insert into neon_auth."user" values($1::uuid,$2,true,false)', [actor.userId, actor.email]);
    await db.query("insert into neon_auth.account values($1::uuid,$1::uuid,'google',$2)", [actor.userId, actor.googleSub]);
    await db.query("insert into identity.members values($1::uuid,$1::uuid,$2,$3,$4)", [actor.userId, actor.googleSub, actor.email, role]);
  }
  await db.exec(`
    insert into identity.departments values('mechanical-production','Mechanical & Production',1),('electrical','Electrical',2),('finance','Finance',3);
    insert into identity.platform_roles values('platform_administrator','Administrator',1);
    insert into identity.member_roles values('${f.outsider}','platform_administrator'),('${f.finance}','financials'),('${f.head}','financials');
    insert into finance.member_grants(member_id,profile,active,operator_member_id,reason) values('${f.head}','head_of_finance',true,'${f.outsider}','Synthetic test grant');
    insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values
      ('${f.season}','S27','Synthetic season','2026-08-01','2027-07-31','active','${f.head}','${f.head}'),
      ('${f.nextSeason}','S28','Next synthetic season','2027-08-01','2028-07-31','planning','${f.head}','${f.head}');
    insert into project_management.departments(id,season,name) values('${f.department}','S27','Mechanical & Production'),('${f.electronicDepartment}','S27','Electronics');
    insert into project_management.department_members values('${f.department}','${f.departmentLead}',true),('${f.electronicDepartment}','${f.otherDepartmentLead}',true);
    insert into project_management.projects values
      ('${f.project}','S27','Frame',array['${f.lead}'::uuid],array['Mechanical & Production'],1),
      ('${f.electronicProject}','S27','Harness',array['${f.lead}'::uuid],array['Electronics'],1);
    insert into finance.systems(id,department_key,code,name) values('${f.system}','mechanical-production','SYS-FR','Frame'),('${f.electronicSystem}','electrical','SYS-EL','Electronics');
    insert into finance.budgets(id,season_id,public_ref,status,approved_by_member_id,approved_on,created_by_member_id,updated_by_member_id)
      values('${f.legacyBudget}','${f.season}','B-S27','approved','${f.head}','2026-10-01','${f.head}','${f.head}');
    insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,created_by_member_id,updated_by_member_id) values
      ('${f.entry}','${f.legacyBudget}','${f.system}','BI-S27-001','Steel','material',1000000,'P1','new','planned','${f.head}','${f.head}'),
      ('${f.electronicEntry}','${f.legacyBudget}','${f.electronicSystem}','BI-S27-002','Cable','material',500000,'P2','new','planned','${f.head}','${f.head}');
    insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,protected,created_by_member_id,updated_by_member_id)
      values('${f.unallocatedEntry}','${f.legacyBudget}','${f.system}','BI-S27-FR-UNALLOC','Unallocated','other',0,'P4','new','planned',true,'${f.head}','${f.head}');
    insert into finance.purchases(id,season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind)
      values('${f.purchase}','${f.season}','${f.departmentLead}','2026-0100','registered','Synthetic buyer','Synthetic supplier','team_account','2026-11-19','Steel for the frame','invoice');
    insert into finance.purchase_lines(id,purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
      values('${f.line}','${f.purchase}','2026-0100-L1','${f.system}','${f.entry}','Steel',1,120000);
    insert into finance.allocations(id,line_id,budget_item_id,public_ref,amount_ore) values('${f.allocation}','${f.line}','${f.entry}','2026-0100-L1-A1',120000);
    insert into finance.purchase_lines(id,purchase_id,public_ref,system_id,budget_item_id,unbudgeted,description,quantity,amount_ore)
      values('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${f.purchase}','2026-0100-L2','${f.system}',null,true,'Unbudgeted material',1,30000);
    insert into finance.allocations(id,line_id,budget_item_id,public_ref,amount_ore)
      values('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${f.unallocatedEntry}','2026-0100-L2-A1',30000);
    insert into finance.documents(id,purchase_id,public_ref,kind,original_name,content_type,byte_size,content_sha256,storage_key)
      values('${f.document}','${f.purchase}','2026-0100-D1','invoice','invoice.pdf','application/pdf',8,repeat('a',64),'legacy/private/invoice.pdf');
    insert into finance.requests(id,season_id,requester_member_id,public_ref,status) values('${f.request}','${f.season}','${f.departmentLead}','RQ-S27-001','draft');
    insert into finance.purchases(id,season_id,requester_member_id,import_source,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind)
      values('${f.importedPurchase}','${f.season}',null,'synthetic-historical-export','2026-0101','registered','Historical buyer','Historical supplier','invoice','2026-09-01','Historical cable purchase','invoice');
    insert into finance.purchase_lines(id,purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore)
      values('${f.importedLine}','${f.importedPurchase}','2026-0101-L1','${f.electronicSystem}','${f.electronicEntry}','Cable',1,50000);
    insert into finance.allocations(id,line_id,budget_item_id,public_ref,amount_ore) values('${f.importedAllocation}','${f.importedLine}','${f.electronicEntry}','2026-0101-L1-A1',50000);
    insert into finance.invoice_obligations(id,purchase_id,due_date,paid,historical_payment) values('${f.importedInvoice}','${f.importedPurchase}','2026-09-15',true,true);
  `);
}

export const projectBudgetMigrationFiles = [
  "066_project_budget_foundation.sql",
  "067_finance_retire_purchase_threshold.sql",
  "068_project_budget_approval.sql",
  "069_project_budget_revisions.sql",
  "070_project_budget_purchases.sql",
  "071_drive_invoice_transfers.sql",
  "072_funding_application_obligations.sql",
  "073_finance_registered_allocation_facts.sql",
  "074_department_budget_packages.sql",
] as const;

export async function applyProjectBudgetMigrations(db: ProjectBudgetTestDatabase) {
  for (const file of projectBudgetMigrationFiles) await db.exec(read(file));
  return [...projectBudgetMigrationFiles];
}

/** Genuine revision-2 approval helpers. No direct SQL approval or test-only service bypass. */
export async function submitProjectBudgetDepartmentPackage(services:import("../../../api/_lib/finance-service.js").FinanceServices,budget:import("../../../src/features/Finance/project-budget-types.js").ProjectBudgetDetail,role:ProjectBudgetFixtureRole="departmentLead") {
 const preview=await services.departmentBudgetPreview(role,budget.responsibleDepartmentId);
 const sent=await services.mutate(role,{action:"sendDepartmentBudgetPackage",requestId:crypto.randomUUID(),departmentId:budget.responsibleDepartmentId,previewToken:preview.previewToken});
 return {packageId:sent.id!,budget:await services.projectBudget("lead",budget.id)};
}
export async function approveProjectBudgetDepartmentPackage(services:import("../../../api/_lib/finance-service.js").FinanceServices,budget:import("../../../src/features/Finance/project-budget-types.js").ProjectBudgetDetail) {
 const queue=await services.departmentBudgetPackages("head",budget.responsibleDepartmentId);
 const packet=queue.packages.find(packet=>packet.status==="finance_pending"&&packet.snapshot.projects.some(project=>project.projectBudgetId===budget.id&&project.included));
 if(!packet)throw new Error("Send this project's exact submitted version through its department package first.");
 await services.mutate("head",{action:"approveDepartmentBudgetPackage",requestId:crypto.randomUUID(),packageId:packet.id,expectedRevision:packet.revision});
 return services.projectBudget("lead",budget.id);
}
