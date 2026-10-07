import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { ChoiceInput, PeriodInputs } from "./ProfileInputs";
import { employmentTypes, locationTypes } from "./profile-inputs";
import { groupExperience } from "./experience";
import { memberText, type MemberLocale } from "./locale";
import type { CvExperience } from "./types";

type ExperienceField = Exclude<keyof CvExperience, "id">;

function TextField({ label, value, onChange, maxLength = 500, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled: boolean;
}) {
  const id = useId();
  return <div className="mcv-field">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} value={value} maxLength={maxLength} disabled={disabled}
      onChange={(event) => onChange(event.target.value)} />
  </div>;
}

function RoleDetails({ role, locale, disabled, onChange }: {
  role: CvExperience;
  locale: MemberLocale;
  disabled: boolean;
  onChange: (key: ExperienceField, value: string) => void;
}) {
  const [open, setOpen] = useState(Boolean(role.department || role.season || role.url));
  const t = (key: "Role details (optional)" | "Department" | "Season" | "Role link") => memberText(locale, key);
  return <Collapsible className="mcv-role-details" open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" type="button" disabled={disabled}>
        {t("Role details (optional)")}
        <ChevronDown aria-hidden="true" className={open ? "mcv-nav-chevron-open" : ""} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent forceMount className="mcv-role-details-content" aria-hidden={!open}>
      <div className="mcv-grid">
        <TextField label={t("Department")} disabled={disabled} value={role.department ?? ""} onChange={(value) => onChange("department", value)} />
        <TextField label={t("Season")} disabled={disabled} value={role.season ?? ""} maxLength={30} onChange={(value) => onChange("season", value)} />
        <TextField label={t("Role link")} disabled={disabled} value={role.url ?? ""} maxLength={2000} onChange={(value) => onChange("url", value)} />
      </div>
    </CollapsibleContent>
  </Collapsible>;
}

export function ExperienceEditor({ rows, locale, disabled, onChange, onRemove, onAdd }: {
  rows: CvExperience[];
  locale: MemberLocale;
  disabled: boolean;
  onChange: (id: string, key: ExperienceField, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: (organization: string, beforeId?: string) => void;
}) {
  const id = useId();
  // Retain groups while focus is inside the editor, including adjacent controls and Tab targets.
  const [editingOrganizations, setEditingOrganizations] = useState<Map<string, string> | null>(null);
  const groupingRows = editingOrganizations
    ? rows.map((role) => ({ ...role, organization: editingOrganizations.get(role.id) ?? role.organization }))
    : rows;
  const groups = groupExperience(groupingRows);
  const currentRoles = new Map(rows.map((role) => [role.id, role]));
  return <div className="mcv-experience-editor"
    onFocus={(event) => {
      if (!editingOrganizations && !event.currentTarget.contains(event.relatedTarget)) {
        setEditingOrganizations(new Map(rows.map((role) => [role.id, role.organization])));
      }
    }}
    onBlur={(event) => {
      // Choice menus use a portal while the member is still editing this role.
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".mcv-profile-menu")) return;
      if (!event.currentTarget.contains(event.relatedTarget)) setEditingOrganizations(null);
    }}>
    {groups.map((group, groupIndex) => <section key={group.key} className="mcv-experience-group" aria-labelledby={`${id}-group-${groupIndex}`}>
      <div className="mcv-organization-heading">
        <h3 id={`${id}-group-${groupIndex}`}>{group.organization || memberText(locale, "Organisation not specified")}</h3>
        {group.organization && <Button variant="ghost" type="button" disabled={disabled || rows.length >= 30 || !group.roles.some((role) => currentRoles.get(role.id)?.organization.trim())}
          aria-label={memberText(locale, "Add another role at {organization}", { organization: group.organization })}
          onClick={() => {
            const organization = group.roles
              .map((role) => currentRoles.get(role.id)?.organization ?? "")
              .find((value) => value.trim());
            if (organization) onAdd(organization, group.roles[0].id);
          }}>
          {memberText(locale, "+ Add another role")}
        </Button>}
      </div>
      <ol className="mcv-role-list" data-connected={group.roles.length > 1} role="list">
        {group.roles.map((groupRole) => {
          const role = currentRoles.get(groupRole.id)!;
          const index = rows.findIndex((entry) => entry.id === role.id);
          const change = (key: ExperienceField, value: string) => onChange(role.id, key, value);
          return <li key={role.id} className="mcv-role-entry">
            <div className="mcv-entry-title">
              <h4>{role.title || `${memberText(locale, "Role")} ${index + 1}`}</h4>
              <Button variant="ghost" type="button" className="mcv-remove" disabled={disabled}
                aria-label={memberText(locale, "Remove {entry} {number}", { entry: memberText(locale, "experience"), number: index + 1 })}
                onClick={() => onRemove(role.id)}>{memberText(locale, "Remove")}</Button>
            </div>
            <div className="mcv-grid">
              <TextField label={memberText(locale, "Job title")} disabled={disabled} value={role.title} onChange={(value) => change("title", value)} />
              <TextField label={memberText(locale, "Company or organisation")} disabled={disabled} value={role.organization}
                onChange={(value) => change("organization", value)} />
              <ChoiceInput label={memberText(locale, "Employment type")} value={role.employmentType ?? ""} options={employmentTypes}
                locale={locale} disabled={disabled} onChange={(value) => change("employmentType", value)} />
              <TextField label={memberText(locale, "Location")} disabled={disabled} value={role.location ?? ""} onChange={(value) => change("location", value)} />
              <ChoiceInput label={memberText(locale, "Location type")} value={role.locationType ?? ""} options={locationTypes}
                locale={locale} disabled={disabled} onChange={(value) => change("locationType", value)} />
              <PeriodInputs startDate={role.startDate} endDate={role.endDate} locale={locale} disabled={disabled}
                ongoingLabel={memberText(locale, "I currently work here")} onChange={change} />
              <div className="mcv-field mcv-full">
                <Label htmlFor={`${id}-${role.id}-description`}>{memberText(locale, "Description")}</Label>
                <Textarea id={`${id}-${role.id}-description`} rows={4} value={role.description} maxLength={8000} disabled={disabled}
                  onChange={(event) => change("description", event.target.value)} />
              </div>
            </div>
            <RoleDetails role={role} locale={locale} disabled={disabled} onChange={change} />
          </li>;
        })}
      </ol>
    </section>)}
    <div className="mcv-experience-actions">
      <Button variant="outline" type="button" disabled={disabled || rows.length >= 30} onClick={() => onAdd("")}>
        {memberText(locale, "+ Add {entry}", { entry: memberText(locale, "experience") })}
      </Button>
      <Button variant="outline" type="button" disabled={disabled || rows.length >= 30} onClick={() => onAdd("Helix NMBU")}>
        {memberText(locale, "+ Add Helix role")}
      </Button>
    </div>
  </div>;
}
