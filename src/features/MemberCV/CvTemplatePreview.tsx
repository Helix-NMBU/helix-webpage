import { useId } from "react";
import { sharedCvData } from "./model";
import { groupExperience } from "./experience";
import { memberText, type MemberLocale, type StaticMemberCopyKey } from "./locale";
import { employmentTypes, languageLevels, locationTypes, readableProfileDate } from "./profile-inputs";
import type { CvData, CvSharing } from "./types";

function hasContent(row: { id: string }) {
  return Object.entries(row).some(([key, value]) => key !== "id" && !key.startsWith("__") && typeof value === "string" && value.trim());
}

function SafeLink({ value, label }: { value: string; label?: string }) {
  if (!value.trim()) return label ? <span>{label}</span> : null;
  let safe = false;
  try {
    const url = new URL(value);
    safe = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { /* Keep authored text visible without an unsafe link action. */ }
  return safe
    ? <a href={value} target="_blank" rel="noopener noreferrer">{label ? <>{label}<br />{value}</> : value}</a>
    : <span>{[label, value].filter(Boolean).join(" · ")}</span>;
}

/** The document preview uses authored content and the same contact redaction as PDF export. */
export function CvTemplatePreview({ data, sharing, locale }: { data: CvData; sharing: CvSharing; locale: MemberLocale }) {
  const id = useId();
  const cv = sharedCvData(data, sharing);
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  const choice = (value: string | undefined, options: readonly StaticMemberCopyKey[]) =>
    value && options.includes(value as StaticMemberCopyKey) ? t(value as StaticMemberCopyKey) : value;
  const period = (start?: string, end?: string) => [start, end].filter(Boolean)
    .map((value) => value === "Present" ? t("Present") : readableProfileDate(value ?? "")).join(" - ");
  const education = cv.education.filter(hasContent);
  const experience = groupExperience(cv.experience.filter(hasContent));
  const projects = cv.projects.filter(hasContent);
  const languages = cv.languages.filter(hasContent);
  const links = cv.links.filter(hasContent);
  return <>
    <p className="mcv-demo-label">{t("Fictional demo · HTML preview")}</p>
    <article className="mcv-template-document" lang={locale}>
      {(cv.headline || cv.city || cv.contactEmail || cv.phone || cv.fullName || cv.summary || cv.fieldOfStudy || cv.graduationYear) && (
        <header className="mcv-template-introduction">
          <div className="mcv-template-topline">
            {cv.headline && <p className="mcv-template-headline">{cv.headline}</p>}
            {(cv.city || cv.contactEmail || cv.phone) && <div className="mcv-template-contacts">
              {cv.contactEmail && <p>{cv.contactEmail}</p>}
              {cv.phone && <p>{cv.phone}</p>}
              {cv.city && <p>{cv.city}</p>}
            </div>}
          </div>
          {cv.fullName && <h1>{cv.fullName}</h1>}
          {cv.summary && <p className="mcv-template-summary">{cv.summary}</p>}
          {(cv.fieldOfStudy || cv.graduationYear) && <p className="mcv-template-study">{[cv.fieldOfStudy, cv.graduationYear].filter(Boolean).join(" | ")}</p>}
        </header>
      )}
      {education.length > 0 && <section className="mcv-template-section" aria-labelledby={`${id}-education`}>
        <h2 id={`${id}-education`}>{t("Education")}</h2>
        {education.map((row) => <div className="mcv-template-education" key={row.id}>
          <div className="mcv-template-education-topline">
            <div>{row.degree && <h3>{row.degree}</h3>}{row.institution && <p>{row.institution}</p>}</div>
            {(row.startDate || row.endDate) && <p className="mcv-template-period">{period(row.startDate, row.endDate)}</p>}
          </div>
          {row.fieldOfStudy && <p>{t("Field of study")}: {row.fieldOfStudy}</p>}
          {row.grade && <p>{t("Grade")}: {row.grade}</p>}
          {row.activities && <p>{t("Activities and societies")}: {row.activities}</p>}
          {row.description && <p>{row.description}</p>}
        </div>)}
      </section>}
      {experience.length > 0 && <section className="mcv-template-section mcv-template-experience" aria-labelledby={`${id}-experience`}>
        <h2 id={`${id}-experience`}>{t("Experience")}</h2>
        {experience.map((group) => <div className="mcv-template-organization" key={group.key}>
          {group.organization && group.roles.length > 1 && <h3 className="mcv-template-organization-heading">{group.organization}</h3>}
          <ol className="mcv-template-roles" data-connected={group.roles.length > 1} role="list">
            {group.roles.map((row) => <li className="mcv-template-role" key={row.id}>
              <div className="mcv-template-role-details">
                {row.title && <h4>{row.title}</h4>}
                {group.roles.length === 1 && row.organization && <p>{row.organization}</p>}
                {(row.startDate || row.endDate) && <p className="mcv-template-period">{period(row.startDate, row.endDate)}</p>}
                {[choice(row.employmentType, employmentTypes), row.location, choice(row.locationType, locationTypes), row.department, row.season]
                  .filter(Boolean).map((value, index) => <p key={index}>{value}</p>)}
                {row.url && <p><SafeLink value={row.url} /></p>}
              </div>
              {row.description && <div className="mcv-template-role-description"><p>{row.description}</p></div>}
            </li>)}
          </ol>
        </div>)}
      </section>}
      {projects.length > 0 && <section className="mcv-template-section" aria-labelledby={`${id}-projects`}>
        <h2 id={`${id}-projects`}>{t("Projects")}</h2>
        {projects.map((row) => <div className="mcv-template-project" key={row.id}>
          <div className="mcv-template-education-topline">
            <div>{row.name && <h3>{row.name}</h3>}{row.role && <p>{row.role}</p>}{row.season && <p>{row.season}</p>}</div>
            {(row.startDate || row.endDate) && <p className="mcv-template-period">{period(row.startDate, row.endDate)}</p>}
          </div>
          {row.description && <p>{row.description}</p>}
          {row.url && <p><SafeLink value={row.url} /></p>}
        </div>)}
      </section>}
      {languages.length > 0 && <section className="mcv-template-section" aria-labelledby={`${id}-languages`}>
        <h2 id={`${id}-languages`}>{t("Languages")}</h2>
        {languages.map((row) => <p key={row.id}>{[row.name, choice(row.level, languageLevels)].filter(Boolean).join(" | ")}</p>)}
      </section>}
      {links.length > 0 && <section className="mcv-template-section" aria-labelledby={`${id}-links`}>
        <h2 id={`${id}-links`}>{t("Links")}</h2>
        {links.map((row) => <p key={row.id}><SafeLink value={row.url} label={row.label} /></p>)}
      </section>}
      {cv.references?.trim() && <section className="mcv-template-section" aria-labelledby={`${id}-references`}>
        <h2 id={`${id}-references`}>{t("References")}</h2><p>{cv.references}</p>
      </section>}
    </article>
  </>;
}
