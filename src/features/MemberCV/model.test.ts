import { describe, expect, it } from "vitest";
import { emptyCv, privateSharing, sharedCvData, validateCvData, validateSharing } from "./model";
import { localizeCvError } from "./errors";
import { moveProjectRoleToExperience } from "./experience";
import type { CvExperience } from "./types";

function experience(overrides: Partial<CvExperience> = {}): CvExperience {
  return { id: "role", organization: "Helix NMBU", title: "Team lead", startDate: "2024", endDate: "Present", description: "Role description", ...overrides };
}

describe("CV input and publication boundaries", () => {
  it("saves an incomplete draft but requires education for publication", () => {
    const draft = emptyCv("Åse Ødegård", "ase@example.no");
    expect(validateCvData(draft)).toEqual(draft);
    expect(() => validateCvData(draft, true)).toThrow("education");
    draft.education.push({ id: "education-1", institution: "NMBU", degree: "Master", startDate: "2024", endDate: "2027", description: "" });
    expect(validateCvData(draft, true).fullName).toBe("Åse Ødegård");
  });
  it("rejects unsafe links, malformed sections and excessive input", () => {
    const draft = emptyCv();
    draft.links = [{ id: "link", label: "Portfolio", url: "javascript:alert(1)" }];
    expect(() => validateCvData(draft)).toThrow("http");
    expect(() => validateCvData({ ...emptyCv(), education: {} })).toThrow("education");
    expect(() => validateCvData({ ...emptyCv(), summary: "x".repeat(8001) })).toThrow("summary");
    expect(() => validateSharing({ cv: "true", email: false, phone: false })).toThrow("sharing");
  });
  it("redacts contacts for sharing without mutating a member's draft", () => {
    const draft = { ...emptyCv("Åse", "private@example.no"), phone: "12345678" };
    const shared = sharedCvData(draft, privateSharing);
    expect(shared.contactEmail).toBe("");
    expect(shared.phone).toBe("");
    expect(draft.contactEmail).toBe("private@example.no");
    expect(sharedCvData(draft, { cv: true, email: true, phone: false }).contactEmail).toBe("private@example.no");
  });

  it("roundtrips optional role metadata through validation and contact redaction without adding omitted legacy fields", () => {
    const draft = { ...emptyCv("Åse", "private@example.no"), phone: "12345678", experience: [experience({ department: "Aerodynamics", season: "S27", url: "https://example.no/project" }), experience({ id: "legacy" })] };
    const validated = validateCvData(JSON.parse(JSON.stringify(draft)));
    expect(validated).toEqual(draft);
    for (const key of ["department", "season", "url"]) expect(validated.experience[1]).not.toHaveProperty(key);
    const shared = sharedCvData(validated, privateSharing);
    expect(shared.experience).toEqual(validated.experience);
    expect(shared.experience).not.toBe(validated.experience);
    expect(shared.contactEmail).toBe("");
    expect(shared.phone).toBe("");
    expect(validated.contactEmail).toBe("private@example.no");
  });

  it.each([
    ["department", "x".repeat(501), "Invalid department."],
    ["department", null, "Invalid department."],
    ["department", "bad\u0000text", "Invalid department."],
    ["season", "x".repeat(31), "Invalid season."],
    ["season", 2027, "Invalid season."],
    ["url", "x".repeat(2001), "Invalid link."],
    ["url", null, "Invalid link."],
  ])("validates present experience %s with the established field limits", (key, value, message) => {
    expect(() => validateCvData({ ...emptyCv(), experience: [experience({ [key]: value } as Partial<CvExperience>)] })).toThrow(message);
    expect(localizeCvError(message, "nb")).not.toBe("Noe gikk galt i medlemsportalen. Prøv igjen senere.");
  });

  it("accepts the metadata bounds and explicit empty optional fields", () => {
    const row = experience({ department: "x".repeat(500), season: "x".repeat(30), url: `https://example.no/${"x".repeat(1981)}` });
    expect(row.url).toHaveLength(2000);
    expect(validateCvData({ ...emptyCv(), experience: [row] }).experience[0]).toEqual(row);
    const blank = experience({ department: "", season: "", url: "" });
    expect(validateCvData({ ...emptyCv(), experience: [blank] }).experience[0]).toEqual(blank);
  });

  it.each(["javascript:alert(1)", "data:text/plain,hello", "ftp://example.no", "https://user:secret@example.no", "/relative", "https://"])("rejects unsafe experience URL %s through save and publication validation", (url) => {
    const draft = { ...emptyCv("Ada"), experience: [experience({ url })] };
    for (const publication of [false, true]) expect(() => validateCvData(draft, publication)).toThrow("Links must be valid http or https URLs.");
  });

  it("keeps a published snapshot independent of an explicit private transfer and preserves sharing metadata", () => {
    const original = { ...emptyCv("Ada", "private@example.no"), phone: "12345678", skills: ["Stored legacy skill"], projects: [{ id: "project", name: "Aerodynamics", role: "Lead", season: "S27", description: "Existing content", url: "https://example.no" }] };
    original.education = [{ id: "school", institution: "NMBU", degree: "Master", startDate: "2024", endDate: "2027", description: "" }];
    const published = sharedCvData(validateCvData(original, true), { cv: true, email: false, phone: false });
    const frozenSnapshot = structuredClone(published);
    const edited = validateCvData(moveProjectRoleToExperience(original, "project", "transferred"));
    expect(edited.projects).toEqual([]);
    expect(edited.experience[0]).toMatchObject({ department: "Aerodynamics", season: "S27", url: "https://example.no" });
    expect(edited.skills).toEqual(original.skills);
    expect(edited.contactEmail).toBe(original.contactEmail);
    expect(edited.phone).toBe(original.phone);
    expect(published).toEqual(frozenSnapshot);
    expect(published.experience).toEqual([]);
    expect(published.projects).toHaveLength(1);
    const republished = sharedCvData(validateCvData(edited, true), privateSharing);
    expect(republished.experience).toEqual(edited.experience);
    expect(republished.contactEmail).toBe("");
    expect(republished.phone).toBe("");
  });
});
