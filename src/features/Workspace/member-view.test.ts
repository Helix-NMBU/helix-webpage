import { describe, expect, it } from "vitest";
import { directoryFixture } from "./fixtures.test-support";
import { memberGroups, memberView } from "./member-view";

describe("member directory view", () => {
  it("supports hiding every optional column and rejects unknown view values", () => {
    expect(memberView(new URLSearchParams("columns=&group=unknown&sort=unknown")).columns).toEqual([]);
    expect(memberView(new URLSearchParams("group=unknown&sort=unknown"))).toMatchObject({ group: "none", sort: "name", direction: "asc" });
  });

  it("sorts dates in either direction with missing dates last", () => {
    const data = directoryFixture();
    data.members = [...data.members, { ...data.members[0], id: "third", name: "Third Example" }];
    data.members[0].joinedAt = null;
    data.members[1].joinedAt = "2024-01-01";
    data.members[2].joinedAt = "2025-01-01";
    const names = (direction: string) => memberGroups(data, memberView(new URLSearchParams({ sort: "joined", direction })), "")[0].members.map(member => member.id);
    expect(names("asc")).toEqual([data.members[1].id, data.members[2].id, data.members[0].id]);
    expect(names("desc")).toEqual([data.members[2].id, data.members[1].id, data.members[0].id]);
  });

  it("groups a member under each department and applies search before grouping", () => {
    const data = directoryFixture();
    const member = data.members[0];
    data.departments = data.departments.slice(0, 2).map(department => ({ ...department, leadIds: [], leadId: null, memberIds: [member.id], viewerIds: [] }));
    const groups = memberGroups(data, memberView(new URLSearchParams("group=department")), member.name);
    expect(groups.map(group => group.name).sort()).toEqual(data.departments.map(department => department.name).sort());
    expect(groups.every(group => group.members.some(item => item.id === member.id))).toBe(true);
  });
});
