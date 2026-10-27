import { describe, expect, it } from "vitest";
import { directoryFixture } from "./fixtures.test-support";
import { projectGroups, projectView, visibleProjects } from "./project-view";
import { timelineRange } from "./ProjectTimeline";

describe("project views", () => {
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
  it("keeps an undated project undated and uses a finite calendar window", () => {
    const project = { ...directoryFixture().projects[0], deadline: null, milestones: [] };
    const range = timelineRange([project], "2026-10-27");
    expect(range.months.length).toBeGreaterThan(0); expect(range.months.length).toBeLessThan(12);
    expect(project.deadline).toBeNull();
    expect(projectView(new URLSearchParams("columns=&view=timeline")).columns).toEqual([]);
  });
});
