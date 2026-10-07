import { describe, expect, it } from "vitest";
import { localizeCvError } from "./errors";
import { groupExperience, moveProjectRoleToExperience } from "./experience";
import { emptyCv } from "./model";
import type { CvExperience } from "./types";

function role(id: string, organization: string): CvExperience {
  return { id, organization, title: id, startDate: "", endDate: "", description: "" };
}
function projectDraft() {
  return {
    ...emptyCv("Ada", "private@example.no"), phone: "12345678", skills: ["Legacy skill"],
    experience: [role("existing", "NMBU")],
    projects: [
      { id: "first", name: "Aerodynamics", role: "Lead", season: "S27", description: "  Exact\nproject text  ", url: "https://example.no/project", startDate: "2023-02-29", endDate: "Summer 2025" },
      { id: "second", name: "Concrete project", role: "Engineer", season: "S26", description: "Other description", url: "" },
    ],
  };
}

describe("experience organization grouping", () => {
  it("groups nonadjacent normalized employers and exact Helix aliases in first-appearance order", () => {
    const rows = [role("one", "  Example   AS "), role("helix-one", " HELIX "), role("two", "example AS"), role("unrelated", "Helix Energy"), role("helix-two", "helix  nmbu"), role("three", "EXAMPLE\tAS")];
    const original = structuredClone(rows);
    const grouped = groupExperience(rows);
    expect(grouped.map(({ key, organization, roles }) => ({ key, organization, ids: roles.map((row) => row.id) }))).toEqual([
      { key: "organization:example as", organization: "Example AS", ids: ["one", "two", "three"] },
      { key: "organization:helix nmbu", organization: "Helix NMBU", ids: ["helix-one", "helix-two"] },
      { key: "organization:helix energy", organization: "Helix Energy", ids: ["unrelated"] },
    ]);
    expect(rows).toEqual(original);
    expect(grouped[0].roles[0]).toBe(rows[0]);
    expect(groupExperience(rows)).toEqual(grouped);
  });

  it("keeps every unnamed row separate, including duplicate IDs, and avoids name collisions", () => {
    const rows = [role("same", ""), role("same", " \t "), role("named", "unnamed:0"), role("helix-as", "Helix AS"), role("helix", "Helix")];
    const grouped = groupExperience(rows);
    expect(grouped).toHaveLength(5);
    expect(grouped.map((group) => group.key)).toEqual(["unnamed:0", "unnamed:1", "organization:unnamed:0", "organization:helix as", "organization:helix nmbu"]);
    expect(grouped[0].roles).toEqual([rows[0]]);
    expect(grouped[1].roles).toEqual([rows[1]]);
    expect(groupExperience([])).toEqual([]);
  });

  it("does not mutate frozen input or leak mutable grouping arrays between calls", () => {
    const row = Object.freeze(role("one", "Helix"));
    const rows = Object.freeze([row]) as unknown as CvExperience[];
    const first = groupExperience(rows);
    first[0].roles.length = 0;
    expect(groupExperience(rows)[0].roles).toEqual([row]);
  });
});

describe("explicit project role transfer", () => {
  it("retains exact content, metadata and legacy dates, removes only the selected project and appends its role", () => {
    const draft = projectDraft();
    const original = structuredClone(draft);
    const result = moveProjectRoleToExperience(draft, "first", "new-role");
    expect(result.experience).toEqual([
      draft.experience[0],
      { id: "new-role", organization: "Helix NMBU", title: "Lead", department: "Aerodynamics", season: "S27", url: "https://example.no/project", description: "  Exact\nproject text  ", startDate: "2023-02-29", endDate: "Summer 2025" },
    ]);
    expect(result.projects).toEqual([draft.projects[1]]);
    expect(result.projects[0]).toBe(draft.projects[1]);
    expect(draft).toEqual(original);
    expect(result.contactEmail).toBe(original.contactEmail);
    expect(result.phone).toBe(original.phone);
    expect(result.skills).toEqual(original.skills);
  });

  it("fills only omitted date strings and leaves a missing source draft unchanged", () => {
    const draft = projectDraft();
    const result = moveProjectRoleToExperience(draft, "second", "new-role");
    expect(result.experience[result.experience.length - 1]).toMatchObject({ startDate: "", endDate: "", department: "Concrete project", season: "S26", url: "" });
    expect(moveProjectRoleToExperience(draft, "missing", "existing")).toBe(draft);
  });

  it("rejects the experience capacity before removing anything with a localized error", () => {
    const draft = projectDraft();
    draft.experience = Array.from({ length: 30 }, (_, index) => role(String(index), "NMBU"));
    const original = structuredClone(draft);
    const message = "Invalid experience. Use at most 30 entries.";
    expect(() => moveProjectRoleToExperience(draft, "first", "new-role")).toThrow(message);
    expect(localizeCvError(message, "nb")).toBe("Ugyldig erfaring. Bruk maks 30 oppføringer.");
    expect(draft).toEqual(original);
    draft.experience.pop();
    expect(moveProjectRoleToExperience(draft, "first", "new-role").experience).toHaveLength(30);
  });

  it.each(["existing", " existing ", "", " ", "bad\u0000id", "x".repeat(101)])("rejects a colliding or invalid new ID %j without changing the source", (id) => {
    const draft = projectDraft();
    const original = structuredClone(draft);
    const message = "Invalid experience entry ID.";
    expect(() => moveProjectRoleToExperience(draft, "first", id)).toThrow(message);
    expect(localizeCvError(message, "nb")).toBe("Ugyldig ID for en oppføring under erfaring.");
    expect(draft).toEqual(original);
  });
});
