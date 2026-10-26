import type {
  Project,
  ProjectDepartment,
  ProjectMember,
  TaskPriority,
} from "../ProjectManagement/types.js";

export interface WorkspaceMember extends ProjectMember {
  helixRole: string | null;
  role: "Admin" | "Member";
  joinedAt: string | null;
  lastSeenAt: string | null;
  revision: number;
}
export interface WorkspaceProject extends Project {
  total: number;
  done: number;
  milestones: {
    id: string;
    title: string;
    deadline: string | null;
    priority: TaskPriority;
  }[];
}
export interface WorkspaceDirectory {
  viewerId: string;
  canAdmin: boolean;
  projectAccess: boolean;
  canManageProjects: boolean;
  members: WorkspaceMember[];
  departments: ProjectDepartment[];
  projects: WorkspaceProject[];
}
export interface MemberChange {
  action: "save_member";
  id: string;
  expectedRevision: number;
  name: string;
  helixRole: string | null;
  departments: {
    id: string;
    revision: number;
    member: boolean;
    lead: boolean;
  }[];
}
export interface WorkspaceRepository {
  load(): Promise<WorkspaceDirectory>;
  saveMember(change: MemberChange): Promise<WorkspaceDirectory>;
  saveProject(
    change: Extract<
      import("../ProjectManagement/types.js").ProjectMutation,
      { action: "save_project" }
    >,
  ): Promise<WorkspaceDirectory>;
}
export function departmentPath(name: string) {
  return `/departments/${name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
