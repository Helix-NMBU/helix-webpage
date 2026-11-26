import { departmentAccess } from "../ProjectManagement/permissions";
import type { WorkspaceDirectory } from "../Workspace/types";

export const vehicleCatalogPath = "/departments/management/vehicle-systems";

export function canManageVehicleCatalog(workspace: WorkspaceDirectory | null | undefined) {
  return Boolean(workspace && (workspace.canManageProjects || workspace.departments.some(department =>
    department.name === "Management" && ["member", "lead"].includes(departmentAccess(department, workspace.viewerId) ?? ""),
  )));
}
