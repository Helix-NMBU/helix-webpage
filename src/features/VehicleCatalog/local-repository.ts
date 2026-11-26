import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { canManageProject, departmentAccess } from "../ProjectManagement/permissions";
import { ProjectRequestError } from "../ProjectManagement/repository";
import { componentArchived, parseCatalogMutation, parseProjectVehicleChange } from "./model";
import seed from "./s27.json";
import type { CatalogMutation, ProjectVehicleChange, ProjectVehicleScope, VehicleCatalog, VehicleComponent } from "./types";

const key = "helix-local-vehicle-catalog-v1";
type Assignment = { componentId: string | null; revision: number };
type StoredCatalog = {
  components: VehicleComponent[];
  assignments: Record<string, Assignment>;
  s27Bom?: true | 2;
  owners?: Record<string, Record<string, string | string[]>>;
};

function invalid(message: string, status = 400): never {
  throw new ProjectRequestError(message, status);
}

function initialCatalog(): StoredCatalog {
  const previous = localStorage.getItem("helix-local-season-structure-v1");
  if (previous) {
    const { components, definitions } = JSON.parse(previous) as { components: VehicleComponent[]; definitions: Record<string, Assignment> };
    return { components, assignments: Object.fromEntries(Object.entries(definitions).map(([project, assignment]) => [project, {
      componentId: assignment.componentId, revision: 1,
    }])) };
  }
  return { components: [], assignments: {} };
}

function applyS27Bom(catalog: StoredCatalog, s27ProjectIds: string[]) {
  const components = new Map(catalog.components.map(item => [item.code, item]));
  const updated = seed.systems.flatMap<VehicleComponent>(system => {
    const current = components.get(system.code);
    const id = current?.id ?? crypto.randomUUID();
    return [
      { id, parentId: null, code: system.code, name: system.name, description: system.description, archived: false, revision: (current?.revision ?? 0) + 1 },
      ...system.subsystems.map(([code, name]) => {
        const previous = components.get(code);
        return { id: previous?.id ?? crypto.randomUUID(), parentId: id, code, name, description: previous?.description ?? "", archived: false, revision: (previous?.revision ?? 0) + 1 };
      }),
    ];
  });
  const replacementIds = new Map(updated.map(item => [item.code, item.id]));
  const replacements = new Map(Object.entries(seed.movedProjectLinks).flatMap(([oldCode, newCode]) => {
    const before = components.get(oldCode)?.id;
    const after = replacementIds.get(newCode);
    return before && after ? [[before, after] as const] : [];
  }));
  for (const projectId of s27ProjectIds) {
    const assignment = catalog.assignments[projectId];
    const replacement = assignment?.componentId && replacements.get(assignment.componentId);
    if (replacement) catalog.assignments[projectId] = { componentId: replacement, revision: assignment.revision + 1 };
  }
  catalog.components = [
    ...updated,
    ...catalog.components.filter(item => !replacementIds.has(item.code)).map(item =>
      seed.retired.includes(item.code) && !item.archived ? { ...item, archived: true, revision: item.revision + 1 } : item),
  ];
  catalog.s27Bom = 2;
}

