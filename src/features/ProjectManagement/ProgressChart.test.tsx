// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressChart } from "./OverviewProgress";
import { initialLocalWorkspace } from "./local-repository";
import { addDays, osloDate } from "./model";
import { chartDay, progressChartRange, seasonChartRange } from "./progress-chart";

const today = osloDate();
function render(deadline: string | null, bounds: { startDate?: string | null; endDate?: string | null; showDeadlineTail?: boolean; events?: { value: "production-start"; label: string; date: string }[]; visibleEventIds?: string[]; startEventId?: "season-start" | "concept" | "design" | "production-start" | "car-unveiling" | "season-end"; endEventId?: "season-start" | "concept" | "design" | "production-start" | "car-unveiling" | "season-end" } = {}) {
  const workspace = initialLocalWorkspace();
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ProgressChart workspace={workspace} deadline={deadline} compact={false} {...bounds} />);
  return container;
}

describe("deadline progress charts", () => {
  it("places the red boundary at the supplied deadline and leaves visible hatching after it", () => {
    const deadline = addDays(today, 40);
    const container = render(deadline);
    const marker = container.querySelector(`[data-progress-deadline="${deadline}"]`)!;
    const range = progressChartRange(today, today, deadline);
    const expectedX = 22 + (chartDay(deadline) - chartDay(range.start)) / (chartDay(range.end) - chartDay(range.start)) * 596;
    expect(Number(marker.querySelector("line")?.getAttribute("x1"))).toBeCloseTo(expectedX);
    expect(Number(marker.querySelector("rect")?.getAttribute("width"))).toBeGreaterThan(0);
    expect(marker.querySelector('rect[fill^="url"]')).not.toBeNull();
    expect(container.querySelector("desc")?.textContent).toContain("Red hatching marks time after that deadline");
    // The deadline does not manufacture future progress observations.
    expect(container.querySelector("tbody")?.innerHTML).toBe(render(null).querySelector("tbody")?.innerHTML);
  });

  it("does not infer a deadline from task dates when the project has none", () => {
    const container = render(null);
    expect(container.querySelector("[data-progress-deadline]")).toBeNull();
    expect(container.textContent).not.toContain("Deadline:");
  });

  it.each([0, -1, -40])("keeps a deadline %i days from today inside the chart", days => {
    const deadline = addDays(today, days);
    const marker = render(deadline).querySelector("[data-progress-deadline]")!;
    const position = Number(marker.querySelector("line")?.getAttribute("x1"));
    expect(position).toBeGreaterThan(22);
    expect(position).toBeLessThan(618);
    expect(Number(marker.querySelector("rect")?.getAttribute("width"))).toBeGreaterThan(0);
  });

  it("keeps the existing date window when no deadline is set", () => {
    expect(progressChartRange("2026-10-27", "2026-10-27", null)).toEqual({ start: "2026-10-20", end: "2026-11-03" });
    expect(progressChartRange("2026-10-01", "2026-10-27", null)).toEqual({ start: "2026-10-01", end: "2026-11-10" });
  });
  it("uses the configured project start at the left edge regardless of observation dates", () => {
    for (const startDate of [addDays(today, -60), today, addDays(today, 10)]) {
      const deadline = addDays(startDate, 40);
      const container = render(deadline, { startDate });
      expect(container.querySelector('[data-progress-start]')?.getAttribute('data-progress-start')).toBe(startDate);
      expect(container.querySelector('[data-chart-boundary="start"] time')?.getAttribute('dateTime')).toBe(startDate);
      expect(parseFloat(container.querySelector<HTMLElement>('[data-chart-boundary="start"]')!.style.left)).toBeCloseTo(22 / 640 * 100);
      const range = progressChartRange(addDays(today,-7),today,deadline,{startDate});
      const expectedX = 22 + (chartDay(deadline)-chartDay(startDate))/(chartDay(range.end)-chartDay(startDate))*596;
      expect(Number(container.querySelector('[data-progress-deadline] line')?.getAttribute('x1'))).toBeCloseTo(expectedX);
      expect(container.querySelector('tbody')?.innerHTML).toBe(render(deadline).querySelector('tbody')?.innerHTML);
      expect(container.querySelector('g[clip-path]')).not.toBeNull();
    }
  });
  it("keeps the full season window through July, including leap years", () => {
    expect(seasonChartRange('S27')).toEqual({startDate:'2026-08-01',endDate:'2027-07-31'});
    expect(seasonChartRange('S28')).toEqual({startDate:'2027-08-01',endDate:'2028-07-31'});
    for (const date of ['2026-07-01','2026-10-27','2027-08-01']) {
      expect(progressChartRange(date,date,'2028-01-01',seasonChartRange('S27'))).toEqual({start:'2026-08-01',end:'2027-07-31'});
    }
    const container=render('2026-11-30',seasonChartRange('S27'));
    expect(container.querySelector('[data-chart-boundary="start"]')?.textContent).toBe('1 Aug');
    expect(container.querySelector('[data-chart-boundary="end"]')?.textContent).toBe('31 Jul');
  });
  it("keeps the scope area and deadline regions bounded when dates lie outside the window", () => {
    for (const bounds of [seasonChartRange('S26'),seasonChartRange('S28')]) {
      for (const deadline of ['2025-01-01','2029-01-01']) {
        const container=render(deadline,bounds);
        expect(container.querySelector('[data-progress-deadline] line')).toBeNull();
        for (const rect of container.querySelectorAll('svg rect')) {
          expect(Number(rect.getAttribute('width'))).toBeGreaterThanOrEqual(0);
          expect(Number(rect.getAttribute('x'))).toBeGreaterThanOrEqual(22);
          expect(Number(rect.getAttribute('x'))+Number(rect.getAttribute('width'))).toBeLessThanOrEqual(618);
        }
        expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(0);
      }
    }
  });
  it("keeps valid bounds for future starts without a deadline and preserves a boundary deadline", () => {
    const startDate=addDays(today,30);
    const range=progressChartRange(today,today,null,{startDate});
    expect(range.start).toBe(startDate);expect(range.end>startDate).toBe(true);
    const container=render(startDate,{startDate});
    expect(container.querySelector('[data-chart-boundary="start"]')?.textContent).not.toBe('');
    expect(Number(container.querySelector('[data-progress-deadline] line')?.getAttribute('x1'))).toBe(22);
  });

  it("starts the season red tail exactly at 31 July while retaining the season bounds", () => {
    const bounds=seasonChartRange('S27');
    const container=render(bounds.endDate,{...bounds,showDeadlineTail:true});
    const marker=container.querySelector('[data-progress-deadline="2027-07-31"]')!;
    const boundary=Number(marker.querySelector('line')?.getAttribute('x1'));
    expect(boundary).toBe(570);
    for(const rect of marker.querySelectorAll('rect')) {
      expect(Number(rect.getAttribute('x'))).toBe(boundary);
      expect(Number(rect.getAttribute('width'))).toBe(618-boundary);
    }
    expect(container.querySelector('[data-progress-start]')?.getAttribute('data-progress-start')).toBe('2026-08-01');
    expect(container.querySelector('[data-progress-end]')?.getAttribute('data-progress-end')).toBe('2027-07-31');
    expect(container.querySelector('[data-chart-boundary="end"]')?.textContent).toBe('31 Jul');
    expect(container.querySelector('[data-chart-boundary="end"]')?.getAttribute('class')).toContain('text-destructive');
  });

  it.each(['S27','S28'])("marks Production start at its actual position in %s", season => {
    const bounds=seasonChartRange(season);
    const productionStartDate=`${bounds.endDate.slice(0,4)}-01-04`;
    const productionEvent={value:"production-start" as const,label:"Production start",date:productionStartDate};
    const container=render(bounds.endDate,{...bounds,showDeadlineTail:true,events:[productionEvent],visibleEventIds:[productionEvent.value]});
    const marker=container.querySelector(`[data-progress-event="${productionEvent.value}"]`)!;
    const expectedX=22+(chartDay(productionStartDate)-chartDay(bounds.startDate))/(chartDay(bounds.endDate)-chartDay(bounds.startDate))*(570-22);
    expect(Number(marker.querySelector('line')?.getAttribute('x1'))).toBeCloseTo(expectedX);
    expect(marker.querySelector('line')?.getAttribute('x2')).toBe(marker.querySelector('line')?.getAttribute('x1'));
    expect(marker.querySelector('line')?.classList.contains('text-foreground')).toBe(true);
    expect(marker.querySelector('title')?.textContent).toBe(`Production start: 4 Jan ${bounds.endDate.slice(0,4)}`);
    expect(container.querySelector(`time[datetime="${productionStartDate}"]`)?.textContent).toBe('4 Jan');
    expect(container.querySelector('tbody')?.innerHTML).toBe(render(bounds.endDate,{...bounds,showDeadlineTail:true}).querySelector('tbody')?.innerHTML);
  });
  it("does not add season event markers to project charts or outside the visible range", () => {
    const productionEvent={value:"production-start" as const,label:"Production start",date:"2027-01-04"};
    expect(render('2027-07-31').querySelector('[data-progress-event]')).toBeNull();
    expect(render('2027-07-31',{...seasonChartRange('S27'),events:[{...productionEvent,date:'2028-01-04'}],visibleEventIds:[productionEvent.value]}).querySelector('[data-event-label]')).toBeNull();
  });

});
