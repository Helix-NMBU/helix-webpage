export const seasonPhaseLabels = {
  recruitment: "Recruiting and Onboarding",
  "draft-concept": "Draft Concept",
  concept: "Concept",
  design: "Design",
  construction: "Construction",
  test: "Test",
} as const;

export type SeasonPhaseId = keyof typeof seasonPhaseLabels;
export const seasonPhaseIds = Object.keys(seasonPhaseLabels) as SeasonPhaseId[];
export const seasonPhaseStatuses = ["planned", "in_progress", "done"] as const;
export type SeasonPhaseStatus = typeof seasonPhaseStatuses[number];

export interface SeasonPhase {
  id: SeasonPhaseId;
  status: SeasonPhaseStatus;
  startDate: string | null;
  endDate: string | null;
  note: string;
}

export interface SeasonSchedule {
  phases: SeasonPhase[];
  revision: number;
}

export function emptySeasonPhases(): SeasonPhase[] {
  return seasonPhaseIds.map(id => ({ id, status: "planned", startDate: null, endDate: null, note: "" }));
}
