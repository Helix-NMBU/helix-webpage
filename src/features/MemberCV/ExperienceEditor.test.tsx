import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExperienceEditor } from "./ExperienceEditor";
import { ExperiencePreview } from "./ExperiencePreview";
import type { CvExperience } from "./types";

function role(id: string, organization: string, title: string): CvExperience {
  return { id, organization, title, startDate: "2024-08", endDate: "Present", description: `Contribution ${id}` };
}

const rows = [
  { ...role("lead", "Helix NMBU", "Team lead"), department: "Chassis", season: "S27", url: "https://example.com/chassis", employmentType: "Part-time", location: "Ås", locationType: "Hybrid" },
  role("engineer", " Helix ", "Engineer"),
  role("unrelated", "Helix Engineering", "Consultant"),
  role("blank-a", "", "Independent work"),
  role("blank-b", "  ", "Another assignment"),
];

describe("grouped experience presentation", () => {
  it.each(["en", "nb"] as const)("groups named editor roles with one heading and an ordered connected list in %s", (locale) => {
    const markup = renderToStaticMarkup(<ExperienceEditor rows={rows} locale={locale} disabled={false}
      onChange={() => undefined} onRemove={() => undefined} onAdd={() => undefined} />);
    expect(markup.match(/class="mcv-experience-group"/g)).toHaveLength(4);
    expect(markup.match(/>Helix NMBU<\/h3>/g)).toHaveLength(1);
    expect(markup.match(/<ol class="mcv-role-list" data-connected="true" role="list">/g)).toHaveLength(1);
    expect(markup.match(/class="mcv-role-entry"/g)).toHaveLength(5);
    expect(markup).toContain("Helix Engineering</h3>");
    expect(markup).toContain('value=" Helix "');
    expect(markup.indexOf("Team lead</h4>")).toBeLessThan(markup.indexOf("Engineer</h4>"));
    expect(markup.match(new RegExp(locale === "en" ? "Organisation not specified</h3>" : "Organisasjon ikke oppgitt</h3>", "g"))).toHaveLength(2);
    expect(markup.match(new RegExp(locale === "en" ? 'aria-label="Add another role at' : 'aria-label="Legg til en ny rolle i', "g"))).toHaveLength(2);
    expect(markup).toContain(locale === "en" ? "+ Add Helix role" : "+ Legg til Helix-rolle");
    expect(markup).toContain(locale === "en" ? "+ Add experience" : "+ Legg til erfaring");
  });

  it.each(["en", "nb"] as const)("retains optional role details and the primary editable fields in %s", (locale) => {
    const markup = renderToStaticMarkup(<ExperienceEditor rows={[rows[0]]} locale={locale} disabled={false}
      onChange={() => undefined} onRemove={() => undefined} onAdd={() => undefined} />);
    expect(markup).toMatch(/class="mcv-role-details-content"[^>]*aria-hidden="false"/);
    for (const value of ["Team lead", "Helix NMBU", "Chassis", "S27", "https://example.com/chassis", "Ås"]) {
      expect(markup).toContain(`value="${value}"`);
    }
    expect(markup).toContain("Contribution lead</textarea>");
    expect(markup).toContain(locale === "en" ? "Role details (optional)" : "Rolledetaljer (valgfritt)");
    expect(markup).toContain(locale === "en" ? "Company or organisation" : "Bedrift eller organisasjon");
    expect(markup).toContain(locale === "en" ? "I currently work here" : "Jeg jobber her fortsatt");
  });

  it("keeps empty optional details collapsed and all inputs mounted", () => {
    const markup = renderToStaticMarkup(<ExperienceEditor rows={[rows[1]]} locale="en" disabled={false}
      onChange={() => undefined} onRemove={() => undefined} onAdd={() => undefined} />);
    expect(markup).toMatch(/class="mcv-role-details-content"[^>]*aria-hidden="true"/);
    expect(markup).toContain("Department</label>");
    expect(markup).toContain("Season</label>");
    expect(markup).toContain("Role link</label>");
  });

  it.each(["en", "nb"] as const)("uses the same groups in HTML with separate periods and complete content in %s", (locale) => {
    const markup = renderToStaticMarkup(<ExperiencePreview rows={rows} locale={locale} />);
    expect(markup.match(/class="mcv-experience-group"/g)).toHaveLength(4);
    expect(markup.match(/>Helix NMBU<\/h3>/g)).toHaveLength(1);
    expect(markup.match(/class="mcv-role-period"/g)).toHaveLength(5);
    expect(markup).toContain(`08.2024 – ${locale === "en" ? "Present" : "Nå"}`);
    expect(markup).toContain(locale === "en" ? "Part-time" : "Deltid");
    for (const value of ["Team lead", "Engineer", "Helix Engineering", "Chassis", "S27", "https://example.com/chassis", "Contribution lead", "Ås"]) {
      expect(markup).toContain(value);
    }
    expect(markup).not.toContain("Helix roles and projects");
    expect(markup).not.toContain("Helix-roller og prosjekter");
  });
});
