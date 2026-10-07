import { describe, expect, it } from "vitest";
import { emptyCv } from "./model";
import { moveProjectRoleToExperience } from "./experience";
import { validateProfileMutation } from "./validate-profile-mutation";

function data(date: string) {
  const cv = emptyCv("Ada");
  cv.education = [{ id: "education", institution: "NMBU", degree: "Master", startDate: date, endDate: "Present", description: "" }];
  return cv;
}
const sharing = { cv: false, email: false, phone: false };

describe("member date mutation guard", () => {
  it.each(["save", "publish", "preview"] as const)("rejects newly edited incomplete dates before %s without changing input", (action) => {
    const draft = data("202-08");
    expect(() => validateProfileMutation({ action, draft, sharing, expectedRevision: 0 }, data("2023"))).toThrow("Complete the date before saving.");
    expect(draft.education[0].startDate).toBe("202-08");
  });
  it.each(["2024-13", "2023-02-29", "0000"])("preserves unchanged previously saved date %s during unrelated edits", (date) => {
    const saved = data(date);
    const draft = { ...saved, headline: "New headline" };
    expect(validateProfileMutation({ action: "save", draft, sharing, expectedRevision: 1 }, saved).draft?.education[0].startDate).toBe(date);
  });
  it("allows year-only, valid leap dates, free text and current markers", () => {
    for (const date of ["2023", "2024-02", "2024-02-29", "Summer 2024", "Present"]) {
      expect(validateProfileMutation({ action: "publish", draft: data(date), sharing, expectedRevision: 0 }).draft?.education[0].startDate).toBe(date);
    }
  });
  it("keeps ordinary publication and contact validation", () => {
    const draft = data("2024");
    draft.contactEmail = "invalid-email";
    expect(() => validateProfileMutation({ action: "save", draft, sharing, expectedRevision: 0 })).toThrow("Enter a valid contact email.");
    const incomplete = emptyCv();
    expect(() => validateProfileMutation({ action: "publish", draft: incomplete, sharing, expectedRevision: 0 })).toThrow("Add your name");
  });

  it.each(["202-08", "2024-13", "2023-02-29", "0000"])("preserves exact prior project date %s only during an explicit transfer", (date) => {
    const saved = data("2024");
    saved.projects = [{ id: "project", name: "Aerodynamics", role: "Lead", season: "S27", description: "Existing content", url: "https://example.no", startDate: date, endDate: "Summer 2025" }];
    const transferred = moveProjectRoleToExperience(saved, "project", "role");
    for (const action of ["save", "publish", "preview"] as const) {
      expect(validateProfileMutation({ action, draft: transferred, sharing, expectedRevision: 1 }, saved).draft?.experience[0].startDate).toBe(date);
    }
    expect(() => validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 })).toThrow();
    const retainedSource = { ...transferred, projects: saved.projects };
    expect(() => validateProfileMutation({ action: "save", draft: retainedSource, sharing, expectedRevision: 1 }, saved)).toThrow();
    expect(saved.projects).toHaveLength(1);
    expect(saved.experience).toEqual([]);
  });

  it.each(["organization", "title", "department", "season", "url", "description", "startDate", "endDate"] as const)("does not exempt legacy invalid dates when mapped %s changes", (key) => {
    const saved = data("2024");
    saved.projects = [{ id: "project", name: "Aerodynamics", role: "Lead", season: "S27", description: "Existing content", url: "https://example.no", startDate: "2024-13", endDate: "202-08" }];
    const transferred = moveProjectRoleToExperience(saved, "project", "role");
    transferred.experience[0][key] = key === "url" ? "https://example.no/changed" : "Changed";
    expect(() => validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 }, saved)).toThrow();
  });

  it("validates every other new date and all unsafe URLs despite an exact transfer", () => {
    const saved = data("2024");
    saved.projects = [{ id: "project", name: "Aerodynamics", role: "Lead", season: "S27", description: "Existing content", url: "https://example.no", endDate: "2023-02-29" }];
    const transferred = moveProjectRoleToExperience(saved, "project", "role");
    expect(validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 }, saved).draft?.experience[0]).toMatchObject({ startDate: "", endDate: "2023-02-29" });
    transferred.education = [{ ...transferred.education[0], startDate: "2024-13" }];
    expect(() => validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 }, saved)).toThrow("Enter a month from 01 to 12.");
    const unsafe = structuredClone(saved);
    unsafe.projects[0].url = "javascript:alert(1)";
    expect(() => validateProfileMutation({ action: "save", draft: moveProjectRoleToExperience(unsafe, "project", "role"), sharing, expectedRevision: 1 }, unsafe)).toThrow("Links must be valid http or https URLs.");
  });

  it("rejects extra role fields and only transfers missing sources, rather than borrowing another section's baseline", () => {
    const saved = data("2024");
    saved.projects = [{ id: "project", name: "Aerodynamics", role: "Lead", season: "S27", description: "Existing content", url: "", startDate: "2024-13" }];
    const transferred = moveProjectRoleToExperience(saved, "project", "role");
    transferred.experience[0].location = "New location";
    expect(() => validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 }, saved)).toThrow("Enter a month from 01 to 12.");
    transferred.experience = [{ id: "project", organization: "Helix NMBU", title: "Lead", description: "", startDate: "2024-13", endDate: "" }];
    expect(() => validateProfileMutation({ action: "save", draft: transferred, sharing, expectedRevision: 1 }, saved)).toThrow("Enter a month from 01 to 12.");
  });
});
