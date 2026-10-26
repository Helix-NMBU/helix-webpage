import { describe, expect, it } from "vitest";
import { editProfilePhone, phoneCountries, saveProfilePhone, splitProfilePhone } from "./profile-phone";
import { nmbuStudyFieldLabel, nmbuStudyFields } from "./nmbu-study-fields";

describe("profile phone country handling", () => {
  it("offers country names and calling codes, including countries sharing a code", () => {
    expect(phoneCountries.length).toBeGreaterThan(230);
    for (const [code, label, calling] of [["NO", "Norway", "+47"], ["GB", "United Kingdom", "+44"], ["US", "United States", "+1"], ["CA", "Canada", "+1"]]) {
      expect(phoneCountries.find(country => country.value === code)).toMatchObject({ label, detail: calling });
    }
  });
  it.each(["46318917", "+47 463 18 917", "0047 46318917", "office 123 ext 4", ""])("keeps an untouched stored number unchanged: %s", (original) => {
    expect(saveProfilePhone(splitProfilePhone(original), original)).toBe(original);
  });
  it("detects the country of existing and pasted international numbers", () => {
    expect(splitProfilePhone("+47 12345678")).toMatchObject({ country: "NO", national: "12345678" });
    expect(splitProfilePhone("+44 20 7946 0018")).toMatchObject({ country: "GB", national: "2079460018" });
    const pasted = editProfilePhone("0044 20 7946 0018", splitProfilePhone(""));
    expect(pasted).toMatchObject({ country: "GB", national: "2079460018", changed: true });
    expect(saveProfilePhone(pasted, "")).toBe("+44 20 7946 0018");
    expect(splitProfilePhone("+1 416 555 0123").country).toBe("CA");
  });
  it("uses the selected country and handles national trunk prefixes", () => {
    expect(saveProfilePhone({ country: "GB", national: "020 7946 0018", changed: true }, "")).toBe("+44 20 7946 0018");
    expect(saveProfilePhone({ country: "NO", national: "46318917", changed: true }, "").replace(/ /g, "")).toBe("+4746318917");
  });
  it("rejects incomplete numbers and allows clearing the optional phone field", () => {
    expect(() => saveProfilePhone({ country: "NO", national: "123", changed: true }, "old")).toThrow("valid phone number");
    expect(saveProfilePhone({ country: "NO", national: "", changed: true }, "old")).toBe("");
  });
});

describe("NMBU study field names", () => {
  it("finds English names from Norwegian names and retains an unmatched existing value", () => {
    expect(nmbuStudyFieldLabel("Industriell økonomi")).toBe("Industrial Economics");
    expect(nmbuStudyFieldLabel("Teknologi og produktutvikling")).toBe("Technology and Product Development");
    expect(nmbuStudyFieldLabel("Anvendt robotikk")).toBe("Applied Robotics");
    expect(nmbuStudyFieldLabel("Existing specialist programme")).toBe("Existing specialist programme");
  });
  it("includes fields across NMBU faculties, not only engineering or English-taught programmes", () => {
    const fields = nmbuStudyFields.map(field => field.label);
    for (const label of ["Veterinary Nursing", "Veterinary Medicine", "Animal Science", "Plant Sciences", "Urban and Regional Planning", "Public Health", "Economics", "Teacher Education in Natural Sciences"]) expect(fields).toContain(label);
    expect(new Set(fields).size).toBe(fields.length);
  });
});
