import type { CvData, CvExperience } from "./types.js";

/** Group named organizations in first-appearance order, retaining each role's order and text. */
export function groupExperience(rows: CvExperience[]): { key: string; organization: string; roles: CvExperience[] }[] {
  const groups: { key: string; organization: string; roles: CvExperience[] }[] = [];
  const namedGroups = new Map<string, (typeof groups)[number]>();
  rows.forEach((row, index) => {
    const organization = row.organization.trim().replace(/\s+/g, " ");
    if (!organization) {
      groups.push({ key: `unnamed:${index}`, organization: "", roles: [row] });
      return;
    }
    const normalized = organization.toLowerCase();
    const helix = normalized === "helix" || normalized === "helix nmbu";
    const key = `organization:${helix ? "helix nmbu" : normalized}`;
    const existing = namedGroups.get(key);
    if (existing) existing.roles.push(row);
    else {
      const group = { key, organization: helix ? "Helix NMBU" : organization, roles: [row] };
      namedGroups.set(key, group);
      groups.push(group);
    }
  });
  return groups;
}

/** Transfer one explicitly selected project role within the private draft. */
export function moveProjectRoleToExperience(draft: CvData, projectId: string, newExperienceId: string): CvData {
  const sourceIndex = draft.projects.findIndex((project) => project.id === projectId);
  if (sourceIndex === -1) return draft;
  if (draft.experience.length >= 30) throw new Error("Invalid experience. Use at most 30 entries.");
  if (!newExperienceId.trim() || newExperienceId.length > 100 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(newExperienceId) ||
      draft.experience.some((row) => row.id.trim() === newExperienceId.trim())) {
    throw new Error("Invalid experience entry ID.");
  }
  const project = draft.projects[sourceIndex];
  const experience: CvExperience = {
    id: newExperienceId, organization: "Helix NMBU", title: project.role,
    department: project.name, season: project.season, url: project.url,
    description: project.description, startDate: project.startDate ?? "", endDate: project.endDate ?? "",
  };
  return {
    ...draft,
    projects: draft.projects.filter((_, index) => index !== sourceIndex),
    experience: [...draft.experience, experience],
  };
}
