import { describe, expect, it } from "vitest";
import { emptyCv, privateSharing, sharedCvData, validateCvData, validateSharing } from "./model";

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
});
