import { describe, expect, it } from "vitest";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString } from "pdf-lib";
import { emptyCv, validateCvData } from "../../src/features/MemberCV/model";
import { generateCvPdf } from "./member-cv-pdf";
import type { CvData } from "../../src/features/MemberCV/types";

const shared = { cv: true, email: true, phone: true };

// Read actual saved PDF content through the embedded ToUnicode maps. This stays
// portable in CI without a Poppler executable or a browser runtime dependency.
async function inspect(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const text: string[] = [];
  const urls: string[] = [];
  for (const page of pdf.getPages()) {
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const characterMaps = new Map<string, Map<string, string>>();
    for (const [name, fontRef] of fonts.entries()) {
      const font = pdf.context.lookup(fontRef, PDFDict);
      const cmap = font.lookup(PDFName.of("ToUnicode")) as PDFRawStream;
      const source = Buffer.from(decodePDFRawStream(cmap).decode()).toString();
      const characters = new Map<string, string>();
      for (const match of source.matchAll(/<([0-9a-f]+)>\s+<([0-9a-f]+)>/gi)) {
        const utf16 = match[2].match(/.{4}/g)!.map((unit) => parseInt(unit, 16));
        characters.set(match[1].toUpperCase(), String.fromCharCode(...utf16));
      }
      characterMaps.set(name.toString().slice(1), characters);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const stream of streams) {
      const source = Buffer.from(decodePDFRawStream(pdf.context.lookup(stream) as PDFRawStream).decode()).toString();
      let fontName = "";
      for (const operator of source.matchAll(/\/([^\s]+)\s+[\d.]+\s+Tf|<([0-9a-f]+)>\s+Tj/gi)) {
        if (operator[1]) fontName = operator[1];
        else text.push(operator[2].match(/.{4}/g)!.map((code) => characterMaps.get(fontName)!.get(code.toUpperCase()) ?? "").join(""));
      }
    }
    const annotations = page.node.Annots();
    if (annotations) for (const ref of annotations.asArray()) {
      const action = pdf.context.lookup(ref, PDFDict).lookup(PDFName.of("A"), PDFDict);
      urls.push(action.lookup(PDFName.of("URI"), PDFString).decodeText());
    }
  }
  return { pdf, text: text.join("\n"), urls };
}

function sample(): CvData {
  return {
    ...emptyCv("Åse Ødegård Ærlig", "private@example.no"),
    phone: "+47 12345678", city: "Ås", headline: "Ingeniørstudent", fieldOfStudy: "Robotikk", graduationYear: "2027",
    summary: "Fiktiv prøve. Søker miljø med bærekraft. Élodie, Łukasz, Žaneta. Ελληνικά Русский.",
    education: [{ id: "e1", institution: "NMBU", degree: "Master i robotikk", startDate: "2022", endDate: "2027", description: "Studerer mekanikk og styring." }],
    experience: [{ id: "x1", title: "Sommerstudent", organization: "Eksempelbedrift", startDate: "2025", endDate: "2025", description: "Utviklet måleverktøy." }],
    projects: [{ id: "p1", name: "Helix", role: "Testansvarlig", season: "S27", description: "Prøvde sensorer og dokumenterte resultater.", url: "https://example.com/prosjekt" }],
    skills: ["Python", "CAD"], languages: [{ id: "l1", name: "Norsk", level: "Morsmål" }],
    links: [{ id: "u1", label: "Portefølje", url: "https://example.com/ase" }],
  };
}

