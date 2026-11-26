import { localMemberSignedIn, isLocalMemberMode } from "../MemberPlatform/local-mode";
import { memberLoadFailure, memberSessionToken } from "../MemberCV/session";
import { CvRequestError } from "../MemberCV/repository";
import { ProjectRequestError } from "../ProjectManagement/repository";
import type { CatalogMutation, ProjectVehicleChange, ProjectVehicleScope, VehicleCatalog } from "./types";

export function vehicleCatalogRepository() {
  const owner = { current: null as string | null };
  async function request(projectId: null, change?: CatalogMutation): Promise<VehicleCatalog>;
  async function request(projectId: string, change?: ProjectVehicleChange): Promise<ProjectVehicleScope>;
  async function request(projectId: string | null, change?: CatalogMutation | ProjectVehicleChange): Promise<VehicleCatalog | ProjectVehicleScope> {
    if (import.meta.env.DEV && import.meta.env.MODE === "member-local" && isLocalMemberMode()) {
      if (!localMemberSignedIn()) throw new ProjectRequestError("Log in to continue.", 401);
      const { localCatalogRequest } = await import("./local-repository");
      return localCatalogRequest(projectId, change);
    }
    let token: string;
    try {
      token = await memberSessionToken(owner);
    } catch (error) {
      if (error instanceof CvRequestError) throw new ProjectRequestError(error.message, error.status === 403 ? 401 : error.status);
      throw error;
    }
    const query = projectId ? `view=vehicle-scope&projectId=${encodeURIComponent(projectId)}` : "view=vehicle-catalog";
    const response = await fetch(`/api/projects?${query}`, {
      method: change ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(change ? { "Content-Type": "application/json" } : {}) },
      ...(change ? { body: JSON.stringify(change) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body.error === "string" ? body.error : "Could not load vehicle systems. Please try again.";
      if (response.status === 401) memberLoadFailure(new CvRequestError(message, 401));
      throw new ProjectRequestError(message, response.status);
    }
    if (!Array.isArray(body.components) || (projectId === null && !Array.isArray(body.linkedProjects))) {
      throw new ProjectRequestError("Could not load vehicle systems. Please try again.", 503);
    }
    return body as VehicleCatalog | ProjectVehicleScope;
  }
  return {
    load: () => request(null),
    save: (change: CatalogMutation) => request(null, change),
    loadProject: (id: string) => request(id),
    saveProject: (id: string, change: ProjectVehicleChange) => request(id, change),
  };
}
