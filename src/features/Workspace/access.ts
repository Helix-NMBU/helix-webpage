import type { MemberChange } from "./types.js";

export const WORKSPACE_SPACES = [
  { key: "season-overview", label: "Season Overview" },
  { key: "recruiting", label: "Recruiting" },
  { key: "financials", label: "Financials" },
] as const;
export type WorkspaceSpace = typeof WORKSPACE_SPACES[number]["key"];
export interface WorkspaceAccessChange {
  memberId: string;
  expectedRevision: number;
  departments: MemberChange["departments"];
  spaceKeys: WorkspaceSpace[];
}
