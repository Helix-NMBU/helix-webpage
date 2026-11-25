import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import phases from "../src/features/ProjectManagement/s27-schedule.json";

const manager = { userId: "10000000-0000-4000-8000-000000000005", googleSub: "test-manager", email: "timeline-manager@helixnmbu.no", name: "Test Manager" };
const viewer = { userId: "10000000-0000-4000-8000-000000000006", googleSub: "test-viewer", email: "timeline-viewer@helixnmbu.no", name: "Test Viewer" };
const recruitmentId = "a6a4c222-189a-4641-9aa3-54d079e7c82f";

it("authorizes season schedule edits and preserves projects when milestones are backfilled", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema neon_auth;
      create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean,"createdAt" timestamptz default now(),"updatedAt" timestamptz default now());
      create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"idToken" text,"createdAt" timestamptz default now(),"updatedAt" timestamptz default now());`);
    const path = new URL("../db/migrations/", import.meta.url);
    for (const filename of readdirSync(path).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort()) {
      await db.exec(readFileSync(new URL(filename, path), "utf8"));
    }
    for (const user of [manager, viewer]) {
      await db.query('insert into neon_auth."user"(id,email,"emailVerified",banned) values($1,$2,true,false)', [user.userId, user.email]);
      await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)', [user.googleSub, user.userId]);
      await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)", [user.userId, user.googleSub, user.email, user.name]);
    }
    await db.query("insert into identity.member_roles(member_id,role_key) values($1,'platform_administrator')", [manager.userId]);
    await db.exec(`insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('S27','Season 2027','2026-08-01','2027-07-31','planning','${manager.userId}','${manager.userId}') on conflict(code) do nothing;
      insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S27"','Test season','${manager.userId}') on conflict(setting_key) do update set setting_value=excluded.setting_value;`);
    await db.query("insert into project_management.season_schedules(season_code,phases) values('S27',$1::jsonb)", [JSON.stringify(phases)]);
    const asMember = (identity: typeof manager) => createProjectServices({ db, authenticate: async () => identity });
    const request = { action: "save_season_schedule", season: "S27", expectedRevision: 1, phases };

    const moved = phases.map(phase => phase.id === "construction" ? { ...phase, endDate: "2027-05-06" } : phase.id === "test" ? { ...phase, startDate: "2027-05-06" } : phase);
    await expect(asMember(viewer).mutate("verified", request)).rejects.toMatchObject({ status: 403 });
    await expect(asMember(manager).mutate("verified", { ...request, phases: moved })).resolves.toMatchObject({ seasonSchedule: { revision: 2, phases: moved } });
    await expect(asMember(manager).mutate("verified", request)).rejects.toMatchObject({ status: 409 });
    await expect(asMember(manager).mutate("verified", { ...request, expectedRevision: 2, phases: moved.map(phase => phase.id === "test" ? { ...phase, startDate: "2027-05-07" } : phase) })).rejects.toMatchObject({ status: 400 });

    const seed = readFileSync(new URL("../db/seeds/s27-verified-season-milestones.sql", import.meta.url), "utf8");
    const ids = [...new Set([...seed.matchAll(/'([a-f0-9-]{36})'::uuid/g)].map(match => match[1]))].filter(id => id !== recruitmentId);
    for (const projectId of ids) {
      await db.query("insert into project_management.projects(id,season,name,category,departments,lead_ids) values($1,'S27',$2,'operations',array['Management'],array[$3::uuid])", [projectId, projectId, manager.userId]);
    }
    const existingProjects = "select * from project_management.projects where id<>$1 order by id";
    const before = await db.query(existingProjects, [recruitmentId]);
    await db.exec(seed);
    await db.exec(seed);
    expect((await db.query(existingProjects, [recruitmentId])).rows).toEqual(before.rows);
    expect((await db.query("select status,count(*)::int as count from project_management.tasks where kind='milestone' group by status order by status")).rows)
      .toEqual([{ status: "done", count: 21 }, { status: "todo", count: 1 }]);
  } finally { await db.close(); }
}, 30000);
