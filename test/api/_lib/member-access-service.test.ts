import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createMemberAccessServices } from "../../../api/_lib/member-access-service.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";

const adminId = "10000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000001";
let pg: PGlite;
let db: CvDatabase;
let services: ReturnType<typeof createMemberAccessServices>;
let seededPlatformAdmin = false;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("create schema identity; create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text);");
  await pg.exec("create schema project_management; create table project_management.access(member_id uuid primary key,active boolean default true);");
  await pg.query("insert into identity.members values ($1, 'henrik-google', 'henrik.engdal@helixnmbu.no', 'Henrik Engdal')", [adminId]);
  await pg.exec(readFileSync(new URL("../../../db/migrations/009_platform_access_and_managed_positions.sql", import.meta.url), "utf8"));
  db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  seededPlatformAdmin = (await db.query<{ granted: boolean }>("select exists (select 1 from identity.member_roles where member_id = $1 and role_key = 'platform_administrator') as granted", [adminId])).rows[0]?.granted ?? false;
  services = createMemberAccessServices({
    db,
    authenticate: async (token) => token === "admin"
      ? { userId: adminId, googleSub: "admin-google", email: "admin@example.test", name: "Admin" }
      : { userId: memberId, googleSub: "member-google", email: "member@example.test", name: "Member" },
  });
});

beforeEach(async () => {
  await pg.exec("delete from identity.member_roles; delete from identity.member_departments; delete from identity.members;");
  await db.query("insert into identity.members values ($1, 'admin-google', 'admin@example.test', 'Admin'), ($2, 'member-google', 'member@example.test', 'Member')", [adminId, memberId]);
  await db.query("insert into identity.member_roles values ($1, 'platform_administrator', now())", [adminId]);
});

afterAll(async () => { await pg.close(); });

describe("member role and feature access", () => {
  it("seeds the requested platform administrator when their Neon member row exists", () => {
    expect(seededPlatformAdmin).toBe(true);
  });

  it("returns the assigned roles and resolved feature set", async () => {
    await db.query("insert into identity.member_departments (member_id, department_key) values ($1, 'electrical')", [memberId]);
    await db.query("insert into identity.member_roles (member_id, role_key) values ($1, 'team_member')", [memberId]);
    await expect(services.self("member")).resolves.toMatchObject({
      email: "member@example.test", departmentId: "electrical", roles: [{ key: "team_member", label: "Team Member" }], features: ["team.electrical"],
    });
  });

  it("limits the member directory and role writes to platform administrators", async () => {
    await expect(services.members("member")).rejects.toMatchObject({ status: 403 });
    await expect(services.save("member", memberId, "finance", ["project_manager"])).rejects.toMatchObject({ status: 403 });
    await expect(services.save("admin", adminId, null, [])).rejects.toMatchObject({ status: 403 });
    const directory = await services.members("admin");
    expect(directory.departments).toHaveLength(6);
    expect(directory.roles.map((role) => role.key)).toEqual(["project_manager", "department_lead", "team_member", "platform_administrator"]);
  });

  it("saves multiple roles and resolves department-specific access", async () => {
    await services.save("admin", memberId, "software-autonomous", ["team_member", "project_manager"]);
    await expect(services.self("member")).resolves.toMatchObject({
      departmentId: "software-autonomous",
      roles: [{ key: "project_manager", label: "Project Manager" }, { key: "team_member", label: "Team Member" }],
      features: ["team.software-autonomous", "recruitment.manage"],
    });
  });

  it("allows an administrator to assign Financials alongside the other roles", async () => {
    await db.query("insert into identity.platform_roles (role_key, label, sort_order) values ('financials', 'Financials', 5) on conflict do nothing");
    try {
      await services.save("admin", memberId, "finance", ["team_member", "project_manager", "department_lead", "platform_administrator", "financials"]);
      const directory = await services.members("admin");
      expect(directory.roles).toContainEqual({ key: "financials", label: "Financials" });
      expect(directory.members.find((member) => member.id === memberId)?.roleKeys).toContain("financials");
    } finally {
      await db.query("delete from identity.member_roles where role_key = 'financials'");
      await db.query("delete from identity.platform_roles where role_key = 'financials'");
    }
  });
});
