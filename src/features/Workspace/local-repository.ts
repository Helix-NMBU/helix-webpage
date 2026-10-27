import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { validateProject } from "../ProjectManagement/model";
import { WorkspaceRequestError } from "./repository";
import type {
  MemberChange,
  WorkspaceDirectory,
  WorkspaceMember,
  WorkspaceRepository,
} from "./types";
const KEY = "helix-member-local-directory-v1";
// Shares the existing project/membership fixture store. Never imported in production.
export function createLocalWorkspaceRepository(): WorkspaceRepository {
  if (!isLocalMemberMode())
    throw new Error("Local workspace requires member-local mode on loopback.");
  const projects = createLocalProjectRepository();
  async function read(): Promise<WorkspaceDirectory> {
    const data = await projects.load();
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      Partial<WorkspaceMember>
    >;
    return {
      viewerId: data.viewerId,
      taskLeadCategories: data.taskLeadCategories,
      canAdmin: true,
      projectAccess: true,
      canManageProjects: data.canManage,
      members: data.members.map((m) => ({
        ...m,
        helixRole: null,
        role: m.id === data.viewerId ? "Admin" : "Member",
        joinedAt: null,
        lastSeenAt: null,
        revision: 1,
        ...saved[m.id],
      })),
      departments: data.departments,
      projects: data.projects.map((p) => {
        const tasks = data.tasks.filter(
          (t) =>
            t.projectId === p.id &&
            t.kind === "task" &&
            t.status !== "cancelled",
        );
        return {
          ...p,
          total: tasks.length,
          done: tasks.filter((t) => t.status === "done").length,
          milestones: data.tasks
            .filter(
              (t) =>
                t.projectId === p.id &&
                t.kind === "milestone" &&
                !["done", "cancelled"].includes(t.status),
            )
            .map(({ id, title, deadline, priority }) => ({
              id,
              title,
              deadline,
              priority,
            })),
        };
      }),
    };
  }
  async function saveMember(change: MemberChange) {
    const data = await read();
    if (!data.canAdmin)
      throw new WorkspaceRequestError(
        "Only platform admins can edit members.",
        403,
      );
    const member = data.members.find((m) => m.id === change.id);
    if (
      !member ||
      member.revision !== change.expectedRevision ||
      data.departments.some(
        (d) =>
          change.departments.find((c) => c.id === d.id)?.revision !==
          d.revision,
      )
    )
      throw new WorkspaceRequestError(
        "This record changed. Reload before saving.",
        409,
      );
    if (
      !change.name.trim() ||
      change.name.length > 160 ||
      (change.helixRole?.length ?? 0) > 150 ||
      change.departments.length !== 7
    )
      throw new Error("Check the member details.");
    if (
      change.departments.some(
        (c) =>
          c.lead &&
          (!c.member ||
            (data.departments.find((d) => d.id === c.id)?.leadId &&
              data.departments.find((d) => d.id === c.id)?.leadId !==
                change.id)),
      )
    )
      throw new WorkspaceRequestError(
        "This department already has a Lead. Remove their Lead assignment first.",
        409,
      );
    // Validate all changes before writing the fixture snapshot.
    const raw = await projects.load();
    raw.members = raw.members.map((m) =>
      m.id === member.id ? { ...m, name: change.name.trim() } : m,
    );
    raw.departments = raw.departments.map((d) => {
      const c = change.departments.find((c) => c.id === d.id)!;
      const memberIds = c.member
        ? [...new Set([...d.memberIds, member.id])]
        : d.memberIds.filter((id) => id !== member.id);
      const leadId = c.lead
        ? member.id
        : d.leadId === member.id
          ? null
          : d.leadId;
      return {
        ...d,
        memberIds,
        leadId,
        revision:
          d.revision +
          (d.memberIds.includes(member.id) !== c.member || d.leadId !== leadId
            ? 1
            : 0),
      };
    });
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    saved[member.id] = {
      name: change.name.trim(),
      helixRole: change.helixRole?.trim() || null,
      revision: member.revision + 1,
    };
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify(raw));
    localStorage.setItem(KEY, JSON.stringify(saved));
    return read();
  }
  return {
    load: read,
    saveMember,
    async saveProject(change) {
      validateProject(change.project);
      await projects.mutate(change);
      return read();
    },
  };
}
