import type { CvData } from "./types.js";

export const managedHelixRoleId = "helix-member-role";

/** Rebuild the administrator-owned role while retaining the member's contribution. */
export function withManagedHelixRole(cv: CvData, title?: string | null): CvData {
  const previous = cv.experience.find(entry => entry.id === managedHelixRoleId);
  const experience = cv.experience.filter(entry => entry.id !== managedHelixRoleId);
  if (title) experience.unshift({
    id: managedHelixRoleId, section: "helixRoles", organization: "Helix NMBU", title,
    startDate: "", endDate: "", description: previous?.description ?? "",
  });
  return { ...cv, experience };
}
