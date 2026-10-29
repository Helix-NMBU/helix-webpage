import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createProjectServices } from "../../../api/_lib/project-management-service.js";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";
const id=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people=["manager","finance","marketing"].map((name,i)=>({userId:id(i+1),googleSub:name,email:`${name}@helixnmbu.no`,name}));
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),'utf8');
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());');
 for(const n of ["001_member_cv","002_member_helix_role","009_platform_access_and_managed_positions","009_project_management","010_department_lead_tasks","011_task_assignees","012_project_milestones","013_project_hierarchy","014_milestone_field_updates","015_project_departments","016_fixed_departments","017_workspace_directory","020_project_start_dates","021_project_creation_milestones","018_department_homes","019_department_settings_permissions","025_workspace_space_access","026_department_access_levels","032_estimated_task_history","033_project_status","022_task_backlog_status"]) await db.exec(read(n));
 await db.exec(`create schema partner; create table partner.organizations(id uuid primary key,name text,active boolean); create schema finance; create table finance.seasons(id uuid primary key,code text,name text,start_date date,end_date date,status text); create table finance.settings(setting_key text,setting_value jsonb);`);
 for(const p of people){
  await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)',[p.userId,p.name,p.email]);
  await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',[p.googleSub,p.userId]);
  await db.query('insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)',[p.userId,p.googleSub,p.email,p.name]);
 }
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')",[people[0].userId]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Finance'",[people[1].userId]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'member' from project_management.departments where name='Business & Marketing'",[people[2].userId]);
 await db.exec(`insert into partner.organizations values('${id(10)}','Acme',false); insert into finance.seasons values('${id(11)}','S27','S27','2026-08-01','2027-07-31','active'); insert into finance.settings values('current_season','"S27"');`);
 await db.exec(read('035_partner_deals'));
 await db.exec('create function partner_deals.attach_won_funding(uuid,uuid) returns void language plpgsql as $$ begin return; end $$;');
 await db.exec(read('038_partner_won_handoff'));
 await db.exec(`insert into partner_deals.deals(id,organization_id,title,stage,created_by_member_id,updated_by_member_id) values('${id(12)}','${id(10)}','Agreement','proposal','${id(1)}','${id(1)}'); insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date) values('${id(12)}','${id(11)}','cash',10000,'2026-11-01'); insert into partner_deals.deliverables(deal_id,title,owner_member_id) values('${id(12)}','Publish logo','${id(3)}');`);
},60000);
afterAll(async()=>db.close());
it('creates tasks that the respective department members can see and update',async()=>{
 await db.query('select partner_deals.confirm_won($1,$2,$3,$4,0)',[id(1),'manager','manager@helixnmbu.no',id(12)]);
 const links=await db.query<{kind:string;task_id:string}>('select kind,task_id from partner_deals.task_links');
 const invoice=links.rows.find(x=>x.kind==='invoice')!.task_id, marketing=links.rows.find(x=>x.kind==='marketing')!.task_id;
 const finance=createProjectServices({db,authenticate:async()=>people[1]});
 const marketingService=createProjectServices({db,authenticate:async()=>people[2]});
 expect((await finance.load('test')).tasks.some(x=>x.id===invoice)).toBe(true);
 expect((await marketingService.load('test')).tasks.some(x=>x.id===marketing)).toBe(true);
 expect((await marketingService.load('test')).tasks.some(x=>x.id===invoice)).toBe(false);
 await finance.mutate('test',{action:'set_status',id:invoice,expectedRevision:1,status:'in_progress',blockedReason:''});
 await marketingService.mutate('test',{action:'set_status',id:marketing,expectedRevision:1,status:'done',blockedReason:''});
});

it('reveals the agreement link only while both task and shared-deal access remain valid',async()=>{
 const marketingTask=(await db.query<{task_id:string}>("select task_id from partner_deals.task_links where kind='marketing'")).rows[0].task_id;
 const queryDb: CvDatabase={query:async<T>(sql:string,params?:unknown[])=>({rows:(await db.query<T>(sql,params)).rows})};
 const service=createDealServices({db:queryDb,authenticate:async()=>people[2]});
 expect(await service.taskDeal('test',marketingTask)).toEqual({dealId:null});
 await db.query("insert into partner_deals.member_grants values($1,'marketing',true)",[id(3)]);
 expect(await service.taskDeal('test',marketingTask)).toEqual({dealId:id(12)});
 const financeTask=(await db.query<{task_id:string}>("select task_id from partner_deals.task_links where kind='invoice'")).rows[0].task_id;
 expect(await service.taskDeal('test',financeTask)).toEqual({dealId:null});
 let revoked=false;
 const revokingDb: CvDatabase={query:async<T>(sql:string,params?:unknown[])=>{
  const rows=(await db.query<T>(sql,params)).rows;
  if (!revoked && sql.includes('select d.id as "dealId"')) { revoked=true; await db.query("update partner_deals.member_grants set active=false where member_id=$1",[id(3)]); }
  return {rows};
 }};
 const revoking=createDealServices({db:revokingDb,authenticate:async()=>people[2]});
 expect(await revoking.taskDeal('test',marketingTask)).toEqual({dealId:null});
 expect(revoked).toBe(true);
});
