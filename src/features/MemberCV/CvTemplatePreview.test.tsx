import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvTemplatePreview } from "./CvTemplatePreview";
import { OptionalReferencesInput } from "./OptionalReferencesInput";
import { emptyCv } from "./model";
import type { CvData, CvSharing } from "./types";

const sharing: CvSharing = { cv: true, email: true, phone: true };
function fixture(): CvData {
  return {
    ...emptyCv("Åse Ødegård", "private@example.no"),
    phone: "+47 12345678", city: "Ås", headline: "Mechanical engineer", summary: "User-authored introduction\nPreserve this line.",
    fieldOfStudy: "Automation", graduationYear: "2028", references: "Dr. Example\nContact me first.", skills: ["Legacy skill stays private"],
    education: [{ id: "ed", institution: "NMBU", degree: "Master in engineering", startDate: "2024-02-29", endDate: "2028-06", fieldOfStudy: "Robotics", grade: "A", activities: "Student robotics club", description: "User-authored education." }],
    experience: [
      { id: "x1", title: "Lead engineer", organization: "Helix NMBU", startDate: "2026-08", endDate: "Present", description: "Led the design team.", employmentType: "Part-time", location: "Ås campus", locationType: "Hybrid", department: "Aero", season: "S27", url: "https://example.no/role" },
      { id: "x2", title: "Engineer", organization: "Helix", startDate: "Summer 2025", endDate: "2026", description: "Designed a sensor." },
      { id: "x3", title: "Intern", organization: "Example company", startDate: "2025", endDate: "2025", description: "Worked on testing." },
    ],
    projects: [{ id: "p", name: "Telemetry project", role: "Builder", season: "S26", startDate: "2025-08", endDate: "2026-02-28", description: "Built a logger.", url: "https://example.no/project" }],
    languages: [{ id: "l", name: "Norsk", level: "Native or bilingual proficiency" }, { id: "custom", name: "Custom language", level: "User wording" }],
    links: [{ id: "u", label: "Portfolio", url: "https://example.no/portfolio" }],
  };
}
function preview(data: CvData, locale: "en" | "nb" = "en", flags = sharing) {
  return renderToStaticMarkup(<CvTemplatePreview data={data} sharing={flags} locale={locale} />);
}

describe("reference CV document preview", () => {
  it.each(["en", "nb"] as const)("keeps every authored field and uses the template structure in %s", (locale) => {
    const cv = fixture();
    const before = structuredClone(cv);
    const markup = preview(cv, locale);
    for (const value of ["Åse Ødegård", "Mechanical engineer", "private@example.no", "+47 12345678", "Ås", "User-authored introduction", "Preserve this line.", "Automation | 2028", "NMBU", "Master in engineering", "Robotics", ": A", "Student robotics club", "User-authored education.", "Lead engineer", "Led the design team.", "Ås campus", "Aero", "S27", "https://example.no/role", "Engineer", "Summer 2025 - 2026", "Designed a sensor.", "Example company", "Intern", "Worked on testing.", "Telemetry project", "Builder", "S26", "Built a logger.", "https://example.no/project", "Norsk", "Custom language | User wording", "Portfolio", "https://example.no/portfolio", "Dr. Example", "Contact me first."]) expect(markup).toContain(value);
    expect(markup).toContain("29.02.2024 - 06.2028");
    expect(markup).toContain("08.2025 - 28.02.2026");
    expect(markup).toContain(locale === "en" ? "08.2026 - Present" : "08.2026 - Nå");
    expect(markup).toContain(locale === "en" ? "Part-time" : "Deltid");
    expect(markup).toContain(locale === "en" ? "Native or bilingual proficiency" : "Morsmål eller tospråklig");
    expect(markup).toContain(`lang="${locale}"`);
    expect(markup).toContain('class="mcv-template-contacts"');
    expect(markup).toContain('class="mcv-template-section mcv-template-experience"');
    expect(markup).toContain('class="mcv-template-role-description"');
    expect(markup).toContain('data-connected="true"');
    expect(markup.match(/>Helix NMBU<\/h3>/g)).toHaveLength(1);
    expect(markup.indexOf("Lead engineer")).toBeLessThan(markup.indexOf(">Engineer</h4>"));
    expect(markup).toContain(locale === "en" ? ">Projects</h2>" : ">Prosjekter</h2>");
    expect(markup).toContain(locale === "en" ? ">References</h2>" : ">Referanser</h2>");
    expect(markup).not.toMatch(/<img|Legacy skill|Voluntary|Your name|Ola Normann|ola.normann/);
    expect(cv).toEqual(before);
  });

  it.each([{ email: false, phone: false }, { email: true, phone: false }, { email: false, phone: true }])("redacts independent contact choices $email/$phone", (flags) => {
    const markup = preview(fixture(), "en", { cv: false, ...flags });
    expect(markup.includes("private@example.no")).toBe(flags.email);
    expect(markup.includes("+47 12345678")).toBe(flags.phone);
    expect(markup).toContain("Ås");
  });

  it("omits empty rows, sections and absent references without inserting sample claims", () => {
    const cv = emptyCv();
    cv.education = [{ id: "blank", institution: " ", degree: "", startDate: "", endDate: "", description: "" }];
    cv.experience = [{ id: "blank", organization: "", title: "", startDate: "", endDate: "", description: "" }];
    Object.assign(cv.experience[0], { __projectRoleSourceId: "blank-project" });
    cv.references = " \n ";
    const markup = preview(cv);
    expect(markup).not.toMatch(/<h[1-4]|mcv-template-section|mcv-template-introduction|mcv-template-contacts|Provided on request|Oppgis på forespørsel|Organisation not specified/);
  });

  it("keeps optional-only rows, unsafe URL text and long authored content without unsafe actions", () => {
    const cv = emptyCv();
    cv.education = [{ id: "ed", institution: "", degree: "", startDate: "", endDate: "", description: "", activities: "Activity-only education" }];
    cv.experience = [{ id: "x", organization: "", title: "", startDate: "", endDate: "", description: "Description-only role\n" + "ø".repeat(8000) }];
    cv.projects = [{ id: "p", name: "", role: "", season: "", description: "", url: "javascript:alert(1)" }];
    cv.links = [{ id: "u", label: "Unsafe link", url: "https://user:pass@example.no" }];
    cv.references = "R".repeat(2000);
    const markup = preview(cv);
    for (const text of ["Activity-only education", "Description-only role", "ø".repeat(8000), "javascript:alert(1)", "https://user:pass@example.no", "R".repeat(2000)]) expect(markup).toContain(text);
    expect(markup).not.toContain('href="javascript:');
    expect(markup).not.toContain('href="https://user:pass');
  });
});

describe("secondary optional References control", () => {
  it.each(["en", "nb"] as const)("offers a localized placeholder without saving a claim in %s", (locale) => {
    const markup = renderToStaticMarkup(<OptionalReferencesInput value="" onChange={() => undefined} locale={locale} disabled={false} />);
    expect(markup).toContain(locale === "en" ? "References (optional)" : "Referanser (valgfritt)");
    expect(markup).toContain(`placeholder="${locale === "en" ? "Provided on request" : "Oppgis på forespørsel"}"`);
    expect(markup).toContain('maxLength="2000"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/<textarea[^>]*><\/textarea>/);
  });
  it("opens existing authored references and honors the editor lock", () => {
    const markup = renderToStaticMarkup(<OptionalReferencesInput value="Contact Dr. Example" onChange={() => undefined} locale="en" disabled />);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(">Contact Dr. Example</textarea>");
  });
});
