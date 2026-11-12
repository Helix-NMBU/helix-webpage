import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconArrowLeft, IconChevronRight, IconDots, IconPlus, IconX } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import type { CountryCode } from "libphonenumber-js/min";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { ButtonGroup } from "@libs/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { SearchableSelect, type SearchableOption } from "@libs/components/ui/searchable-select";
import { Switch } from "@libs/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { Textarea } from "@libs/components/ui/textarea";
import { useMemberAccount } from "../MemberPlatform/MemberAccountContext";
import { accountInitials } from "../MemberPlatform/account";
import { useMemberLanguage } from "../MemberPlatform/MemberLanguage";
import { useMemberNavigation } from "../MemberPlatform/MemberNavigation";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { ProfileContent } from "../SponsorWorkspace/DirectoryPanel";
import { CvTemplatePreview } from "./CvTemplatePreview";
import { fictionalCv } from "./demo";
import { localizeCvError } from "./errors";
import { sharedCvData, validateCvData } from "./model";
import { nmbuStudyFieldLabel, nmbuStudyFields } from "./nmbu-study-fields";
import { formatProfileDateInput, profileDateInputValue, profileDateValidation } from "./profile-dates";
import { editProfilePhone, profilePhoneCountries, saveProfilePhone, splitProfilePhone } from "./profile-phone";
import { cvExperienceGroups, experienceSection, experienceSections } from "./experience";
import { managedHelixRoleId, withManagedHelixRole } from "./helix-role";
import { createCvRepository, CvRequestError } from "./repository";
import { memberLoadFailure, memberSessionToken, signOutMember, watchMemberSession } from "./session";
import { memberPaths } from "../MemberPlatform/routes";
import type { CvData, CvEducation, CvEnvelope, CvExperience, CvSharing } from "./types";
import { validateProfileMutation } from "./validate-profile-mutation";
import "./member-cv.css";

// Keep the original development fixture isolated from authenticated CV drafts.
const storageKey = "helix-local-cv-prototype-v1";
const sections = {
  contact: "Contact details",
  about: "About you",
  education: "Education",
  ...experienceSections,
} as const;
type ExperienceSection = keyof typeof experienceSections;
type Section = keyof typeof sections;
type View = "profile" | "overview" | "review" | "published" | Section;
type ExperienceEntry = CvExperience;
type DraftCv = CvData;
type Snapshot = { cv: DraftCv; sharing: CvSharing };
type Saved = Snapshot & { lastSection: Section | null; published: Snapshot | null };
type DateField = "startDate" | "endDate";

const emptyEducation: CvEducation = { id: "", institution: "", degree: "", startDate: "", endDate: "", description: "" };
const emptyExperience: ExperienceEntry = { id: "", organization: "", title: "", startDate: "", endDate: "", description: "" };
const nmbu = "Norwegian University of Life Sciences";
const otherInstitution = "__other_institution__";

// NOKUT's university category: https://www.nokut.no/en/higher-education/higher-education-institutions/
const institutionOptions: SearchableOption[] = [
  { value: "Nord University", label: "Nord University", keywords: ["Nord universitet", "NU"] },
  { value: nmbu, label: nmbu, keywords: ["NMBU", "Norges miljø- og biovitenskapelige universitet"] },
  { value: "Norwegian University of Science and Technology", label: "Norwegian University of Science and Technology", keywords: ["NTNU", "Norges teknisk-naturvitenskapelige universitet"] },
  { value: "Oslo Metropolitan University", label: "Oslo Metropolitan University", keywords: ["OsloMet", "Storbyuniversitetet"] },
  { value: "UiT The Arctic University of Norway", label: "UiT The Arctic University of Norway", keywords: ["Universitetet i Tromsø", "Norges arktiske universitet"] },
  { value: "University of Agder", label: "University of Agder", keywords: ["UiA", "Universitetet i Agder"] },
  { value: "University of Bergen", label: "University of Bergen", keywords: ["UiB", "Universitetet i Bergen"] },
  { value: "University of Inland Norway", label: "University of Inland Norway", keywords: ["INN", "Universitetet i Innlandet"] },
  { value: "University of Oslo", label: "University of Oslo", keywords: ["UiO", "Universitetet i Oslo"] },
  { value: "University of South-Eastern Norway", label: "University of South-Eastern Norway", keywords: ["USN", "Universitetet i Sørøst-Norge"] },
  { value: "University of Stavanger", label: "University of Stavanger", keywords: ["UiS", "Universitetet i Stavanger"] },
  { value: otherInstitution, label: "Other institution" },
];

function institutionName(value: string) {
  const name = value.trim().toLowerCase();
  return institutionOptions.find(option => option.value !== otherInstitution &&
    [option.value, ...(option.keywords ?? [])].some(alias => alias.toLowerCase() === name))?.value ?? value;
}

