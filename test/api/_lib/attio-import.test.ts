import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
const id=(n:number)=>`90000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),"utf8");
const statement=readFileSync(new URL("../../../scripts/import-attio-s27.sql",import.meta.url),"utf8");
let db:PGlite;
const snapshot=[
 {id:"attio-won",title:"S27 A",season:"S27",stage:"Won 🎉",company:"A",owner_email:"linus.hanevik@helixnmbu.no",cash_ore:"2500000",inkind_ore:"0",certainty:"Closed",notes:"Source note",types:"Cash"},
 {id:"attio-goods",title:"S27 B",season:"S27",stage:"Won 🎉",company:"B",owner_email:"admin@helixnmbu.no",cash_ore:"0",inkind_ore:"600000",types:"Materials / Products"},
 {id:"attio-draft",title:"S27 C",season:"S27",stage:"On Hold",company:"C",owner_email:"admin@helixnmbu.no",cash_ore:"2000000",inkind_ore:null,types:"Cash"},
];
async function runImport(rows=snapshot) {
 await db.exec("begin");
 try { await db.query("select set_config('helix.attio_import_payload',$1,true), set_config('helix.attio_import_actor',$2,true)",[JSON.stringify(rows),"admin@helixnmbu.no"]); await db.exec(statement); await db.exec("commit"); }
 catch (error) { await db.exec("rollback"); throw error; }
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('create schema neon_auth; create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean); create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now()); create role anon; create role authenticated; create role anonymous;');
 for(const n of ["001_member_cv","002_member_helix_role","009_platform_access_and_managed_positions","009_project_management","010_department_lead_tasks","011_task_assignees","012_project_milestones","013_project_hierarchy","014_milestone_field_updates","015_project_departments","016_fixed_departments","017_workspace_directory","018_department_homes","019_department_settings_permissions","020_project_start_dates","021_project_creation_milestones","022_task_backlog_status","023_project_requires_lead","025_workspace_space_access","026_department_access_levels","029_pending_members_multiple_leads","032_estimated_task_history","033_project_status"]) await db.exec(read(n));
 await db.exec("create schema partner; create table partner.organizations(id uuid primary key default gen_random_uuid(),name text not null,active boolean not null default false);");
 await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)',[id(1),'Admin','admin@helixnmbu.no']);
 await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',['admin',id(1)]);
 await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,'admin','admin@helixnmbu.no','Admin')",[id(1)]);
 await db.query("insert into identity.members(id,auth_user_id,google_sub,verified_at,email,full_name) values($1,null,null,null,'oskar.gabrielsen@helixnmbu.no','Oskar'),($2,null,null,null,'aslan.yelli@helixnmbu.no','Aslan')",[id(2),id(3)]);
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'platform_administrator'),($1,'project_manager')",[id(1)]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Finance'",[id(2)]);
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Business & Marketing'",[id(3)]);
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','040_partner_stable_draft_items','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','046_partner_agreement_changes','047_partner_invoice_history','048_partner_review_notifications','049_partner_added_items','050_partner_change_reconciliation','051_won_finance_recovery','052_partner_manual_history','053_partner_manual_review','054_partner_manual_finance_review','055_partner_manual_review_gate','056_partner_deal_sponsor_level','057_optional_manager_department_membership','058_partner_deal_space_access','059_imported_partner_deals','060_imported_partner_finance_review']) await db.exec(read(n));
 await db.query("insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values($1,'S27','S27','2026-08-01','2027-07-31','planning',$2,$2)",[id(10),id(1)]);
 await db.query("insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Current season',$1)",[id(1)]);
},60000);
afterAll(async()=>db?.close());
it("imports once with traceable sources, pending ownership and review rather than invoices",async()=>{
 await runImport(); await runImport();
 expect((await db.query("select * from partner_deals.import_sources")).rows).toHaveLength(3);
 expect((await db.query("select * from partner_deals.deals where stage='won'")).rows).toHaveLength(2);
 expect((await db.query("select * from identity.members where email='linus.hanevik@helixnmbu.no' and auth_user_id is null and verified_at is null")).rows).toHaveLength(1);
 const c=(await db.query<{invoice_date:string|null;amount_ore:string}>("select invoice_date,amount_ore::text from partner_deals.contributions c join partner_deals.import_sources i on i.deal_id=c.deal_id where i.external_id='attio-won' and c.kind='cash'")).rows[0];
 expect(c).toMatchObject({invoice_date:null,amount_ore:'2500000'});
 expect((await db.query("select * from partner_deals.task_links where kind='finance_review'")).rows).toHaveLength(1);
 expect((await db.query("select * from finance.funding")).rows).toHaveLength(0);
 expect((await db.query<{result:{created:number;failed:number}}>("select partner_deals.materialize_invoices_on('2026-10-01') as result")).rows[0].result).toMatchObject({created:0,failed:0});
});
it("rolls back the whole snapshot on an unsupported stage",async()=>{
 const broken=[{...snapshot[0],id:"new-valid",title:"Different agreement"},{...snapshot[1],id:"new-invalid",title:"Another agreement",stage:"Unexpected"}];
 await expect(runImport(broken)).rejects.toThrow(/attio_import_unmapped_stage/);
 expect((await db.query("select * from partner_deals.import_sources")).rows).toHaveLength(3);
});

it("refuses a possible duplicate rather than creating a second deal",async()=>{
 await expect(runImport([{...snapshot[0],id:"different-source-id"}])).rejects.toThrow(/attio_import_possible_duplicate/);
 expect((await db.query("select * from partner_deals.import_sources")).rows).toHaveLength(3);
});
it.skipIf(!process.env.ATTIO_IMPORT_SNAPSHOT)("validates the complete real source snapshot locally",async()=>{
 const input=JSON.parse(readFileSync(process.env.ATTIO_IMPORT_SNAPSHOT!,"utf8")) as (typeof snapshot[number] & {task_history?:{assignee_emails:string[]}[]})[];
 const mapped=input.map(row=>({...row,import_open_tasks:true,owner_email:row.owner_email==='henrik.engdal@helixnmbu.no'?'admin@helixnmbu.no':row.owner_email,task_history:row.task_history?.map(task=>({...task,assignee_emails:task.assignee_emails.map(email=>email==='henrik.engdal@helixnmbu.no'?'admin@helixnmbu.no':email)}))}));
 await runImport(mapped);
 const imported=(await db.query<{count:number}>("select count(*)::integer as count from partner_deals.import_sources where external_id ~ '^[0-9a-f-]{36}$'")).rows[0].count;
 expect(imported).toBe(25);
 expect((await db.query("select * from partner_deals.import_sources i join partner_deals.deals d on d.id=i.deal_id where i.external_id ~ '^[0-9a-f-]{36}$' and d.primary_season_id=$1",[id(10)])).rows).toHaveLength(25);
 expect((await db.query("select * from partner_deals.task_links where kind='finance_review'")).rows).toHaveLength(5);
 expect((await db.query("select * from partner_deals.task_links where kind='follow_up'")).rows).toHaveLength(4);
 expect((await db.query("select * from finance.funding")).rows).toHaveLength(0);
 const totals=(await db.query<{cash:string;inkind:string}>("select coalesce(sum(c.amount_ore) filter(where c.kind='cash'),0)::text as cash,coalesce(sum(c.amount_ore) filter(where c.kind<>'cash'),0)::text as inkind from partner_deals.contributions c join partner_deals.import_sources i on i.deal_id=c.deal_id where i.external_id ~ '^[0-9a-f-]{36}$' ")).rows[0];
 expect(totals.cash).toBe(input.reduce((sum,row)=>sum+BigInt(row.cash_ore??0),0n).toString());
 expect(totals.inkind).toBe(input.reduce((sum,row)=>sum+BigInt(row.inkind_ore??0),0n).toString());
 expect((await db.query("select * from partner_deals.import_sources i join partner_deals.deals d on d.id=i.deal_id where i.external_id ~ '^[0-9a-f-]{36}$' and i.source_data->>'stage'='Won 🎉' and d.stage='won'")).rows).toHaveLength(6);
});
