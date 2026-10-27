// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressChart } from "./OverviewProgress";
import { initialLocalWorkspace } from "./local-repository";
import { addDays, osloDate } from "./model";
import { chartDay, progressChartRange } from "./progress-chart";

const today = osloDate();
function render(deadline: string | null) {
  const workspace = initialLocalWorkspace();
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ProgressChart workspace={workspace} deadline={deadline} compact={false} />);
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
});
