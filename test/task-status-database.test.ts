import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";
import type { TaskInput, TaskStatus } from "../src/features/ProjectManagement/types.js";
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identities: WorkspaceIdentity[] = ["Manager", "Lead", "Assignee", "Reader"].map(
  (name, index) => ({
    userId: id(index + 1),
    googleSub: `status-${index}`,
    email: `status-${index}@helixnmbu.no`,
    name,
  }),
);
const migration = (name: string) =>
  readFileSync(new URL(`../db/migrations/${name}.sql`, import.meta.url), "utf8");
let db: PGlite;
const service = (actor = 1) =>
  createProjectServices({ db, authenticate: async () => identities[actor] });
const input = (status: TaskStatus = "todo"): TaskInput => ({
  title: "Review assembly",
  description: "Review drawings",
  category: "production",
  projectId: id(100),
  milestoneId: id(101),
  kind: "task",
  assigneeIds: [id(3)],
  deadline: "2026-11-30",
  startDate: null,
  priority: "normal",
  status,
  blockedReason: "",
  partnerName: "",
});
async function create(number: number, status: TaskStatus = "todo") {
  return service().mutate("verified", {
    action: "save_task",
    id: id(number),
    expectedRevision: 0,
    task: input(status),
  });
}

describe("task workflow persistence", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      'create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());',
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
      "020_project_start_dates",
      "021_project_creation_milestones",
    ])
      await db.exec(migration(name));
    for (const [index, person] of identities.entries()) {
      await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [
        person.userId,
        person.name,
        person.email,
      ]);
      await db.query(
        'insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)',
        [person.googleSub, person.userId],
      );
      await db.query(
        "insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)",
        [person.userId, person.googleSub, person.email, person.name],
      );
      await db.query(
        "insert into project_management.access(member_id,active,can_manage,task_lead_categories) values($1,true,$2,$3)",
        [person.userId, index === 0, index === 1 ? ["production"] : []],
      );
    }
    await service(0).mutate("verified", {
      action: "save_project",
      id: id(100),
      expectedRevision: 0,
      project: {
        name: "Workflow project",
        description: "",
        category: "production",
        departments: ["Mechanical & Production"],
        deadline: "2026-11-30",
      },
    });
    await service().mutate("verified", {
      action: "save_task",
      id: id(101),
      expectedRevision: 0,
      task: { ...input(), kind: "milestone", milestoneId: null, title: "Assembly ready" },
    });
    await create(102, "cancelled");
    await db.exec(migration("022_task_backlog_status"));
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("persists all five statuses through an assigned member and records completion transitions", async () => {
    let workspace = await create(200, "backlog");
    expect(workspace.tasks.find((t) => t.id === id(200))?.status).toBe("backlog");
    for (const [index, status] of (
      ["todo", "in_progress", "done", "blocked", "backlog"] as const
    ).entries()) {
      workspace = await service(2).mutate("verified", {
        action: "set_status",
        id: id(200),
        expectedRevision: index + 1,
        status,
        blockedReason: status === "blocked" ? "Waiting for approval" : "",
      });
      const task = workspace.tasks.find((t) => t.id === id(200))!;
      expect(task.status).toBe(status);
      expect(task.revision).toBe(index + 2);
      expect(Boolean(task.completedAt)).toBe(status === "done");
    }
    expect(
      workspace.progressEvents.filter((e) => e.taskId === id(200)).map((e) => e.status),
    ).toEqual(["backlog", "todo", "in_progress", "done", "blocked", "backlog"]);
  });
  it("retains authorization, stale-revision checks and required blocked reasons", async () => {
    await create(201, "backlog");
    const change = {
      action: "set_status",
      id: id(201),
      expectedRevision: 1,
      status: "done",
      blockedReason: "",
    };
    await expect(service(3).mutate("verified", change)).rejects.toMatchObject({ status: 403 });
    await expect(
      service(2).mutate("verified", { ...change, expectedRevision: 99 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service(2).mutate("verified", { ...change, status: "blocked" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service(0).mutate("verified", {
        action: "save_task",
        id: id(202),
        expectedRevision: 0,
        task: input("backlog"),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await service().load("verified")).tasks.find((t) => t.id === id(201))).toMatchObject({
      status: "backlog",
      revision: 1,
    });
  });
  it("preserves legacy cancelled records and observed history when reapplied", async () => {
    const before = await service().load("verified");
    await db.exec(migration("022_task_backlog_status"));
    const after = await service().load("verified");
    expect(after.tasks).toEqual(before.tasks);
    expect(after.progressEvents).toEqual(before.progressEvents);
    expect(after.tasks.find((t) => t.id === id(102))?.status).toBe("cancelled");
    await expect(
      db.query("update project_management.tasks set status='in_review' where id=$1", [id(200)]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
