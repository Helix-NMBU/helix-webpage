import { fetchPublicPositions, type PublicPosition } from "../Apply/positions-api";

export type RecruitmentPosition = PublicPosition & { visible: boolean; contactMemberId?: string };
export const publicPositions = fetchPublicPositions;

export function positionApplicationUrl(position: Pick<PublicPosition, "id" | "applyUrl">): string {
  return `/apply/form?position=${encodeURIComponent(position.id)}`;
}
