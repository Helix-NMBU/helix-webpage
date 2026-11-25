import { addDays, osloDate } from "./model";

export const chartDay = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;

export const progressLabelAngle = 36;
const labelRadians = progressLabelAngle * Math.PI / 180;
const nameLineHeight = 16;

export function progressLabelLayout(axisWidth: number, labels: { center: number; dateWidth: number; nameWidth: number }[]) {
  const labelsByDate = labels.map((label, index) => ({ ...label, index })).sort((a, b) => a.center - b.center);
  const diagonalGap = (nameLineHeight + 4) / Math.sin(labelRadians);
  const gapBetween = (left: number, right: number) =>
    Math.max(diagonalGap, (labelsByDate[left].dateWidth + labelsByDate[right].dateWidth) / 2 + 6);
  const nameInset = nameLineHeight / 2 * Math.sin(labelRadians);
  const latest: number[] = [];
  for (let index = labelsByDate.length - 1; index >= 0; index--) {
    const { dateWidth, nameWidth } = labelsByDate[index];
    const rightInset = Math.max(dateWidth / 2, nameInset + nameWidth * Math.cos(labelRadians));
    const nextBoundary = index < labelsByDate.length - 1 ? latest[index + 1] - gapBetween(index, index + 1) : axisWidth;
    latest[index] = Math.min(axisWidth - rightInset, nextBoundary);
  }
  const anchors: number[] = [];
  let previous = 0;
  labelsByDate.forEach(({ center, dateWidth, index }, order) => {
    const earliest = order === 0 ? Math.max(dateWidth / 2, nameInset) : previous + gapBetween(order - 1, order);
    previous = Math.max(earliest, Math.min(center, latest[order]));
    anchors[index] = previous;
  });
  const longestName = Math.max(0, ...labels.map(label => label.nameWidth));
  const nameHeight = Math.ceil(longestName * Math.sin(labelRadians) + nameLineHeight / 2 * (1 + Math.cos(labelRadians)) + 6);
  return { anchors, nameHeight };
}

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
