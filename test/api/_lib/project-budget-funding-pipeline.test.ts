import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { applyProjectBudgetMigrations } from "./project-budget-test-db.js";
const id=(n:number)=>`8a000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people=['manager','head','marketing','administrator'].map((name,i)=>({userId:id(i+1),googleSub:name,email:`${name}@helixnmbu.no`,name}));
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),'utf8');
let db:PGlite;
const dealService=(n:number)=>createDealServices({db,authenticate:async()=>people[n]});
const financeService=(n:number)=>createFinanceServices({db,authenticate:async()=>people[n]});
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now()); create role anon; create role authenticated; create role anonymous;');
 for(const n of ["001_member_cv","002_member_helix_role","009_platform_access_and_managed_positions","009_project_management","010_department_lead_tasks","011_task_assignees","012_project_milestones","013_project_hierarchy","014_milestone_field_updates","015_project_departments","016_fixed_departments","017_workspace_directory","020_project_start_dates","021_project_creation_milestones","018_department_homes","019_department_settings_permissions","025_workspace_space_access","026_department_access_levels","032_estimated_task_history","033_project_status","022_task_backlog_status"]) await db.exec(read(n));
 await db.exec(`create schema partner; create table partner.organizations(id uuid primary key default gen_random_uuid(),name text,active boolean);`);
 for(const p of people){
  await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)',[p.userId,p.name,p.email]);
  await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',[p.googleSub,p.userId]);
  await db.query('insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)',[p.userId,p.googleSub,p.email,p.name]);
 }
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')",[id(1)]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Finance'",[id(2)]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'member' from project_management.departments where name='Business & Marketing'",[id(3)]);
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','046_partner_agreement_changes','047_partner_invoice_history','048_partner_review_notifications','049_partner_added_items','050_partner_change_reconciliation','051_won_finance_recovery','052_partner_manual_history','053_partner_manual_review','054_partner_manual_finance_review','055_partner_manual_review_gate','056_partner_deal_sponsor_level','058_partner_deal_space_access','059_imported_partner_deals','060_imported_partner_finance_review']) await db.exec(read(n));
 await db.exec("alter table partner_deals.deals add column if not exists primary_season_id uuid");
 await db.exec(`insert into partner_deals.member_grants values('${id(2)}','finance',true),('${id(3)}','marketing',true);
 insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('${id(20)}','S27','S27','2026-08-01','2027-07-31','active','${id(1)}','${id(1)}'),('${id(21)}','S28','S28','2027-08-01','2028-07-31','planning','${id(1)}','${id(1)}');
 insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season','${id(1)}');`);
 for(const file of ['014_finance_register_purchases','015_finance_requests','016_finance_fulfillment','017_finance_notifications_exports','018_finance_unpaid_voids_reviews','019_finance_budget_import','020_finance_processing_guards','021_finance_final_candidate_ledger','065_finance_historical_purchases']) await db.exec(read(file));
 await applyProjectBudgetMigrations(db);
 await db.exec(`insert into identity.member_roles(member_id,role_key) values('${id(2)}','financials'),('${id(4)}','platform_administrator');
 insert into finance.member_grants(member_id,profile,active,operator_member_id,reason) values('${id(2)}','head_of_finance',true,'${id(1)}','Synthetic explicit Head of Finance grant');
 insert into partner_deals.space_access values('${id(3)}',true,true) on conflict(member_id) do update set pipeline=true,agreements=true;
 insert into partner_deals.space_access values('${id(2)}',false,false) on conflict(member_id) do update set pipeline=false,agreements=false;
 insert into project_management.department_members(department_id,member_id,access_level) select id,'${id(3)}','lead' from project_management.departments where name='Mechanical & Production' and season='S27';
 insert into project_management.projects(id,season,name,description,category,departments,deadline,lead_ids) values('${id(90)}','S27','Grant budget project','Budgeted research work','production',array['Mechanical & Production'],'2027-06-01',array['${id(1)}'::uuid]);
 insert into finance.systems(id,department_key,code,name) select '${id(91)}',department_key,'SYS-GRANT','Grant material' from identity.departments where name='Mechanical & Production';`);
},60000);
afterAll(async()=>db.close());

