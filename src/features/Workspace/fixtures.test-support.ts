import { initialLocalWorkspace } from "../ProjectManagement/local-repository";
import type { WorkspaceDirectory } from "./types";
export function directoryFixture(): WorkspaceDirectory {
  const data = initialLocalWorkspace();
  return {
    viewerId: data.viewerId,
    canAdmin: true,
    projectAccess: true,
    canManageProjects: true,
    members: data.members.map((m) => ({
      ...m,
      role: m.id === data.viewerId ? "Admin" : "Member",
      helixRole: null,
      joinedAt: "2026-09-01T12:00:00Z",
      lastSeenAt: null,
      revision: 1,
    })),
    departments: data.departments,
    projects: data.projects.map((p) => ({
      ...p,
      total: 3,
      done: 1,
      milestones: [],
    })),
  };
}
