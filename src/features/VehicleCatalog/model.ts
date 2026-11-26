import type { CatalogComponentChange, CatalogMutation, ProjectVehicleChange, VehicleComponent } from "./types.js";

export class CatalogInputError extends Error {}

function invalid(message = "Check the vehicle catalog fields and try again."): never {
  throw new CatalogInputError(message);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, limit: number, required = false): string {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) {
    return invalid(`Enter a valid ${name} of up to ${limit} characters.`);
  }
  return value.trim();
}

export function catalogId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value.toLowerCase();
}

function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 2147483647) return invalid();
  return value;
}

export function parseComponent(value: unknown): CatalogComponentChange {
  const body = record(value);
  const code = text(body.code, "code", 24, true).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return invalid("Use letters, numbers and hyphens for the code.");
  if (typeof body.archived !== "boolean") return invalid();
  const responsibility = body.responsibility === undefined ? undefined : record(body.responsibility);
  let assignment: CatalogComponentChange["responsibility"];
  if (responsibility) {
    if (body.parentId === null || typeof responsibility.season !== "string" || !/^S\d{2}$/.test(responsibility.season)) return invalid();
    const { memberIds, memberId, pendingNames } = responsibility;
    const ids = memberIds === undefined ? (memberId === null ? [] : [memberId]) : memberIds;
    if (!Array.isArray(ids) || (pendingNames !== undefined && !Array.isArray(pendingNames))) return invalid();
    assignment = {
      season: responsibility.season,
      memberIds: [...new Set(ids.map(catalogId))],
      ...(pendingNames === undefined ? {} : { pendingNames: [...new Set(pendingNames.map(name => text(name, "responsible name", 120, true)))] }),
    };
  }
  return {
    id: catalogId(body.id), parentId: body.parentId === null ? null : catalogId(body.parentId), code,
    name: text(body.name, "name", 120, true),
    description: text(body.description, "description", 1000),
    archived: body.archived, revision: revision(body.revision),
    ...(assignment ? { responsibility: assignment } : {}),
  };
}

export function parseProjectVehicleChange(value: unknown): ProjectVehicleChange {
  const body = record(value);
  return { componentId: body.componentId === null ? null : catalogId(body.componentId), expectedRevision: revision(body.expectedRevision) };
}

export function parseCatalogMutation(value: unknown): CatalogMutation {
  const body = record(value);
  if (body.action === "delete_component") return { action: body.action, id: catalogId(body.id), expectedRevision: revision(body.expectedRevision) };
  return parseComponent(body);
}

export function componentArchived(component: VehicleComponent, components: VehicleComponent[]) {
  return component.archived || components.some(parent => parent.id === component.parentId && parent.archived);
}

export function componentLabel(id: string | null, components: VehicleComponent[]) {
  const component = components.find(item => item.id === id);
  const parent = components.find(item => item.id === component?.parentId);
  if (!component) return "No vehicle system";
  return parent ? `${parent.name} / ${component.name}` : component.name;
}