export async function localCatalogRequest(projectId: string | null, input?: CatalogMutation | ProjectVehicleChange): Promise<VehicleCatalog | ProjectVehicleScope> {
  if (!isLocalMemberMode()) return invalid("Local access is unavailable.", 403);
  const workspace = await createLocalProjectRepository().load();
  const stored = localStorage.getItem(key);
  const catalog: StoredCatalog = stored ? JSON.parse(stored) : initialCatalog();
  if (!catalog.s27Bom) applyS27Bom(catalog, workspace.projects.filter(project => project.season === "S27").map(project => project.id));
  if (catalog.s27Bom === true) {
    const chassis = catalog.components.find(item => item.parentId === null && item.code === "CB" && item.name === "Frame");
    if (chassis) {
      chassis.name = "Chassis";
      chassis.revision += 1;
    }
    catalog.s27Bom = 2;
  }
  const visibleProjects = workspace.projects.filter(project => project.season === workspace.season &&
    (workspace.canManage || workspace.departments.some(department => department.season === workspace.season &&
      project.departments.includes(department.name) && departmentAccess(department, workspace.viewerId))));

  if (workspace.season === "S27") {
    for (const project of visibleProjects) {
      if (catalog.assignments[project.id]) continue;
      const code = seed.assignments.find(item => item.name === project.name)?.component ?? (project.name === "Chassis & assembly" ? "CB" : null);
      const suggested = catalog.components.find(item => item.code === code);
      if (suggested) catalog.assignments[project.id] = { componentId: suggested.id, revision: 1 };
    }
  }

  if (projectId) {
    const project = visibleProjects.find(item => item.id === projectId);
    if (!project) return invalid("Access to this project is required.", 403);
    const canEdit = canManageProject(project, workspace);
    let assignment = catalog.assignments[projectId];
    if (input) {
      if (!canEdit) return invalid("Access to this project is required.", 403);
      const change = parseProjectVehicleChange(input);
      if ((assignment?.revision ?? 0) !== change.expectedRevision) return invalid("This project changed. Reload the saved version.", 409);
      if (change.componentId && change.componentId !== assignment?.componentId && !catalog.components.some(item => item.id === change.componentId && !componentArchived(item, catalog.components))) {
        return invalid("Choose an active system or subsystem.");
      }
      assignment = catalog.assignments[projectId] = { componentId: change.componentId, revision: change.expectedRevision + 1 };
    }
    localStorage.setItem(key, JSON.stringify(catalog));
    const current = catalog.components.find(item => item.id === assignment?.componentId);
    return {
      componentId: assignment?.componentId ?? null, revision: assignment?.revision ?? 0, canEdit,
      components: catalog.components.filter(item => item.id === current?.id || item.id === current?.parentId || (canEdit && !componentArchived(item, catalog.components))),
    };
  }

  const management = workspace.departments.find(department => department.name === "Management");
  if (!workspace.canManage && (!management || !["member", "lead"].includes(departmentAccess(management, workspace.viewerId) ?? ""))) {
    return invalid("Management access is required.", 403);
  }
  const season = workspace.season;
  const owners = (catalog.owners ??= {})[season] ??= {};
  const eligible = new Set(workspace.departments.filter(department => department.season === season)
    .flatMap(department => department.memberIds.filter(id => departmentAccess(department, id) !== "viewer")));
  const members = workspace.members.filter(member => eligible.has(member.id)).map(({ id, name }) => ({ id, name }));
  const change = input ? parseCatalogMutation(input) : null;
  if (change && "action" in change) {
    const component = catalog.components.find(item => item.id === change.id);
    if (!component || component.revision !== change.expectedRevision) return invalid("This record changed. Reload the saved version.", 409);
    if (catalog.components.some(item => item.parentId === change.id)) return invalid("Move or delete the subsystems first, or archive this system.");
    if (workspace.projects.some(project => catalog.assignments[project.id]?.componentId === change.id)) {
      return invalid("This item has project links. Archive it to preserve those links.");
    }
    catalog.components = catalog.components.filter(item => item.id !== change.id);
    for (const seasonOwners of Object.values(catalog.owners)) delete seasonOwners[change.id];
  } else if (change) {
    const { responsibility, ...component } = change;
    const previous = catalog.components.find(item => item.id === component.id);
    if ((previous?.revision ?? 0) !== component.revision) return invalid("This record changed. Reload the saved version.", 409);
    if (catalog.components.some(item => item.code === component.code && item.id !== component.id)) return invalid("This code is already in use.");
    if (component.parentId && component.parentId !== previous?.parentId && !catalog.components.some(item => item.id === component.parentId && !item.parentId && !item.archived)) {
      return invalid("Choose an active parent system.");
    }
    if (previous && Boolean(previous.parentId) !== Boolean(component.parentId)) return invalid("This component type cannot change.");
    if (responsibility && responsibility.season !== season) return invalid("This record changed. Reload the saved version.", 409);
    if (component.parentId) {
      const existing = owners[component.id];
      const previousMembers = typeof existing === "string" ? [existing] : existing ?? [];
      const memberIds = responsibility?.memberIds ?? previousMembers;
      const active = !componentArchived(component, catalog.components);
      if (responsibility?.pendingNames?.length) return invalid("Check the vehicle catalog fields and try again.");
      if (active && memberIds.length === 0) return invalid("Choose at least one person responsible for this subsystem.");
      if (memberIds.some(memberId => (active || !previousMembers.includes(memberId)) && !eligible.has(memberId))) return invalid("Choose a member of the current season.");
      if (memberIds.length > 0) owners[component.id] = memberIds;
      else if (responsibility) delete owners[component.id];
    }
    catalog.components = [...catalog.components.filter(item => item.id !== component.id), { ...component, revision: component.revision + 1 }];
  }
  localStorage.setItem(key, JSON.stringify(catalog));
  const people = new Map(workspace.members.map(member => [member.id, member.name]));
  const responsibilities = Object.entries(owners).flatMap(([subsystemId, assignment]) => (typeof assignment === "string" ? [assignment] : assignment).flatMap(memberId => {
    const name = people.get(memberId);
    return name ? [{ subsystemId, memberId, name }] : [];
  }));
  const linkedProjects = visibleProjects.flatMap(({ id, name }) => {
    const componentId = catalog.assignments[id]?.componentId;
    return componentId ? [{ id, name, componentId }] : [];
  }).sort((first, second) => first.name.localeCompare(second.name) || first.id.localeCompare(second.id));
  return { components: catalog.components, season, canAssignResponsibility: true, members, responsibilities, linkedProjects };
}
