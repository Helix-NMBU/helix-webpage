import {
  isLocalMemberMode,
  localMemberAccount,
} from "../MemberPlatform/local-mode";
import { createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { googleDriveFolder, type DepartmentHome } from "./department-home";
import type { DepartmentHomeRepository } from "./department-home-repository";
import { WorkspaceRequestError } from "./repository";
const KEY = "helix-member-local-department-homes-v1";
export function createLocalDepartmentHomeRepository(): DepartmentHomeRepository {
  if (!isLocalMemberMode())
    throw new Error("Local departments require member-local mode on loopback.");
  const projects = createLocalProjectRepository();
  async function read(id: string): Promise<DepartmentHome> {
    const workspace = await projects.load();
    const department = workspace.departments.find((d) => d.id === id);
    if (!department?.memberIds.includes(workspace.viewerId))
      throw new WorkspaceRequestError(
        "You can open departments that you belong to.",
        403,
      );
    const saved = (
      JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
        string,
        Partial<DepartmentHome> | undefined
      >
    )[id];
    return {
      departmentId: id,
      revision: 0,
      description: "",
      driveFolderUrl: null,
      ...saved,
      canEdit:
        department.leadId === workspace.viewerId ||
        workspace.canManage ||
        localMemberAccount.role === "Admin",
    };
  }
  return {
    load: read,
    async save(change) {
      const home = await read(change.departmentId);
      if (!home.canEdit)
        throw new WorkspaceRequestError(
          "The department head, a project manager or a platform admin with department access must save these settings.",
          403,
        );
      if (home.revision !== change.expectedRevision)
        throw new WorkspaceRequestError(
          "Department settings changed. Reload before saving.",
          409,
        );
      if (
        typeof change.description !== "string" ||
        change.description.length > 2000
      )
        throw new Error(
          "Use up to 2,000 characters for the department description.",
        );
      const next = {
        ...home,
        description: change.description.trim(),
        driveFolderUrl: googleDriveFolder(change.driveFolderUrl),
        revision: home.revision + 1,
      };
      const all = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      all[home.departmentId] = next;
      localStorage.setItem(KEY, JSON.stringify(all));
      return next;
    },
  };
}
