import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { createWorkspaceServices } from "../api/_lib/workspace-service.js";

it("upgrades an existing member database through the complete migration chain and loads its workspace", async () => {
  const db = new PGlite();
  const memberId = "10000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create schema neon_auth;
      create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean,"createdAt" timestamptz default now(),"updatedAt" timestamptz default now());
      create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"idToken" text,"createdAt" timestamptz default now(),"updatedAt" timestamptz default now());
      insert into neon_auth."user"(id,name,email,"emailVerified",banned) values('${memberId}','Existing Member','existing@helixnmbu.no',true,false);
      insert into neon_auth.account("accountId","providerId","userId") values('existing-google','google','${memberId}');`);
    const path = new URL("../db/migrations/", import.meta.url);
    const files = readdirSync(path).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
    for (const file of files) {
      if (file === "033_project_status.sql") await db.exec(`
        insert into project_management.projects(id,season,name,category,lead_ids) values('20000000-0000-4000-8000-000000000001','S27','Existing project','production',array['${memberId}'::uuid]);
        insert into project_management.tasks(id,season,title,category,project_id,deadline,status,priority,kind) values('20000000-0000-4000-8000-000000000002','S27','Existing milestone','production','20000000-0000-4000-8000-000000000001','2026-12-01','todo','normal','milestone');
        insert into project_management.tasks(id,season,title,category,project_id,milestone_id,status,priority,kind,blocked_reason) values('20000000-0000-4000-8000-000000000003','S27','Existing task','production','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','blocked','normal','task','Waiting');`);
      await db.exec(readFileSync(new URL(file, path), "utf8"));
      if (file === "002_member_helix_role.sql") await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,'existing-google','existing@helixnmbu.no','Existing Member')", [memberId]);
      if (file === "033_project_status.sql") {
        const readStatus = async () => (await db.query<{ status: string }>("select status from project_management.projects where id='20000000-0000-4000-8000-000000000001'")).rows[0].status;
        expect(await readStatus()).toBe("blocked");
        await db.exec("update project_management.projects set status='done' where id='20000000-0000-4000-8000-000000000001'");
        await db.exec(readFileSync(new URL(file, path), "utf8"));
        expect(await readStatus()).toBe("done");
        await db.exec("delete from project_management.tasks where project_id='20000000-0000-4000-8000-000000000001'; delete from project_management.projects where id='20000000-0000-4000-8000-000000000001'");
      }
    }
    const workspace = await createWorkspaceServices({ db, authenticate: async () => ({ userId: memberId, googleSub: "existing-google", email: "existing@helixnmbu.no", name: "Existing Member" }) }).load("verified");
    expect(workspace.members).toEqual([expect.objectContaining({ id: memberId, name: "Existing Member" })]);
    expect(workspace.departments).toHaveLength(7);
    expect(workspace.projects).toEqual([]);
    expect(workspace.canAdmin).toBe(false);
  } finally { await db.close(); }
}, 60000);
