import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {it,expect} from "vitest";
import {createFinanceServices} from "../../../api/_lib/finance-service.js";
import {setupProjectBudgetBase,seedProjectBudgetLegacy,projectBudgetFixture as f,projectBudgetIdentity,type ProjectBudgetTestDatabase,type ProjectBudgetFixtureRole} from "./project-budget-test-db.js";
it("requires a genuine new department send for pre074 Finance-pending versions and preserves their real prior decision",async()=>{
 const pg=new PGlite(),db:ProjectBudgetTestDatabase={exec:sql=>pg.exec(sql),query:async<T>(sql:string,params?:unknown[])=>({rows:(await pg.query<T>(sql,params)).rows})};
 try{
  await setupProjectBudgetBase(db);await seedProjectBudgetLegacy(db);const directory=new URL("../../../db/migrations/",import.meta.url);for(const name of readdirSync(directory).filter(name=>/^0(6[6-9]|7[0-3])_.*\.sql$/.test(name)).sort())await db.exec(readFileSync(new URL(name,directory),"utf8"));
  const services=createFinanceServices({db,authenticate:async role=>projectBudgetIdentity(role as ProjectBudgetFixtureRole)}),mutate=(role:ProjectBudgetFixtureRole,body:Record<string,unknown>)=>services.mutate(role,{requestId:randomUUID(),...body});
  const created=await mutate("lead",{action:"createProjectBudget",projectId:f.project,responsibleDepartmentId:f.department});let budget=await services.projectBudget("lead",created.id!);
  for(const [role,action,fields] of[["lead","saveProjectBudgetEntry",{entry:{systemId:f.system,description:"Pre074 submitted material",category:"material",plannedNok:"100",ordinaryPriority:"P2",reuseStatus:"new",status:"planned"}}],["lead","submitProjectBudget",{}],["departmentLead","approveDepartmentBudget",{}]] as const){await mutate(role,{action,projectBudgetId:budget.id,expectedRevision:budget.revision,...fields});budget=await services.projectBudget("lead",budget.id);}
  const candidate=budget.pendingVersionId!,prior=(await db.query<{id:string;record:Record<string,unknown>}>("select id,to_jsonb(decision) as record from finance.project_budget_decisions decision where project_budget_id=$1::uuid and action='approveDepartmentBudget'",[budget.id])).rows[0];expect(prior.record.actor_member_id).toBe(f.departmentLead);
  await db.exec(readFileSync(new URL("074_department_budget_packages.sql",directory),"utf8"));expect((await db.query("select id from finance.department_budget_packages")).rows).toEqual([]);expect((await services.projectBudget("lead",budget.id)).pendingVersionId).toBe(candidate);
  await expect(mutate("head",{action:"approveProjectBudget",projectBudgetId:budget.id,expectedRevision:budget.revision})).rejects.toMatchObject({status:400});
  const preview=await services.departmentBudgetPreview("departmentLead",f.department);expect(preview.projects.find(project=>project.projectBudgetId===budget.id)).toMatchObject({readiness:"finance_pending",included:true,proposedVersion:{id:candidate}});
  const sent=await mutate("departmentLead",{action:"sendDepartmentBudgetPackage",departmentId:f.department,previewToken:preview.previewToken});const packet=await services.departmentBudgetPackage("head",sent.id!);expect(packet.submittedBy).toBe(f.departmentLead);expect(packet.decisions).toHaveLength(1);expect((await db.query<{record:Record<string,unknown>}>("select to_jsonb(decision) as record from finance.project_budget_decisions decision where id=$1::uuid",[prior.id])).rows[0].record).toEqual(prior.record);
  await mutate("head",{action:"approveDepartmentBudgetPackage",packageId:packet.id,expectedRevision:packet.revision});expect((await services.projectBudget("lead",budget.id)).approvedVersionId).toBe(candidate);
 }finally{await pg.close();}
},30000);
