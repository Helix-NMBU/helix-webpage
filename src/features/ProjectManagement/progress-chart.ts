import { addDays } from "./model";

export const chartDay = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;

// Leave room beyond the deadline so the after-deadline region is always visible.
export function progressChartRange(firstObservation: string, today: string, deadline: string | null) {
  let start = firstObservation === today ? addDays(today, -7) : firstObservation;
  if (deadline && deadline <= start) start = addDays(deadline, -2);
  let end = addDays(today, Math.max(3, Math.min(14, chartDay(today) - chartDay(start))));
  if (deadline) {
    const padding = Math.max(1, Math.ceil((chartDay(deadline) - chartDay(start)) * 0.15));
    const afterDeadline = addDays(deadline, padding);
    if (afterDeadline > end) end = afterDeadline;
  }
  return { start, end };
}
