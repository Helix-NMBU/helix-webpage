import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionNavigation } from "./SectionNavigation";
import type { CvSectionKey, CvSectionStatus } from "./section-status";

function statuses() {
  return Object.fromEntries(
    ["contact", "education", "experience", "projects", "languages", "links", "skills", "sharing"].map(
      (key) => [key, { content: "filled", dirty: true }],
    ),
  ) as Record<CvSectionKey, CvSectionStatus>;
}

describe("simplified section overview", () => {
  it.each(["en", "nb"] as const)("marks only empty or started content with an accessible %s hint", (locale) => {
    const state = statuses();
    state.education.content = "empty";
    state.experience.content = "started";
    // Sharing is a setting, regardless of its supplied progress or dirty status.
    state.sharing.content = "empty";
    const markup = renderToStaticMarkup(
      <SectionNavigation locale={locale} statuses={state} onNavigate={() => undefined} />,
    );
    expect(markup.match(/class="mcv-nav-missing"/g)).toHaveLength(2);
    expect(markup).toContain(`aria-label="${locale === "en" ? "No content yet" : "Ikke noe innhold ennå"}"`);
    expect(markup).toContain(`aria-label="${locale === "en" ? "Some content is missing" : "Noe innhold mangler"}"`);
    expect(markup).not.toContain("#mcv-skills");
    expect(markup).not.toMatch(/mcv-nav-save|mcv-nav-content|mcv-nav-help|mcv-nav-description/);
    expect(markup).toContain('aria-current="location"');
    expect(markup).toContain('href="#mcv-publication"');
    expect(markup).toContain(`>${locale === "en" ? "Projects" : "Prosjekter"}</span>`);
    expect(markup).not.toMatch(/Helix roles and projects|Helix-roller og prosjekter/);
  });
});
