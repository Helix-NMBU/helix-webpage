import { addDays, osloDate } from "./model";

export const chartDay = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;

// Seasons are named for their ending year: S27 is August 2026 through July 2027.
export function seasonChartRange(season: string, today = osloDate()) {
  const match = /^S(\d{2}|\d{4})$/.exec(season);
  const endingYear = match ? Number(match[1]) + (match[1].length === 2 ? 2000 : 0) : Number(today.slice(0, 4)) + (today.slice(5, 7) >= "08" ? 1 : 0);
  return { startDate: `${endingYear - 1}-08-01`, endDate: `${endingYear}-07-31` };
}

// Configured bounds take precedence over observations. Project charts retain
// room after the deadline; season charts use their exact August-July window.
export function progressChartRange(firstObservation: string, today: string, deadline: string | null, { startDate = null, endDate = null }: { startDate?: string | null; endDate?: string | null } = {}) {
  let start = startDate ?? (firstObservation === today ? addDays(today, -7) : firstObservation);
  if (!startDate && deadline && deadline <= start) start = addDays(deadline, -2);
  let end = endDate ?? addDays(today, Math.max(3, Math.min(14, chartDay(today) - chartDay(start))));
  if (!endDate && deadline) {
    const padding = Math.max(1, Math.ceil((chartDay(deadline) - chartDay(start)) * 0.15));
    const afterDeadline = addDays(deadline, padding);
    if (afterDeadline > end) end = afterDeadline;
  }
  if (end <= start) end = addDays(start, 1);
  return { start, end };
}
