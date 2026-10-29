import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDealServices } from '../../../api/_lib/partner-deals-service.js';
import type { WorkspaceIdentity } from '../../../api/_lib/member-cv-service.js';
const actor='11111111-1111-4111-8111-111111111111';
const identity:WorkspaceIdentity={userId:actor,googleSub:'sub',email:'member@example.test',name:'Member'};
let db:PGlite; let svc:ReturnType<typeof createDealServices>; let season:string; let org:string;
const load=(f:string)=>readFileSync(new URL(`../../../db/migrations/${f}.sql`,import.meta.url),'utf8');
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema identity; create schema neon_auth; create schema partner;
 create table neon_auth."user"(id uuid primary key,email text,"emailVerified" boolean,banned boolean);
 create table neon_auth.account("userId" uuid,"providerId" text,"accountId" text);
 create table identity.members(id uuid primary key,auth_user_id uuid,google_sub text,email text,full_name text,helix_role text);
 create table identity.departments(department_key text primary key,name text unique,sort_order smallint unique);
 create table identity.platform_roles(role_key text primary key,label text,sort_order smallint);
 create table identity.member_roles(member_id uuid,role_key text);
 create table identity.member_departments(member_id uuid,department_key text);
 create table identity.recruiter_grants(member_id uuid);
 create table partner.organizations(id uuid primary key default gen_random_uuid(),name text not null,active boolean not null default false);
 create role anon; create role authenticated; create role anonymous;
 insert into neon_auth."user" values('${actor}','member@example.test',true,false);
 insert into neon_auth.account values('${actor}','google','sub');
 insert into identity.members values('${actor}','${actor}','sub','member@example.test','Member','Member');
 insert into identity.platform_roles values('platform_administrator','Admin',1);`);
 for(const f of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','039_partner_deal_funding_recovery','040_partner_stable_draft_items','042_partner_funding_hardening']) await db.exec(load(f));
 await db.exec("alter table partner_deals.deals add column if not exists primary_season_id uuid");
 await db.exec(`insert into partner_deals.member_grants values('${actor}','business',true); insert into identity.member_roles values('${actor}','financials');
 insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('S27','S27','2026-08-01','2027-07-31','active','${actor}','${actor}');
 insert into partner.organizations(name,active) values('Acme',false);`);
 season=(await db.query<{id:string}>('select id from finance.seasons')).rows[0].id;
 org=(await db.query<{id:string}>('select id from partner.organizations')).rows[0].id;
 svc=createDealServices({db,authenticate:async()=>identity});
},60000);
afterAll(async()=>db.close());
const body=()=>({organizationId:org,title:'Deal',stage:'proposal',contributions:[{seasonId:season,kind:'cash',amountOre:'10000',invoiceDate:'2026-11-01'}],deliverables:[{title:'Logo'}]});
async function snapshot(dealId:string){
 const contribution=(await db.query<{id:string}>('select id from partner_deals.contributions where deal_id=$1',[dealId])).rows[0].id;
 const deliverable=(await db.query<{id:string}>('select id from partner_deals.deliverables where deal_id=$1',[dealId])).rows[0].id;
 return {contribution,deliverable};
}
it('preserves linked funding and both item identities through a stage and title edit',async()=>{
 const deal=(await svc.save('test',body())).id; const ids=await snapshot(deal);
 const record=(await db.query<{id:string}>(`insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-111','Acme','Member','sponsor_cash',10000,'secured',$2,$2) returning id`,[season,actor])).rows[0].id;
 await svc.linkFunding('test',ids.contribution,record,0);
 const payload=body();
 await svc.save('test',{...payload,id:deal,expectedRevision:0,title:'New title',stage:'contacted',contributions:[{...payload.contributions[0],id:ids.contribution}],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]});
 expect(await snapshot(deal)).toEqual(ids);
 expect((await db.query('select * from partner_deals.funding_links where contribution_id=$1',[ids.contribution])).rows).toHaveLength(1);
 const data=(await db.query<{revision:number;stage:string}>('select revision,stage from partner_deals.deals where id=$1',[deal])).rows[0];
 expect(data).toEqual({revision:1,stage:'contacted'});
 expect((await db.query('select * from partner_deals.audit where deal_id=$1',[deal])).rows).toHaveLength(2);
 await expect(svc.save('test',{...payload,id:deal,expectedRevision:1,contributions:[{...payload.contributions[0],id:ids.contribution,amountOre:'20000'}],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]})).rejects.toMatchObject({status:409});
 await expect(svc.save('test',{...payload,id:deal,expectedRevision:1,contributions:[],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]})).rejects.toMatchObject({status:409});
 expect((await db.query<{revision:number}>('select revision from partner_deals.deals where id=$1',[deal])).rows[0].revision).toBe(1);
});
it('rejects another deal item identifier and duplicate item identifiers atomically',async()=>{
 const first=(await svc.save('test',body())).id, second=(await svc.save('test',body())).id;
 const a=await snapshot(first), b=await snapshot(second), payload=body();
 await expect(svc.save('test',{...payload,id:first,expectedRevision:0,contributions:[{...payload.contributions[0],id:b.contribution}],deliverables:[{...payload.deliverables[0],id:a.deliverable}]})).rejects.toMatchObject({status:400});
 await expect(svc.save('test',{...payload,id:first,expectedRevision:0,contributions:[{...payload.contributions[0],id:a.contribution}],deliverables:[{...payload.deliverables[0],id:b.deliverable}]})).rejects.toMatchObject({status:400});
 await expect(svc.save('test',{...payload,id:first,expectedRevision:0,contributions:[{...payload.contributions[0],id:a.contribution},{...payload.contributions[0],id:a.contribution}],deliverables:[{...payload.deliverables[0],id:a.deliverable}]})).rejects.toMatchObject({status:400});
 expect(await snapshot(first)).toEqual(a); expect(await snapshot(second)).toEqual(b);
});
it('retains separate-funding approval on harmless edits and invalidates it when the amount changes',async()=>{
 const deal=(await svc.save('test',body())).id, ids=await snapshot(deal), payload=body();
 await db.query("insert into partner_deals.separate_funding_approvals(contribution_id,candidate_snapshot,approved_by_member_id) values($1,'[]'::jsonb,$2)",[ids.contribution,actor]);
 await svc.save('test',{...payload,id:deal,expectedRevision:0,title:'Changed',contributions:[{...payload.contributions[0],id:ids.contribution}],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]});
 expect((await db.query('select * from partner_deals.separate_funding_approvals where contribution_id=$1',[ids.contribution])).rows).toHaveLength(1);
 await svc.save('test',{...payload,id:deal,expectedRevision:1,contributions:[{...payload.contributions[0],id:ids.contribution,amountOre:'20000'}],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]});
 expect((await db.query('select * from partner_deals.separate_funding_approvals where contribution_id=$1',[ids.contribution])).rows).toHaveLength(0);
 expect(await snapshot(deal)).toEqual(ids);
});
it('allows replacing an unlinked cash entry in the same season',async()=>{
 const deal=(await svc.save('test',body())).id, before=await snapshot(deal), payload=body();
 await svc.save('test',{...payload,id:deal,expectedRevision:0,contributions:[{...payload.contributions[0],amountOre:'20000'}],deliverables:[{...payload.deliverables[0],id:before.deliverable}]});
 const after=await snapshot(deal); expect(after.contribution).not.toBe(before.contribution); expect(after.deliverable).toBe(before.deliverable);
});
it('prevents changing the organization of a deal with linked funding',async()=>{
 const deal=(await svc.save('test',body())).id, ids=await snapshot(deal), payload=body();
 const record=(await db.query<{id:string}>(`insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-112','Acme','Member','sponsor_cash',10000,'secured',$2,$2) returning id`,[season,actor])).rows[0].id;
 await svc.linkFunding('test',ids.contribution,record,0);
 const other=(await db.query<{id:string}>("insert into partner.organizations(name,active) values('Other',false) returning id")).rows[0].id;
 await expect(svc.save('test',{...payload,id:deal,expectedRevision:0,organizationId:other,contributions:[{...payload.contributions[0],id:ids.contribution}],deliverables:[{...payload.deliverables[0],id:ids.deliverable}]})).rejects.toMatchObject({status:409});
 expect(await snapshot(deal)).toEqual(ids);
});
