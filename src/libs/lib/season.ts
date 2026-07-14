// Seasons are named by the academic year's ending year: Aug 2026–Jul 2027 = S27.
// Applications roll over to the upcoming season already in July, so pre-season
// applicants land in the same recruitment round as the autumn ones.
export function currentSeason(now = new Date()): string {
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `S${String(endYear % 100).padStart(2, "0")}`;
}
