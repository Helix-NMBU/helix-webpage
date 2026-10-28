import { ORGANIZATION_DEPARTMENTS, type OrganizationDepartment, type ProjectDepartment } from "./types";

const aliases: Record<string, OrganizationDepartment> = {
  management: "Management", "executive team": "Management", "the board": "Management",
  mechanical: "Mechanical & Production", "mechanical & production": "Mechanical & Production",
  electrical: "Electronics", electronics: "Electronics",
  software: "Software & Autonomous", "software & autonomous": "Software & Autonomous",
  business: "Business & Marketing", marketing: "Business & Marketing", partnerships: "Business & Marketing", "business & marketing": "Business & Marketing",
  logistics: "Logistics", operations: "Logistics", finance: "Finance",
};
export const canonicalDepartment = (name: string): OrganizationDepartment | null => aliases[name.trim().toLowerCase()] ?? null;
export const fixedProjectDepartments = (names: string[]) => [...new Set(names.map(canonicalDepartment).filter((name): name is OrganizationDepartment => name !== null))];

export function fixedDepartmentRecords(existing: ProjectDepartment[]): ProjectDepartment[] {
  return ORGANIZATION_DEPARTMENTS.map((name, index) => {
    const matching = existing.filter(department => canonicalDepartment(department.name) === name);
    const previous = matching.find(department => department.name === name) ?? matching[0];
    const memberIds = [...new Set(matching.flatMap(department => department.memberIds))];
    const leads = [...new Set(matching.flatMap(department => department.leadId && memberIds.includes(department.leadId) ? [department.leadId] : []))];
    return { id: previous?.id ?? `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, season: "S27", memberIds, ...(matching.some(d => d.viewerIds) ? { viewerIds: [...new Set(matching.flatMap(d => d.viewerIds ?? []))] } : {}), leadId: leads.length === 1 ? leads[0] : null, revision: previous ? previous.revision + (previous.name !== name || matching.length > 1 ? 1 : 0) : 1 };
  });
}
