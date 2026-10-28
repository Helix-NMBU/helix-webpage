import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";
import type { PlatformRole, PlatformRoleKey } from "./MemberFeatureAccess";

export type AccessDepartment = { id: string; name: string };
export type AccessMember = { id: string; email: string; name: string; departmentId: string | null; roleKeys: PlatformRoleKey[] };
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
let localDirectory: AccessDirectory = {
  departments: departmentOptions,
  roles: roleOptions,
  members: [{
    id: "local-member", email: localMemberAccount.email, name: localMemberAccount.name,
    departmentId: "mechanical-production", roleKeys: ["team_member", "platform_administrator"],
  }, {
    id: "local-member-two", email: "jordan@example.invalid", name: "Jordan Example",
    departmentId: "finance", roleKeys: ["team_member"],
  }],
};

export function localMemberHasFinancials(): boolean {
  return localDirectory.members.some((member) => member.id === "local-member" && member.roleKeys.includes("financials"));
}

async function getToken(owner: { current: string | null }) {
  return memberSessionToken(owner);
}

export async function getAccessDirectory(owner: { current: string | null }): Promise<AccessDirectory> {
  if (isLocalMemberMode() && localMemberSignedIn()) return structuredClone(localDirectory);
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
    localDirectory = {
      ...localDirectory,
      members: localDirectory.members.map((member) => member.id === input.memberId
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
