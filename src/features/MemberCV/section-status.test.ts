import { describe, expect, it } from "vitest";
import { emptyCv, privateSharing } from "./model";
import { getSectionStatuses, type CvSectionKey } from "./section-status";
import type { CvData, CvRecord } from "./types";

function record(draft = emptyCv()): CvRecord {
  return {
    draft: structuredClone(draft),
    sharing: { ...privateSharing },
    revision: 3,
    publishedRevision: null,
    publishedAt: null,
  };
}

const rowSections = [
  {
    key: "education",
    blank: { id: "e1", institution: "", degree: "", startDate: "", endDate: "", description: "" },
    first: "institution",
    second: "degree",
    optional: "description",
  },
  {
    key: "experience",
    blank: { id: "x1", organization: "", title: "", startDate: "", endDate: "", description: "" },
    first: "organization",
    second: "title",
    optional: "description",
  },
  {
    key: "projects",
    blank: { id: "p1", name: "", role: "", season: "", description: "", url: "" },
    first: "name",
    second: "role",
    optional: "description",
  },
  {
    key: "languages",
    blank: { id: "l1", name: "", level: "" },
    first: "name",
    second: "level",
    optional: "level",
  },
  {
    key: "links",
    blank: { id: "u1", label: "", url: "" },
    first: "label",
    second: "url",
    optional: "url",
  },
] as const;

type RowSection = (typeof rowSections)[number]["key"];

function withRows(key: RowSection, rows: Record<string, string>[]): CvData {
  // The parameterized fixtures retain the complete shape for their section.
  return { ...emptyCv(), [key]: rows } as CvData;
}