function loadDraft(): Saved {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const previous = JSON.parse(saved) as Omit<Saved, "lastSection" | "cv" | "published"> & {
        lastSection: Section | "workExperience" | "helixRoles" | null;
        cv: CvData & { directorySkills?: string[] };
        published: (Snapshot & { cv: CvData & { directorySkills?: string[] } }) | null;
      };
      const education = previous.cv.education.map(entry => ({ ...entry, institution: institutionName(entry.institution) }));
      const lastSection = previous.lastSection === "workExperience" || previous.lastSection === "helixRoles" ? "experience" : previous.lastSection;
      const { directorySkills, ...cv } = previous.cv;
      const published = previous.published && {
        ...previous.published,
        cv: { ...previous.published.cv, skills: previous.published.cv.directorySkills ?? previous.published.cv.skills },
      };
      return { ...previous, published, lastSection, cv: { ...cv, city: "", education, skills: directorySkills ?? cv.skills } };
    }
  } catch { /* The fixture is usable when browser storage is unavailable. */ }
  const sample = fictionalCv();
  return {
    cv: {
      ...sample,
      city: "",
      education: sample.education.map(entry => ({ ...entry, institution: nmbu, startDate: "01/09/2023", endDate: "30/06/2028" })),
      projects: [],
      languages: [],
      skills: ["CAD", "Prototyping"],
    },
    sharing: { cv: true, email: false, phone: false },
    lastSection: null,
    published: null,
  };
}

function Field({ label, value, onChange, hint, type = "text", multiline }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
  multiline?: boolean;
}) {
  const { t: uiText } = useMemberLanguage();
  const id = useId();
  const props = { id, value, "aria-describedby": hint ? `${id}-hint` : undefined };
  return <div className="space-y-2">
    <Label htmlFor={id}>{uiText(label)}</Label>
    {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{uiText(hint)}</p>}
    {multiline
      ? <Textarea {...props} rows={4} onChange={event => onChange(event.target.value)} />
      : <Input {...props} type={type} onChange={event => onChange(event.target.value)} />}
  </div>;
}

