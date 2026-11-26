import type { ProjectVehicleScope, VehicleCatalog } from "../../src/features/VehicleCatalog/types.js";
import { catalogId, CatalogInputError, parseCatalogMutation, parseProjectVehicleChange } from "../../src/features/VehicleCatalog/model.js";
import { MemberCvError } from "./member-cv-error.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";

export function createVehicleCatalogServices({ db, authenticate }: { db: CvDatabase; authenticate(token: string): Promise<WorkspaceIdentity> }) {
  async function request<T>(token: string, query: (args: string[]) => Promise<{ rows: { value: T | null }[] }>, denied: string): Promise<T> {
    try {
      const identity = await authenticate(token);
      const { rows } = await query([identity.userId, identity.googleSub, identity.email]);
      if (!rows[0]?.value) throw new MemberCvError(403, denied);
      return rows[0].value;
    } catch (error) {
      if (error instanceof MemberCvError) throw error;
      if (error instanceof CatalogInputError) throw new MemberCvError(400, error.message);
      const message = error instanceof Error ? error.message : "";
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (message.includes("catalog_forbidden")) throw new MemberCvError(403, denied);
      if (message.includes("catalog_conflict")) throw new MemberCvError(409, "This record changed. Reload the saved version before editing again.");
      if (message.includes("catalog_closed")) throw new MemberCvError(409, "This season is closed.");
      if (message.includes("catalog_component")) throw new MemberCvError(400, "Choose an active system or subsystem.");
      if (message.includes("catalog_owner_required")) throw new MemberCvError(400, "Choose at least one person responsible for this subsystem.");
      if (message.includes("catalog_owner_ineligible")) throw new MemberCvError(400, "Choose a member of the current season.");
      if (message.includes("catalog_season_missing")) throw new MemberCvError(409, "Configure the current season before assigning subsystem responsibility.");
      if (message.includes("catalog_has_subsystems")) throw new MemberCvError(400, "Move or delete the subsystems first, or archive this system.");
      if (message.includes("catalog_has_projects")) throw new MemberCvError(400, "This item has project links. Archive it to preserve those links.");
      if (code === "23505") throw new MemberCvError(400, "This system or subsystem code is already in use.");
      if (message.includes("catalog_invalid") || ["23502", "23503", "23514", "22P02"].includes(String(code))) {
        throw new MemberCvError(400, "Check the vehicle catalog fields and try again.");
      }
      throw new MemberCvError(503, "Could not load or update the vehicle catalog. Please try again.");
    }
  }
  const management = "Management access is required.";
  const project = "Access to this project is required.";
  return {
    load: (token: string) => request<VehicleCatalog>(token, args =>
      db.query("select project_management.read_vehicle_catalog($1::uuid,$2,$3) as value", args), management),
    save: (token: string, body: unknown) => request<VehicleCatalog>(token, args => {
      const change = parseCatalogMutation(body);
      return "action" in change
        ? db.query("select project_management.delete_vehicle_component($1::uuid,$2,$3,$4::uuid,$5::integer) as value", [...args, change.id, change.expectedRevision])
        : db.query("select project_management.save_vehicle_catalog_entry($1::uuid,$2,$3,$4::jsonb) as value", [...args, JSON.stringify(change)]);
    }, management),
    loadProject: (token: string, id: unknown) => request<ProjectVehicleScope>(token, args =>
      db.query("select project_management.read_project_vehicle_scope($1::uuid,$2,$3,$4::uuid) as value", [...args, catalogId(id)]), project),
    saveProject: (token: string, id: unknown, body: unknown) => request<ProjectVehicleScope>(token, args =>
      db.query("select project_management.save_project_vehicle_scope($1::uuid,$2,$3,$4::uuid,$5::jsonb) as value", [...args, catalogId(id), JSON.stringify(parseProjectVehicleChange(body))]), project),
  };
}