describe("generated member CV PDFs", () => {
  it("renders all fields and sections with Norwegian and other supported letters", async () => {
    const { pdf, text, urls } = await inspect(await generateCvPdf(sample(), shared));
    expect(pdf.getPageCount()).toBe(1);
    for (const expected of ["Åse Ødegård Ærlig", "Ingeniørstudent", "Ås", "Robotikk | 2027", "Élodie, Łukasz, Žaneta", "Ελληνικά Русский", "NMBU", "Master i robotikk", "2022 - 2027", "Studerer mekanikk", "Sommerstudent", "Eksempelbedrift", "Utviklet måleverktøy", "Testansvarlig", "S27", "Python", "CAD", "Norsk | Morsmål", "Portefølje", "1 / 1"]) {
      expect(text).toContain(expected);
    }
    expect(urls).toEqual(["https://example.com/prosjekt", "https://example.com/ase"]);
  });

  it.each([
    { email: false, phone: false }, { email: true, phone: false },
    { email: false, phone: true }, { email: true, phone: true },
  ])("honors independent sharing choices $email/$phone in the actual saved PDF", async (flags) => {
    const cv = sample();
    const { pdf, text } = await inspect(await generateCvPdf(cv, { cv: false, ...flags }));
    expect(text.includes(cv.contactEmail)).toBe(flags.email);
    expect(text.includes(cv.phone)).toBe(flags.phone);
    expect(pdf.getTitle()).not.toContain(cv.contactEmail);
    expect(pdf.getAuthor()).toBeUndefined();
    expect(cv.contactEmail).toBe("private@example.no");
    expect(cv.phone).toBe("+47 12345678");
  });

  it("omits empty sections and does not invent data for an incomplete draft", async () => {
    const cv = emptyCv();
    cv.education = [{ id: "blank", institution: "", degree: "", startDate: "", endDate: "", description: "" }];
    const { pdf, text } = await inspect(await generateCvPdf(cv, shared));
    expect(pdf.getPageCount()).toBe(1);
    expect(text.trim()).toBe("1 / 1");
  });

  it("renders all additive profile fields and current markers while still redacting contacts", async () => {
    const cv = sample();
    Object.assign(cv.education[0], { fieldOfStudy: "Autonom styring", grade: "A / 4.5", activities: "Studentforening for robotikk" });
    Object.assign(cv.experience[0], { employmentType: "Part-time", location: "Trondheim", locationType: "Hybrid", startDate: "2025-06", endDate: "Present" });
    Object.assign(cv.projects[0], { startDate: "2026-08", endDate: "Present" });
    const { pdf, text } = await inspect(await generateCvPdf(validateCvData(cv, true), { cv: true, email: false, phone: false }));
    for (const expected of ["Studieretning: Autonom styring", "Karakter: A / 4.5", "Aktiviteter: Studentforening for robotikk", "Part-time | Trondheim | Hybrid", "2025-06 - Present", "S27 | 2026-08 - Present"]) expect(text).toContain(expected);
    expect(text).not.toContain(cv.contactEmail);
    expect(text).not.toContain(cv.phone);
    expect(pdf.getTitle()).not.toContain(cv.contactEmail);
    expect(cv.contactEmail).toBe("private@example.no");
  });

  it("includes optional-only rows and paginates activities without dropping text", async () => {
    const cv = emptyCv("Ada");
    const activities = "Deltok i studentforening.\n".repeat(100) + "AKTIVITETSSLUTT";
    cv.education = [{ id: "e", institution: "", degree: "", startDate: "", endDate: "", description: "", activities }];
    cv.experience = [{ id: "x", organization: "", title: "", startDate: "", endDate: "", description: "", employmentType: "Internship", location: "Ås", locationType: "Remote" }];
    cv.projects = [{ id: "p", name: "", role: "", season: "", description: "", url: "", startDate: "2026", endDate: "Present" }];
    const { pdf, text } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const expected of ["Utdanning", "Aktiviteter:", "AKTIVITETSSLUTT", "Erfaring", "Internship | Ås | Remote", "Helix og prosjekter", "2026 - Present"]) expect(text).toContain(expected);
    expect(text.match(/Deltok i studentforening\./g)).toHaveLength(100);
    expect(text).not.toContain("undefined");
  });

  it("paginates long descriptions, repeated entries and unbroken words without losing text", async () => {
    const cv = sample();
    const longWord = "Æøå".repeat(450);
    cv.summary = longWord;
    cv.experience = Array.from({ length: 12 }, (_, index) => ({
      id: `experience-${index}`, title: `Erfaring ${index}`, organization: "Eksempelbedrift",
      startDate: "2024", endDate: "2026", description: (`Beskrivelse ${index} med måling, øving og bærekraft.\n`).repeat(24) + `SLUTT${index}`,
    }));
    const { pdf, text } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(pdf.getPageCount()).toBeGreaterThan(5);
    expect(text.replace(/\n/g, "")).toContain(longWord);
    for (let index = 0; index < cv.experience.length; index++) {
      expect(text).toContain(`Erfaring ${index}`);
      expect(text).toContain(`SLUTT${index}`);
      expect(text.match(new RegExp(`Beskrivelse ${index} med måling`, "g"))).toHaveLength(24);
    }
    expect(text).toContain("https://example.com/ase");
    expect(text).toContain(`${pdf.getPageCount()} / ${pdf.getPageCount()}`);
  });

  it("does not create active actions for unsafe links even if called without HTTP validation", async () => {
    const cv = emptyCv("Test");
    cv.links = [{ id: "url", label: "Lenke", url: "javascript:alert(1)" }];
    expect((await inspect(await generateCvPdf(cv, shared))).urls).toEqual([]);
  });

  it("reports unsupported glyphs instead of silently losing the member's content", async () => {
    const cv = emptyCv("Test");
    cv.summary = "Tekst med 🦄";
    await expect(generateCvPdf(cv, shared)).rejects.toThrow("does not support");
  });
});
