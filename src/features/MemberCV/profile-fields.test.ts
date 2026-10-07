import { describe, expect, it, vi } from "vitest";
import { createDemoRepository, DEMO_STORAGE_KEY } from "./demo";
import { localizeCvError } from "./errors";
import { emptyCv, privateSharing, sharedCvData, validateCvData } from "./model";
import { createCvRepository, validateMutation } from "./repository";
import type { CvData, CvEnvelope, CvMutation } from "./types";

function legacy(): CvData {
  return {
    ...emptyCv("Ada Eksempel", "private@example.no"),
    phone: "+47 12345678",
    education: [{ id: "e", institution: "NMBU", degree: "MSc", startDate: "Autumn 2023", endDate: "Expected spring 2028", description: "Mechanics" }],
    experience: [{ id: "x", organization: "Example", title: "Engineer", startDate: "Summer 2025", endDate: "Ongoing", description: "Prototype work" }],
    projects: [{ id: "p", name: "Helix", role: "Design", season: "S27", description: "Sensors", url: "https://example.com" }],
  };
}

function expanded(): CvData {
  const cv = legacy();
  Object.assign(cv.education[0], { fieldOfStudy: "Robotics", grade: "A", activities: "Student robotics society" });
  Object.assign(cv.experience[0], { employmentType: "Part-time", location: "Ås", locationType: "Hybrid", startDate: "2025-06", endDate: "Present" });
  Object.assign(cv.projects[0], { startDate: "2026-08", endDate: "Present" });
  return cv;
}

const fields = [
  { section: "education", key: "fieldOfStudy", label: "field of study", nb: "studieretning", limit: 500 },
  { section: "education", key: "grade", label: "grade", nb: "karakter", limit: 100 },
  { section: "education", key: "activities", label: "activities", nb: "aktiviteter", limit: 8000 },
  { section: "experience", key: "employmentType", label: "employment type", nb: "ansettelsestype", limit: 100 },
  { section: "experience", key: "location", label: "location", nb: "arbeidssted", limit: 500 },
  { section: "experience", key: "locationType", label: "location type", nb: "arbeidsform", limit: 100 },
  { section: "projects", key: "startDate", label: "start date", nb: "startdato", limit: 30 },
  { section: "projects", key: "endDate", label: "end date", nb: "sluttdato", limit: 30 },
] as const;

describe("additive profile fields", () => {
  it("leaves legacy omitted fields absent and free-text dates unchanged", () => {
    const old = legacy();
    expect(validateCvData(old)).toEqual(old);
    expect(validateCvData(old, true)).toEqual(old);
    expect(Object.keys(validateCvData(old).projects[0])).toEqual(Object.keys(old.projects[0]));
  });

  it("retains every new field through draft/publication validation and contact redaction", () => {
    const cv = expanded();
    expect(validateCvData(cv)).toEqual(cv);
    expect(validateMutation({ action: "publish", draft: cv, expectedRevision: 0 }).draft).toEqual(cv);
    const redacted = sharedCvData(validateCvData(cv, true), privateSharing);
    expect(redacted.education).toEqual(cv.education);
    expect(redacted.experience).toEqual(cv.experience);
    expect(redacted.projects).toEqual(cv.projects);
    expect(redacted.contactEmail).toBe("");
    expect(redacted.phone).toBe("");
    expect(cv.contactEmail).toBe("private@example.no");
  });

  it.each(fields)("validates $section.$key at its exact limit and rejects malformed present values", ({ section, key, label, nb, limit }) => {
    const valid = legacy();
    Object.assign(valid[section][0], { [key]: "x".repeat(limit) });
    expect(validateCvData(valid)[section][0]).toHaveProperty(key, "x".repeat(limit));
    Object.assign(valid[section][0], { [key]: "  text  " });
    expect(validateCvData(valid)[section][0]).toHaveProperty(key, "text");
    Object.assign(valid[section][0], { [key]: "" });
    expect(validateCvData(valid)[section][0]).toHaveProperty(key, "");
    for (const value of [null, undefined, false, 42, [], {}, "bad\u0000text", "x".repeat(limit + 1)]) {
      const invalid = legacy();
      Object.assign(invalid[section][0], { [key]: value });
      expect(() => validateCvData(invalid)).toThrow(`Invalid ${label}.`);
    }
    expect(localizeCvError(`Invalid ${label}.`, "nb")).toBe(`Ugyldig ${nb}.`);
    expect(localizeCvError(`Invalid ${label}.`, "en")).toBe(`Invalid ${label}.`);
  });

  it("keeps optional-only drafts valid without relaxing publication anchors", () => {
    const cv = emptyCv("Ada");
    cv.education = [{ id: "e", institution: "", degree: "", startDate: "", endDate: "", description: "", activities: "Robotics society" }];
    expect(validateCvData(cv).education[0].activities).toBe("Robotics society");
    expect(() => validateCvData(cv, true)).toThrow("institution and degree");
  });

  it("persists new fields through demo save/reload/publication and keeps the snapshot independent", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const repository = createDemoRepository(storage, true);
    const cv = expanded();
    await repository.mutate({ action: "save", draft: cv, expectedRevision: 0 });
    expect((await createDemoRepository(storage, true).load()).document.draft).toEqual(cv);
    const published = await repository.mutate({ action: "publish", draft: cv, expectedRevision: 1 });
    expect(published.document.draft).toEqual(cv);
    expect(published.document.publishedRevision).toBe(2);
    const changed = structuredClone(cv);
    changed.education[0].activities = "Unpublished edits";
    await repository.mutate({ action: "save", draft: changed, expectedRevision: 2 });
    const persisted = JSON.parse(storage.getItem(DEMO_STORAGE_KEY)!) as CvEnvelope & { published: { draft: CvData } };
    expect(persisted.document.draft.education[0].activities).toBe("Unpublished edits");
    expect(persisted.published.draft).toEqual(cv);
  });

  it("roundtrips additive fields through the HTTP repository save and publish payloads/responses", async () => {
    const cv = expanded();
    const envelope: CvEnvelope = {
      identity: { name: "Ada", email: "ada@helixnmbu.no" },
      document: { draft: legacy(), sharing: privateSharing, revision: 0, publishedRevision: null, publishedAt: null },
    };
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const mutation = validateMutation(JSON.parse(String(options?.body)) as CvMutation);
      envelope.document = {
        ...envelope.document,
        draft: mutation.draft!,
        revision: envelope.document.revision + 1,
        ...(mutation.action === "publish" ? { publishedRevision: envelope.document.revision + 1 } : {}),
      };
      return new Response(JSON.stringify(envelope), { status: 200 });
    });
    const repository = createCvRepository(async () => "member-token", request);
    const saved = await repository.mutate({ action: "save", draft: cv, expectedRevision: 0 });
    const published = await repository.mutate({ action: "publish", draft: saved.document.draft, expectedRevision: 1 });
    expect(saved.document.draft).toEqual(cv);
    expect(published.document.draft).toEqual(cv);
    expect(published.document.publishedRevision).toBe(2);
    for (const call of request.mock.calls) expect(JSON.parse(String(call[1]?.body)).draft).toEqual(cv);
  });
});