function EntryList<T extends { id: string }>({ entries, template, label, heading, identify, activeId, setActiveId, invalidDate, onChange, renderFields, limit = 30, canDelete }: {
  entries: T[];
  template: T;
  label: string;
  heading: string;
  identify: (entry: T) => [string, string];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  invalidDate: DateField | null;
  onChange: (entries: T[]) => void;
  renderFields: (entry: T, update: (changes: Partial<T>) => void) => ReactNode;
  limit?: number;
  canDelete?: (entry: T) => boolean;
}) {
  const { t: uiText } = useMemberLanguage();
  const editor = useRef<HTMLDivElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteOpener = useRef<HTMLElement | null>(null);
  const menuAction = useRef(false);
  const [deletion, setDeletion] = useState<{ id: string; name: string } | null>(null);
  const id = useId();
  const entryType = uiText(label);
  const addLabel = uiText("Add {entry}", { entry: entryType });
  useEffect(() => { if (activeId) editor.current?.querySelector<HTMLElement>('input, textarea, [role="combobox"]')?.focus(); }, [activeId]);
  useEffect(() => { if (invalidDate) editor.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(); }, [activeId, invalidDate]);

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-medium">{heading}</h2>
      <Button ref={add} variant="outline" size="icon" type="button" aria-label={addLabel} title={addLabel} disabled={entries.length >= limit} onClick={() => {
        const entry = { ...template, id: crypto.randomUUID() };
        onChange([...entries, entry]);
        setActiveId(entry.id);
      }}><IconPlus aria-hidden="true" /></Button>
    </div>
    {entries.length ? <ul className="divide-y overflow-hidden rounded-lg border" aria-label={heading}>
      {entries.map(entry => {
        const [title, subtitle] = identify(entry);
        const expanded = activeId === entry.id;
        const triggerId = `${id}-${entry.id}-actions`;
        const name = title || uiText("Untitled {entry}", { entry: entryType });
        return <li key={entry.id}>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{name}</p>
              {subtitle && <p className="break-words text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {expanded && <Button variant="ghost" size="sm" type="button" onClick={() => {
                setActiveId(null);
                document.getElementById(triggerId)?.focus();
              }}>{uiText("Done")}</Button>}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button id={triggerId} variant="ghost" size="icon" type="button" aria-label={uiText("Actions for {entry}", { entry: name })}>
                    <IconDots aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={event => {
                  if (menuAction.current) event.preventDefault();
                  menuAction.current = false;
                }}>
                  <DropdownMenuItem onSelect={() => {
                    menuAction.current = true;
                    setActiveId(entry.id);
                    if (expanded) editor.current?.querySelector<HTMLElement>('input, textarea, [role="combobox"]')?.focus();
                  }}>{uiText("Edit")}</DropdownMenuItem>
                  {canDelete?.(entry) !== false && <DropdownMenuItem variant="destructive" onSelect={() => {
                    menuAction.current = true;
                    deleteOpener.current = document.getElementById(triggerId);
                    setDeletion({ id: entry.id, name });
                  }}>{uiText("Delete")}</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {expanded && <div id={`${triggerId}-fields`} ref={editor} className="space-y-4 border-t bg-muted/20 p-4">
            {renderFields(entry, changes => onChange(entries.map(item => item.id === entry.id ? { ...item, ...changes } : item)))}
          </div>}
        </li>;
      })}
    </ul> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{uiText("Add your first {entry}.", { entry: entryType })}</p>}
    <Dialog open={deletion !== null} onOpenChange={open => { if (!open) setDeletion(null); }}>
      <DialogContent showCloseButton={false} onOpenAutoFocus={event => {
        event.preventDefault();
        cancelDelete.current?.focus();
      }} onCloseAutoFocus={event => {
        event.preventDefault();
        if (deleteOpener.current?.isConnected) deleteOpener.current.focus();
        else add.current?.focus();
      }}>
        <DialogHeader>
          <DialogTitle>{uiText("Delete {entry}?", { entry: deletion?.name ?? entryType })}</DialogTitle>
          <DialogDescription>{uiText("This entry will be removed when you save this section.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelDelete} type="button" variant="outline" onClick={() => setDeletion(null)}>{uiText("Cancel")}</Button>
          <Button type="button" variant="destructive" onClick={() => {
            if (!deletion) return;
            onChange(entries.filter(entry => entry.id !== deletion.id));
            if (activeId === deletion.id) setActiveId(null);
            setDeletion(null);
          }}>{uiText("Delete")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function EntryDates({ startDate, endDate, invalidDate, onChange, experience = false }: Pick<CvEducation, DateField> & {
  invalidDate: DateField | null;
  onChange: (changes: Partial<Pick<CvEducation, "startDate" | "endDate">>) => void;
  experience?: boolean;
}) {
  const { t: uiText } = useMemberLanguage();
  const id = useId();
  const ongoing = experience && endDate === "Present";
  function dateField(field: DateField, label: string, value: string, disabled = false) {
    return <div className="space-y-2">
      <Label htmlFor={`${id}-${field}`}>{uiText(label)}</Label>
      <Input id={`${id}-${field}`} placeholder="DD/MM/YYYY" inputMode="numeric" value={value} disabled={disabled}
        aria-invalid={invalidDate === field || undefined} onChange={event => {
          const next = event.target.value;
          if (/^[\d/]*$/.test(next)) onChange({ [field]: next });
        }} onBlur={event => {
          const current = event.target.value;
          const formatted = formatEntryDate(field, current);
          if (formatted !== current) onChange({ [field]: formatted });
        }} />
    </div>;
  }
  return <fieldset className="space-y-2" aria-describedby={`${id}-hint`}>
    <legend className="text-sm font-medium">{uiText("Dates (optional)")}</legend>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{uiText("Use DD/MM/YYYY or type the digits together, such as 08082023. Start dates also accept YYYY or MM/YYYY.")}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {dateField("startDate", "Start date", startDate)}
      {dateField("endDate", experience ? "End date" : "End or expected graduation", ongoing ? "" : endDate, ongoing)}
    </div>
    {experience && <div className="flex items-center gap-2 pt-2">
      <Checkbox id={`${id}-ongoing`} checked={ongoing} onCheckedChange={checked => onChange({ endDate: checked ? "Present" : "" })} />
      <Label htmlFor={`${id}-ongoing`}>{uiText("Currently in this role")}</Label>
    </div>}
  </fieldset>;
}

function formatEntryDate(field: DateField, value: string) {
  return formatProfileDateInput(field === "startDate" ? value.replace(/^(\d)\/(\d{4})$/, "0$1/$2") : value);
}

function EducationFields({ entry, update }: { entry: CvEducation; update: (changes: Partial<CvEducation>) => void }) {
  const { t: uiText } = useMemberLanguage();
  const id = useId();
  const [customInstitution, setCustomInstitution] = useState(() => Boolean(entry.institution) && !institutionOptions.some(option => option.value === entry.institution));
  const isNmbu = !customInstitution && entry.institution === nmbu;
  const programme = nmbuStudyFieldLabel(entry.degree);
  const programmes = programme && !nmbuStudyFields.some(option => option.value === programme)
    ? [{ value: programme, label: programme }, ...nmbuStudyFields]
    : nmbuStudyFields;

  function chooseInstitution(value: string) {
    const isOther = value === otherInstitution;
    const institution = isOther ? (customInstitution ? entry.institution : "") : value;
    const programmeTypeChanged = isNmbu !== (value === nmbu);
    setCustomInstitution(isOther);
    update({ institution, ...(programmeTypeChanged ? { degree: "" } : {}) });
  }

  return <div className="grid items-start gap-4 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${id}-institution`}>{uiText("Institution")}</Label>
      <SearchableSelect id={`${id}-institution`} label={uiText("Institution")} value={customInstitution ? otherInstitution : entry.institution}
        options={institutionOptions.map(option => option.value === otherInstitution ? { ...option, label: uiText(option.label) } : option)}
        emptyLabel={uiText("No results found.")} placeholder={uiText("Select an institution")} searchPlaceholder={uiText("Search institutions...")} onChange={chooseInstitution} />
      {customInstitution && <Field label="Institution name" value={entry.institution} onChange={institution => update({ institution })} />}
    </div>
    {isNmbu ? <div className="space-y-2">
      <Label htmlFor={`${id}-programme`}>{uiText("Degree or programme")}</Label>
      <SearchableSelect id={`${id}-programme`} label={uiText("Degree or programme")} value={programme} options={programmes}
        emptyLabel={uiText("No results found.")} placeholder={uiText("Select a programme")} searchPlaceholder={uiText("Search programmes...")} onChange={degree => update({ degree })} />
    </div> : <Field label="Degree or programme" value={entry.degree} onChange={degree => update({ degree })} />}
  </div>;
}

function hasEntryContent(entry: CvEducation | ExperienceEntry) {
  return Object.entries(entry).some(([key, value]) => key !== "id" && key !== "section" && value?.trim());
}

function SectionEditor({ section, initial, onSave, onCancel, saving, onDirty }: {
  section: Section;
  initial: Snapshot;
  onSave: (cv: DraftCv, exit: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  onDirty: () => void;
}) {
  const { t: uiText, language } = useMemberLanguage();
  const roleSection = section === "experience" || section === "otherRoles" ? section : null;
  const otherRoleIds = new Set(initial.cv.experience.filter(entry => experienceSection(entry) !== roleSection).map(entry => entry.id));
  const otherManualRoleCount = initial.cv.experience.filter(entry => entry.id !== managedHelixRoleId && otherRoleIds.has(entry.id)).length;
  const [cv, setCv] = useState<DraftCv>(() => {
    const displayDates = <T extends CvEducation | CvExperience>(entry: T): T => ({
      ...entry,
      startDate: profileDateInputValue(entry.startDate),
      endDate: profileDateInputValue(entry.endDate),
    });
    if (section === "education") return { ...initial.cv, education: initial.cv.education.map(displayDates) };
    if (roleSection) return { ...initial.cv, experience: initial.cv.experience.map(entry => otherRoleIds.has(entry.id) ? entry : displayDates(entry)) };
    return initial.cv;
  });
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [invalidDate, setInvalidDate] = useState<DateField | null>(null);
  const [phone, setPhone] = useState(() => splitProfilePhone(initial.cv.phone));
  const [invalidPhone, setInvalidPhone] = useState(false);
  const [skill, setSkill] = useState("");
  const phoneId = useId();
  const phoneInput = useRef<HTMLInputElement>(null);
  const skillId = useId();
  const skillInput = useRef<HTMLInputElement>(null);
  const notify = useNotify();
  const phoneCountries = profilePhoneCountries(language);
  const country = phoneCountries.find(option => option.value === phone.country)!;
  const skills = cv.skills;
  const pendingSkill = skill.trim();
  const canAddSkill = pendingSkill && skills.length < 50 && !skills.some(value => value.toLowerCase() === pendingSkill.toLowerCase());
  const sectionRoles = cv.experience.filter(entry => !otherRoleIds.has(entry.id));
  function setField<K extends keyof DraftCv>(key: K, value: DraftCv[K]) {
    onDirty();
    setInvalidDate(null);
    setCv(previous => ({ ...previous, [key]: value }));
  }
  function addSkill() {
    if (!canAddSkill) return;
    setField("skills", [...skills, pendingSkill]);
    setSkill("");
    skillInput.current?.focus();
  }
  function removeSkill(index: number) {
    onDirty();
    setCv(previous => {
      const translations = structuredClone(previous.translations);
      for (const entries of Object.values(translations ?? {})) {
        if (!entries) continue;
        delete entries[`skills:${index}`];
        for (let source = index + 1; source < previous.skills.length; source++) {
          const key = `skills:${source}`;
          if (entries[key] !== undefined) entries[`skills:${source - 1}`] = entries[key];
          delete entries[key];
        }
      }
      return { ...previous, ...(translations ? { translations } : {}), skills: previous.skills.filter((_, position) => position !== index) };
    });
    skillInput.current?.focus();
  }
  function save(exit: boolean) {
    if (saving) return;
    const entries = {
      education: cv.education.filter(hasEntryContent).map(entry => ({ ...entry })),
      experience: cv.experience.filter(entry => otherRoleIds.has(entry.id) || hasEntryContent(entry)).map(entry => ({ ...entry })),
    };
    if (section === "education" || roleSection) {
      const collection = section === "education" ? "education" : "experience";
      for (const entry of entries[collection]) {
        if (collection === "experience" && otherRoleIds.has(entry.id)) continue;
        const previous = initial.cv[collection].find(item => item.id === entry.id);
        for (const field of ["startDate", "endDate"] as const) {
          const value = entry[field];
          if (!value) continue;
          if (value === profileDateInputValue(previous?.[field] ?? "")) {
            entry[field] = previous?.[field] ?? value;
            continue;
          }
          if (roleSection && field === "endDate" && value === "Present") continue;
          const formatted = formatEntryDate(field, value);
          const matchesFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(formatted) || (field === "startDate" && /^(?:\d{2}\/)?\d{4}$/.test(formatted));
          if (matchesFormat && profileDateValidation(formatted) === "valid") {
            entry[field] = formatted;
            continue;
          }
          setActiveEntry(entry.id);
          setInvalidDate(field);
          notify(uiText("Check your dates"), uiText(field === "startDate" ? "Enter a valid start date in DD/MM/YYYY, MM/YYYY or YYYY format." : "End date must be a valid date in DD/MM/YYYY format."), { id: "cv-prototype-validation", variant: "error" });
          return;
        }
      }
    }
    let savedPhone: string;
    try {
      savedPhone = saveProfilePhone(phone, initial.cv.phone);
    } catch (error) {
      setInvalidPhone(true);
      phoneInput.current?.focus();
      notify(uiText("Check your phone number"), uiText((error as Error).message), { id: "cv-prototype-validation", variant: "error" });
      return;
    }
    try {
      const input = {
        ...cv,
        ...entries,
        phone: savedPhone,
        skills: canAddSkill ? [...skills, pendingSkill] : skills,
      };
      const validated = validateProfileMutation({ action: "save", draft: input, sharing: initial.sharing }, initial.cv).draft!;
      onSave(validated, exit);
    } catch (error) {
      notify(uiText("Check your CV"), localizeCvError((error as Error).message, language), { id: "cv-prototype-validation", variant: "error" });
    }
  }
  return <Card className="max-w-2xl shadow-none"><CardContent>
    <form noValidate onSubmit={event => { event.preventDefault(); save(false); }}>
      <fieldset disabled={saving} className="space-y-5">
      {section === "contact" && <>
        <Field label="Personal email (optional)" type="email" value={cv.contactEmail} onChange={value => setField("contactEmail", value)} />
        <div className="space-y-2">
          <Label htmlFor={phoneId}>{uiText("Phone number (optional)")}</Label>
          <ButtonGroup className="w-full min-w-0" aria-label={uiText("Phone number")}>
            <SearchableSelect label={uiText("Phone country")} value={phone.country} options={phoneCountries}
              triggerText={`${country.value} ${country.detail}`} className="h-9 min-h-9 w-24 shrink-0 gap-1 px-2 [&>span]:whitespace-nowrap"
              emptyLabel={uiText("No results found.")} placeholder={uiText("Country")} searchPlaceholder={uiText("Search countries...")}
              onChange={value => {
                onDirty();
                setPhone(previous => ({ ...previous, country: value as CountryCode, changed: true }));
                setInvalidPhone(false);
              }} />
            <Input ref={phoneInput} id={phoneId} type="tel" autoComplete="tel-national" maxLength={100} className="h-9 min-w-0"
              value={phone.national} aria-invalid={invalidPhone || undefined} onChange={event => {
                onDirty();
                setPhone(previous => editProfilePhone(event.target.value, previous));
                setInvalidPhone(false);
              }} />
          </ButtonGroup>
        </div>
      </>}
      {section === "about" && <>
        <Field label="Introduction (optional)" hint="In a few sentences, tell sponsors what you study and what you enjoy working on." value={cv.summary} onChange={value => setField("summary", value)} multiline />
        <div className="space-y-3">
          <Label htmlFor={skillId}>{uiText("Talent Directory skills (optional)")}</Label>
          <p id={`${skillId}-hint`} className="text-sm text-muted-foreground">{uiText("Add one skill at a time. These skills appear on your sponsor profile.")}</p>
          <div className="flex items-center gap-2">
            <Input ref={skillInput} id={skillId} aria-describedby={`${skillId}-hint`} value={skill} maxLength={100} placeholder={uiText("e.g. CAD")}
              onChange={event => { onDirty(); setSkill(event.target.value); }} onKeyDown={event => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                addSkill();
              }} />
            <Button variant="outline" type="button" disabled={!canAddSkill} onClick={addSkill}>{uiText("Add skill")}</Button>
          </div>
          {skills.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={uiText("Added skills")}>
            {skills.map((value, index) => <li key={`${value}-${index}`} className="min-w-0 max-w-full">
              <Badge variant="secondary" className="h-auto min-h-7 max-w-full gap-1 whitespace-normal pl-3 pr-1">
                <span className="break-all">{value}</span>
                <Button variant="ghost" size="icon" className="size-6 rounded-full" type="button" aria-label={uiText("Remove skill {skill}", { skill: value })} onClick={() => removeSkill(index)}><IconX aria-hidden="true" /></Button>
              </Badge>
            </li>)}
          </ul>}
        </div>
      </>}
      {section === "education" && <EntryList entries={cv.education} template={emptyEducation} heading={uiText("Degrees")} label="degree" activeId={activeEntry} setActiveId={id => { setActiveEntry(id); setInvalidDate(null); }} invalidDate={invalidDate}
        identify={entry => [entry.degree, entry.institution]} onChange={entries => setField("education", entries)} renderFields={(entry, update) => <>
          <EducationFields entry={entry} update={update} />
          <EntryDates startDate={entry.startDate} endDate={entry.endDate} invalidDate={invalidDate} onChange={update} />
        </>} />}
      {roleSection && <EntryList entries={sectionRoles} template={{ ...emptyExperience, section: roleSection === "experience" ? "workExperience" : "otherRoles" }}
        limit={30 - otherManualRoleCount + Number(sectionRoles.some(entry => entry.id === managedHelixRoleId))}
        heading={uiText("Roles")} label="role" activeId={activeEntry} setActiveId={id => { setActiveEntry(id); setInvalidDate(null); }} invalidDate={invalidDate}
        canDelete={entry => entry.id !== managedHelixRoleId} identify={entry => [entry.title, entry.organization]}
        onChange={entries => setField("experience", [...cv.experience.filter(entry => otherRoleIds.has(entry.id)), ...entries])} renderFields={(entry, update) => entry.id === managedHelixRoleId
          ? <Field label="Contribution (optional)" hint="Your role details come from the Helix member directory." value={entry.description} onChange={value => update({ description: value })} multiline />
          : <>
          <Field label="Role title" value={entry.title} onChange={value => update({ title: value })} />
          <Field label="Organisation" value={entry.organization} onChange={value => update({ organization: value })} />
          <EntryDates startDate={entry.startDate} endDate={entry.endDate} invalidDate={invalidDate} onChange={update} experience />
          <Field label="Your contribution (optional)" hint="For example, designed a test fixture so the team could compare two suspension setups." value={entry.description} onChange={value => update({ description: value })} multiline />
        </>} />}
      <div className="flex flex-wrap gap-2 border-t pt-5">
        <Button type="submit">{uiText("Save section")}</Button>
        <Button variant="outline" type="button" onClick={() => save(true)}>{uiText("Save and exit")}</Button>
        <Button variant="ghost" type="button" onClick={onCancel}>{uiText("Cancel")}</Button>
      </div>
      </fieldset>
    </form>
  </CardContent></Card>;
}

function SponsorPreview({ cv, sharing }: Snapshot) {
  const { t: uiText } = useMemberLanguage();
  const profile = sharedCvData(cv, sharing);
  const experienceGroups = cvExperienceGroups(cv.experience);
  return <Tabs defaultValue="profile" className="gap-4">
    <TabsList aria-label={uiText("Sponsor preview")}><TabsTrigger value="profile">{uiText("Directory profile")}</TabsTrigger><TabsTrigger value="pdf" disabled={!sharing.cv}>{uiText("CV PDF")}</TabsTrigger></TabsList>
    <TabsContent value="profile">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">{profile.fullName}</CardTitle>
          <CardDescription>{[profile.fieldOfStudy, profile.graduationYear && uiText("Class of {year}", { year: profile.graduationYear })].filter(Boolean).join(" · ")}</CardDescription>
        </CardHeader>
        <CardContent><ProfileContent profile={profile} experienceGroups={experienceGroups} /></CardContent>
      </Card>
    </TabsContent>
    {sharing.cv && <TabsContent value="pdf"><CvTemplatePreview data={cv} sharing={sharing} locale={cv.cvLanguage ?? "en"} experienceGroups={experienceGroups} /></TabsContent>}
  </Tabs>;
}

function SharingOptions({ snapshot, disabled, onChange }: { snapshot: Snapshot; disabled?: boolean; onChange?: (sharing: CvSharing) => void }) {
  const { t: uiText } = useMemberLanguage();
  const id = useId();
  const options = [
    { key: "email", label: "Share personal email", detail: snapshot.cv.contactEmail || uiText("No email in this draft"), available: Boolean(snapshot.cv.contactEmail) },
    { key: "phone", label: "Share phone number", detail: snapshot.cv.phone || uiText("No phone in this draft"), available: Boolean(snapshot.cv.phone) },
    { key: "cv", label: "Allow CV download", detail: `PDF · ${uiText(snapshot.cv.cvLanguage === "nb" ? "Norwegian" : "English")}`, available: true },
  ] as const;
  return <Card className="shadow-none">
    <CardHeader>
      <CardTitle>{uiText("Who can see this")}</CardTitle>
      <CardDescription>{uiText("Sponsors with access to the Talent Directory.")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {options.map(({ key, label, detail, available }) => <div key={key} className="flex items-start justify-between gap-4 border-t pt-4">
        <div className="min-w-0 space-y-1">
          {onChange ? <Label htmlFor={`${id}-${key}`}>{uiText(label)}</Label> : <p className="text-sm font-medium">{uiText(label)}</p>}
          <p id={`${id}-${key}-detail`} className="break-all text-sm text-muted-foreground">{detail}</p>
        </div>
        {onChange ? <Switch id={`${id}-${key}`} aria-describedby={`${id}-${key}-detail`} checked={available && snapshot.sharing[key]} disabled={!available || disabled}
          onCheckedChange={checked => onChange({ ...snapshot.sharing, [key]: checked })} />
          : <Badge variant="outline">{uiText(available && snapshot.sharing[key] ? "Shared" : "Private")}</Badge>}
      </div>)}
    </CardContent>
  </Card>;
}

function stateFromEnvelope(envelope: CvEnvelope, previous?: Saved): Saved {
  const { draft, sharing, published, publishedRevision } = envelope.document;
  return {
    cv: draft,
    sharing,
    lastSection: previous?.lastSection ?? null,
    published: published ?? (publishedRevision !== null ? previous?.published ?? null : null),
  };
}

export default function MemberCvSections() {
  const { t: uiText, language } = useMemberLanguage();
  const account = useMemberAccount();
  const local = isLocalMemberMode();
  const navigate = useNavigate();
  const setEditor = useMemberNavigation()?.setEditor;
  const boundUserId = useRef<string | null>(null);
  const revision = useRef(0);
  const publishedRevision = useRef<number | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const dirty = useRef(false);
  const repository = useMemo(() => local ? null : createCvRepository(() => memberSessionToken(boundUserId)), [local]);
  const [saved, setSaved] = useState<Saved | null>(() => local ? loadDraft() : null);
  const [view, setView] = useState<View>("profile");
  const [sectionReturn, setSectionReturn] = useState<"overview" | "review">("overview");
  const [loading, setLoading] = useState(!local);
  const [saving, setSaving] = useState(false);
  const [leave, setLeave] = useState<{ proceed: () => void } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const notify = useNotify();
  const login = memberPaths().login;
  useEffect(() => { heading.current?.focus(); }, [view, loading]);

  function changeView(next: View) {
    dirty.current = false;
    setView(next);
  }

  function confirmLeave(proceed: () => void) {
    if (operation.current) return;
    if (dirty.current) setLeave({ proceed });
    else proceed();
  }

  const reload = useMemo(() => async (refresh = false) => {
    if (!repository) return;
    setLoading(true);
    try {
      const envelope = await (refresh && repository.refresh ? repository.refresh() : repository.load());
      if (!alive.current) return;
      revision.current = envelope.document.revision;
      publishedRevision.current = envelope.document.publishedRevision;
      dirty.current = false;
      setSaved(stateFromEnvelope(envelope));
      setView("profile");
    } catch (error) {
      if (!alive.current) return;
      const failure = memberLoadFailure(error);
      if ("redirectTo" in failure) navigate(failure.redirectTo, { replace: true });
      else notify(uiText("Could not load your CV."), localizeCvError(failure.message, language), {
        variant: "error", id: "cv-load", action: { label: uiText("Try again"), onClick: () => void reload(true) },
      });
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [language, navigate, notify, repository, uiText]);
  const initialLoad = useRef(reload);
  useEffect(() => {
    alive.current = true;
    void initialLoad.current();
    const unwatch = watchMemberSession(() => navigate(login, { replace: true }), undefined, boundUserId);
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || operation.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false;
      unwatch();
      window.removeEventListener("beforeunload", warn);
    };
  }, [login, navigate]);

  useLayoutEffect(() => {
    setEditor?.({
      busy: saving,
      navigate: to => confirmLeave(() => navigate(to)),
      signOut: () => confirmLeave(() => {
        void signOutMember().then(() => navigate(login, { replace: true })).catch((error: unknown) => {
          notify(uiText("Could not sign out."), localizeCvError((error as Error).message, language), { variant: "error" });
        });
      }),
    });
    return () => setEditor?.(null);
  }, [language, login, navigate, notify, saving, setEditor, uiText]);

  if (!saved) return <div className="mx-auto max-w-6xl space-y-3 p-6">
    <h1 className="text-3xl font-medium">{uiText("Profile")}</h1>
    {loading ? <p>{uiText("Loading profile")}</p> : <Button onClick={() => void reload(true)}>{uiText("Try again")}</Button>}
  </div>;
  const { sharing, published, lastSection } = saved;
  const cv = local ? withManagedHelixRole(saved.cv, account?.helixRole) : saved.cv;
  const hasPrivateChanges = !published || revision.current !== publishedRevision.current;
  const privateDraft = local ? !published || JSON.stringify(sharedCvData(cv, sharing)) !== JSON.stringify(published.cv)
    || JSON.stringify(sharing) !== JSON.stringify(published.sharing) : hasPrivateChanges;
  const education = cv.education.find(entry => entry.institution.trim() && entry.degree.trim());
  function experienceSummary(key: ExperienceSection, empty: string) {
    const roles = cv.experience.filter(entry => experienceSection(entry) === key);
    if (roles.length > 1) return uiText("{count} roles", { count: roles.length });
    const role = roles[0];
    return role ? [role.title, role.organization].filter(Boolean).join(" · ") : uiText(empty);
  }
  const summaries: Record<Section, string> = {
    contact: [cv.contactEmail, cv.phone].filter(Boolean).join(" · ") || uiText("Add contact details if you want sponsors to reach you."),
    about: cv.summary || uiText("Add a short introduction and skills."),
    education: cv.education.length > 1 ? uiText("{count} degrees", { count: cv.education.length })
      : education ? `${education.degree} · ${education.institution}` : uiText("Add an institution and degree before publishing."),
    experience: experienceSummary("experience", "Add a job, internship or other work experience."),
    otherRoles: experienceSummary("otherRoles", "Add student society roles, board positions or volunteering."),
  };

  async function persist(next: Saved, action: "save" | "publish" | "withdraw", afterSave?: () => void) {
    if (operation.current) return;
    operation.current = true;
    setSaving(true);
    try {
      if (repository) {
        const result = await repository.mutate({
          action, expectedRevision: revision.current,
          ...(action === "withdraw" ? {} : { draft: { ...next.cv, cvRegistered: true }, sharing: next.sharing }),
        });
        if (!alive.current) return;
        revision.current = result.document.revision;
        publishedRevision.current = result.document.publishedRevision;
        setSaved(stateFromEnvelope(result, next));
      } else {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setSaved(next);
      }
      dirty.current = false;
      afterSave?.();
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof CvRequestError ? error.status : null;
      if (status === 401 || status === 403) {
        const failure = memberLoadFailure(error);
        if ("redirectTo" in failure) navigate(failure.redirectTo, { replace: true });
        return;
      }
      notify(uiText("Could not save CV"), localizeCvError((error as Error).message, language), {
        id: "cv-save", variant: "error",
        action: status === 409
          ? { label: uiText("Reload draft"), onClick: () => confirmLeave(() => void reload(true)) }
          : undefined,
      });
    } finally {
      operation.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function openSection(section: Section, returnTo: "overview" | "review") {
    setSectionReturn(returnTo);
    changeView(section);
  }

  function publish() {
    try {
      const next = validateCvData(cv, true);
      const snapshot = { cv: sharedCvData(next, sharing), sharing: { ...sharing } };
      void persist({ ...saved!, cv: next, published: snapshot }, "publish", () => {
        changeView("published");
        notify(uiText("Published to Talent Directory"), uiText("Sponsors with access can see this version."), { id: "cv-publication" });
      });
    } catch (error) {
      notify(uiText("Check your CV"), localizeCvError((error as Error).message, language), { variant: "error" });
    }
  }

  function title(text: string, description: string, action?: ReactNode) {
    return <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-medium tracking-tight outline-none">{uiText(text)}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{uiText(description)}</p>
      </div>
      {action}
    </header>;
  }

  function back(label: string, target: View) {
    return <Button variant="ghost" size="sm" className="-ml-2 w-fit" disabled={saving} onClick={() => confirmLeave(() => changeView(target))}><IconArrowLeft aria-hidden="true" />{uiText(label)}</Button>;
  }

  const section = view in sections ? view as Section : null;
  return <div className="mx-auto w-full max-w-6xl space-y-6 px-2 py-6 sm:px-4 lg:py-8" lang={language}>
    {view === "profile" && <>
      {title("Profile", "Manage your profile, CV and sponsor visibility.")}
      <Card className="max-w-3xl shadow-none"><CardContent className="flex items-center gap-4">
        <Avatar className="size-12"><AvatarFallback>{accountInitials(cv.fullName)}</AvatarFallback></Avatar>
        <div className="min-w-0 space-y-1"><p className="font-medium">{cv.fullName}</p><p className="text-sm text-muted-foreground">{cv.experience.find(entry => entry.id === managedHelixRoleId)?.title || cv.headline}</p></div>
      </CardContent></Card>
      <section className="max-w-3xl space-y-3" aria-labelledby="cv-prototype-card-title">
        <h2 id="cv-prototype-card-title" className="text-lg font-medium">CV</h2>
        <Card className="shadow-none">
          <CardHeader><div className="flex flex-wrap items-center gap-3"><CardTitle>{uiText("CV for {name}", { name: cv.fullName })}</CardTitle>
            <Badge variant="secondary">{uiText(privateDraft ? "Private draft" : "Published")}</Badge></div>
            <CardDescription>{lastSection ? uiText("Last edited section: {section}", { section: uiText(sections[lastSection]) }) : uiText("Finish your CV when you're ready.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => changeView("overview")}>{uiText(privateDraft ? "Continue draft" : "Edit CV")}</Button>
            {published && <Button variant="outline" onClick={() => changeView("published")}>{uiText("View published version")}</Button>}
            <Button variant="ghost" asChild><Link to={local ? "?cv-prototype=0" : "?cv-editor=classic"}>{uiText("Advanced CV settings")}</Link></Button>
          </CardContent>
        </Card>
      </section>
    </>}

    {view === "overview" && <>
      {back("Profile", "profile")}
      {title("Your CV", "Choose a section to edit. Saved changes stay private until you publish.", <Button variant="outline" onClick={() => changeView("profile")}>{uiText("Save and exit")}</Button>)}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b py-5"><CardTitle>{uiText("CV sections")}</CardTitle><CardDescription>{uiText("Open any section. Education is required to publish.")}</CardDescription></CardHeader>
          <CardContent className="p-0"><ul className="divide-y">
            {(Object.entries(sections) as [Section, string][]).map(([key, label]) => <li key={key}>
              <Button variant="ghost" className="h-auto w-full justify-between gap-5 rounded-none px-5 py-4 text-left" onClick={() => openSection(key, "overview")}>
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{uiText(label)}</span>
                    {lastSection === key && <Badge variant="secondary">{uiText("Last edited")}</Badge>}
                    {key === "education" && !education && <Badge variant="outline">{uiText("Required to publish")}</Badge>}
                  </span>
                  <span className="block truncate text-sm font-normal text-muted-foreground">{summaries[key]}</span>
                </span>
                <IconChevronRight className="text-muted-foreground" aria-hidden="true" />
              </Button>
            </li>)}
          </ul></CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{uiText("Talent Directory")}</CardTitle>
            <CardDescription>{uiText(published ? "Your published version stays visible while you edit your draft." : "Your CV is private. Check what sponsors will see before you publish.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 xl:flex-col">
            <Button onClick={() => setView("review")}>{uiText("Review sponsor view")}</Button>
            {published && <Button variant="outline" onClick={() => setView("published")}>{uiText("View published version")}</Button>}
          </CardContent>
        </Card>
      </div>
    </>}

    {section && <>
      {back(sectionReturn === "review" ? "Review sponsor view" : "CV sections", sectionReturn)}
      {title(sections[section], section === "education" ? "Add or edit your degrees. You need at least one institution and degree to publish." : "Save this section to keep your changes in your private draft.")}
      <SectionEditor key={section} section={section} initial={{ cv, sharing }} saving={saving} onDirty={() => { dirty.current = true; }} onCancel={() => confirmLeave(() => changeView(sectionReturn))} onSave={(nextCv, exit) => {
        void persist({ ...saved, cv: nextCv, lastSection: section }, "save", () => {
          changeView(exit ? "profile" : sectionReturn);
          notify(uiText("Private draft saved"), uiText(exit ? "You can continue from your profile." : "Your changes are saved."), { id: "cv-prototype-save" });
        });
      }} />
    </>}

    {view === "review" && <>
      {back("CV sections", "overview")}
      {title("Review sponsor view", "Check your directory profile and choose what sponsors can access before you publish.", <Badge variant="secondary">{uiText("Private draft")}</Badge>)}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <SponsorPreview key={String(sharing.cv)} cv={cv} sharing={sharing} />
        <div className="space-y-4">
          <SharingOptions snapshot={saved} disabled={saving} onChange={nextSharing => void persist({ ...saved, sharing: nextSharing }, "save")} />
          {education
            ? <Button className="w-full" disabled={saving} onClick={publish}>{uiText(published ? "Publish changes" : "Publish to Talent Directory")}</Button>
            : <Button className="w-full" onClick={() => openSection("education", "review")}>{uiText("Add education to publish")}</Button>}
        </div>
      </div>
    </>}

    {view === "published" && published && <>
      {back("CV sections", "overview")}
      {title("Published version", "This is the version sponsors with Talent Directory access can see.", <Badge variant="secondary">{uiText("Published")}</Badge>)}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <SponsorPreview {...published} />
        <div className="space-y-4">
          <SharingOptions snapshot={published} />
          <Button variant="outline" disabled={saving} onClick={() => void persist({ ...saved, published: null }, "withdraw", () => {
            changeView("overview");
            notify(uiText("CV hidden from Talent Directory"), uiText("Your private draft is up to date."));
          })}>{uiText("Hide from Talent Directory")}</Button>
        </div>
      </div>
    </>}
    <Dialog open={leave !== null} onOpenChange={open => { if (!open) setLeave(null); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{uiText("Discard unsaved changes?")}</DialogTitle>
          <DialogDescription>{uiText("Changes in this section are kept when you save it.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLeave(null)}>{uiText("Keep editing")}</Button>
          <Button variant="destructive" onClick={() => {
            const proceed = leave?.proceed;
            setLeave(null);
            dirty.current = false;
            proceed?.();
          }}>{uiText("Discard changes")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
