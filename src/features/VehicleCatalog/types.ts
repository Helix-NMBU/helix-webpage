export interface VehicleComponent {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string;
  archived: boolean;
  revision: number;
}

export interface VehicleCatalog {
  components: VehicleComponent[];
  season: string;
  canAssignResponsibility: boolean;
  members: { id: string; name: string }[];
  responsibilities: { subsystemId: string; memberId: string | null; name: string }[];
  linkedProjects: VehicleProjectLink[];
}

export interface VehicleProjectLink {
  id: string;
  name: string;
  componentId: string;
}

export type CatalogComponentChange = VehicleComponent & {
  responsibility?: { season: string; memberIds: string[]; pendingNames?: string[] };
};

export interface CatalogComponentDeletion {
  action: "delete_component";
  id: string;
  expectedRevision: number;
}

export type CatalogMutation = CatalogComponentChange | CatalogComponentDeletion;

export interface ProjectVehicleScope {
  componentId: string | null;
  components: VehicleComponent[];
  canEdit: boolean;
  revision: number;
}

export interface ProjectVehicleChange {
  componentId: string | null;
  expectedRevision: number;
}
