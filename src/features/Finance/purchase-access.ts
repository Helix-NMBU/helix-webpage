import { departmentAccess } from '../ProjectManagement/permissions';
import type { WorkspaceDirectory } from '../Workspace/types';

export function isManagementMember(workspace: WorkspaceDirectory | null | undefined): boolean {
  if (!workspace) return false;
  return workspace.departments.some(department => department.name === 'Management'
    && ['member', 'lead'].includes(departmentAccess(department, workspace.viewerId) ?? ''));
}
