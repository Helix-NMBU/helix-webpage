import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { isProjectMemberPreview } from "../MemberPlatform/local-member-profile-selection";
import type { ProjectWorkspace } from "./types";

/** A reversible local projection. Never persist these synthetic lead assignments. */
export function projectMemberWorkspace(workspace: ProjectWorkspace): ProjectWorkspace {
  if (!isProjectMemberPreview(isLocalMemberMode())) return workspace;
  const viewer = workspace.viewerId;
  const other = workspace.members.find(member => member.id !== viewer)?.id;
  const leads = (ids: string[]) => {
    const remaining = ids.filter(id => id !== viewer);
    return ids.includes(viewer) && !remaining.length && other ? [other] : remaining;
  };
  return {
    ...workspace, canManage: false, taskLeadCategories: [],
    projects: workspace.projects.map(project => ({ ...project, leadIds: leads(project.leadIds ?? []) })),
    departments: workspace.departments.map(department => {
      const leadIds = leads(department.leadIds ?? (department.leadId ? [department.leadId] : []));
      return { ...department, leadIds, leadId: leadIds[0] ?? null };
    }),
  };
}
