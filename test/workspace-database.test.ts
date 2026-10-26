import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkspaceServices } from "../api/_lib/workspace-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";
import type {
  MemberChange,
  WorkspaceDirectory,
} from "../src/features/Workspace/types.js";
const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const people = [
  ["henrik.engdal", "Admin"],
  ["manager", "Manager"],
  ["member", "Member"],
  ["lead", "Lead"],
  ["other", "Other"],
] as const;
const identities: WorkspaceIdentity[] = people.map(([email, name], i) => ({
  userId: id(i + 1),
  googleSub: `google-${i}`,
  email: `${email}@helixnmbu.no`,
  name,
}));
let db: PGlite;
const service = (n = 0) =>
  createWorkspaceServices({ db, authenticate: async () => identities[n] });
const migration = (name: string) =>
  readFileSync(
    new URL(`../db/migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
const project = (departments = ["Mechanical & Production"]) => ({
  action: "save_project",
  id: id(100),
  expectedRevision: 0,
  project: {
    name: "Suspension",
    description: "Build and test",
    category: "production",
    departments,
    deadline: "2026-12-01",
    priority: "high",
    leadIds: [id(4)],
  },
});
const change = (data: WorkspaceDirectory, index = 2): MemberChange => ({
  action: "save_member",
  id: identities[index].userId,
  expectedRevision: data.members.find((m) => m.id === identities[index].userId)!
    .revision,
  name: "Updated member",
  helixRole: "Engineer",
  departments: data.departments.map((d) => ({
    id: d.id,
    revision: d.revision,
    member: d.memberIds.includes(identities[index].userId),
    lead: d.leadId === identities[index].userId,
  })),
});
describe("Workspace directory authorization and persistence", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());`,
    );
    for (const name of [
      "001_member_cv",
      "002_member_helix_role",
      "009_project_management",
      "010_department_lead_tasks",
      "011_task_assignees",
      "012_project_milestones",
      "013_project_hierarchy",
      "014_milestone_field_updates",
      "015_project_departments",
      "016_fixed_departments",
      "017_workspace_directory",
    ])
      await db.exec(migration(name));
    for (const person of identities) {
      await db.query(
        'insert into neon_auth."user" values($1,$2,$3,true,false)',
        [person.userId, person.name, person.email],
      );
      await db.query(
        'insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',
        [person.googleSub, person.userId],
      );
      await db.query(
        "insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)",
        [person.userId, person.googleSub, person.email, person.name],
      );
    }
    await db.query(
      "insert into project_management.access(member_id,active,can_manage) values($1,true,true),($2,true,false)",
      [id(2), id(3)],
    );
    await db.query(
      "insert into project_management.department_members(department_id,member_id,is_lead) select id,$1,true from project_management.departments where name='Mechanical & Production'",
      [id(4)],
    );
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("lets any verified platform member see the directory without a project grant", async () => {
    const data = await service(4).load("verified");
    expect(data.members).toHaveLength(5);
    expect(data.departments).toHaveLength(7);
    expect(data).toMatchObject({
      canAdmin: false,
      canManageProjects: false,
      projectAccess: false,
    });
    expect(data.members.find((m) => m.id === id(5))?.lastSeenAt).not.toBeNull();
    expect(JSON.stringify(data)).not.toMatch(
      /@helixnmbu|google-|auth_user_id|cv_path/,
    );
    await db.query('update neon_auth."user" set banned=true where id=$1', [
      id(5),
    ]);
    expect(
      (await service().load("verified")).members.map((m) => m.id),
    ).not.toContain(id(5));
    await expect(service(4).load("verified")).rejects.toMatchObject({status:403});
    await db.query('update neon_auth."user" set banned=false where id=$1', [id(5)]);
  });
  it("limits member edits to the platform admin even for project managers", async () => {
    const input = change(await service().load("verified"));
    await expect(service(1).mutate("verified", input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service(2).mutate("verified", input)).rejects.toMatchObject({
      status: 403,
    });
    const saved = await service().mutate("verified", input);
    expect(saved.members.find((m) => m.id === input.id)).toMatchObject({
      name: "Updated member",
      helixRole: "Engineer",
      revision: 2,
      role: "Member",
    });
    await expect(
      service().mutate("verified", { ...input, name: "Stale" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("persists membership and Lead assignments atomically, without granting project module access", async () => {
    const data = await service().load("verified");
    const input = change(data, 4);
    const electronic = data.departments.find((d) => d.name === "Electronics")!;
    input.departments = input.departments.map((d) =>
      d.id === electronic.id ? { ...d, member: true, lead: true } : d,
    );
    const saved = await service().mutate("verified", input);
    expect(saved.departments.find((d) => d.id === electronic.id)).toMatchObject(
      { memberIds: [id(5)], leadId: id(5), revision: electronic.revision + 1 },
    );
    expect((await service(4).load("verified")).projectAccess).toBe(false);
    const conflict = change(saved, 2);
    conflict.departments = conflict.departments.map((d) =>
      d.id === electronic.id ? { ...d, member: true, lead: true } : d,
    );
    await expect(service().mutate("verified", conflict)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await service().load("verified")).members.find((m) => m.id === id(3))
        ?.revision,
    ).toBe(2);
    await expect(
      service().mutate("verified", { ...input, expectedRevision: 2 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("allows project managers and department Leads to create projects and keeps others read-only", async () => {
    await expect(
      service(2).mutate("verified", project()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service(0).mutate("verified", project()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service(3).mutate("verified", project(["Finance"])),
    ).rejects.toMatchObject({ status: 403 });
    const saved = await service(3).mutate("verified", project());
    expect(saved.projects.find((p) => p.id === id(100))).toMatchObject({
      priority: "high",
      leadIds: [id(4)],
      total: 0,
      done: 0,
    });
    await service(1).mutate("verified", {
      ...project(["Finance"]),
      id: id(101),
    });
    await expect(
      service(3).mutate("verified", {
        ...project(),
        id: id(101),
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service(3).mutate("verified", { ...project(), expectedRevision: 2 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service(1).mutate("verified", {
        ...project(),
        id: id(102),
        project: { ...project().project, leadIds: [id(999)] },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("does not restore a revoked manager grant through department Lead access", async () => {
    await db.query(
      "update project_management.access set active=false where member_id=$1",
      [id(2)],
    );
    await db.query(
      "insert into project_management.department_members select id,$1,true from project_management.departments where name='Logistics'",
      [id(2)],
    );
    await expect(
      service(1).mutate("verified", { ...project(["Finance"]), id: id(103) }),
    ).rejects.toMatchObject({ status: 403 });
    await service(1).mutate("verified", {
      ...project(["Logistics"]),
      id: id(103),
    });
  });
  it("keeps department members without project grants editable by project managers", async () => {
    await db.query(
      "update project_management.access set active=true where member_id=$1",
      [id(2)],
    );
    const data = await service().load("verified");
    const electronic = data.departments.find((d) => d.name === "Electronics")!;
    await db.query(
      "select project_management.save_department($1,$2,$3,$4::jsonb)",
      [
        id(2),
        identities[1].googleSub,
        identities[1].email,
        JSON.stringify({
          action: "save_department",
          id: electronic.id,
          expectedRevision: electronic.revision,
          department: {
            name: electronic.name,
            memberIds: electronic.memberIds,
            leadId: electronic.leadId,
          },
        }),
      ],
    );
    expect(
      (await service().load("verified")).departments.find(
        (d) => d.id === electronic.id,
      )?.leadId,
    ).toBe(id(5));
    expect((await service(4).load("verified")).projectAccess).toBe(false);
  });
  it("calculates project progress from non-cancelled tasks rather than milestones", async () => {
    await db.query(
      "insert into project_management.tasks(id,season,title,category,project_id,deadline,kind,status,priority) values($1,'S27','Build complete','production',$2,'2026-12-01','milestone','todo','normal')",
      [id(200), id(100)],
    );
    for (const [number, status] of [
      [201, "done"],
      [202, "todo"],
      [203, "cancelled"],
    ] as const)
      await db.query(
        "insert into project_management.tasks(id,season,title,category,project_id,milestone_id,status,kind,priority,completed_at) values($1,'S27','Build task','production',$2,$3,$4,'task','normal',case when $4='done' then now() else null end)",
        [id(number), id(100), id(200), status],
      );
    expect(
      (await service(2).load("verified")).projects.find(
        (p) => p.id === id(100),
      ),
    ).toMatchObject({
      total: 2,
      done: 1,
      milestones: [expect.objectContaining({ title: "Build complete" })],
    });
  });
  it("reapplies safely without losing directory details or project metadata", async () => {
    await db.exec(migration("017_workspace_directory"));
    const data = await service().load("verified");
    expect(data.members.find((m) => m.id === id(3))?.helixRole).toBe(
      "Engineer",
    );
    expect(data.projects.find((p) => p.id === id(100))?.leadIds).toEqual([
      id(4),
    ]);
    expect(
      (
        await db.query(
          "select has_function_privilege('public','identity.save_workspace_member(uuid,text,text,jsonb)','EXECUTE') as allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
  });
});
