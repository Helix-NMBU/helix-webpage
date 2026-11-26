import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVehicleCatalogServices } from "../api/_lib/vehicle-catalog-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";

const id = (value: number) => `17000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const manager = { userId: id(1), googleSub: "manager", email: "manager@helixnmbu.no", name: "Manager" };
const committeeMember = { userId: id(2), googleSub: "committee", email: "committee@helixnmbu.no", name: "Committee" };
const viewer = { userId: id(3), googleSub: "viewer", email: "viewer@helixnmbu.no", name: "Viewer" };
const migrations = (file: string) => readFileSync(new URL(`../db/migrations/${file}.sql`, import.meta.url), "utf8");
const bom = JSON.parse(readFileSync(new URL("../src/features/VehicleCatalog/s27.json", import.meta.url), "utf8")) as {
  assignments: Array<{ id: string; name: string; component: string }>;
  systems: Array<{ code: string; name: string; subsystems: [string, string][] }>;
};
const [legacySystems, legacyLinks] = ["catalog", "assignments"].map(label => JSON.parse(migrations("069_s27_vehicle_catalog").split(`$${label}$`)[1]));
const seed = {
  systems: legacySystems as typeof bom.systems,
  assignments: bom.assignments.map(project => ({ ...project, component: (legacyLinks as Array<{ id: string; component: string }>).find(link => link.id === project.id)!.component })),
};
let db: PGlite;

function services(identity: WorkspaceIdentity = manager) {
  return createVehicleCatalogServices({ db, authenticate: async () => identity });
}

describe("vehicle catalog and project access", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema neon_auth;
      create table neon_auth."user" (id uuid primary key,email text,"emailVerified" boolean,banned boolean);
      create table neon_auth.account ("accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id));
      create schema finance;
      create table finance.settings (setting_key text primary key,setting_value jsonb);
      create table finance.seasons (code text primary key,status text);
      insert into finance.settings values ('current_season','"S27"');
      insert into finance.seasons values ('S27','active'),('S28','planning');
    `);
    for (const migration of ["001_member_cv", "009_project_management", "012_project_milestones", "013_project_hierarchy", "015_project_departments", "022_task_backlog_status", "033_project_status"]) {
      await db.exec(migrations(migration));
    }
    // Current role and season inputs from the workspace migrations.
    await db.exec(`
      create table identity.member_roles(member_id uuid,role_key text);
      alter table project_management.department_members add column access_level text;
      alter table project_management.projects drop constraint projects_season_check;
      alter table project_management.projects add constraint projects_season_check check (season ~ '^S[0-9]{2}$');
      create function project_management.is_department_manager(actor uuid) returns boolean language sql stable as
        'select exists(select 1 from identity.member_roles where member_id=actor and role_key in (''project_manager'',''platform_administrator''))';
      create function project_management.current_season() returns text language sql stable as
        'select setting_value #>> ''{}'' from finance.settings where setting_key=''current_season''';
      create function project_management.can_access_project(actor uuid, department_names text[], managing boolean default false)
      returns boolean language sql stable as $fn$
        select project_management.is_department_manager(actor) or exists(
          select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id
          where dm.member_id=actor and d.season=project_management.current_season() and d.name=any(department_names)
            and (not managing or dm.access_level='lead')
        )
      $fn$;
    `);
    for (const identity of [manager, committeeMember, viewer]) {
      await db.query('insert into neon_auth."user" values($1,$2,true,false)', [identity.userId, identity.email]);
      await db.query("insert into neon_auth.account values($1,'google',$2)", [identity.googleSub, identity.userId]);
      await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)", [identity.userId, identity.googleSub, identity.email, identity.name]);
    }
    await db.query("insert into identity.member_roles values($1,'project_manager')", [manager.userId]);
    await db.query("insert into project_management.departments(id,season,name) values($1,'S27','Management')", [id(10)]);
    await db.query("insert into project_management.department_members(department_id,member_id,access_level) values($1,$2,'member'),($1,$3,'viewer')", [id(10), committeeMember.userId, viewer.userId]);
    for (const project of seed.assignments) {
      await db.query("insert into project_management.projects(id,season,name,category,departments) values($1,'S27',$2,'production',array['Management'])", [project.id, project.name]);
    }
    await db.exec(migrations("068_vehicle_catalog"));
    await db.exec(migrations("069_s27_vehicle_catalog"));
    await db.exec(migrations("070_vehicle_subsystem_responsibility"));
    await db.exec(migrations("071_vehicle_catalog_project_links"));
    await db.exec(migrations("072_delete_vehicle_catalog_components"));
    await db.exec(migrations("073_multiple_vehicle_subsystem_responsibilities"));
  });

  afterAll(async () => db?.close());

  it("seeds catalog entries and links technical projects without writing project work", async () => {
    const catalog = await services(committeeMember).load("verified");
    expect(catalog.components).toHaveLength(seed.systems.length + seed.systems.reduce((n, system) => n + system.subsystems.length, 0));
    for (const assignment of seed.assignments) {
      const scope = await services().loadProject("verified", assignment.id);
      expect(scope.componentId).toBe(catalog.components.find(item => item.code === assignment.component)?.id);
      expect(catalog.linkedProjects).toContainEqual({ id: assignment.id, name: assignment.name, componentId: scope.componentId });
    }
    expect((await db.query("select 1 from project_management.tasks")).rows).toEqual([]);
    await expect(services(viewer).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(services({ ...committeeMember, googleSub: "incorrect" }).load("verified")).rejects.toMatchObject({ status: 403 });
  });

  it("lists projects only when the catalog viewer can open them in Workspace Projects", async () => {
    const restrictedId = id(100);
    const catalog = await services().load("verified");
    const system = catalog.components.find(item => item.code === "BR")!;
    await db.query("insert into project_management.projects(id,season,name,category,departments) values($1,'S27','Workshop project','production',array['Mechanical & Production'])", [restrictedId]);
    await db.query("insert into project_management.project_vehicle_components(project_id,component_id) values($1,$2)", [restrictedId, system.id]);

    expect((await services().load("verified")).linkedProjects).toContainEqual({ id: restrictedId, name: "Workshop project", componentId: system.id });
    expect((await services(committeeMember).load("verified")).linkedProjects.some(project => project.id === restrictedId)).toBe(false);
    await expect(services(committeeMember).loadProject("verified", restrictedId)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps an archived assignment readable but excludes archived options for new assignments", async () => {
    const catalog = await services().load("verified");
    const system = catalog.components.find(item => item.code === "SU")!;
    const child = catalog.components.find(item => item.code === "SU-ARMS")!;
    const projectId = seed.assignments.find(item => item.component === "SU")!.id;
    const change = { ...system, archived: true, name: "Suspension" };
    await expect(services(viewer).save("verified", change)).rejects.toMatchObject({ status: 403 });
    await services(committeeMember).save("verified", change);
    const scope = await services().loadProject("verified", projectId);
    expect(scope.componentId).toBe(system.id);
    expect(scope.components.find(item => item.id === system.id)).toMatchObject({ archived: true, name: "Suspension" });
    expect(scope.components.some(item => item.id === child.id)).toBe(false);
    await expect(services().saveProject("verified", projectId, { componentId: child.id, expectedRevision: scope.revision })).rejects.toMatchObject({ status: 400 });
    await expect(services().save("verified", change)).rejects.toMatchObject({ status: 409 });
  });

  it("allows project editors to pick and clear an assignment with conflict protection", async () => {
    const projectId = seed.assignments.find(item => item.component === "BR")!.id;
    const catalog = await services().load("verified");
    const pedalBox = catalog.components.find(item => item.code === "BR-PEDAL")!;
    const viewerScope = await services(viewer).loadProject("verified", projectId);
    expect(viewerScope.canEdit).toBe(false);
    expect(viewerScope.components).toHaveLength(1);
    const change = { componentId: pedalBox.id, expectedRevision: viewerScope.revision };
    await expect(services(viewer).saveProject("verified", projectId, change)).rejects.toMatchObject({ status: 403 });
    const selected = await services().saveProject("verified", projectId, change);
    expect(selected.componentId).toBe(pedalBox.id);
    expect((await services().load("verified")).linkedProjects.filter(item => item.id === projectId))
      .toEqual([{ id: projectId, name: "S27 Brake System [BR]", componentId: pedalBox.id }]);
    const readback = await services(viewer).loadProject("verified", projectId);
    expect(readback.components.map(item => item.code)).toEqual(["BR", "BR-PEDAL"]);
    await expect(services().saveProject("verified", projectId, change)).rejects.toMatchObject({ status: 409 });
    const cleared = await services().saveProject("verified", projectId, { componentId: null, expectedRevision: selected.revision });
    expect(cleared.componentId).toBeNull();
    expect((await services().load("verified")).linkedProjects.some(item => item.id === projectId)).toBe(false);
  });

  it("validates and replaces shared responsibilities atomically", async () => {
    const service = services(committeeMember);
    const catalog = await service.load("verified");
    const subsystem = catalog.components.find(item => item.code === "BR-PEDAL")!;
    expect(catalog.members).toEqual([{ id: committeeMember.userId, name: committeeMember.name }]);
    await expect(service.save("verified", subsystem)).rejects.toMatchObject({ status: 400 });
    await expect(service.save("verified", {
      ...subsystem, responsibility: { season: "S27", memberIds: [committeeMember.userId, viewer.userId] },
    })).rejects.toMatchObject({ status: 400 });
    expect((await service.load("verified")).components.find(item => item.id === subsystem.id)?.revision).toBe(subsystem.revision);

    await db.query("insert into project_management.department_members(department_id,member_id,access_level) values($1,$2,'member')", [id(10), manager.userId]);
    const change = { ...subsystem, responsibility: { season: "S27", memberIds: [committeeMember.userId, manager.userId, committeeMember.userId] } };
    const saved = await service.save("verified", change);
    expect(saved.responsibilities.filter(item => item.subsystemId === subsystem.id).map(item => item.memberId))
      .toEqual([committeeMember.userId, manager.userId]);
    await expect(service.save("verified", change)).rejects.toMatchObject({ status: 409 });
    const current = saved.components.find(item => item.id === subsystem.id)!;
    await expect(service.save("verified", { ...current, responsibility: { season: "S27", memberIds: [] } })).rejects.toMatchObject({ status: 400 });
    const replaced = await service.save("verified", { ...current, responsibility: { season: "S27", memberIds: [committeeMember.userId] } });
    expect(replaced.responsibilities.filter(item => item.subsystemId === subsystem.id).map(item => item.memberId)).toEqual([committeeMember.userId]);
    await db.exec("update finance.seasons set status='closed' where code='S27'");
    await expect(service.save("verified", { ...replaced.components.find(item => item.id === subsystem.id), responsibility: change.responsibility })).rejects.toMatchObject({ status: 409 });
    await db.exec("update finance.seasons set status='active' where code='S27'");
  });

  it("reuses the catalog in the next season and rejects writes to old projects", async () => {
    await db.exec("update finance.settings set setting_value='\"S28\"' where setting_key='current_season'");
    const next = await services().load("verified");
    expect(next.components.length).toBeGreaterThan(10);
    expect(next.responsibilities).toEqual([]);
    expect(next.linkedProjects).toEqual([]);
    const subsystem = next.components.find(item => item.code === "BR-PEDAL")!;
    await expect(services().save("verified", {
      ...subsystem, responsibility: { season: "S27", memberId: committeeMember.userId },
    })).rejects.toMatchObject({ status: 409 });
    expect((await db.query("select member_id from project_management.vehicle_subsystem_responsibilities where season_code='S27'")).rows)
      .toEqual([{ member_id: committeeMember.userId }]);
    await expect(services().saveProject("verified", seed.assignments[0].id, {
      componentId: null, expectedRevision: 1,
    })).rejects.toMatchObject({ status: 403 });
  });

  it("deletes unused items and protects project links, child subsystems and stale requests", async () => {
    await db.exec("update finance.settings set setting_value='\"S27\"' where setting_key='current_season'");
    const service = services(committeeMember);
    const system = { id: id(200), parentId: null, code: "TEST-DELETE", name: "Test system", description: "", archived: false, revision: 0 };
    await service.save("verified", system);
    const child = {
      id: id(201), parentId: system.id, code: "TEST-CHILD", name: "Test subsystem", description: "", archived: false, revision: 0,
      responsibility: { season: "S27", memberId: committeeMember.userId },
    };
    await service.save("verified", child);
    const deletion = { action: "delete_component", id: child.id, expectedRevision: 1 };
    await expect(services(viewer).save("verified", deletion)).rejects.toMatchObject({ status: 403 });
    await expect(service.save("verified", { ...deletion, id: system.id })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("subsystems") });
    await expect(service.save("verified", { ...deletion, expectedRevision: 0 })).rejects.toMatchObject({ status: 409 });
    const projectId = seed.assignments[0].id;
    const scope = await services().loadProject("verified", projectId);
    const linked = await services().saveProject("verified", projectId, { componentId: child.id, expectedRevision: scope.revision });
    await expect(service.save("verified", deletion)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("project links") });
    await services().saveProject("verified", projectId, { componentId: scope.componentId, expectedRevision: linked.revision });
    const removed = await service.save("verified", deletion);
    expect(removed.components.some(component => component.id === child.id)).toBe(false);
    expect(removed.responsibilities.some(assignment => assignment.subsystemId === child.id)).toBe(false);
    expect((await service.save("verified", { ...deletion, id: system.id })).components.some(component => component.id === system.id)).toBe(false);
  });

  it("reconciles the S27 catalog, preserves links and reads privately assigned responsibilities", async () => {
    const service = services();
    const before = await service.load("verified");
    const archivedBrakes = before.components.find(item => item.code === "BR")!;
    const oldProject = id(105);
    await db.query("insert into project_management.projects(id,season,name,category,departments) values($1,'S28','Other season','production',array['Management'])", [oldProject]);
    await db.query("insert into project_management.project_vehicle_components(project_id,component_id) values($1,$2)", [oldProject, archivedBrakes.id]);
    await db.exec(migrations("084_s27_vehicle_catalog_structure"));
    await db.query(`insert into project_management.vehicle_subsystem_responsibilities(subsystem_id,season_code,member_id,recorded_name)
      select id,'S27',$1::uuid,null::text from project_management.vehicle_components where code='AERO-FRONT'
      union all
      select id,'S27',null,'Unmatched Example' from project_management.vehicle_components where code='AERO-REAR'`, [manager.userId]);

    const catalog = await service.load("verified");
    const active = catalog.components.filter(item => !item.archived);
    expect(active.filter(item => item.parentId === null).map(item => item.name).sort()).toEqual(bom.systems.map(item => item.name).sort());
    for (const group of bom.systems) {
      const system = active.find(item => item.code === group.code)!;
      expect(active.filter(item => item.parentId === system.id).map(item => [item.code, item.name]).sort()).toEqual([...group.subsystems].sort());
    }
    for (const assignment of bom.assignments) {
      const linkedBefore = before.linkedProjects.some(item => item.id === assignment.id);
      const expectedComponent = linkedBefore ? active.find(item => item.code === assignment.component)?.id : undefined;
      expect(catalog.linkedProjects.find(item => item.id === assignment.id)?.componentId).toBe(expectedComponent);
    }
    expect(catalog.linkedProjects).toHaveLength(before.linkedProjects.length);
    expect((await db.query("select component_id from project_management.project_vehicle_components where project_id=$1", [oldProject])).rows)
      .toEqual([{ component_id: archivedBrakes.id }]);
    const front = active.find(item => item.code === "AERO-FRONT")!;
    const rear = active.find(item => item.code === "AERO-REAR")!;
    expect(catalog.responsibilities.filter(item => item.subsystemId === front.id)).toEqual([{ subsystemId: front.id, memberId: manager.userId, name: manager.name }]);
    expect(catalog.responsibilities.filter(item => item.subsystemId === rear.id)).toEqual([{ subsystemId: rear.id, memberId: null, name: "Unmatched Example" }]);
    await expect(service.save("verified", { ...rear, responsibility: { season: "S27", memberIds: [], pendingNames: ["Unknown Person"] } })).rejects.toMatchObject({ status: 400 });
    const resolved = await service.save("verified", { ...rear, responsibility: { season: "S27", memberIds: [committeeMember.userId], pendingNames: [] } });
    expect(resolved.responsibilities.filter(item => item.subsystemId === rear.id)).toEqual([{ subsystemId: rear.id, memberId: committeeMember.userId, name: committeeMember.name }]);
  });
});
