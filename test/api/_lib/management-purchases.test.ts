import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createManagementPurchaseServices } from "../../../api/_lib/management-purchases.js";
import { loadDepartmentSummaries, loadFundingScenarios } from "../../../api/_lib/finance-summary.js";
import { loadPurchaseRegister } from "../../../api/_lib/finance-register.js";
import { buildPurchaseExport } from "../../../api/_lib/finance-export.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";
const id=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people=['manager','finance','marketing','outsider'].map((name,i)=>({userId:id(i+1),googleSub:name,email:`${name}@helixnmbu.no`,name}));
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),'utf8');
let db:PGlite;
const auth=(n:number)=>async()=>people[n];



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
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','014_finance_register_purchases','015_finance_requests','016_finance_fulfillment','017_finance_notifications_exports','018_finance_unpaid_voids_reviews','019_finance_budget_import','020_finance_processing_guards','021_finance_final_candidate_ledger','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','046_partner_agreement_changes','047_partner_invoice_history','048_partner_review_notifications','049_partner_added_items','050_partner_change_reconciliation','051_won_finance_recovery','052_partner_manual_history','053_partner_manual_review','054_partner_manual_finance_review','055_partner_manual_review_gate','057_optional_manager_department_membership','065_finance_historical_purchases','066_project_budget_foundation','067_finance_retire_purchase_threshold','068_project_budget_approval','069_project_budget_revisions','070_project_budget_purchases','071_drive_invoice_transfers','072_funding_application_obligations','073_finance_registered_allocation_facts','074_department_budget_packages','075_partner_grants','076_purchase_invoice_links','077_correct_purchase_invoice_links','078_partner_invoice_progress','079_management_purchase_registration']) await db.exec(read(n));
 await db.exec("alter table partner_deals.deals add column if not exists primary_season_id uuid");
 await db.exec(`insert into partner_deals.member_grants values('${id(2)}','finance',true),('${id(3)}','marketing',true);
 insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('${id(20)}','S27','S27','2026-08-01','2027-07-31','active','${id(1)}','${id(1)}'),('${id(21)}','S28','S28','2027-08-01','2028-07-31','planning','${id(1)}','${id(1)}');
 insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season','${id(1)}');`);
},60000);
afterAll(async()=>db.close());


