import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createProjectServices } from "../../../api/_lib/project-management-service.js";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import { applyFundingMutation } from "../../../api/_lib/finance-funding.js";
import { loadSeasonMoneyFlow } from "../../../api/_lib/season-money-flow.js";
import { parseInvoiceProgress } from "../../../api/_lib/partner-invoice-validation.js";
const id=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people=['manager','finance','marketing','outsider'].map((name,i)=>({userId:id(i+1),googleSub:name,email:`${name}@helixnmbu.no`,name}));
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),'utf8');
let db:PGlite;
const auth=(n:number)=>async()=>people[n];
const dealService=(n:number)=>createDealServices({db,authenticate:auth(n)});
const projectService=(n:number)=>createProjectServices({db,authenticate:auth(n)});
const confirm=(n:number,deal:number)=>dealService(n).confirmWon('test',id(deal),0,true);
async function setupDeal(number:number,orgName:string,seasons:number[]){
 await db.query('insert into partner.organizations(id,name,active) values($1,$2,false)',[id(number),orgName]);
 await db.query("insert into partner_deals.deals(id,organization_id,title,stage,negotiation_notes,created_by_member_id,updated_by_member_id) values($1,$2,'Agreement','proposal','Private negotiation',$3,$3)",[id(number+1),id(number),id(1)]);
 for(const season of seasons) await db.query("insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date) values($1,$2,'cash',10000,'2026-11-01')",[id(number+1),id(season)]);
 await db.query("insert into partner_deals.deliverables(deal_id,title,owner_member_id) values($1,'Publish logo',$2)",[id(number+1),id(3)]);
}
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
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','046_partner_agreement_changes','047_partner_invoice_history','048_partner_review_notifications','049_partner_added_items','050_partner_change_reconciliation','051_won_finance_recovery','052_partner_manual_history','053_partner_manual_review','054_partner_manual_finance_review','055_partner_manual_review_gate','078_partner_invoice_progress']) await db.exec(read(n));
 await db.exec("alter table partner_deals.deals add column if not exists primary_season_id uuid");
 await db.exec(`insert into partner_deals.member_grants values('${id(2)}','finance',true),('${id(3)}','marketing',true);
 insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('${id(20)}','S27','S27','2026-08-01','2027-07-31','active','${id(1)}','${id(1)}'),('${id(21)}','S28','S28','2027-08-01','2028-07-31','planning','${id(1)}','${id(1)}');
 insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season','${id(1)}');`);
},60000);
afterAll(async()=>db.close());

