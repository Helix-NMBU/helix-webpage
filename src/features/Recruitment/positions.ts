import { fetchPublicPositions, type PublicPosition } from "../Apply/positions-api";

export type RecruitmentPosition = PublicPosition & { visible: boolean };
export const publicPositions = fetchPublicPositions;

export function positionApplicationUrl(position: Pick<PublicPosition, "id" | "applyUrl">): string {
  // Existing catalog seeds contain this legacy placeholder, never a real form.
  return position.applyUrl && position.applyUrl !== "https://form.typeform.com/to/placeholder"
    ? position.applyUrl : `/apply/form?position=${encodeURIComponent(position.id)}`;
}
