import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
const id=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people=['manager','finance','marketing','outsider'].map((name,i)=>({userId:id(i+1),googleSub:name,email:`${name}@helixnmbu.no`,name}));
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}.sql`,import.meta.url),'utf8');
let db:PGlite;
const auth=(n:number)=>async()=>people[n];
const dealService=(n:number)=>createDealServices({db,authenticate:auth(n)});

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
 await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Business & Marketing'",[id(3)]);
 for(const n of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','038_partner_won_handoff','039_partner_deal_funding_recovery','040_partner_stable_draft_items','041_project_current_season','042_partner_funding_hardening','043_partner_finance_review','044_partner_due_invoices','045_partner_finance_review_unlink','046_partner_agreement_changes','047_partner_invoice_history','048_partner_review_notifications','049_partner_added_items','050_partner_change_reconciliation','051_won_finance_recovery','052_partner_manual_history','053_partner_manual_review','054_partner_manual_finance_review','055_partner_manual_review_gate','056_partner_deal_sponsor_level','059_imported_partner_deals','060_imported_partner_finance_review','063_partner_won_card_edits','064_partner_closed_season_reconciliation']) await db.exec(read(n));
 await db.exec("alter table partner_deals.deals add column if not exists primary_season_id uuid");
 await db.exec(`insert into partner_deals.member_grants values('${id(2)}','finance',true),('${id(3)}','marketing',true);
 insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('${id(20)}','S27','S27','2026-08-01','2027-07-31','active','${id(1)}','${id(1)}'),('${id(21)}','S28','S28','2027-08-01','2028-07-31','planning','${id(1)}','${id(1)}');
 insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season','${id(1)}');`);
},60000);
afterAll(async()=>db.close());

