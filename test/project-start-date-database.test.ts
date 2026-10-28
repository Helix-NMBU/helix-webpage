import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkspaceServices } from "../api/_lib/workspace-service.js";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const identities: WorkspaceIdentity[] = ["manager", "lead", "reader"].map((name,index)=>({ userId:id(index+1), googleSub:`start-${index}`, email:`${name}@helixnmbu.no`, name }));
const migration = (name: string) => readFileSync(new URL(`../db/migrations/${name}.sql`,import.meta.url),"utf8");
let db: PGlite;
const service = (actor=0) => createWorkspaceServices({ db, authenticate:async()=>identities[actor] });
const project = (number: number) => ({ action:"save_project", id:id(number), expectedRevision:0, project:{ name:"Scheduled project", description:"Build and inspect", category:"production", departments:["Mechanical & Production"], startDate:"2026-10-01", deadline:"2026-12-01", priority:"normal", leadIds:[id(2)] } });

describe("project start dates in Postgres",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec('create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());');
    for(const name of ["001_member_cv","002_member_helix_role","009_platform_access_and_managed_positions","009_project_management","010_department_lead_tasks","011_task_assignees","012_project_milestones","013_project_hierarchy","014_milestone_field_updates","015_project_departments","016_fixed_departments","017_workspace_directory"]) await db.exec(migration(name));
    await db.query("insert into project_management.projects(id,season,name,category,deadline) values($1,'S27','Legacy project','production','2026-12-01')",[id(90)]);
    await db.exec(migration("020_project_start_dates"));
    await db.exec(migration("021_project_creation_milestones"));
    for (const name of ["018_department_homes","019_department_settings_permissions","025_workspace_space_access","026_department_access_levels","028_member_preferences"]) await db.exec(migration(name));
    for(const person of identities){
      await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)',[person.userId,person.name,person.email]);
      await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',[person.googleSub,person.userId]);
      await db.query('insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)',[person.userId,person.googleSub,person.email,person.name]);
    }
    await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')",[id(1)]);
    await db.query('insert into project_management.access(member_id,active,can_manage) values($1,true,true)',[id(1)]);
    await db.query("insert into project_management.department_members(department_id,member_id,is_lead) select id,$1,true from project_management.departments where name='Mechanical & Production'",[id(2)]);
  },60000);
  afterAll(async()=>{await db?.close();});

  it("leaves legacy starts empty and persists dates through both authenticated reads",async()=>{
    expect((await service().load("verified")).projects.find(item=>item.id===id(90))?.startDate).toBeNull();
    const result=await service().mutate("verified",project(100));
    expect(result.projects.find(item=>item.id===id(100))).toMatchObject({ startDate:"2026-10-01",deadline:"2026-12-01" });
    const tasks=await createProjectServices({db,authenticate:async()=>identities[0]}).load("verified");
    expect(tasks.projects.find(item=>item.id===id(100))?.startDate).toBe("2026-10-01");
  });
  it("lets a department Lead update, preserve an omitted start, and explicitly clear it",async()=>{
    const input=project(101);await service(1).mutate("verified",input);
    await service(1).mutate("verified",{...input,expectedRevision:1,project:{...input.project,startDate:"2026-10-05"}});
    const { startDate: omitted, ...legacy }=input.project;void omitted;
    const kept=await service(1).mutate("verified",{...input,expectedRevision:2,project:{...legacy,deadline:"2026-12-02"}});
    expect(kept.projects.find(item=>item.id===input.id)?.startDate).toBe("2026-10-05");
    const cleared=await service(1).mutate("verified",{...input,expectedRevision:3,project:{...input.project,startDate:null}});
    expect(cleared.projects.find(item=>item.id===input.id)?.startDate).toBeNull();
  });
  it("rejects reversed and invalid dates at the API and database boundaries",async()=>{
    const input=project(102);
    for(const startDate of ["2026-12-02","2026-02-30","1999-01-01","2101-01-01",5]) await expect(service().mutate("verified",{...input,project:{...input.project,startDate}})).rejects.toMatchObject({status:400});
    const manager=identities[0];
    await expect(db.query('select project_management.mutate($1,$2,$3,$4::jsonb)',[manager.userId,manager.googleSub,manager.email,JSON.stringify({...input,project:{...input.project,startDate:"2026-12-02"}})])).rejects.toMatchObject({code:"23514"});
    await service().mutate("verified",input);
    await expect(db.query("update project_management.projects set deadline='2026-09-30' where id=$1",[input.id])).rejects.toMatchObject({code:"23514"});
    expect((await service().load("verified")).projects.find(item=>item.id===input.id)?.deadline).toBe("2026-12-01");
  });
  it("preserves scoped authorization and revision conflicts",async()=>{
    await expect(service(2).mutate("verified",project(103))).rejects.toMatchObject({status:403});
    await expect(service(1).mutate("verified",{...project(103),project:{...project(103).project,departments:["Finance"]}})).rejects.toMatchObject({status:403});
    await expect(service().mutate("verified",{...project(100),expectedRevision:99})).rejects.toMatchObject({status:409});
  });
  it("atomically creates initial milestones with scoped Lead authorization",async()=>{
    await db.query("insert into project_management.access(member_id,active,can_manage,task_lead_categories) values($1,true,false,array['production'])",[id(2)]);
    const input={...project(110),milestones:[{id:id(210),title:"Design ready",description:"Reviewed drawings",deadline:"2026-11-01",partnerName:""},{id:id(211),title:"Assembly ready",description:"",deadline:"2026-12-01",partnerName:""}]};
    const result=await service(1).mutate("verified",input);
    expect(result.taskLeadCategories).toEqual(["production"]);
    expect(result.projects.find(p=>p.id===input.id)?.milestones.map(m=>m.title)).toEqual(["Design ready","Assembly ready"]);
    const tasks=await createProjectServices({db,authenticate:async()=>identities[1]}).load("verified");
    expect(tasks.tasks.filter(t=>t.projectId===input.id)).toEqual(expect.arrayContaining([expect.objectContaining({id:id(210),kind:"milestone",projectId:input.id,status:"todo",assigneeIds:[]})]));
    expect(tasks.progressEvents.filter(e=>e.taskId===id(210))).toHaveLength(1);
    // Both API paths use the same atomic function.
    const other=await createProjectServices({db,authenticate:async()=>identities[1]}).mutate("verified",{...input,id:id(111),milestones:[{...input.milestones[0],id:id(212)}]});
    expect(other.tasks.find(t=>t.id===id(212))?.projectId).toBe(id(111));
  });
  it("rolls back the project and earlier milestones when a later child conflicts",async()=>{
    const input={...project(112),milestones:[{id:id(213),title:"First draft",description:"",deadline:"2026-11-01",partnerName:""},{id:id(210),title:"Conflicting draft",description:"",deadline:"2026-11-02",partnerName:""}]};
    await expect(service(1).mutate("verified",input)).rejects.toMatchObject({status:409});
    expect((await db.query('select id from project_management.projects where id=$1',[input.id])).rows).toHaveLength(0);
    expect((await db.query('select id from project_management.tasks where id=$1',[id(213)])).rows).toHaveLength(0);
    expect((await db.query('select task_id from project_management.task_progress_events where task_id=$1',[id(213)])).rows).toHaveLength(0);
  });
  it("gives project managers full milestone creation rights and rejects batch edits",async()=>{
    const input={...project(113),milestones:[{id:id(214),title:"Unauthorized",description:"",deadline:"2026-11-01",partnerName:""}]};
    const saved = await service().mutate("verified",input);
    expect(saved.projects.some(p=>p.id===input.id)).toBe(true);
    await expect(service(2).mutate("verified",input)).rejects.toMatchObject({status:403});
    await expect(service(1).mutate("verified",{...input,expectedRevision:1})).rejects.toMatchObject({status:400});
  });
  it("rejects malformed initial milestones at both API and SQL boundaries",async()=>{
    const input={...project(114),milestones:[{id:id(215),title:"Ready",description:"",deadline:"2026-11-01",partnerName:""}]};
    for(const patch of [{deadline:null},{deadline:"2026-02-30"},{title:""},{kind:"task"},{assigneeIds:[id(1)]},{id:"invalid"}]){
      await expect(service(1).mutate("verified",{...input,milestones:[{...input.milestones[0],...patch}]})).rejects.toMatchObject({status:400});
      const actor=identities[1];
      await expect(db.query('select project_management.create_project_with_milestones($1,$2,$3,$4::jsonb)',[actor.userId,actor.googleSub,actor.email,JSON.stringify({...input,milestones:[{...input.milestones[0],...patch}]})])).rejects.toThrow();
      expect((await service().load("verified")).projects.some(p=>p.id===input.id)).toBe(false);
    }
    await expect(service(1).mutate("verified",{...input,milestones:[input.milestones[0],input.milestones[0]]})).rejects.toMatchObject({status:400});
    await expect(service(1).mutate("verified",{...input,milestones:Array(21).fill(input.milestones[0])})).rejects.toMatchObject({status:400});
  });
  it("is safe to reapply without changing dates or revisions",async()=>{
    const before=(await service().load("verified")).projects;
    await db.exec(migration("020_project_start_dates"));
    await db.exec(migration("021_project_creation_milestones"));
    expect((await service().load("verified")).projects).toEqual(before);
  });
});
