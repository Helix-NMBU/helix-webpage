import { departmentAccess } from "../ProjectManagement/permissions";
import type { WorkspaceDirectory, WorkspaceMember } from "./types";

export const MEMBER_COLUMNS = [["role", "Role"], ["joined", "Joined"], ["department", "Department"], ["seen", "Last seen"]] as const;
export type MemberColumn = typeof MEMBER_COLUMNS[number][0];

export function memberView(params: URLSearchParams) {
  const group = params.get("group");
  const sort = params.get("sort");
  return {
    group: group === "department" || group === "role" ? group : "none",
    sort: sort === "role" || sort === "joined" || sort === "department" || sort === "seen" ? sort : "name",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    columns: MEMBER_COLUMNS.map(([key]) => key).filter(key => !params.has("columns") || params.get("columns")!.split(",").includes(key)),
  };
}

export function memberDepartments(data: WorkspaceDirectory, memberId: string) {
  return data.departments.filter(department => {
    const level = departmentAccess(department, memberId);
    return level === "member" || level === "lead";
  });
}

export function memberGroups(data: WorkspaceDirectory, options: ReturnType<typeof memberView>, search: string) {
  const departments = (member: WorkspaceMember) => memberDepartments(data, member.id).map(department => department.name).sort((a, b) => a.localeCompare(b));
  const members = data.members.filter(member => `${member.name} ${member.helixRole ?? ""} ${member.role} ${departments(member).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  members.sort((a, b) => {
    const value = (member: WorkspaceMember): string | null => options.sort === "role" ? member.role : options.sort === "joined" ? member.joinedAt : options.sort === "seen" ? member.lastSeenAt : options.sort === "department" ? departments(member).join(", ") || null : member.name;
    const left = value(a), right = value(b);
    const comparison = left && right ? left.localeCompare(right) * (options.direction === "desc" ? -1 : 1) : left ? -1 : right ? 1 : 0;
    return comparison || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  if (options.group === "none") return [{ name: "", members }];
  const groups = new Map<string, WorkspaceMember[]>();
  for (const member of members) {
    const names = options.group === "role" ? [member.role] : departments(member);
    for (const name of names.length ? names : ["No department"]) groups.set(name, [...(groups.get(name) ?? []), member]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, members: items }));
}
