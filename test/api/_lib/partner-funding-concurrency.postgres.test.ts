import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const url=process.env.FINANCE_TEST_POSTGRES_URL;
const dbName=`partner_lock_test_${randomUUID().replaceAll('-','')}`;
const actor='11111111-1111-4111-8111-111111111111';
const read=(f:string)=>readFileSync(new URL(`../../../db/migrations/${f}.sql`,import.meta.url),'utf8');
describe.skipIf(!url)('partner funding serialization on PostgreSQL',()=>{
 let admin:pg.Client,pool:pg.Pool,season:string,deal:string,funding:string;
 beforeAll(async()=>{
  const base=new URL(url!);
  if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.pathname!=='/postgres') throw new Error('Requires a loopback PostgreSQL maintenance connection.');
  admin=new pg.Client({connectionString:base.toString()});await admin.connect();await admin.query(`create database ${dbName}`);
  base.pathname=`/${dbName}`;pool=new pg.Pool({connectionString:base.toString(),max:4});
  await pool.query(`create schema identity;create schema neon_auth;create schema partner;
   create table neon_auth."user"(id uuid primary key,email text,"emailVerified" boolean,banned boolean);
   create table neon_auth.account("userId" uuid,"providerId" text,"accountId" text);
   create table identity.members(id uuid primary key,auth_user_id uuid,google_sub text,email text,full_name text,helix_role text);
   create table identity.departments(department_key text primary key,name text unique,sort_order smallint unique);
   create table identity.platform_roles(role_key text primary key,label text,sort_order smallint);
   create table identity.member_roles(member_id uuid,role_key text);
   create table identity.member_departments(member_id uuid,department_key text);
   create table identity.recruiter_grants(member_id uuid);
   create table partner.organizations(id uuid primary key default gen_random_uuid(),name text not null,active boolean not null default false);
   insert into neon_auth."user" values('${actor}','member@example.test',true,false);
   insert into neon_auth.account values('${actor}','google','sub');
   insert into identity.members values('${actor}','${actor}','sub','member@example.test','Member','Member');
   insert into identity.platform_roles values('platform_administrator','Admin',1);`);
  for(const f of ['011_finance_core','012_finance_season_budgets','013_finance_funding','024_financials_member_role','035_partner_deals','037_partner_deal_funding','039_partner_deal_funding_recovery','042_partner_funding_hardening']) await pool.query(read(f));
  season=(await pool.query(`insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('S27','S27','2026-08-01','2027-07-31','active',$1,$1) returning id`,[actor])).rows[0].id;
  await pool.query(`insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Current season',$1)`,[actor]);
  const org=(await pool.query(`insert into partner.organizations(name) values('Acme') returning id`)).rows[0].id;
  deal=(await pool.query(`insert into partner_deals.deals(organization_id,title,stage,created_by_member_id,updated_by_member_id) values($1,'Deal','proposal',$2,$2) returning id`,[org,actor])).rows[0].id;
  await pool.query(`insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date) values($1,$2,'cash',10000,'2026-11-01')`,[deal,season]);
  funding=(await pool.query(`insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1,'F-S27-001','Other','Member','sponsor_cash',10000,'secured',$2,$2) returning id`,[season,actor])).rows[0].id;
 },30000);
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`drop database if exists ${dbName} with (force)`);await admin.end();}});
 it('waits for a concurrent source edit and then requires duplicate review',async()=>{
  const editor=await pool.connect(), confirmer=await pool.connect();
  try {
   await editor.query('begin');
   const change={action:'editFunding',fundingId:funding,expectedRevision:0,fields:['sourceName'],values:{sourceName:'Acme'}};
   await editor.query('select finance.apply_funding_change($1,$2,$3,$4::jsonb,false)',[actor,randomUUID(),'a'.repeat(64),JSON.stringify(change)]);
   const pid=(await confirmer.query<{pid:number}>('select pg_backend_pid() as pid')).rows[0].pid;
   const attempt=confirmer.query('select partner_deals.attach_won_funding($1,$2)',[actor,deal]).then(()=>({error:null as Error|null}),error=>({error:error as Error}));
   let blocked=false;
   for(let n=0;n<100;n++){
    const wait=(await pool.query<{wait_event_type:string|null}>('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(wait?.wait_event_type==='Lock'){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(blocked).toBe(true);
   await editor.query('commit');
   expect((await attempt).error?.message).toContain('deal_funding_possible_duplicate');
   expect((await pool.query('select * from partner_deals.funding_links')).rows).toHaveLength(0);
  } finally { await editor.query('rollback').catch(()=>{});editor.release();confirmer.release(); }
 },30000);
});