async function termsFor(number:number){
 const cash=(await db.query<{id:string;amount_ore:string;invoice_date:string}>("select id,amount_ore::text,invoice_date::text from partner_deals.contributions where deal_id=$1 and kind='cash' and retired_at is null",[id(number)])).rows;
 const deliverables=(await db.query<{id:string;title:string;description:string;due_date:string|null}>("select id,title,description,due_date::text from partner_deals.deliverables where deal_id=$1 and retired_at is null",[id(number)])).rows;
 return {title:'Agreement',contactName:'',contactEmail:'',startsOn:null,endsOn:null,agreementLink:'',cashChanges:cash.map(c=>({id:c.id,amountOre:c.amount_ore,invoiceDate:c.invoice_date})),inKindChanges:[],deliverableChanges:deliverables.map(d=>({id:d.id,title:d.title,description:d.description,dueDate:d.due_date})),newCash:[],newInKind:[],newDeliverables:[]};
}
it('reviews Won metadata without changing stage or exposing private pipeline fields in shared history',async()=>{
 await setupDeal(80,'Metadata',[20]);await confirm(0,81);
 const terms={...await termsFor(81),cardFields:{organizationId:id(80),ownerMemberId:id(3),seasonId:id(20),sponsorLevel:'gold',probability:75,followUpOn:'2026-12-03'}};
 const proposal=await dealService(0).recordAgreementChange('test',id(81),1,'amendment','Sponsor level and owner review',terms,true);
 expect((await db.query<{sponsor_level:string|null}>('select sponsor_level from partner_deals.deals where id=$1',[id(81)])).rows[0].sponsor_level).toBeNull();
 const shared=await dealService(2).load('test','shared');expect(JSON.stringify(shared)).not.toContain('probability');expect(JSON.stringify(shared)).not.toContain('followUpOn');
 const pipeline=await dealService(0).load('test','pipeline');expect(JSON.stringify(pipeline)).toContain('"probability":75');
 await dealService(0).resolveAgreementChange('test',proposal.id,'Reviewed metadata',true,false);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Retry',true,false);
 expect((await db.query('select stage,sponsor_level,owner_member_id,probability from partner_deals.deals where id=$1',[id(81)])).rows[0]).toMatchObject({stage:'won',sponsor_level:'gold',owner_member_id:id(3),probability:75});
});
it('requires Finance signoff for a company correction and preserves received cash without a second funding record',async()=>{
 await db.query("insert into identity.member_roles(member_id,role_key) values($1,'financials') on conflict do nothing",[id(2)]);
 await setupDeal(90,'Original company',[20]);await confirm(0,91);
 await db.query("insert into partner.organizations(id,name,active) values($1,'Corrected company',false)",[id(95)]);
 await db.query("update finance.funding set status='received',received_date='2026-11-02',revision=revision+1 where id in(select funding_id from partner_deals.funding_links where contribution_id in(select id from partner_deals.contributions where deal_id=$1))",[id(91)]);
 const before=(await db.query('select f.* from finance.funding f join partner_deals.funding_links l on l.funding_id=f.id join partner_deals.contributions c on c.id=l.contribution_id where c.deal_id=$1',[id(91)])).rows;
 const proposal=await dealService(0).recordAgreementChange('test',id(91),1,'amendment','Correct contracting company',{...await termsFor(91),cardFields:{organizationId:id(95)}},true);
 await expect(dealService(0).resolveAgreementChange('test',proposal.id,'Business reviewed',true,true)).rejects.toMatchObject({status:409});
 expect((await dealService(1).reviewNotifications('test')).some((n:unknown)=>JSON.stringify(n).includes('company review requested'))).toBe(true);
 const reviews=await dealService(1).financeReviewQueue('test') as {id:string;companyChange?:boolean;linkedFunding:{id:string;revision:number}}[];
 const review=reviews.find(r=>r.companyChange)!;expect(review).toBeDefined();
 await expect(dealService(0).resolveFinanceReview('test',review.id,'verified',review.linkedFunding.id,review.linkedFunding.revision,null,true)).rejects.toMatchObject({status:403});
 await dealService(1).resolveFinanceReview('test',review.id,'verified',review.linkedFunding.id,review.linkedFunding.revision,null,true);
 expect((await dealService(0).reviewNotifications('test')).some((n:unknown)=>JSON.stringify(n).includes('company review completed'))).toBe(true);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Finance approved original funding',true,true);
 const after=(await db.query('select f.* from finance.funding f join partner_deals.funding_links l on l.funding_id=f.id join partner_deals.contributions c on c.id=l.contribution_id where c.deal_id=$1',[id(91)])).rows;
 expect(after).toEqual(before);expect(after).toHaveLength(1);
 expect((await db.query('select organization_id from partner_deals.deals where id=$1',[id(91)])).rows[0]).toMatchObject({organization_id:id(95)});
 expect((await db.query<{mismatch:boolean}>("select partner_deals.linked_funding_mismatch(id) mismatch from partner_deals.contributions where deal_id=$1",[id(91)])).rows[0].mismatch).toBe(false);
});
it('rejects stale Finance signoff and protects the original company from renaming after correction',async()=>{
 await setupDeal(100,'Previous party',[20]);await confirm(0,101);
 await db.query("insert into partner.organizations(id,name,active) values($1,'New party',false)",[id(105)]);
 const proposal=await dealService(0).recordAgreementChange('test',id(101),1,'amendment','Correct company',{...await termsFor(101),cardFields:{organizationId:id(105)}},true);
 let review=(await dealService(1).financeReviewQueue('test') as {id:string;companyChange?:boolean;linkedFunding:{id:string;revision:number}}[]).find(r=>r.companyChange)!;
 await dealService(1).resolveFinanceReview('test',review.id,'verified',review.linkedFunding.id,review.linkedFunding.revision,null,true);
 await db.query("update finance.funding set revision=revision+1 where id=$1",[review.linkedFunding.id]);
 await expect(dealService(0).resolveAgreementChange('test',proposal.id,'Stale review',true,false)).rejects.toMatchObject({status:409});
 expect((await db.query<{organization_id:string}>('select organization_id from partner_deals.deals where id=$1',[id(101)])).rows[0].organization_id).toBe(id(100));
 review=(await dealService(1).financeReviewQueue('test') as typeof review[]).find(r=>r.id===review.id)!;
 await dealService(1).resolveFinanceReview('test',review.id,'verified',review.linkedFunding.id,review.linkedFunding.revision,null,true);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Fresh review',true,false);
 await expect(dealService(0).renameOrganization('test',id(100),0,'Renamed past party')).rejects.toMatchObject({status:409});
});
it('replaces an unreceived contribution in another season without moving its funding or invoice history',async()=>{
 await setupDeal(110,'Season change',[20]);await confirm(0,111);
 const terms=await termsFor(111);const old=terms.cashChanges[0];
 const proposal=await dealService(0).recordAgreementChange('test',id(111),1,'amendment','Correct season',{...terms,cashChanges:[{...old,retire:true}],newCash:[{id:id(115),replacementOf:old.id,seasonId:id(21),amountOre:old.amountOre,invoiceDate:'2027-11-01'}]},true);
 const oldFunding=(await db.query<{funding_id:string}>('select funding_id from partner_deals.funding_links where contribution_id=$1',[old.id])).rows[0];
 const oldInvoice=(await db.query<{task_id:string}>('select task_id from partner_deals.task_links where contribution_id=$1',[old.id])).rows[0];
 await expect(dealService(0).resolveAgreementChange('test',proposal.id,'Unreviewed',true,false)).rejects.toMatchObject({status:409});
 await db.query("update finance.funding set status='deleted',prior_status='secured',revision=revision+1 where id=$1",[oldFunding.funding_id]);
 await db.query("update project_management.tasks set status='cancelled' where id=$1",[oldInvoice.task_id]);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Original funding and task retired by Finance',true,false);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Retry',true,false);
 expect((await db.query('select season_id,status from finance.funding where id=$1',[oldFunding.funding_id])).rows[0]).toMatchObject({season_id:id(20),status:'deleted'});
 expect((await db.query('select season_id,retired_at from partner_deals.contributions where id=$1',[old.id])).rows[0]).toMatchObject({season_id:id(20),retired_at:expect.any(Date)});
 expect((await db.query('select f.season_id,f.status from finance.funding f join partner_deals.funding_links l on l.funding_id=f.id where l.contribution_id=$1',[id(115)])).rows[0]).toMatchObject({season_id:id(21),status:'secured'});
});
it('rejects moving received cash between seasons before it creates a second economic obligation',async()=>{
 await setupDeal(120,'Received season',[20]);await confirm(0,121);
 const terms=await termsFor(121);const old=terms.cashChanges[0];
 await db.query("update finance.funding set status='received',received_date='2026-11-02' where id in(select funding_id from partner_deals.funding_links where contribution_id=$1)",[old.id]);
 await expect(dealService(0).recordAgreementChange('test',id(121),1,'amendment','Move received cash',{...terms,cashChanges:[{...old,retire:true}],newCash:[{id:id(125),replacementOf:old.id,seasonId:id(21),amountOre:old.amountOre,invoiceDate:'2027-11-01'}]},true)).rejects.toMatchObject({status:409,message:expect.stringContaining('Received cash cannot be moved')});
 expect((await db.query('select id from partner_deals.contributions where deal_id=$1',[id(121)])).rows).toHaveLength(1);
 expect((await db.query('select id from partner_deals.agreement_changes where deal_id=$1',[id(121)])).rows).toHaveLength(0);
});
it('allows metadata corrections while preserving an unchanged closed primary season',async()=>{
 await setupDeal(130,'Closed metadata',[]);await confirm(0,131);
 await db.query("insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values($1,'S26','S26','2025-08-01','2026-07-31','closed',$2,$2)",[id(22),id(1)]);
 await db.query('update partner_deals.deals set primary_season_id=$1 where id=$2',[id(22),id(131)]);
 const proposal=await dealService(0).recordAgreementChange('test',id(131),1,'amendment','Historical sponsor label',{...await termsFor(131),cardFields:{seasonId:id(22),sponsorLevel:'silver'}},true);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Historical metadata reviewed',true,false);
 expect((await db.query('select sponsor_level,primary_season_id from partner_deals.deals where id=$1',[id(131)])).rows[0]).toMatchObject({sponsor_level:'silver',primary_season_id:id(22)});
});
it('reviews imported Won metadata while leaving unknown invoice dates and unlinked funding unchanged',async()=>{
 await db.query("insert into partner.organizations(id,name,active) values($1,'Imported company',false)",[id(140)]);
 await db.query("insert into partner_deals.deals(id,organization_id,title,stage,primary_season_id,created_by_member_id,updated_by_member_id,won_at,won_by_member_id) values($1,$2,'Imported agreement','won',$3,$4,$4,now(),$4)",[id(141),id(140),id(20),id(1)]);
 await db.query("insert into partner_deals.contributions(id,deal_id,season_id,kind,amount_ore,invoice_date) values($1,$2,$3,'cash',50000,null)",[id(142),id(141),id(20)]);
 const terms={...await termsFor(141),title:'Imported agreement',cardFields:{organizationId:id(140),seasonId:id(20),sponsorLevel:'gold',ownerMemberId:id(3),probability:25,followUpOn:'2026-12-04'}};
 const proposal=await dealService(0).recordAgreementChange('test',id(141),0,'amendment','Correct imported sponsor details',terms,true);
 await dealService(0).resolveAgreementChange('test',proposal.id,'Metadata only; financial setup remains outstanding',true,false);
 expect((await db.query('select invoice_date,amount_ore::text from partner_deals.contributions where id=$1',[id(142)])).rows[0]).toMatchObject({invoice_date:null,amount_ore:'50000'});
 expect((await db.query('select * from partner_deals.funding_links where contribution_id=$1',[id(142)])).rows).toHaveLength(0);
 expect((await db.query('select sponsor_level,owner_member_id from partner_deals.deals where id=$1',[id(141)])).rows[0]).toMatchObject({sponsor_level:'gold',owner_member_id:id(3)});
});
