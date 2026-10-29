import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";
import type { WorkspaceAccessChange, WorkspaceSpace } from "../Workspace/access";
import type { PlatformRole, PlatformRoleKey } from "./MemberFeatureAccess";

export type AccessDepartment = { id: string; name: string };
export type AccessMember = { id: string; email: string; name: string; departmentId: string | null; roleKeys: PlatformRoleKey[]; spaceKeys: WorkspaceSpace[] };
export type AccessDirectory = { departments: AccessDepartment[]; roles: PlatformRole[]; members: AccessMember[] };

const roleOptions: PlatformRole[] = [
  { key: "project_manager", label: "Project Manager" },
  { key: "department_lead", label: "Department Lead" },
  { key: "team_member", label: "Team Member" },
  { key: "platform_administrator", label: "Platform administrator" },
  { key: "financials", label: "Financials" },
];
const departmentOptions: AccessDepartment[] = [
  { id: "finance", name: "Finance" },
  { id: "mechanical-production", name: "Mechanical & Production" },
  { id: "electrical", name: "Electrical" },
  { id: "software-autonomous", name: "Software & Autonomous" },
  { id: "business-marketing", name: "Business & Marketing" },
  { id: "logistics", name: "Logistics" },
];
let localDirectory: AccessDirectory | null = null;
async function localAccessDirectory(): Promise<AccessDirectory> {
  const { createLocalWorkspaceRepository } = await import("../Workspace/local-repository");
  const workspace = await createLocalWorkspaceRepository().load();
  const previous = localDirectory;
  localDirectory = {
    departments: departmentOptions,
    roles: roleOptions,
    members: workspace.members.map(member => ({
      id: member.id, name: member.name,
      email: member.id === workspace.viewerId ? localMemberAccount.email : `${member.id}@example.invalid`,
      departmentId: previous?.members.find(item => item.id === member.id)?.departmentId ?? "mechanical-production",
      spaceKeys: previous?.members.find(item => item.id === member.id)?.spaceKeys ?? (member.id === workspace.viewerId ? ["season-overview", "recruiting"] : []),
      roleKeys: previous?.members.find(item => item.id === member.id)?.roleKeys ?? (member.id === workspace.viewerId ? ["team_member", "platform_administrator"] : ["team_member"]),
    })),
  };
  return structuredClone(localDirectory);
}

export function localMemberHasSeasonOverview(): boolean {
  if (!localDirectory) return true; // Matches the default local workspace access.
  return localDirectory.members.some(member => member.email === localMemberAccount.email && member.spaceKeys.includes("season-overview"));
}

export function localMemberHasFinancials(): boolean {
  return localDirectory?.members.some(member => member.email === localMemberAccount.email && (member.spaceKeys.includes("financials") || member.roleKeys.includes("financials"))) ?? false;
}

async function getToken(owner: { current: string | null }) {
  return memberSessionToken(owner);
}

export async function getAccessDirectory(owner: { current: string | null }): Promise<AccessDirectory> {
  if (isLocalMemberMode() && localMemberSignedIn()) return localAccessDirectory();
  const token = await getToken(owner);
  const response = await fetch("/api/member-access?action=members", {
    cache: "no-store", credentials: "include", headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null) as (AccessDirectory & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || "Could not load member access.");
  if (!body || !Array.isArray(body.members) || !Array.isArray(body.roles) || !Array.isArray(body.departments)) throw new Error("The member access response was incomplete.");
  return body;
}

export async function saveAccessAssignment(owner: { current: string | null }, input: { memberId: string; departmentId: string; roleKeys: PlatformRoleKey[] }): Promise<void> {
  if (isLocalMemberMode() && localMemberSignedIn()) {
    const directory = await localAccessDirectory();
    localDirectory = {
      ...directory,
      members: directory.members.map((member) => member.id === input.memberId
        ? { ...member, departmentId: input.departmentId, roleKeys: input.roleKeys }
        : member),
    };
    return;
  }
  const token = await getToken(owner);
  const response = await fetch("/api/member-access", {
    method: "POST", cache: "no-store", credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", memberId: input.memberId, departmentId: input.departmentId, roleKeys: input.roleKeys }),
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "Could not save member access.");
}

export async function saveWorkspaceAccess(owner: { current: string | null }, input: WorkspaceAccessChange): Promise<void> {
  if (isLocalMemberMode() && localMemberSignedIn()) {
    const { createLocalWorkspaceRepository } = await import("../Workspace/local-repository");
    const repository = createLocalWorkspaceRepository();
    const workspace = await repository.load();
    const member = workspace.members.find(item => item.id === input.memberId);
    if (!member) throw new Error("This member is no longer available.");
    const directory = await localAccessDirectory();
    await repository.saveMember({ action: "save_member", id: member.id, expectedRevision: input.expectedRevision, name: member.name, helixRole: member.helixRole, departments: input.departments });
    localDirectory = { ...directory, members: directory.members.map(item => item.id === input.memberId ? { ...item, spaceKeys: input.spaceKeys } : item) };
    return;
  }
  const token = await getToken(owner);
  const response = await fetch("/api/member-access", {
    method: "POST", cache: "no-store", credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_workspace_access", ...input }),
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "Could not save member access.");
}
