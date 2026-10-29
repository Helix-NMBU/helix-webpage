import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import { createDealHandler } from "../../../api/_lib/partner-deals-handler.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";
const business="00000000-0000-4000-8000-000000000001", marketing="00000000-0000-4000-8000-000000000002", admin="00000000-0000-4000-8000-000000000003", pm="00000000-0000-4000-8000-000000000004";
const season="00000000-0000-4000-8000-000000000005", future="00000000-0000-4000-8000-000000000006";
let pg: PGlite; let services: ReturnType<typeof createDealServices>; let dealId=""; let orgId="";
const identities = new Map([business,marketing,admin,pm].map(id=>[id,{ userId:id, googleSub:`sub-${id}`,email:`${id}@helixnmbu.no` } as WorkspaceIdentity]));
beforeAll(async()=>{
 pg=new PGlite();
 await pg.exec(`create schema identity; create schema neon_auth; create schema partner; create schema finance; create schema project_management;
 create table project_management.tasks(id uuid primary key,title text,status text);
 create function project_management.can_access_task(uuid,uuid) returns boolean language sql as $$ select false $$;
 create table neon_auth."user"(id uuid primary key,email text,"emailVerified" boolean,banned boolean);
 create table neon_auth.account("userId" uuid,"providerId" text,"accountId" text);
 create table identity.members(id uuid primary key,auth_user_id uuid,google_sub text,email text);
 create table identity.member_roles(member_id uuid,role_key text);
 create table partner.organizations(id uuid primary key default gen_random_uuid(),name text not null,active boolean not null default false,revoked_at timestamptz,created_at timestamptz default now());
 create table finance.seasons(id uuid primary key,code text,name text,start_date date,end_date date,status text);
 create function finance.capability_flags(uuid) returns jsonb language sql as $$ select '{"manageFunding":false}'::jsonb $$;
 insert into finance.seasons values('${season}','S27','S27','2026-08-01','2027-07-31','active'),('${future}','S28','S28','2027-08-01','2028-07-31','planning');`);
 for(const [id,actor] of identities) {
  await pg.query(`insert into neon_auth."user" values($1,$2,true,false)`,[id,actor.email]);
  await pg.query(`insert into neon_auth.account values($1,'google',$2)`,[id,actor.googleSub]);
  await pg.query(`insert into identity.members values($1,$1,$2,$3)`,[id,actor.googleSub,actor.email]);
 }
 await pg.exec(`insert into identity.member_roles values('${admin}','platform_administrator'),('${pm}','project_manager');`);
 await pg.exec(readFileSync(new URL("../../../db/migrations/035_partner_deals.sql",import.meta.url),"utf8"));
 await pg.exec(`create table partner_deals.task_links(id uuid primary key default gen_random_uuid(),deal_id uuid,task_id uuid,kind text,deliverable_id uuid,season_id uuid);`);
 await pg.exec(`insert into partner_deals.member_grants values ('${business}','business',true),('${marketing}','marketing',true);`);
 const db: CvDatabase={query:async<T>(sql:string,params?:unknown[])=>({rows:(await pg.query<T>(sql,params)).rows})};
 services=createDealServices({db,authenticate:async token=>{const actor=identities.get(token);if(!actor)throw new MemberCvError(401,"Log in");return actor;}});
});
afterAll(async()=>pg.close());
const input=()=>({organizationId:orgId,title:"Partner agreement",stage:"lead",ownerMemberId:business,contactName:"Contact",contactEmail:"person@example.test",startsOn:"2026-08-01",endsOn:"2028-07-31",agreementLink:"https://example.test/agreement",negotiationNotes:"Private negotiation",contributions:[{seasonId:season,kind:"cash",amountOre:"100000",invoiceDate:"2026-11-01"},{seasonId:future,kind:"product",amountOre:"12000",description:"Parts"}],deliverables:[{title:"Logo",description:"On car"}]});
describe("partner deals access and persistence",()=>{
 it("separates explicit pipeline grants from marketing, admin and unauthenticated sessions",async()=>{
  await expect(services.load(marketing,"pipeline")).rejects.toMatchObject({status:403});
  await expect(services.load(admin,"pipeline")).rejects.toMatchObject({status:403});
  await expect(services.load("partner-otp","shared")).rejects.toMatchObject({status:401});
  expect((await services.load(pm,"pipeline")).canManage).toBe(true);
  orgId=(await services.createOrganization(business,"Example partner")).id;
  expect((await pg.query<{active:boolean}>("select active from partner.organizations where id=$1",[orgId])).rows[0].active).toBe(false);
  await expect(services.renameOrganization(marketing,orgId,0,"Denied")).rejects.toMatchObject({status:403});
  await services.renameOrganization(business,orgId,0,"Renamed partner");
  await expect(services.renameOrganization(business,orgId,0,"Stale")).rejects.toMatchObject({status:409});
  expect((await pg.query<{active:boolean}>("select active from partner.organizations where id=$1",[orgId])).rows[0].active).toBe(false);
 });
 it("persists separate seasonal contributions and multiple agreements without exposing prospects",async()=>{
  dealId=(await services.save(business,input())).id;
  await services.save(business,{...input(),title:"Second agreement"});
  const pipeline=await services.load(business,"pipeline"); expect(pipeline.deals).toHaveLength(2);
  expect(JSON.stringify(pipeline)).toContain("Private negotiation");
  expect((await services.load(marketing,"shared")).deals).toHaveLength(0);
  expect((await pg.query("select * from partner_deals.contributions where deal_id=$1",[dealId])).rows).toHaveLength(2);
 });
 it("rejects stale revisions and the bypass of the Won transition",async()=>{
  await services.save(business,{...input(),id:dealId,expectedRevision:0,title:"Updated"});
  await expect(services.save(business,{...input(),id:dealId,expectedRevision:0})).rejects.toMatchObject({status:409});
  await expect(services.save(business,{...input(),stage:"won"})).rejects.toMatchObject({status:400});
  expect((await pg.query("select * from partner_deals.audit where deal_id=$1",[dealId])).rows).toHaveLength(2);
 });
 it("rejects duplicate seasonal cash and rolls back the entire attempted update",async()=>{
  const before = await services.load(business,"pipeline");
  const payload=input();
  await expect(services.save(business,{...payload,id:dealId,expectedRevision:1,title:"Should roll back",contributions:[payload.contributions[0],payload.contributions[0]]})).rejects.toMatchObject({status:400});
  expect(await services.load(business,"pipeline")).toEqual(before);
  await expect(services.save(business,{...payload,agreementLink:"javascript:alert(1)"})).rejects.toMatchObject({status:400});
 });
 it("only exposes won terms to shared readers and never returns negotiation notes",async()=>{
  await pg.query("update partner_deals.deals set stage='won',won_at=now(),won_by_member_id=$2 where id=$1",[dealId,business]);
  const shared=await services.load(marketing,"shared"); expect(shared.deals).toHaveLength(1);
  expect(shared.deals[0]).toMatchObject({ contributions: expect.arrayContaining([
   expect.objectContaining({ seasonCode:"S27", seasonName:"S27" }),
   expect.objectContaining({ seasonCode:"S28", seasonName:"S28" }),
  ]) });
  expect(shared.seasons).toEqual([]);
  expect(JSON.stringify(shared)).not.toContain("Private negotiation");
  await expect(services.save(business,{...input(),id:dealId,expectedRevision:1})).rejects.toMatchObject({status:409});
 });
 it("returns no deal data when a grant is revoked during a read",async()=>{
  let revoked=false;
  const db: CvDatabase={query:async<T>(sql:string,params?:unknown[])=>{
   const rows=(await pg.query<T>(sql,params)).rows;
   if (!revoked && sql.includes('as "canManage"')) {
    revoked=true;
    await pg.query("update partner_deals.member_grants set active=false where member_id=$1",[marketing]);
   }
   return {rows};
  }};
  const reading=createDealServices({db,authenticate:async token=>{const actor=identities.get(token);if(!actor)throw new MemberCvError(401,"Log in");return actor;}});
  const handler=createDealHandler(()=>reading);
  const response={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()}; response.status.mockReturnValue(response);
  await handler({method:"GET",headers:{authorization:`Bearer ${marketing}`},query:{view:"shared"}} as never,response as never);
  expect(revoked).toBe(true);
  expect(response.status).toHaveBeenCalledWith(403);
  expect(response.json).toHaveBeenCalledWith({error:"You do not have access to sponsor deals."});
  expect(JSON.stringify(response.json.mock.calls)).not.toContain("Partner agreement");
  await pg.query("update partner_deals.member_grants set active=true where member_id=$1",[marketing]);
 });
 it("rechecks account and grant revocation",async()=>{
  await pg.query("update partner_deals.member_grants set active=false where member_id=$1",[marketing]);
  await expect(services.load(marketing,"shared")).rejects.toMatchObject({status:403});
  await pg.query('update neon_auth."user" set banned=true where id=$1',[business]);
  await expect(services.load(business,"pipeline")).rejects.toMatchObject({status:403});
 });
});
