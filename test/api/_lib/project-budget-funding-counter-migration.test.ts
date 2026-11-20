import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from "vitest";
import {setupProjectBudgetBase,seedProjectBudgetLegacy,applyProjectBudgetMigrations,type ProjectBudgetTestDatabase} from "./project-budget-test-db.js";
let pg:PGlite,originalOwner:string;
const read=(name:string)=>readFileSync(new URL(`../../../db/migrations/${name}`,import.meta.url),"utf8");
const source=read("073_finance_registered_allocation_facts.sql");
const patch=source.slice(source.indexOf("-- Funding mutation feedback")).replace(/commit;\s*$/,'');
beforeAll(async()=>{pg=new PGlite();const db:ProjectBudgetTestDatabase={exec:sql=>pg.exec(sql),query:async<T>(sql:string,params?:unknown[])=>({rows:(await pg.query<T>(sql,params)).rows})};await setupProjectBudgetBase(db);await seedProjectBudgetLegacy(db);
 // Install the actual042 funding serialization functions, without its unrelated
 // partner mutation triggers. No substitute wrapper or production bypass.
 const hardening=read("042_partner_funding_hardening.sql");await pg.exec(hardening.slice(hardening.indexOf("alter function finance.apply_funding_change"),hardening.indexOf("-- Matching and insertion")));
 originalOwner=(await pg.query<{definition:string}>("select pg_get_functiondef('finance.apply_funding_change_unserialized(uuid,uuid,text,jsonb,boolean)'::regprocedure) as definition")).rows[0].definition;
 await applyProjectBudgetMigrations(db);
},30000);
beforeEach(()=>pg.exec("begin"));afterEach(()=>pg.exec("rollback"));afterAll(()=>pg.close());
it("patches the actual042 owner and preserves the season-serialization wrapper",async()=>{
 const rows=(await pg.query<{name:string;definition:string}>("select proname as name,pg_get_functiondef(oid) as definition from pg_proc where oid in('finance.apply_funding_change(uuid,uuid,text,jsonb,boolean)'::regprocedure,'finance.apply_funding_change_unserialized(uuid,uuid,text,jsonb,boolean)'::regprocedure)")).rows;
 expect(rows.find(row=>row.name==="apply_funding_change")?.definition).toContain("return finance.apply_funding_change_unserialized");expect(rows.find(row=>row.name==="apply_funding_change_unserialized")?.definition).toContain("from finance.effective_budget_entries i");
});
it("fails clearly when neither known function owns the expected counter",async()=>{await expect(pg.exec(patch)).rejects.toMatchObject({code:"P0001",message:"073 expected exactly one funding active-link counter; found 0"});});
it("fails clearly when two functions unexpectedly own the counter",async()=>{await pg.exec(originalOwner);await pg.exec(originalOwner.replace("FUNCTION finance.apply_funding_change_unserialized(","FUNCTION finance.apply_funding_change("));await expect(pg.exec(patch)).rejects.toMatchObject({code:"P0001",message:"073 expected exactly one funding active-link counter; found 2"});});
