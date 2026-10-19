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
  const pages: string[] = [];
  const urls: string[] = [];
  const drawn: { page: number; text: string; x: number; y: number; size: number; color: number[]; font: string }[] = [];
  const graphics: string[] = [];
  for (const [pageIndex, page] of pdf.getPages().entries()) {
    const pageText: string[] = [];
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const characterMaps = new Map<string, Map<string, string>>();
    const fontNames = new Map<string, string>();
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
      fontNames.set(name.toString().slice(1), font.lookup(PDFName.of("BaseFont"), PDFName).toString());
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const stream of streams) {
      const source = Buffer.from(decodePDFRawStream(pdf.context.lookup(stream) as PDFRawStream).decode()).toString();
      graphics.push(...[...source.matchAll(/q\n[\s\S]*?\nQ/g)].map((match) => match[0]));
      let fontName = "";
      let size = 0;
      let x = 0;
      let y = 0;
      let color = [0, 0, 0];
      for (const operator of source.matchAll(/\/([^\s]+)\s+([\d.]+)\s+Tf|1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm|([\d.]+) ([\d.]+) ([\d.]+) rg|<([0-9a-f]+)>\s+Tj/gi)) {
        if (operator[1]) { fontName = operator[1]; size = Number(operator[2]); }
        else if (operator[3]) { x = Number(operator[3]); y = Number(operator[4]); }
        else if (operator[5]) color = [Number(operator[5]), Number(operator[6]), Number(operator[7])];
        else {
          const value = operator[8].match(/.{4}/g)!.map((code) => characterMaps.get(fontName)!.get(code.toUpperCase()) ?? "").join("");
          pageText.push(value);
          drawn.push({ page: pageIndex, text: value, x, y, size, color: [...color], font: fontNames.get(fontName)! });
        }
      }
    }
    text.push(...pageText);
    pages.push(pageText.join("\n"));
    const annotations = page.node.Annots();
    if (annotations) for (const ref of annotations.asArray()) {
      const action = pdf.context.lookup(ref, PDFDict).lookup(PDFName.of("A"), PDFDict);
      urls.push(action.lookup(PDFName.of("URI"), PDFString).decodeText());
    }
  }
  return { pdf, text: text.join("\n"), urls, pages, drawn, graphics };
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
    // The reference's larger name, section rules and generous spacing place
    // this fixture's final language/link sections on its second page.
    expect(pdf.getPageCount()).toBe(2);
    for (const expected of ["Åse Ødegård Ærlig", "Ingeniørstudent", "Ås", "Robotikk | 2027", "Élodie, Łukasz, Žaneta", "Ελληνικά Русский", "NMBU", "Master i robotikk", "2022 - 2027", "Studerer mekanikk", "Sommerstudent", "Eksempelbedrift", "Utviklet måleverktøy", "Testansvarlig", "S27", "Norsk | Morsmål", "Portefølje", "2 / 2"]) {
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
    for (const expected of ["Studieretning: Autonom styring", "Karakter: A / 4.5", "Aktiviteter: Studentforening for robotikk", "Part-time | Trondheim | Hybrid", "06.2025 - Nå", "S27 | 08.2026 - Nå"]) expect(text).toContain(expected);
    expect(text).not.toContain(cv.contactEmail);
    expect(text).not.toContain(cv.phone);
    expect(pdf.getTitle()).not.toContain(cv.contactEmail);
    expect(cv.contactEmail).toBe("private@example.no");
  });

  it("formats full dates in European order and omits legacy skills without deleting them", async () => {
    const cv = sample();
    cv.education[0].startDate = "2024-02-29";
    cv.education[0].endDate = "2027-06";
    cv.experience[0].startDate = "Summer 2025";
    const { text } = await inspect(await generateCvPdf(cv, shared));
    expect(text).toContain("29.02.2024 - 06.2027");
    expect(text).toContain("Summer 2025");
    expect(text).not.toContain("Ferdigheter");
    expect(text).not.toContain("Python");
    expect(text).not.toContain("CAD");
    expect(cv.skills).toEqual(["Python", "CAD"]);
    expect(cv.education[0].startDate).toBe("2024-02-29");
  });

  it("includes optional-only rows and paginates activities without dropping text", async () => {
    const cv = emptyCv("Ada");
    const activities = "Deltok i studentforening.\n".repeat(100) + "AKTIVITETSSLUTT";
    cv.education = [{ id: "e", institution: "", degree: "", startDate: "", endDate: "", description: "", activities }];
    cv.experience = [{ id: "x", organization: "", title: "", startDate: "", endDate: "", description: "", employmentType: "Internship", location: "Ås", locationType: "Remote" }];
    cv.projects = [{ id: "p", name: "", role: "", season: "", description: "", url: "", startDate: "2026", endDate: "Present" }];
    const { pdf, text } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const expected of ["Utdanning", "Aktiviteter:", "AKTIVITETSSLUTT", "Erfaring", "Internship | Ås | Remote", "Prosjekter", "2026 - Nå"]) expect(text).toContain(expected);
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

  it("groups Helix positions under one organization while retaining individual dates and moved-role details", async () => {
    const cv = sample();
    cv.experience = [
      { id: "lead", organization: "Helix NMBU", title: "Gruppeleder", startDate: "2026-08-01", endDate: "Present", description: "Ledet testarbeidet.", department: "Elektronikk", season: "S27", url: "https://example.com/elektronikk" },
      { id: "member", organization: " helix ", title: "Gruppemedlem", startDate: "2025-08", endDate: "2026-06", description: "Målte sensorrespons.", employmentType: "Part-time", location: "Ås", locationType: "On-site" },
    ];
    const original = structuredClone(cv);
    const { text, urls } = await inspect(await generateCvPdf(validateCvData(cv, true), { cv: true, email: false, phone: false }));
    expect(text.match(/^Helix NMBU$/gm)).toHaveLength(1);
    for (const expected of ["Erfaring", "Gruppeleder", "Gruppemedlem", "01.08.2026 - Nå", "08.2025 - 06.2026", "Ledet testarbeidet.", "Målte sensorrespons.", "Avdeling: Elektronikk | Sesong: S27", "Part-time | Ås | On-site", "https://example.com/elektronikk", "Prosjekter", "Testansvarlig", "Prøvde sensorer og dokumenterte resultater."]) expect(text.replace(/\n/g, " ")).toContain(expected);
    expect(text.indexOf("Gruppeleder")).toBeLessThan(text.indexOf("Gruppemedlem"));
    expect(text.indexOf("Gruppemedlem")).toBeLessThan(text.indexOf("Prosjekter"));
    expect(text).not.toContain("Helix og prosjekter");
    expect(text).not.toContain(cv.contactEmail);
    expect(text).not.toContain(cv.phone);
    expect(text).not.toContain("Ferdigheter");
    expect(text).not.toContain("Python");
    expect(urls).toEqual(["https://example.com/elektronikk", "https://example.com/prosjekt", "https://example.com/ase"]);
    expect(cv).toEqual(original);
  });

  it("keeps separate organizations and unnamed roles distinct and renders optional-only experience", async () => {
    const cv = emptyCv("Ada");
    cv.experience = [
      { id: "a1", organization: "Example  Company", title: "Ny rolle", startDate: "2026", endDate: "Present", description: "" },
      { id: "a2", organization: " example company ", title: "Tidligere rolle", startDate: "2024", endDate: "2025", description: "" },
      { id: "b", organization: "Example Company AS", title: "Annen bedrift", startDate: "Summer 2023", endDate: "", description: "" },
      { id: "empty1", organization: "", title: "Selvstendig rolle", startDate: "2022", endDate: "", description: "" },
      { id: "empty2", organization: "", title: "", startDate: "", endDate: "", description: "", department: "Mekanikk", season: "S26", url: "https://example.com/mekanikk" },
    ];
    const { text, urls } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(text.match(/^Example Company$/gm)).toHaveLength(1);
    expect(text.match(/^Example Company AS$/gm)).toHaveLength(1);
    for (const expected of ["Ny rolle", "2026 - Nå", "Tidligere rolle", "2024 - 2025", "Annen bedrift", "Summer 2023", "Selvstendig rolle", "2022", "Avdeling: Mekanikk | Sesong: S26"]) expect(text).toContain(expected);
    expect(text.indexOf("Ny rolle")).toBeLessThan(text.indexOf("Tidligere rolle"));
    expect(text.indexOf("Selvstendig rolle")).toBeLessThan(text.indexOf("Avdeling: Mekanikk"));
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("Nå -");
    expect(urls).toEqual(["https://example.com/mekanikk"]);
  });

  it("repeats organization and position context on continuation pages without losing experience or project content", async () => {
    const cv = emptyCv("Ada");
    cv.experience = [
      { id: "long", organization: "Helix NMBU", title: "Gruppeleder", startDate: "2026-08", endDate: "Present", department: "Elektronikk", season: "S27", description: "Lang erfaring med dokumentasjon.\n".repeat(140) + "FØRSTE ROLLE SLUTT", url: "https://example.com/long-role" },
      { id: "next", organization: "Helix", title: "Gruppemedlem", startDate: "2025-08", endDate: "2026-06", description: "Neste erfaring.\n".repeat(70) + "ANDRE ROLLE SLUTT" },
      { id: "other", organization: "Eksempelbedrift", title: "Sommerstudent", startDate: "2024", endDate: "2024", description: "ANNEN BEDRIFT SLUTT" },
    ];
    cv.projects = [{ id: "p", name: "Konkret prosjekt", role: "Testansvarlig", season: "S27", description: "PROSJEKT SLUTT", url: "https://example.com/project" }];
    const { pdf, text, urls, pages } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(pdf.getPageCount()).toBeGreaterThan(4);
    expect(text.match(/Lang erfaring med dokumentasjon\./g)).toHaveLength(140);
    expect(text.match(/Neste erfaring\./g)).toHaveLength(70);
    for (const pageText of pages) {
      if (pageText.includes("Lang erfaring med dokumentasjon.")) {
        expect(pageText).toContain("Helix NMBU");
        expect(pageText).toContain("Gruppeleder");
      }
      if (pageText.includes("Neste erfaring.")) {
        expect(pageText).toContain("Helix NMBU");
        expect(pageText).toContain("Gruppemedlem");
      }
    }
    for (const expected of ["08.2026 - Nå", "08.2025 - 06.2026", "FØRSTE ROLLE SLUTT", "ANDRE ROLLE SLUTT", "ANNEN BEDRIFT SLUTT", "Prosjekter", "Konkret prosjekt", "PROSJEKT SLUTT"]) expect(text).toContain(expected);
    expect(urls).toEqual(["https://example.com/long-role", "https://example.com/project"]);
    expect(text.indexOf("ANDRE ROLLE SLUTT")).toBeLessThan(text.indexOf("Eksempelbedrift"));
    expect(text.indexOf("ANNEN BEDRIFT SLUTT")).toBeLessThan(text.indexOf("Prosjekter"));
    expect(text).toContain(`${pdf.getPageCount()} / ${pdf.getPageCount()}`);
  });

  it("does not turn an unsafe experience URL into a PDF action", async () => {
    const cv = emptyCv("Test");
    cv.experience = [{ id: "e", title: "Rolle", organization: "Helix NMBU", startDate: "", endDate: "", description: "", url: "https://user:password@example.com/private" }];
    const { text, urls } = await inspect(await generateCvPdf(cv, shared));
    expect(text).toContain("https://user:password@example.com/private");
    expect(urls).toEqual([]);
  });

  it("paginates a multiline title longer than a page with bounded continuation headers", async () => {
    const cv = emptyCv("Ada");
    const title = Array(55).fill("Title").join("\n");
    cv.experience = [{ id: "long-title", organization: "Helix NMBU", title, startDate: "2026-08", endDate: "Present", description: "Description ".repeat(500) }];
    const { pdf, text, pages } = await inspect(await generateCvPdf(validateCvData(cv), shared));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getPageCount()).toBeLessThan(10);
    expect(text.match(/^Title$/gm)).toHaveLength(55);
    expect(text.match(/Description/g)).toHaveLength(500);
    expect(text).toContain("08.2026 - Nå");
    for (const pageText of pages.filter((value) => value.includes("Description"))) {
      expect(pageText).toContain("Helix NMBU");
      expect(pageText).toContain("Title");
    }
    expect(cv.experience[0].title).toBe(title);
  });

  it("saves the template's actual font, color, column and background geometry without adding a portrait or extra sections", async () => {
    const cv = sample();
    cv.references = "Fiktiv referanse: prosjektveileder Åse Eksempel.";
    const { pdf, text, drawn, graphics } = await inspect(await generateCvPdf(cv, { cv: true, email: true, phone: false }));
    const item = (value: string) => drawn.find((line) => line.text === value)!;
    const name = item(cv.fullName);
    const headline = item(cv.headline);
    const contact = item(cv.contactEmail);
    expect(name.font).toContain("HelixCVSans-Bold");
    expect(headline.font).toContain("HelixCVSans-Medium");
    expect(contact.font).toContain("HelixCVSans-Light");
    expect(name.size).toBe(32);
    expect(name.color).toEqual([0, 46 / 255, 196 / 255]);
    expect(headline.color).toEqual(name.color);
    expect(contact.color).toEqual(name.color);
    expect(headline.x).toBe(64);
    expect(contact.x).toBeGreaterThan(300);
    expect(headline.page).toBe(name.page);
    expect(contact.page).toBe(name.page);
    expect(headline.y).toBeGreaterThan(name.y);
    expect(contact.y).toBeGreaterThan(name.y);
    const introduction = drawn.find((line) => line.text.includes("Ελληνικά Русский"))!;
    expect(introduction.font).toContain("NotoSans");
    expect(introduction.y).toBeLessThan(name.y);
    expect(item("Robotikk | 2027").y).toBeLessThan(introduction.y);
    const degree = item("Master i robotikk");
    const educationPeriod = item("2022 - 2027");
    expect(degree.font).toContain("Medium");
    expect(degree.x).toBe(64);
    expect(educationPeriod.x).toBeGreaterThan(degree.x + 250);
    expect(Math.abs(educationPeriod.y - degree.y)).toBeLessThan(5);
    const position = item("Sommerstudent");
    const description = item("Utviklet måleverktøy.");
    expect(position.color).toEqual([1, 1, 1]);
    expect(description.color).toEqual([1, 1, 1]);
    expect(description.page).toBe(position.page);
    expect(description.x).toBe(266);
    expect(position.x).toBe(64);
    expect(Math.abs(description.y - position.y)).toBeLessThan(5);
    expect(graphics.some((source) => source.includes("0 0.1803921568627451 0.7686274509803922 rg") && source.includes("595.28 0 l") && source.includes("\nh\nf"))).toBe(true);
    expect(graphics.some((source) => source.includes("1 1 1 RG") && /251 [\d.]+ m[\s\S]*251 [\d.]+ l/.test(source))).toBe(true);
    expect(graphics.some((source) => source.includes("0.58 0.58 0.58 RG"))).toBe(true);
    expect(item("Prosjekter").color).toEqual(name.color);
    expect(item("Helix | Testansvarlig").color).toEqual([0.08, 0.08, 0.08]);
    expect(text).not.toContain(cv.phone);
    for (const absent of ["Om meg", "Frivillig", "Ferdigheter", "Python", "CAD"]) expect(text).not.toContain(absent);
    for (const page of pdf.getPages()) {
      expect(page.getSize()).toEqual({ width: 595.28, height: 841.89 });
      const objects = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
      expect(objects?.entries().length ?? 0).toBe(0);
    }
  });

  it("prints only authored references after the existing sections and omits blank reference sections", async () => {
    const cv = sample();
    const original = structuredClone(cv);
    for (const references of [undefined, "", " \n "]) {
      const { text } = await inspect(await generateCvPdf({ ...cv, references }, shared));
      expect(text).not.toContain("Referanser");
      expect(text).not.toContain("Oppgis på forespørsel");
    }
    cv.references = "Veileder: Élodie Eksempel.\nFiktiv kontakt etter avtale.";
    const { text, pages } = await inspect(await generateCvPdf(cv, shared));
    expect(text).toContain(cv.references);
    expect(text.indexOf("Referanser")).toBeGreaterThan(text.indexOf("Portefølje"));
    expect(pages.at(-1)).toContain("Fiktiv kontakt etter avtale.");
    expect(original.references).toBeUndefined();
  });

  it("paginates either experience column independently, retaining every original title, description, link and reference", async () => {
    const cv = emptyCv("Åse Ødegård");
    const longTitle = Array(50).fill("VENSTRE").join("\n");
    const longDepartment = "D".repeat(400);
    const longUrl = `https://example.com/${"abc".repeat(150)}`;
    cv.experience = [
      { id: "left", organization: "Helix NMBU", title: longTitle, startDate: "2024-02-29", endDate: "2025-06", description: "KORT HØYRE SLUTT", department: longDepartment, season: "S26", url: longUrl },
      { id: "right", organization: "Helix", title: "Kort venstre", startDate: "2026-08-01", endDate: "Present", description: "LANG HØYRE.\n".repeat(160) + "HØYRE SLUTT" },
    ];
    cv.references = "Referansetekst.\n".repeat(100) + "REFERANSE SLUTT";
    const original = structuredClone(cv);
    const { pdf, text, pages, drawn, urls } = await inspect(await generateCvPdf(validateCvData(cv), { cv: true, email: false, phone: false }));
    expect(pdf.getPageCount()).toBeGreaterThan(6);
    expect(pdf.getPageCount()).toBeLessThan(20);
    expect(text.match(/^VENSTRE$/gm)).toHaveLength(50);
    expect(text.match(/^LANG HØYRE\.$/gm)).toHaveLength(160);
    expect(text.replace(/\n/g, "")).toContain(longDepartment);
    expect(text).toContain("KORT HØYRE SLUTT");
    expect(text).toContain("29.02.2024 - 06.2025");
    expect(text).toContain("01.08.2026 - Nå");
    expect(text).toContain("HØYRE SLUTT");
    expect(text.match(/^Referansetekst\.$/gm)).toHaveLength(100);
    expect(pages.at(-1)).toContain("REFERANSE SLUTT");
    expect(urls.length).toBeGreaterThan(1);
    expect(new Set(urls)).toEqual(new Set([longUrl]));
    for (const line of drawn.filter((line) => line.size !== 8)) {
      expect(line.x).toBeGreaterThanOrEqual(64);
      expect(line.x).toBeLessThan(531.28);
      expect(line.y).toBeGreaterThanOrEqual(48);
      expect(line.y).toBeLessThan(777.89);
    }
    for (const pageText of pages.filter((value) => value.includes("LANG HØYRE."))) {
      expect(pageText).toContain("Helix NMBU");
      expect(pageText).toContain("Kort venstre");
    }
    expect(cv).toEqual(original);
  });

  it("reports unsupported glyphs instead of silently losing the member's content", async () => {
    const cv = emptyCv("Test");
    cv.summary = "Tekst med 🦄";
    await expect(generateCvPdf(cv, shared)).rejects.toThrow("does not support");
  });
});