const storage=createMemoryFinanceStorage();
const service=(n:number)=>createManagementPurchaseServices({db,authenticate:auth(n),storage});
it('loads only for actual Management members',async()=>{
 await expect(service(0).load('test')).rejects.toMatchObject({status:403});
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'member' from project_management.departments where name='Management' on conflict(department_id,member_id) do update set access_level='member'",[id(1)]);
 expect(await service(0).load('test')).toMatchObject({projects:[],items:[],purchases:[]});
});
async function evidence(){
 const authorized=await service(0).mutate('test',{action:'managementAuthorizeUpload',requestId:crypto.randomUUID(),fileName:'receipt.pdf',contentType:'application/pdf',byteSize:8});
 await putMemoryPdf(storage,authorized.stagingKey!);
 await service(0).mutate('test',{action:'managementFinalizeUpload',requestId:crypto.randomUUID(),uploadId:authorized.id});
 return authorized.id!;
}
let savedLine='';
it('registers an incurred purchase without a project, approved budget or broad Finance role and replays once',async()=>{
 const purchase={buyerName:'Manager',supplierName:'Parts supplier',purchaseDate:'2026-11-01',justification:'Parts already purchased',paymentMethod:'team_account',documentKind:'receipt',lines:[{systemId:'',projectId:null,budgetItemId:null,unbudgeted:true,description:'Steel plates',quantity:'2',amountNok:'6000.01'}],uploadIds:[await evidence()]};
 const command={action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase};
 const result=await service(0).mutate('test',command);
 expect(result).toMatchObject({ok:true,publicRef:expect.any(String),warnings:[expect.objectContaining({message:expect.stringContaining('Unbudgeted actual cost')})]});
 expect(await service(0).mutate('test',command)).toEqual(result);
 expect((await db.query('select * from finance.purchases')).rows).toHaveLength(1);
 expect((await db.query('select * from finance.documents')).rows).toHaveLength(1);
 expect((await db.query('select * from finance.allocations')).rows).toHaveLength(0);
 expect((await db.query("select * from finance.exception_reviews where kind='missing_approval'")).rows).toHaveLength(0);
 const choices=await service(0).load('test');expect(choices.purchases).toMatchObject([{projectId:null,budgetItemId:null,amountNok:'6000.01'}]);savedLine=choices.purchases[0].id;
 expect(await loadDepartmentSummaries(db.query.bind(db),'S27',false)).toEqual(expect.arrayContaining([expect.objectContaining({departmentKey:'unassigned-purchases',actualNok:'6000.01'})]));
 expect((await loadFundingScenarios(db.query.bind(db),'S27',false)).every(scenario=>scenario.needNok==='6000.01')).toBe(true);
 const register=await loadPurchaseRegister(db.query.bind(db),'S27',false);
 expect(register.register[0].lines).toMatchObject([{description:'Steel plates',amountNok:'6000.01',allocationNok:'0.00',systemName:'Awaiting budget allocation'}]);
 expect(register.register[0].documents).toHaveLength(1);
 const exported=await buildPurchaseExport(db,'S27');
 expect(exported.csv).toContain('UNASSIGNED');expect(exported.csv).toContain('Steel plates');
 await expect(service(0).mutate('test',{...command,purchase:{...purchase,supplierName:'Other'}})).rejects.toMatchObject({status:409});
});
it('links the same expense to a led project later and rejects forged assignments',async()=>{
 await db.query("insert into project_management.projects(id,season,name,description,category,departments,lead_ids) values($1,'S27','Fabrication','','production',array['Mechanical & Production'],array[$2::uuid]),($3,'S27','Other project','','production',array['Mechanical & Production'],array[$4::uuid])",[id(400),id(1),id(401),id(2)]);
 await expect(service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:savedLine,projectId:id(401),budgetItemId:null,expectedRevision:0})).rejects.toMatchObject({status:403});
 await service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:savedLine,projectId:id(400),budgetItemId:null,expectedRevision:0});
 expect((await service(0).load('test')).purchases).toMatchObject([{id:savedLine,projectId:id(400),amountNok:'6000.01',revision:1}]);
 expect((await db.query('select * from finance.purchases')).rows).toHaveLength(1);
 expect((await db.query('select * from finance.documents')).rows).toHaveLength(1);
 const exported=await buildPurchaseExport(db,'S27');expect(exported.csv).toContain('Fabrication');
});
it('assigns explicit approved entries to projects and allocates a previously recorded expense only once',async()=>{
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials')",[id(2)]);
 await db.query("insert into finance.budgets(id,season_id,public_ref,status,approved_by_member_id,approved_on,created_by_member_id,updated_by_member_id) values($1,$2,'B-S27','approved',$3,'2026-11-01',$3,$3)",[id(410),id(20),id(2)]);
 await db.query("insert into finance.systems(id,department_key,code,name) select $1,department_key,'SYS-FAB','Fabrication' from identity.departments where project_management.canonical_department(name)='Mechanical & Production' limit 1",[id(411)]);
 await db.query("insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,created_by_member_id,updated_by_member_id) values($1,$2,$3,'BI-S27-001','Steel plates','material',500000,'P1','new','planned',$4,$4),($5,$2,$3,'BI-S27-002','Other project item','material',10000,'P1','new','planned',$4,$4)",[id(412),id(410),id(411),id(2),id(413)]);
 await db.query("insert into finance.project_budgets(id,season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) select $1,$2,$3,d.id,$4,$4 from project_management.departments d where d.name='Mechanical & Production' and d.season='S27'",[id(420),id(20),id(400),id(2)]);
 await db.query("insert into finance.project_budgets(id,season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) select $1,$2,$3,d.id,$4,$4 from project_management.departments d where d.name='Mechanical & Production' and d.season='S27'",[id(421),id(20),id(401),id(2)]);
 await db.query("insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values($1,$2,$1,$3),($4,$5,$4,$3)",[id(412),id(420),id(2),id(413),id(421)]);
 const choices=await service(0).load('test');expect(choices.items.map(item=>item.id)).toEqual([id(412)]);
 await expect(service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:savedLine,projectId:id(400),budgetItemId:id(413),expectedRevision:1})).rejects.toMatchObject({status:409});
 await service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:savedLine,projectId:id(400),budgetItemId:id(412),expectedRevision:1});
 expect((await db.query<{actual:string}>('select finance.item_registered_actual_ore($1::uuid)::text as actual',[id(412)])).rows[0].actual).toBe('600001');
 expect((await db.query('select * from finance.purchases')).rows).toHaveLength(1);expect((await db.query('select * from finance.allocations')).rows).toHaveLength(1);
 expect((await loadDepartmentSummaries(db.query.bind(db),'S27',false)).some(department=>department.departmentKey==='unassigned-purchases')).toBe(false);
 await expect(service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:savedLine,projectId:id(400),budgetItemId:id(412),expectedRevision:1})).rejects.toMatchObject({status:409});
 expect((await db.query("select * from finance.exception_reviews where kind='budget_overrun'")).rows).toHaveLength(1);
});
it('registers directly against an approved entry in a led project and rejects a forged entry',async()=>{
 const purchase={buyerName:'Manager',supplierName:'Parts supplier',purchaseDate:'2026-11-01',justification:'Additional project material',paymentMethod:'team_account',documentKind:'receipt',lines:[{systemId:'',projectId:id(400),budgetItemId:id(413),unbudgeted:false,description:'Fasteners',quantity:'1',amountNok:'100.00'}],uploadIds:[await evidence()]};
 await expect(service(0).mutate('test',{action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase})).rejects.toMatchObject({status:409});
 const result=await service(0).mutate('test',{action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase:{...purchase,lines:[{...purchase.lines[0],budgetItemId:id(412)}]}});
 expect(result).toMatchObject({ok:true,publicRef:expect.any(String)});
 expect((await db.query('select * from finance.purchases')).rows).toHaveLength(2);
 expect((await db.query('select * from finance.allocations')).rows).toHaveLength(2);
 expect((await db.query<{actual:string}>('select finance.item_registered_actual_ore($1::uuid)::text as actual',[id(412)])).rows[0].actual).toBe('610001');
});
it('records one payment and one receipt across multiple project budget entries exactly once',async()=>{
 await db.query("insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,created_by_member_id,updated_by_member_id) values($1,$2,$3,'BI-S27-003','Fasteners','material',50000,'P1','new','planned',$4,$4)",[id(414),id(410),id(411),id(2)]);
 await db.query('insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values($1,$2,$1,$3)',[id(414),id(420),id(2)]);
 const shared={systemId:'',projectId:id(400),unbudgeted:false,description:'Parts for fabrication',quantity:'1'};
 const command={action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase:{buyerName:'Manager',supplierName:'Parts supplier',purchaseDate:'2026-11-01',justification:'Materials for the fabrication workshop',paymentMethod:'team_account',documentKind:'receipt',lines:[{...shared,budgetItemId:id(412),amountNok:'200.00'},{...shared,budgetItemId:id(414),amountNok:'50.00'}],uploadIds:[await evidence()]}};
 const result=await service(0).mutate('test',command);expect(result.ok).toBe(true);
 expect(await service(0).mutate('test',command)).toEqual(result);
 expect((await db.query('select * from finance.purchases where id=$1',[result.id])).rows).toHaveLength(1);
 expect((await db.query('select * from finance.documents where purchase_id=$1',[result.id])).rows).toHaveLength(1);
 expect((await db.query('select * from finance.purchase_lines where purchase_id=$1',[result.id])).rows).toHaveLength(2);
 expect((await db.query<{amount:string;entries:number}>('select sum(a.amount_ore)::text as amount,count(distinct a.budget_item_id)::integer as entries from finance.allocations a join finance.purchase_lines l on l.id=a.line_id where l.purchase_id=$1',[result.id])).rows).toEqual([{amount:'25000',entries:2}]);
});
it('uses the current approved project version and retains its provenance on registration',async()=>{
 await db.query("insert into finance.systems(id,department_key,code,name) select $1,department_key,'SYS-FABNEW','Revised fabrication system' from finance.systems where id=$2",[id(415),id(411)]);
 await db.query("insert into finance.project_budget_versions(id,project_budget_id,version_number,status,department_approved_by,department_approved_at,approved_by,approved_at,created_by_member_id) values($1,$2,1,'draft',$3,now(),$3,now(),$3)",[id(430),id(420),id(2)]);
 await db.query("insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,status) values($1,$2,$3,'Approved replacement description','material',2000000,'P2','new','active')",[id(430),id(412),id(415)]);
 await db.query("update finance.project_budget_versions set status='approved' where id=$1",[id(430)]);
 await db.query('update finance.project_budgets set approved_version_id=$1 where id=$2',[id(430),id(420)]);
 const choices=await service(0).load('test');expect(choices.items).toMatchObject([{id:id(412),systemId:id(415),description:'Approved replacement description',plannedNok:'20000.00'}]);expect(choices.items.some(item=>item.id===id(414))).toBe(false);
 const result=await service(0).mutate('test',{action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase:{buyerName:'Manager',supplierName:'Supplier',purchaseDate:'2026-11-01',justification:'Purchase against the approved version',paymentMethod:'team_account',documentKind:'receipt',lines:[{systemId:'',projectId:id(400),budgetItemId:id(412),unbudgeted:false,description:'Approved materials',quantity:'1',amountNok:'100.00'}],uploadIds:[await evidence()]}});
 expect((await db.query('select approved_version_id,budget_authority,system_id from finance.purchase_lines where purchase_id=$1',[result.id])).rows).toMatchObject([{approved_version_id:id(430),budget_authority:'project_approved',system_id:id(415)}]);
 const unallocated=await service(0).mutate('test',{action:'registerManagementPurchase',requestId:crypto.randomUUID(),purchase:{buyerName:'Manager',supplierName:'Supplier',purchaseDate:'2026-11-01',justification:'Expense linked after registration',paymentMethod:'team_account',documentKind:'receipt',lines:[{systemId:'',projectId:null,budgetItemId:null,unbudgeted:true,description:'Later allocation',quantity:'1',amountNok:'25.00'}],uploadIds:[await evidence()]}});
 const line=(await service(0).load('test')).purchases.find(line=>line.purchaseId===unallocated.id)!;
 await service(0).mutate('test',{action:'linkManagementPurchase',requestId:crypto.randomUUID(),lineId:line.id,projectId:id(400),budgetItemId:id(412),expectedRevision:0});
 expect((await db.query('select system_id,approved_version_id from finance.purchase_lines where id=$1',[line.id])).rows).toMatchObject([{system_id:id(415),approved_version_id:id(430)}]);

});
it('rechecks membership and project leads instead of using cached roles or choices',async()=>{
 await expect(service(1).load('test')).rejects.toMatchObject({status:403});
 await db.query("update project_management.department_members dm set access_level='viewer' from project_management.departments d where d.id=dm.department_id and d.name='Management' and dm.member_id=$1",[id(1)]);
 await expect(service(0).load('test')).rejects.toMatchObject({status:403});
 await expect(service(0).mutate('test',{action:'managementAuthorizeUpload',requestId:crypto.randomUUID(),fileName:'receipt.pdf',contentType:'application/pdf',byteSize:8})).rejects.toMatchObject({status:403});
 await db.query("update project_management.department_members dm set access_level='member' from project_management.departments d where d.id=dm.department_id and d.name='Management' and dm.member_id=$1",[id(1)]);
 await db.query("update project_management.projects set lead_ids=array[$2::uuid] where id=$1",[id(400),id(2)]);
 expect((await service(0).load('test')).items).toHaveLength(0);expect((await service(0).load('test')).projects).toHaveLength(0);
});
