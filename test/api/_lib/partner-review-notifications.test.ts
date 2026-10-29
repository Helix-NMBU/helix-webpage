import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createProjectServices } from "../../../api/_lib/project-management-service.js";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
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
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','040_partner_stable_draft_items','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','048_partner_review_notifications']) await db.exec(read(n));
 await db.exec(`insert into partner_deals.member_grants values('${id(2)}','finance',true),('${id(3)}','marketing',true);
 insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('${id(20)}','S27','S27','2026-08-01','2027-07-31','active','${id(1)}','${id(1)}'),('${id(21)}','S28','S28','2027-08-01','2028-07-31','planning','${id(1)}','${id(1)}');
 insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season','${id(1)}');`);
},60000);
afterAll(async()=>db.close());
it('delivers one private request notification to each authorized Finance member and records reads separately',async()=>{
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials'),($2,'financials')",[id(2),id(4)]);
 await setupDeal(180,'NotificationCo',[20]);
 await db.query("insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-980','NotificationCo','Owner','sponsor_cash',10000,'secured',$2,$2)",[id(20),id(1)]);
 await dealService(0).requestFinanceReview('test',id(181),0);
 await dealService(0).requestFinanceReview('test',id(181),0);
 expect((await db.query("select * from partner_deals.review_notification_events where kind='requested'")).rows).toHaveLength(1);
 const first=await dealService(1).reviewNotifications('test') as {id:string;href:string}[];
 expect(first).toHaveLength(1);expect(first[0].href).toBe('/finance/sponsor-reviews');
 expect(JSON.stringify(first)).not.toContain('NotificationCo');expect(JSON.stringify(first)).not.toContain('Private negotiation');
 expect(await dealService(2).reviewNotifications('test')).toEqual([]);
 await dealService(2).markReviewNotificationsRead('test',[first[0].id]);
 expect(await dealService(3).reviewNotifications('test')).toHaveLength(1);
 await dealService(1).markReviewNotificationsRead('test',[first[0].id]);
 await dealService(1).markReviewNotificationsRead('test',[first[0].id]);
 expect(await dealService(1).reviewNotifications('test')).toEqual([]);
 expect(await dealService(3).reviewNotifications('test')).toHaveLength(1);
 expect((await db.query('select * from partner_deals.review_notification_reads')).rows).toHaveLength(1);
});
it('notifies only the still-authorized requester once after Finance resolves and persists read state',async()=>{
 const queue=await dealService(1).financeReviewQueue('test') as {id:string;candidates:{id:string;revision:number}[]}[];
 const candidate=queue[0].candidates[0];
 await dealService(1).resolveFinanceReview('test',queue[0].id,'link',candidate.id,candidate.revision,null,true);
 await dealService(1).resolveFinanceReview('test',queue[0].id,'link',candidate.id,candidate.revision,null,true);
 expect((await db.query("select * from partner_deals.review_notification_events where kind='resolved'")).rows).toHaveLength(1);
 expect(await dealService(3).reviewNotifications('test')).toEqual([]);
 await db.query("insert into partner_deals.member_grants values($1,'business',true)",[id(3)]);
 expect(await dealService(2).reviewNotifications('test')).toHaveLength(1);
 const business=await dealService(0).reviewNotifications('test') as {id:string;href:string}[];
 expect(business).toHaveLength(1);expect(business[0].href).toBe('/sponsor-pipeline');
 await db.query("delete from identity.member_roles where member_id=$1 and role_key='project_manager'",[id(1)]);
 expect(await dealService(0).reviewNotifications('test')).toEqual([]);
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')",[id(1)]);
 expect(await dealService(0).reviewNotifications('test')).toHaveLength(1);
 await dealService(0).markReviewNotificationsRead('test',[business[0].id]);
 expect(await dealService(0).reviewNotifications('test')).toEqual([]);
 expect(await dealService(2).reviewNotifications('test')).toHaveLength(1);
 await dealService(2).markReviewNotificationsRead('test',[business[0].id]);
});
it('does not return an event when Finance access is revoked between reads',async()=>{
 await setupDeal(190,'RevokedCo',[20]);
 await db.query("insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-981','RevokedCo','Owner','sponsor_cash',10000,'secured',$2,$2)",[id(20),id(1)]);
 await dealService(0).requestFinanceReview('test',id(191),0);
 let revoked=false;
 const revoking={query:async<T>(sql:string,params?:unknown[])=>{const rows=(await db.query<T>(sql,params)).rows;if(!revoked&&sql.includes('review_notifications(')){revoked=true;await db.query("delete from identity.member_roles where member_id=$1 and role_key='financials'",[id(2)]);}return {rows};}};
 const service=createDealServices({db:revoking,authenticate:auth(1)});
 expect(await service.reviewNotifications('test')).toEqual([]);expect(revoked).toBe(true);
});
it('suppresses a stale completion when the linked funding changes later',async()=>{
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials')",[id(2)]);
 await setupDeal(200,'LaterChangeCo',[20]);
 await db.query("insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-982','LaterChangeCo','Owner','sponsor_cash',10000,'secured',$2,$2)",[id(20),id(1)]);
 await dealService(0).requestFinanceReview('test',id(201),0);
 const queue=await dealService(1).financeReviewQueue('test') as {id:string;partner:string;candidates:{id:string;revision:number}[]}[];
 const review=queue.find(r=>r.partner==='LaterChangeCo')!;const candidate=review.candidates[0];
 await dealService(1).resolveFinanceReview('test',review.id,'link',candidate.id,candidate.revision,null,true);
 expect(await dealService(0).reviewNotifications('test')).toHaveLength(1);
 await db.query('update finance.funding set amount_ore=20000,revision=revision+1 where id=$1',[candidate.id]);
 expect(await dealService(0).reviewNotifications('test')).toEqual([]);
});
