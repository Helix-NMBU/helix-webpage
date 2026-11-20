import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage } from "./project-budget-test-db.js";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import { osloToday, addCalendarDays } from "../../../src/features/Finance/money.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";
import { projectBudgetFixture as f, projectBudgetIdentity, setupProjectBudgetBase, seedProjectBudgetLegacy, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
const url = process.env.FINANCE_TEST_POSTGRES_URL;
const databaseName = `helix_pba_effective_${randomUUID().replaceAll("-", "")}`;
const migrationDirectory = new URL("../../../db/migrations/",import.meta.url);
const migration = readFileSync(new URL("073_finance_registered_allocation_facts.sql",migrationDirectory),"utf8");
const storage = createMemoryFinanceStorage();
let admin: pg.Client | undefined, pool: pg.Pool, close: (()=>Promise<void>) | undefined, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>, originalCore: string;
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string,unknown>)=>services.mutate(role,{requestId:randomUUID(),...body});
async function write(b: ProjectBudgetDetail, action: string, fields = {}, role: ProjectBudgetFixtureRole = "lead") { if(action === "sendDepartmentBudgetPackage") return (await submitProjectBudgetDepartmentPackage(services,b,role)).budget; if(action === "approveDepartmentBudgetPackage") return approveProjectBudgetDepartmentPackage(services,b); await mutate(role,{action,projectBudgetId:b.id,expectedRevision:b.revision,...fields}); return services.projectBudget("lead",b.id); }
const input = {systemId:f.system,description:"Concurrent approved material",category:"material",plannedNok:"1000",ordinaryPriority:"P2",reuseStatus:"new",status:"planned"};
async function approved() {
  const projectId=randomUUID(); await db.query("insert into project_management.projects values($1::uuid,'S27','Concurrent frame',array[$2::uuid],array['Mechanical & Production'],1)",[projectId,f.lead]);
  const created=await mutate("lead",{action:"createProjectBudget",projectId,responsibleDepartmentId:f.department}); let b=await services.projectBudget("lead",created.id!); b=await write(b,"saveProjectBudgetEntry",{entry:input}); b=await write(b,"submitProjectBudget"); b=await write(b,"sendDepartmentBudgetPackage",{},"departmentLead"); return write(b,"approveDepartmentBudgetPackage",{},"head");
}
async function pending(b:ProjectBudgetDetail) { b=await write(b,"requestProjectBudgetChanges",{reason:"New approved quote"}); b=await write(b,"saveProjectBudgetEntry",{entry:{...input,entryId:b.approvedVersion!.entries[0].entryId,plannedNok:"2000"}}); b=await write(b,"submitProjectBudget"); return write(b,"sendDepartmentBudgetPackage",{},"departmentLead"); }
async function purchaseBody(b:ProjectBudgetDetail) {
  const upload=await mutate("head",{action:"authorizeUpload",fileName:"invoice.pdf",contentType:"application/pdf",byteSize:8}); await putMemoryPdf(storage,upload.stagingKey!); await mutate("head",{action:"finalizeUpload",uploadId:upload.id});
  return {action:"registerPurchase",requestId:randomUUID(),purchase:{buyerName:"Finance buyer",supplierName:"Supplier",paymentMethod:"team_account",purchaseDate:osloToday(),justification:"Concurrent frame materials",documentKind:"receipt",uploadIds:[upload.id],lines:[{systemId:f.system,budgetItemId:b.approvedVersion!.entries[0].entryId,unbudgeted:false,description:"Material",quantity:"1",amountNok:"500"}]}};
}
async function waitForBlocked(functionName:string) {
  for(let attempt=0;attempt<100;attempt++) { const rows=await pool.query<{blocked:boolean}>("select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like $1) as blocked",[`%select finance.${functionName}(%`]); if(rows.rows[0].blocked)return; await new Promise(resolve=>setTimeout(resolve,20)); }
  throw new Error(`Expected ${functionName} to wait on the held project header`);
}
describe.skipIf(!url)("canonical Finance approval/actual atomicity on PostgreSQL",()=>{
  beforeAll(async()=>{
    const connection=new URL(url!); if(!["127.0.0.1","localhost","[::1]"].includes(connection.hostname)||connection.pathname!=="/postgres")throw new Error("Use the loopback postgres maintenance database.");
    admin=new pg.Client({connectionString:connection.toString()}); await admin.connect().catch(error=>{admin=undefined;throw error;}); await admin!.query(`create database ${databaseName}`); connection.pathname=`/${databaseName}`;
    const resource=createPostgresTestPool({connectionString:connection.toString(),max:8});pool=resource.pool;close=resource.close;
    db={exec:sql=>pool.query(sql),query:async<T>(sql:string,params?:unknown[])=>{try{return{rows:(await pool.query(sql,params)).rows as T[]};}catch(error){const fault=error as {code?:string;constraint?:string};console.error("Synthetic Finance PostgreSQL failure",{action:sql.match(/finance\.[a-z_]+/)?.[0],code:fault.code,constraint:fault.constraint});throw error;}}};
    await setupProjectBudgetBase(db);await seedProjectBudgetLegacy(db);
    for(const name of readdirSync(migrationDirectory).filter(name=>/^0(6[6-9]|7[0-2])_.*\.sql$/.test(name)).sort())await db.exec(readFileSync(new URL(name,migrationDirectory),"utf8"));
    originalCore=(await pool.query<{definition:string}>("select pg_get_functiondef('finance.register_purchase_before_project_tracking(uuid,uuid,text,jsonb)'::regprocedure) as definition")).rows[0].definition;
    await db.exec(migration); await db.exec(readFileSync(new URL("074_department_budget_packages.sql",migrationDirectory),"utf8")); await db.query("insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid)",[f.head]);
    await db.query("update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null where id=$1::uuid",[f.legacyBudget]);
    await db.query("insert into finance.reference_counters(counter_key,configured_next,last_issued,updated_by_member_id) values('request:S27',2,1,$1::uuid)",[f.head]);
    services=createFinanceServices({db,financeStorage:storage,authenticate:async token=>projectBudgetIdentity(token as ProjectBudgetFixtureRole)});
  },30000);
  afterAll(async()=>{try{await close?.();if(admin)await admin.query(`drop database if exists ${databaseName}`);}finally{if(admin)await admin.end();}});
  it("retains the old recorded version when purchase wins without staling an unchanged package",async()=>{
    let b=await approved();const old=b.approvedVersionId!,entry=b.approvedVersion!.entries[0].entryId;b=await pending(b);const body=await purchaseBody(b);
    const blocker=await pool.connect();await blocker.query("begin");await blocker.query("select id from finance.project_budgets where id=$1::uuid for update",[b.id]);
    const registration=services.mutate("head",body); let promotion:Promise<unknown>|undefined;
    try{await waitForBlocked("register_purchase");promotion=write(b,"approveDepartmentBudgetPackage",{},"head").then(value=>({ok:true,value}),error=>({ok:false,error})); await waitForBlocked("mutate_department_budget_package");await blocker.query("commit"); const registered=await registration; expect(await promotion).toMatchObject({ok:true});
      const replay=await services.mutate("head",body);expect(replay.id).toBe(registered.id);b=await services.projectBudget("lead",b.id);expect(b.pendingVersionId).toBeNull();
      expect((await pool.query("select approved_version_id from finance.purchase_lines where purchase_id=$1::uuid",[registered.id])).rows).toEqual([{approved_version_id:old}]);
      expect((await pool.query("select planned_ore::text, (select sum(amount_ore)::text from finance.registered_allocation_facts where budget_item_id=e.id) as actual from finance.effective_budget_entries e where id=$1::uuid",[entry])).rows).toEqual([{planned_ore:"200000",actual:"50000"}]);
    }finally{await blocker.query("rollback");blocker.release(); await Promise.allSettled([registration,...(promotion?[promotion]:[])]);}
  },15000);
  it("records the new approved version when promotion wins and exposes no partial materialization",async()=>{
    let b=await pending(await approved());const candidate=b.pendingVersionId!,entry=b.approvedVersion!.entries[0].entryId,body=await purchaseBody(b);
    const blocker=await pool.connect();await blocker.query("begin");await blocker.query("select id from finance.project_budgets where id=$1::uuid for update",[b.id]);
    const promotion=write(b,"approveDepartmentBudgetPackage",{},"head");let registration:ReturnType<typeof services.mutate>|undefined;
    try{await waitForBlocked("mutate_department_budget_package");registration=services.mutate("head",body);await waitForBlocked("register_purchase");
      expect((await pool.query("select approved_version_id,planned_ore::text from finance.effective_budget_entries where id=$1::uuid",[entry])).rows).toEqual([{approved_version_id:b.approvedVersionId,planned_ore:"100000"}]);
      await blocker.query("commit");b=await promotion;const registered=await registration;
      expect((await pool.query("select approved_version_id from finance.purchase_lines where purchase_id=$1::uuid",[registered.id])).rows).toEqual([{approved_version_id:candidate}]);
      expect((await pool.query("select approved_version_id,planned_ore::text from finance.effective_budget_entries where id=$1::uuid",[entry])).rows).toEqual([{approved_version_id:candidate,planned_ore:"200000"}]);
    }finally{await blocker.query("rollback");blocker.release();await Promise.allSettled([promotion,...(registration?[registration]:[])]);}
  },15000);
  it("rechecks canonical request eligibility after waiting for a removal promotion's anchor locks",async()=>{
    let b=await approved(); const entry=b.approvedVersion!.entries[0].entryId;
    const request={supplierName:"Supplier",justification:"Materials for the frame",plannedDate:addCalendarDays(osloToday(),3),lines:[{budgetItemId:entry,description:"Frame material",estimatedNok:"1000"}]};
    const saved=await mutate("head",{action:"saveRequest",request}); await mutate("head",{action:"submitRequest",requestRecordId:saved.id,expectedRevision:saved.revision,request});
    const revision=(await pool.query<{id:string}>("select submitted_revision_id as id from finance.requests where id=$1::uuid",[saved.id])).rows[0].id;
    b=await write(b,"requestProjectBudgetChanges",{reason:"No material needed"});b=await write(b,"removeProjectBudgetEntry",{entryId:entry});b=await write(b,"submitProjectBudget");b=await write(b,"sendDepartmentBudgetPackage",{},"departmentLead");
    const ledger=await pool.connect(); await ledger.query("begin");await ledger.query("select id from finance.budgets where id=$1::uuid for update",[f.legacyBudget]);
    const promotion=write(b,"approveDepartmentBudgetPackage",{},"head").then(value=>({ok:true,value}),error=>({ok:false,error}));let decision:Promise<unknown>|undefined;
    try{await waitForBlocked("mutate_department_budget_package");decision=mutate("head",{action:"decideRequest",requestRecordId:saved.id,revisionId:revision,decision:"approved",reason:"Material approved",approvedOreByLine:{}}).then(value=>({ok:true,value}),error=>({ok:false,error}));await waitForBlocked("apply_request_change");
      await ledger.query("commit");expect(await promotion).toMatchObject({ok:true});expect(await decision).toMatchObject({ok:false,error:{status:409}});
      expect((await pool.query("select status from finance.requests where id=$1::uuid",[saved.id])).rows).toEqual([{status:"submitted"}]);expect((await pool.query("select id from finance.request_decisions where revision_id=$1::uuid",[revision])).rows).toEqual([]);
    }finally{await ledger.query("rollback");ledger.release();await Promise.allSettled([promotion,...(decision?[decision]:[])]);}
  },15000);
  it("validates saved request lines freshly after all anchor waits",async()=>{
    let b=await approved();const entry=b.approvedVersion!.entries[0].entryId;
    const request={supplierName:"Supplier",justification:"Materials for the frame",plannedDate:addCalendarDays(osloToday(),3),lines:[{budgetItemId:entry,description:"Frame material",estimatedNok:"1000"}]};
    const saved=await mutate("head",{action:"saveRequest",request});
    b=await write(b,"requestProjectBudgetChanges",{reason:"No material needed"});b=await write(b,"removeProjectBudgetEntry",{entryId:entry});b=await write(b,"submitProjectBudget");b=await write(b,"sendDepartmentBudgetPackage",{},"departmentLead");
    const ledger=await pool.connect();await ledger.query("begin");await ledger.query("select id from finance.budgets where id=$1::uuid for update",[f.legacyBudget]);
    const promotion=write(b,"approveDepartmentBudgetPackage",{},"head").then(value=>({ok:true,value}),error=>({ok:false,error}));let saving:Promise<unknown>|undefined;
    try{await waitForBlocked("mutate_department_budget_package");saving=mutate("head",{action:"saveRequest",requestRecordId:saved.id,expectedRevision:saved.revision,request:{...request,supplierName:"Changed supplier"}}).then(value=>({ok:true,value}),error=>({ok:false,error}));await waitForBlocked("apply_request_change");await ledger.query("commit");expect(await promotion).toMatchObject({ok:true});expect(await saving).toMatchObject({ok:false,error:{status:400}});
      expect((await pool.query("select status,supplier_name from finance.requests where id=$1::uuid",[saved.id])).rows).toEqual([{status:"draft",supplier_name:"Supplier"}]);
    }finally{await ledger.query("rollback");ledger.release();await Promise.allSettled([promotion,...(saving?[saving]:[])]);}
  },15000);
  it("fails migration on an unexpected owning clause and rolls back the new projection",async()=>{
    const client=await pool.connect();await client.query("begin");
    try{await client.query("drop view finance.department_actual_allocation; drop view finance.registered_allocation_facts");const altered=originalCore.replace("if current_budget.status <> 'approved' then","if current_budget.status is distinct from 'approved' then");expect(altered).not.toBe(originalCore);await client.query(altered);
      await expect(client.query(migration.replace(/^begin;\n/,"").replace(/commit;\s*$/,""))).rejects.toMatchObject({code:"P0001",message:"073 expected exactly one purchase eligibility clause 0; found 0"});
    }finally{await client.query("rollback");client.release();}
    expect((await pool.query("select count(*)::integer as count from finance.registered_allocation_facts")).rows[0].count).toBeGreaterThan(0);
  });
});
