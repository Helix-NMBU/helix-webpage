import type { CvData, CvExperience, CvProject } from "./types.js";

// Private edit provenance survives object spreads and autosave's structuredClone.
// validateCvData omits it before requests or stored drafts are produced.
type ProjectRoleExperience = CvExperience & { __projectRoleSourceId?: string };

export function projectRoleSourceId(row: CvExperience): string | undefined {
  const value = (row as ProjectRoleExperience).__projectRoleSourceId;
  return typeof value === "string" ? value : undefined;
}

/** Map the selected project's content without changing or inventing date text. */
export function projectRoleToExperience(project: CvProject, id: string): CvExperience {
  return {
    id, organization: "Helix NMBU", title: project.role,
    department: project.name, season: project.season, url: project.url,
    description: project.description, startDate: project.startDate ?? "", endDate: project.endDate ?? "",
  };
}

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
  const experience: ProjectRoleExperience = {
    ...projectRoleToExperience(project, newExperienceId),
    __projectRoleSourceId: project.id,
  };
  return {
    ...draft,
    projects: draft.projects.filter((_, index) => index !== sourceIndex),
    experience: [...draft.experience, experience],
  };
}