it("keeps real Won effects separate from awards and gives HOF no pipeline or organization access", async () => {
 const marketing=dealService(2), headDeals=dealService(1), head=financeService(1), lead=financeService(0);
 await expect(headDeals.load('test','pipeline')).rejects.toMatchObject({status:403});
 await expect(headDeals.load('test','shared')).rejects.toMatchObject({status:403});
 const organizationId=id(30), dealId=id(31), unrelated=id(32);
 await db.exec(`insert into partner.organizations(id,name,active) values('${organizationId}','Private organization',false);
 insert into partner_deals.deals(id,organization_id,title,stage,negotiation_notes,created_by_member_id,updated_by_member_id) values
 ('${dealId}','${organizationId}','Research application','proposal','Private negotiation and contacts','${id(3)}','${id(3)}'),
 ('${unrelated}','${organizationId}','Unrelated negotiation','proposal','More private notes','${id(3)}','${id(3)}');
 insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date) values('${dealId}','${id(20)}','cash',10000,'2026-12-01');`);
 const classified=await marketing.saveFundingApplication('test',{action:'saveFundingApplication',requestId:randomUUID(),dealId,dealExpectedRevision:0,expectedRevision:0,seasonId:id(20),purchaseConditions:'Purchase the research material'});
 const department=(await db.query<{id:string}>("select id from project_management.departments where name='Mechanical & Production' and season='S27'")).rows[0].id;
 let saved=await lead.mutate('test',{action:'createProjectBudget',requestId:randomUUID(),projectId:id(90),responsibleDepartmentId:department});
 for(const [actor,action,fields] of [[0,'saveProjectBudgetEntry',{entry:{systemId:id(91),description:'Research material',category:'material',plannedNok:'1000',ordinaryPriority:'P2',reuseStatus:'new',status:'planned'}}],[0,'submitProjectBudget',{}],[2,'approveDepartmentBudget',{}],[1,'approveProjectBudget',{}]] as const) saved=await financeService(actor).mutate('test',{action,requestId:randomUUID(),projectBudgetId:saved.id,expectedRevision:saved.revision,...fields});
 let budget=await head.projectBudget('test',saved.id!); let app=await head.fundingApplication('test',classified.id); const entryId=budget.approvedVersion!.entries[0].entryId;
 await head.mutate('test',{action:'linkFundingApplicationEntry',requestId:randomUUID(),applicationId:app.id,expectedRevision:app.revision,entryId,expectedBudgetRevision:budget.revision});
 await marketing.confirmWon('test',dealId,0,true);
 const before=(await db.query<{status:string;received_date:null}>("select status,received_date from finance.funding")).rows;
 expect(before).toEqual([{status:'secured',received_date:null}]);
 const tasks=(await db.query("select id from project_management.tasks")).rows; expect(tasks.length).toBeGreaterThan(0);
 expect((await db.query<{priority:string}>("select priority from finance.effective_budget_entries where id=$1::uuid",[entryId])).rows).toEqual([{priority:'P2'}]);
 app=await head.fundingApplication('test',app.id); expect(app.award).toBeNull();
 await head.mutate('test',{action:'recordFundingAward',requestId:randomUUID(),applicationId:app.id,expectedRevision:app.revision,awardDate:'2026-11-19',awardReference:'Research award letter'});
 expect((await db.query("select status,received_date from finance.funding")).rows).toEqual(before);
 expect((await db.query("select id from project_management.tasks")).rows).toEqual(tasks);
 expect((await db.query("select priority from finance.effective_budget_entries where id=$1::uuid",[entryId])).rows).toEqual([{priority:'P0'}]);
 const queue=await head.fundingApplications('test'); expect(queue.applications.map(app=>app.title)).toEqual(['Research application']);
 const limited=JSON.stringify(await head.fundingApplication('test',classified.id)); for(const hidden of ['Private organization','Private negotiation','Unrelated negotiation','organizationId','negotiationNotes','contactEmail']) expect(limited).not.toContain(hidden);
 await expect(head.fundingApplication('test',unrelated)).rejects.toMatchObject({status:404});
 await expect(financeService(3).fundingApplications('test')).rejects.toMatchObject({status:403});
 await expect(headDeals.save('test',{organizationId,title:'Forbidden pipeline mutation',stage:'proposal',contributions:[],deliverables:[]})).rejects.toMatchObject({status:403});
 budget=await head.projectBudget('test',budget.id); expect(budget.approvedTotalNok).toBe('1000.00');
});
