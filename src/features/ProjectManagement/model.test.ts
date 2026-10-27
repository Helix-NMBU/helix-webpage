import { describe, expect, it } from "vitest";
import { initialLocalWorkspace } from "./local-repository";
import { addDays, osloDate, summarize, taskUrgency, validateProject, validateTask } from "./model";

describe("project progress and deadlines", () => {
  it("validates optional project starts and their order against deadlines", () => {
    const project = { name:"Build",description:"",category:"production" as const,departments:["Mechanical & Production"],deadline:"2026-12-01" };
    expect(validateProject(project).startDate).toBeNull();
    expect(validateProject({...project,startDate:"2026-12-01"}).startDate).toBe("2026-12-01");
    expect(validateProject({...project,startDate:"2026-10-01",deadline:null}).startDate).toBe("2026-10-01");
    for(const startDate of ["2026-12-02","2026-02-30","1999-01-01"]) expect(()=>validateProject({...project,startDate})).toThrow();
  });

  it("uses the Oslo calendar date across midnight and daylight-saving changes", () => {
    expect(osloDate(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(addDays("2026-10-24", 7)).toBe("2026-10-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("keeps milestones and cancelled work out of the completion denominator", () => {
    const base = initialLocalWorkspace().tasks[0];
    const stats = summarize([{ ...base, status: "done" }, { ...base, status: "todo", deadline: "2026-10-26" }, { ...base, status: "cancelled" }, { ...base, kind: "milestone", status: "todo", deadline: "2026-10-25" }], "2026-10-26");
    expect(stats).toMatchObject({ total: 2, done: 1, percent: 50, overdue: 1, upcoming: 1 });
    expect(summarize([])).toMatchObject({ total: 0, percent: 0 });
  });
  it("includes today and day seven as approaching, without treating closed work as late", () => {
    const base = { ...initialLocalWorkspace().tasks[0], status: "todo" as const };
    expect(taskUrgency({ ...base, deadline: "2026-10-26" }, "2026-10-26")).toBe("soon");
    expect(taskUrgency({ ...base, deadline: "2026-11-02" }, "2026-10-26")).toBe("soon");
    expect(taskUrgency({ ...base, deadline: "2026-11-03" }, "2026-10-26")).toBeNull();
    expect(taskUrgency({ ...base, deadline: "2026-10-25", status: "done" }, "2026-10-26")).toBeNull();
    expect(taskUrgency({ ...base, deadline: null }, "2026-10-26")).toBeNull();
  });
  it("requires real dates, coherent schedules, blocked reasons and partner obligations", () => {
    const base = initialLocalWorkspace().tasks[1];
    expect(() => validateTask({ ...base, deadline: "2026-02-30" })).toThrow("valid date");
    expect(() => validateTask({ ...base, startDate: "2027-01-01", deadline: "2026-01-01" })).toThrow("start date");
    expect(() => validateTask({ ...base, blockedReason: "" })).toThrow("blocking");
    expect(() => validateTask({ ...base, kind: "milestone", milestoneId: null, deadline: null })).toThrow("deadline");
    expect(() => validateTask({ ...base, category: "partnership-deliverables", partnerName: "" })).toThrow("partner");
    expect(validateProject({ name: " Shared project ", description: "", departments: ["Mechanical & Production", "Electronics", "Mechanical & Production"], category: "production", deadline: null }).departments).toEqual(["Mechanical & Production", "Electronics"]);
  });
  it("accepts several unique assignees and rejects malformed assignment lists", () => {
    const base = initialLocalWorkspace().tasks[0];
    const ids = initialLocalWorkspace().members.map(member => member.id);
    expect(validateTask({ ...base, assigneeIds: [...ids, ids[0]] }).assigneeIds).toEqual(ids);
    expect(validateTask({ ...base, assigneeIds: [] }).assigneeIds).toEqual([]);
    expect(() => validateTask({ ...base, assigneeIds: ["not-a-member"] })).toThrow();
    expect(() => validateTask({ ...base, assigneeIds: Array(21).fill(ids[0]) })).toThrow("20");
  });
});
