import { useId } from "react";
import { groupExperience } from "./experience";
import { memberText, type MemberLocale, type StaticMemberCopyKey } from "./locale";
import { employmentTypes, locationTypes, readableProfileDate } from "./profile-inputs";
import type { CvExperience } from "./types";

export function ExperiencePreview({ rows, locale }: { rows: CvExperience[]; locale: MemberLocale }) {
  const id = useId();
  function choice(value: string | undefined, options: readonly StaticMemberCopyKey[]) {
    return value && options.includes(value as StaticMemberCopyKey) ? memberText(locale, value as StaticMemberCopyKey) : value;
  }
  function date(value: string) {
    return value === "Present" ? memberText(locale, "Present") : readableProfileDate(value);
  }
  return <>
    {groupExperience(rows).map((group, index) => <section className="mcv-experience-group" key={group.key} aria-labelledby={`${id}-group-${index}`}>
      <h3 id={`${id}-group-${index}`}>{group.organization || memberText(locale, "Organisation not specified")}</h3>
      <ol className="mcv-role-list" data-connected={group.roles.length > 1} role="list">
        {group.roles.map((role) => <li className="mcv-role-entry mcv-preview-entry" key={role.id}>
          {role.title && <h4 className="mcv-preserve">{role.title}</h4>}
          {(role.startDate || role.endDate) && <p className="mcv-role-period">{[role.startDate, role.endDate].filter(Boolean).map(date).join(" – ")}</p>}
          {[choice(role.employmentType, employmentTypes), role.location, choice(role.locationType, locationTypes), role.department, role.season, role.url, role.description]
            .filter(Boolean).map((value, fieldIndex) => <p className="mcv-preserve" key={fieldIndex}>{value}</p>)}
        </li>)}
      </ol>
    </section>)}
  </>;
}