async function invoice(number:number) {
 await setupDeal(number,`Invoice partner ${number}`,[20]);
 await confirm(0,number+1);
 return (await db.query<{task_id:string}>("select task_id from partner_deals.task_links where deal_id=$1 and kind='invoice'",[id(number+1)])).rows[0].task_id;
}
async function record(taskId:string,sentDate:string|null,receivedDate:string|null,actor=1) {
 const progress=await dealService(actor).invoiceProgress('test',taskId);
 if(!progress)throw new Error('Invoice not found');
 return dealService(actor).saveInvoiceProgress('test',{taskId,expectedRevision:progress.revision,fundingRevision:progress.fundingRevision,sentDate,receivedDate});
}
async function complete(taskId:string,action='set_status') {
 const task=(await projectService(1).load('test')).tasks.find(task=>task.id===taskId)!;
 return projectService(1).mutate('test', action==='save_task'?{action,id:taskId,expectedRevision:task.revision,task:{...task,status:'done'}}:
 action==='estimate_history'?{action,id:taskId,expectedRevision:task.revision,createdDate:'2026-10-01',completedDate:'2026-11-01',basis:'Imported history'}:
 {action,id:taskId,expectedRevision:task.revision,status:'done',blockedReason:''});
}
it('blocks every completion path until sending and full payment are recorded',async()=>{
 const taskId=await invoice(300);
 expect(await dealService(1).invoiceProgress('test',taskId)).toMatchObject({sentDate:null,receivedDate:null,canRecordSent:true,canRecordPayment:false});
 for(const action of ['set_status','save_task','estimate_history'])await expect(complete(taskId,action)).rejects.toMatchObject({status:409});
 await record(taskId,'2026-11-01',null);
 await expect(complete(taskId)).rejects.toMatchObject({status:409});
 await expect(record(taskId,'2026-11-01','2026-11-02')).rejects.toMatchObject({status:403});
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials')",[id(2)]);
 const previousFlow=await loadSeasonMoneyFlow(db,'S27');
 await record(taskId,'2026-11-01','2026-11-02');
 expect(await dealService(1).invoiceProgress('test',taskId)).toMatchObject({sentDate:'2026-11-01',receivedDate:'2026-11-02',canRecordPayment:true});
 const next=await complete(taskId);
 expect(next.tasks.find(task=>task.id===taskId)?.status).toBe('done');
 const flow=await loadSeasonMoneyFlow(db,'S27');
 if(flow.status!=='available'||previousFlow.status!=='available')throw new Error('Expected available money flow');
 expect(Number(flow.moneyInNok)-Number(previousFlow.moneyInNok)).toBe(100);
 expect((await db.query("select * from partner_deals.audit where action='invoice_progress'")).rows).toHaveLength(2);
 await expect(record(taskId,null,'2026-11-02')).rejects.toMatchObject({status:409});
 await expect(record(taskId,'2026-11-01',null)).rejects.toMatchObject({status:409});
 const funding=(await db.query<{id:string;revision:number}>("select f.id,f.revision from finance.funding f join partner_deals.funding_links fl on fl.funding_id=f.id join partner_deals.task_links l on l.contribution_id=fl.contribution_id where l.task_id=$1",[taskId])).rows[0];
 await expect(applyFundingMutation(db,id(2),{action:'editFunding',requestId:id(901),fundingId:funding.id,expectedRevision:funding.revision,patch:{status:'secured',receivedDate:null}},false)).rejects.toMatchObject({status:409});
});
it('requires sending even when payment was recorded first and rejects stale edits',async()=>{
 const taskId=await invoice(310);
 const initial=await dealService(1).invoiceProgress('test',taskId);
 await record(taskId,null,'2026-11-03');
 await expect(complete(taskId)).rejects.toMatchObject({status:409});
 await expect(dealService(1).saveInvoiceProgress('test',{taskId,expectedRevision:initial!.revision,fundingRevision:initial!.fundingRevision,sentDate:'2026-11-01',receivedDate:null})).rejects.toMatchObject({status:409});
 await record(taskId,'2026-11-01','2026-11-03');
 await complete(taskId);
});
it('denies unrelated members and revoked Finance payment rights without leaking progress',async()=>{
 const taskId=await invoice(320);
 expect(await dealService(3).invoiceProgress('test',taskId)).toBeNull();
 await expect(dealService(3).saveInvoiceProgress('test',{taskId,expectedRevision:0,fundingRevision:0,sentDate:'2026-11-01',receivedDate:null})).rejects.toMatchObject({status:403});
 await db.query("delete from identity.member_roles where member_id=$1 and role_key='financials'",[id(2)]);
 await expect(record(taskId,'2026-11-01','2026-11-02')).rejects.toMatchObject({status:403});
 expect(await dealService(1).invoiceProgress('test',taskId)).toMatchObject({revision:0,sentDate:null,receivedDate:null});
});
it('rejects changed funding and closed seasons without partially saving invoice progress',async()=>{
 const taskId=await invoice(330);
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials')",[id(2)]);
 const initial=await dealService(1).invoiceProgress('test',taskId);
 await db.query("update finance.funding f set revision=f.revision+1 from partner_deals.funding_links fl join partner_deals.task_links l on l.contribution_id=fl.contribution_id where f.id=fl.funding_id and l.task_id=$1",[taskId]);
 await expect(dealService(1).saveInvoiceProgress('test',{taskId,expectedRevision:initial!.revision,fundingRevision:initial!.fundingRevision,sentDate:'2026-11-01',receivedDate:'2026-11-02'})).rejects.toMatchObject({status:409});
 expect(await dealService(1).invoiceProgress('test',taskId)).toMatchObject({revision:0,sentDate:null,receivedDate:null});
 await db.query("update finance.seasons set status='closed' where id=$1",[id(20)]);
 expect(await dealService(1).invoiceProgress('test',taskId)).toMatchObject({canRecordSent:false,canRecordPayment:false});
 await expect(record(taskId,'2026-11-01','2026-11-02')).rejects.toMatchObject({status:403});
 await db.query("update finance.seasons set status='active' where id=$1",[id(20)]);
});
it('rejects impossible or future dates and requires explicit revisions',()=>{
 const input={taskId:id(1),expectedRevision:0,fundingRevision:0,sentDate:'2026-11-01',receivedDate:null};
 expect(parseInvoiceProgress(input)).toEqual(input);
 for(const patch of [{sentDate:'2026-02-30'},{sentDate:'2100-01-01'},{receivedDate:''},{expectedRevision:-1},{fundingRevision:undefined},{taskId:'bad'}])expect(()=>parseInvoiceProgress({...input,...patch})).toThrow();
});