describe("CV section content and acknowledged-save status", () => {
  it("keeps new optional sections empty and private sharing valid", () => {
    const statuses = getSectionStatuses(emptyCv(), privateSharing, record());
    for (const key of Object.keys(statuses) as CvSectionKey[]) {
      expect(statuses[key]).toEqual({
        content: key === "sharing" ? "filled" : "empty",
        dirty: false,
      });
    }
  });

  it("uses name as the contact minimum without requiring optional fields", () => {
    const saved = record();
    const draft = emptyCv("Ada Eksempel");
    expect(getSectionStatuses(draft, privateSharing, saved).contact).toEqual({ content: "filled", dirty: true });
    draft.fullName = " ";
    draft.summary = "Student interested in robotics.";
    expect(getSectionStatuses(draft, privateSharing, saved).contact.content).toBe("started");
  });

  it.each(rowSections)("ignores ID-only and whitespace rows in $key content", ({ key, blank, first }) => {
    const draft = withRows(key, [{ ...blank, [first]: " \n " }]);
    expect(getSectionStatuses(draft, privateSharing, record())[key]).toEqual({ content: "empty", dirty: true });
    expect(getSectionStatuses(draft, privateSharing, record(draft))[key]).toEqual({ content: "empty", dirty: false });
  });

  it.each(rowSections)("keeps partial and mixed $key rows started", ({ key, blank, first, second, optional }) => {
    const partial = { ...blank, [first]: "Example" };
    const complete = { ...blank, id: "complete", [first]: "Example", [second]: "Anchor" };
    for (const rows of [[partial], [complete, partial], [{ ...blank, [optional]: "Some detail" }]]) {
      expect(getSectionStatuses(withRows(key, rows), privateSharing, record())[key].content).toBe("started");
    }
    const draft = withRows(key, [complete, { ...blank }]);
    expect(getSectionStatuses(draft, privateSharing, record())[key].content).toBe("filled");
  });

  it("marks skills with useful text as filled without counting blank placeholders", () => {
    const draft = emptyCv();
    draft.skills = [" ", "\n"];
    expect(getSectionStatuses(draft, privateSharing, record()).skills).toEqual({ content: "empty", dirty: true });
    draft.skills.push("TypeScript");
    expect(getSectionStatuses(draft, privateSharing, record()).skills.content).toBe("filled");
  });

  it("compares all contact fields exactly and clears dirty on revert", () => {
    const draft = emptyCv("Ada Eksempel");
    const saved = record(draft);
    const fields = ["fullName", "headline", "contactEmail", "phone", "city", "summary", "fieldOfStudy", "graduationYear"] as const;
    for (const field of fields) {
      draft[field] += " ";
      expect(getSectionStatuses(draft, privateSharing, saved).contact.dirty).toBe(true);
      draft[field] = saved.draft[field];
      expect(getSectionStatuses(draft, privateSharing, saved).contact.dirty).toBe(false);
    }
  });

  it("detects row value, ID and order changes without treating property order as an edit", () => {
    const draft = emptyCv();
    draft.languages = [{ id: "a", name: "Norwegian", level: "Native" }, { id: "b", name: "English", level: "Fluent" }];
    const saved = record(draft);
    draft.languages[0] = { level: "Native", name: "Norwegian", id: "a" };
    expect(getSectionStatuses(draft, privateSharing, saved).languages.dirty).toBe(false);
    draft.languages.reverse();
    expect(getSectionStatuses(draft, privateSharing, saved).languages.dirty).toBe(true);
    draft.languages.reverse();
    draft.languages[0].id = "new-id";
    expect(getSectionStatuses(draft, privateSharing, saved).languages.dirty).toBe(true);
    draft.languages[0].id = "a";
    draft.languages[0].level = "Fluent";
    expect(getSectionStatuses(draft, privateSharing, saved).languages.dirty).toBe(true);
  });

  it("keeps each section dirty only when its own values change", () => {
    const draft = emptyCv("Ada Eksempel");
    const saved = record(draft);
    draft.skills = ["TypeScript", "Python"];
    const sharing = { ...privateSharing, email: true };
    const statuses = getSectionStatuses(draft, sharing, saved);
    expect(Object.entries(statuses).filter(([, status]) => status.dirty).map(([key]) => key)).toEqual(["skills", "sharing"]);
    expect(statuses.sharing.content).toBe("filled");
    const acknowledged = { ...saved, draft: structuredClone(draft), sharing: { ...sharing } };
    draft.skills.reverse();
    expect(getSectionStatuses(draft, sharing, acknowledged).skills.dirty).toBe(true);
  });

  it("keeps edits dirty through a failed save until the acknowledged baseline changes", () => {
    const saved = record(emptyCv("Ada Eksempel"));
    const draft = structuredClone(saved.draft);
    const sharing = { ...saved.sharing, cv: true };
    draft.headline = "Engineering student";
    const beforeSave = getSectionStatuses(draft, sharing, saved);
    // A rejected save leaves the existing confirmed record in place.
    expect(getSectionStatuses(draft, sharing, saved)).toEqual(beforeSave);
    expect(beforeSave.contact.dirty).toBe(true);
    expect(beforeSave.sharing.dirty).toBe(true);
    const acknowledged = { ...saved, draft: structuredClone(draft), sharing: { ...sharing }, revision: saved.revision + 1 };
    expect(Object.values(getSectionStatuses(draft, sharing, acknowledged)).every((status) => !status.dirty)).toBe(true);
    expect(saved.draft.headline).toBe("");
    expect(saved.sharing.cv).toBe(false);
  });

  it("does not infer content or saving from publication metadata", () => {
    const saved = record();
    const draft = emptyCv("Ada Eksempel");
    const unpublished = getSectionStatuses(draft, privateSharing, saved);
    const published = { ...saved, revision: 20, publishedRevision: 18, publishedAt: "2026-10-06T12:00:00Z" };
    expect(getSectionStatuses(draft, privateSharing, published)).toEqual(unpublished);
    expect(unpublished.contact.dirty).toBe(true);
    expect(unpublished.education.content).toBe("empty");
  });

  it("does not mutate draft, sharing or saved values", () => {
    const draft = emptyCv("Ada Eksempel");
    draft.languages = [{ id: "l", name: "Norwegian", level: "Native" }];
    const sharing = { ...privateSharing };
    const saved = record(draft);
    const before = structuredClone({ draft, sharing, saved });
    Object.freeze(draft.languages[0]);
    Object.freeze(draft.languages);
    Object.freeze(draft);
    Object.freeze(sharing);
    Object.freeze(saved);
    getSectionStatuses(draft, sharing, saved);
    expect({ draft, sharing, saved }).toEqual(before);
  });
});
