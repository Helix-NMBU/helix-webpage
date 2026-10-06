import { describe, expect, it } from "vitest";
import { emptyCv } from "./model";
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
});
