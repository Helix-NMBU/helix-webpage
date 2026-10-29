import { describe, expect, it } from "vitest";
import { directoryFixture } from "./fixtures.test-support";
import { projectGroups, projectView, visibleProjects } from "./project-view";
import { milestonePositions, offscreenProject, timelineRange, timelineTicks } from "./ProjectTimeline";

describe("project views", () => {
  it("keeps every nearby milestone individually accessible in the same lane", () => {
    const milestones = [{ id: "a", title: "First", deadline: "2026-10-01", priority: "normal" as const }, { id: "b", title: "Second", deadline: "2026-10-02", priority: "normal" as const }, { id: "c", title: "Third", deadline: "2026-11-01", priority: "normal" as const }, { id: "d", title: "Undated", deadline: null, priority: "normal" as const }];
    const positions = milestonePositions(milestones, date => (Date.parse(date) - Date.parse("2026-10-01")) / 86400000 * 3);
    expect(positions.map(item => [item.milestone.id, item.position])).toEqual([["a", 0], ["b", 12], ["c", 93]]);
  });
  it("shows progressively more date ticks when zooming in", () => {
    const ticks = (pixelsPerDay: number) => timelineTicks("2026-10-01", "2026-11-01", pixelsPerDay);
    expect(ticks(18)).toHaveLength(31);
    expect(ticks(8).length).toBeGreaterThan(ticks(3).length);
    expect(ticks(3).every(date => date >= "2026-10-01" && date < "2026-11-01")).toBe(true);
  });
  it("identifies projects outside either edge without hiding overlapping or undated projects", () => {
    expect(offscreenProject(10, 20, 30, 100)).toBe("left");
    expect(offscreenProject(120, 150, 30, 100)).toBe("right");
    expect(offscreenProject(20, 50, 30, 100)).toBeNull();
    expect(offscreenProject(null, 20, 30, 100)).toBe("left");
    expect(offscreenProject(null, null, 30, 100)).toBeNull();
  });
  it("combines department, co-Lead, priority, completion and text filters", () => {
    const data = directoryFixture();
    const project = data.projects[0];
    project.leadIds = data.members.map(member => member.id); project.priority = "high"; project.done = project.total;
    const params = new URLSearchParams({ department: data.departments.find(item => project.departments.includes(item.name))!.id, lead: data.members[1].id, priority: "high", completion: "completed" });
    expect(visibleProjects(data, projectView(params), "chassis").map(item => item.id)).toEqual([project.id]);
    params.set("completion", "open");
    expect(visibleProjects(data, projectView(params), "chassis")).toEqual([]);
  });
  it("distinguishes undated, unassigned and empty projects and sorts missing dates last", () => {
    const data = directoryFixture();
    data.projects = data.projects.slice(0, 2);
    data.projects[0] = { ...data.projects[0], deadline: null, leadIds: [], total: 0, done: 0 };
    data.projects[1].deadline = "2026-11-01";
    expect(visibleProjects(data, projectView(new URLSearchParams()), "").map(item => item.id)).toEqual([data.projects[1].id, data.projects[0].id]);
    expect(visibleProjects(data, projectView(new URLSearchParams("lead=none&completion=empty")), "").map(item => item.id)).toEqual([data.projects[0].id]);
  });
  it("places a shared project in each participating department or Lead group", () => {
    const data = directoryFixture(); const project = data.projects[0]; project.leadIds = data.members.map(member => member.id);
    expect(projectGroups([project], data, "department").map(group => group.name).sort()).toEqual([...project.departments].sort());
    expect(projectGroups([project], data, "lead").map(group => group.name).sort()).toEqual(data.members.map(member => member.name).sort());
  });
  it("includes overdue and distant targets and milestones in the calendar domain", () => {
    const project = directoryFixture().projects[0]; project.deadline = "2027-08-31";
    project.milestones = [{ id: "past", title: "Past milestone", deadline: "2025-12-01", priority: "normal" }];
    const range = timelineRange([project], "2026-10-27");
    expect(range.start < "2025-12-01").toBe(true); expect(range.end > "2027-08-31").toBe(true);
    expect(range.months).toContain("2026-01-01"); expect(range.months).toContain("2027-09-01");
  });
  it("includes the project start in the calendar even before every milestone", () => {
    const project = { ...directoryFixture().projects[0], startDate:"2025-01-01", deadline:"2026-12-01" };
    expect(timelineRange([project], "2026-10-27").start < "2025-01-01").toBe(true);
  });
  it("keeps an undated project undated and uses a finite calendar window", () => {
    const project = { ...directoryFixture().projects[0], startDate: null, deadline: null, milestones: [] };
    const range = timelineRange([project], "2026-10-27");
    expect(range.start < "2024-01-01").toBe(true); expect(range.end > "2029-01-01").toBe(true);
    expect(range.months.length).toBeLessThan(80);
    expect(project.deadline).toBeNull();
    expect(projectView(new URLSearchParams("columns=&view=timeline")).columns).toEqual([]);
  });
});
