import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
const actor="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
let pg:PGlite; let svc:ReturnType<typeof createDealServices>; let current:string; let future:string; let org:string;
const identity:WorkspaceIdentity={userId:actor,googleSub:"sub",email:"member@example.test",name:"Member"};
beforeAll(async()=>{
 pg=new PGlite();
 await pg.exec(`create schema identity; create schema neon_auth; create schema partner;
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
 insert into neon_auth."user" values('${actor}','member@example.test',true,false),('${other}','other@example.test',true,false);
 insert into neon_auth.account values('${actor}','google','sub'),('${other}','google','other');
 insert into identity.members values('${actor}','${actor}','sub','member@example.test','Member','Member'),('${other}','${other}','other','other@example.test','Other','Member');
 insert into identity.platform_roles values('platform_administrator','Admin',1);`);
 for(const file of ["011_finance_core.sql","012_finance_season_budgets.sql","013_finance_funding.sql","024_financials_member_role.sql","035_partner_deals.sql","037_partner_deal_funding.sql"]) await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`,import.meta.url),"utf8"));
 await pg.exec(`insert into partner_deals.member_grants values('${actor}','business',true);
 insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values
 ('S27','S27','2026-08-01','2027-07-31','active','${actor}','${actor}'),('S28','S28','2027-08-01','2028-07-31','planning','${actor}','${actor}');`);
 const seasons=(await pg.query<{id:string,code:string}>("select id,code from finance.seasons")).rows;current=seasons.find(s=>s.code==='S27')!.id;future=seasons.find(s=>s.code==='S28')!.id;
 const db:CvDatabase={query:async<T>(sql:string,params?:unknown[])=>({rows:(await pg.query<T>(sql,params)).rows})};
 svc=createDealServices({db,authenticate:async()=>identity});org=(await svc.createOrganization('actor','Acme')).id;
});
afterAll(async()=>pg.close());
const payload=(name:string,contributions:unknown[])=>({organizationId:org,title:name,stage:'proposal',ownerMemberId:actor,agreementLink:'https://example.test',contributions,deliverables:[]});
const cash=(seasonId:string,amountOre='100000')=>({seasonId,kind:'cash',amountOre,invoiceDate:'2026-11-01'});
const call=(id:string)=>pg.query('select partner_deals.attach_won_funding($1,$2)',[actor,id]);
describe('partner deal funding',()=>{
 it('creates audited secured funding per season, never for in-kind, and retries idempotently',async()=>{
  const id=(await svc.save('actor',payload('First',[cash(current),cash(future),{seasonId:current,kind:'product',amountOre:'12345'}]))).id;
  await call(id);await call(id);
  const rows=(await pg.query<{status:string,received_date:string|null,amount_ore:string}>("select status,received_date,amount_ore::text from finance.funding order by public_ref")).rows;
  expect(rows).toEqual([{status:'secured',received_date:null,amount_ore:'100000'},{status:'secured',received_date:null,amount_ore:'100000'}]);
  expect((await pg.query('select * from partner_deals.funding_links')).rows).toHaveLength(2);
  expect((await pg.query("select * from finance.audit_log where entity='funding'")).rows.length).toBeGreaterThan(0);
 });
 it('fails before producing a duplicate and preserves existing funding',async()=>{
  const id=(await svc.save('actor',payload('Second',[cash(current)]))).id;
  await expect(call(id)).rejects.toThrow('deal_funding_possible_duplicate');
  expect((await pg.query('select * from finance.funding')).rows).toHaveLength(2);
 });
 it('requires existing financial authority for linking and refuses reuse of a linked funding record',async()=>{
  const id=(await svc.save('actor',payload('Third',[cash(current)]))).id;
  const contribution=(await pg.query<{id:string}>('select id from partner_deals.contributions where deal_id=$1',[id])).rows[0].id;
  const funding=(await pg.query<{id:string}>('select id from finance.funding where season_id=$1',[current])).rows[0].id;
  await expect(svc.linkFunding('actor',contribution,funding)).rejects.toMatchObject({status:403});
  await pg.exec(`insert into identity.member_roles values('${actor}','financials');`);
  await expect(svc.linkFunding('actor',contribution,funding)).rejects.toMatchObject({status:400});
 });
 it('links a matching pre-existing record without changing received status, and supports unlink before Won',async()=>{
  await pg.exec("insert into partner.organizations(name,active) values('NewCo',false)");
  const newOrg=(await pg.query<{id:string}>("select id from partner.organizations where name='NewCo'")).rows[0].id;
  const id=(await svc.save('actor',{...payload('Fourth',[cash(current,'1234')]),organizationId:newOrg})).id;
  const contribution=(await pg.query<{id:string}>('select id from partner_deals.contributions where deal_id=$1',[id])).rows[0].id;
  const record=(await pg.query<{id:string}>(`insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-999','NewCo','Member','sponsor_cash',1234,'received',$2,$2) returning id`,[current,actor])).rows[0].id;
  await svc.linkFunding('actor',contribution,record);await svc.linkFunding('actor',contribution,record);await call(id);
  expect((await pg.query<{status:string}>('select status from finance.funding where id=$1',[record])).rows[0].status).toBe('received');
  await svc.unlinkFunding('actor',contribution);expect((await pg.query('select * from partner_deals.funding_links where contribution_id=$1',[contribution])).rows).toHaveLength(0);
 });
 it('rolls back all finance effects when any deal season is closed',async()=>{
  await pg.exec("update finance.seasons set status='closed' where code='S28'");
  await pg.exec("insert into partner.organizations(name,active) values('FreshCo',false)");
  const fresh=(await pg.query<{id:string}>("select id from partner.organizations where name='FreshCo'")).rows[0].id;
  const id=(await svc.save('actor',{...payload('Fifth',[cash(current),cash(future)]),organizationId:fresh})).id;
  const before=(await pg.query('select * from finance.funding')).rows.length;
  await expect(call(id)).rejects.toThrow('deal_funding_closed');
  expect((await pg.query('select * from finance.funding')).rows).toHaveLength(before);
  expect((await pg.query('select * from partner_deals.funding_links where contribution_id in (select id from partner_deals.contributions where deal_id=$1)',[id])).rows).toHaveLength(0);
 });
});
