import { describe, expect, it } from "vitest";
import { emptyCv, validateCvData } from "./model";
import { changeCvLanguage, hasRegisteredCv, localizedCv } from "./translations";

function bilingualCv() {
  return { ...emptyCv("Alex", "alex@example.invalid"), cvLanguage: "nb" as const, headline: "Maskiningeniørstudent", summary: "Utvikler hjuloppheng.",
    education: [{ id: "education-1", institution: "NMBU", degree: "Maskinteknikk", startDate: "2023", endDate: "2028", description: "Mekanikk." }],
    translations: { en: { headline: "Mechanical engineering student", summary: "Developing suspension.", "education:education-1:degree": "Mechanical engineering" } },
  };
}

describe("manually translated CVs", () => {
  it("stores only English and Norwegian translations and applies them without modifying the original", () => {
    const source = validateCvData(bilingualCv());
    const english = localizedCv(source, "en");
    expect(english.headline).toBe("Mechanical engineering student");
    expect(english.education[0].degree).toBe("Mechanical engineering");
    expect(english.education[0].institution).toBe("NMBU");
    expect(localizedCv(source, "nb").summary).toBe("Utvikler hjuloppheng.");
    expect(source.summary).toBe("Utvikler hjuloppheng.");
    expect(() => validateCvData({ ...source, cvLanguage: "de" })).toThrow("Invalid CV data.");
    expect(() => validateCvData({ ...source, translations: { de: { headline: "Student" } } })).toThrow("Invalid CV data.");
  });
  it("preserves both versions when the original language changes, including fallback text", () => {
    const source = bilingualCv();
    const english = changeCvLanguage(source, "en");
    expect(english.headline).toBe("Mechanical engineering student");
    expect(english.translations?.nb?.headline).toBe("Maskiningeniørstudent");
    expect(english.translations?.en).toBeUndefined();
    const norwegian = changeCvLanguage(english, "nb");
    expect(norwegian.summary).toBe(source.summary);
    expect(norwegian.education).toEqual(source.education);
    expect(localizedCv(norwegian, "en").summary).toBe("Developing suspension.");
  });
  it("drops translations for removed entries and protects contact, identity and sharing fields", () => {
    const source = bilingualCv();
    source.translations.en = { ...source.translations.en, phone: "secret", contactEmail: "hidden@example.invalid", helixRole: "Admin", "education:removed:degree": "Deleted" } as typeof source.translations.en;
    const parsed = validateCvData(source);
    expect(Object.keys(parsed.translations!.en!)).toEqual(["headline", "summary", "education:education-1:degree"]);
    expect(() => validateCvData({ ...source, translations: { en: { "education:education-1:grade": "a".repeat(101) } } })).toThrow("Invalid CV data.");
  });
  it("distinguishes basic profile details and unfinished setup from a registered CV", () => {
    expect(hasRegisteredCv({ ...emptyCv("Alex", "alex@example.invalid"), phone: "+47 12345678", fieldOfStudy: "Engineering", graduationYear: "2028" })).toBe(false);
    expect(hasRegisteredCv(bilingualCv())).toBe(true);
    expect(hasRegisteredCv({ ...bilingualCv(), cvRegistered: false })).toBe(false);
    expect(hasRegisteredCv({ ...emptyCv(), cvRegistered: true })).toBe(true);
  });
});
