import { useState } from "react";

export type MemberLocale = "nb" | "en";
export const MEMBER_LOCALE_KEY = "helix-member-ui-language-v1";

export const englishCopy = {
  References: "References",
  "References (optional)": "References (optional)",
  "Provided on request": "Provided on request",
  "No content yet": "No content yet",
  "Some content is missing": "Some content is missing",
  "Grade (optional)": "Grade (optional)",
  "Day (optional)": "Day (optional)",
  "Day is optional. Use day, month, year.": "Day is optional. Use day, month, year.",
  "Use numeric date": "Use numeric date",
  "Changes are saved automatically as a private draft.": "Changes are saved automatically as a private draft.",
  "Saving draft…": "Saving draft…",
  "All changes saved": "All changes saved",
  "Changes waiting to be saved": "Changes waiting to be saved",
  "Automatic saving paused. Your input is kept.": "Automatic saving paused. Your input is kept.",
  "Retry saving": "Retry saving",
  "Complete the date before saving.": "Complete the date before saving.",
  "Enter a month from 01 to 12.": "Enter a month from 01 to 12.",
  "Enter a valid calendar day.": "Enter a valid calendar day.",
  "Enter a four-digit year.": "Enter a four-digit year.",

  "Expand {section}": "Expand {section}",
  "Collapse {section}": "Collapse {section}",
  Grade: "Grade",
  "Activities and societies": "Activities and societies",
  "Job title": "Job title",
  "Company or organisation": "Company or organisation",
  "Employment type": "Employment type",
  Location: "Location",
  "Location type": "Location type",
  Proficiency: "Proficiency",
  "Full-time": "Full-time",
  "Part-time": "Part-time",
  "Self-employed": "Self-employed",
  Freelance: "Freelance",
  Contract: "Contract",
  Internship: "Internship",
  Apprenticeship: "Apprenticeship",
  Seasonal: "Seasonal",
  "On-site": "On-site",
  Hybrid: "Hybrid",
  Remote: "Remote",
  "Elementary proficiency": "Elementary proficiency",
  "Limited working proficiency": "Limited working proficiency",
  "Professional working proficiency": "Professional working proficiency",
  "Full professional proficiency": "Full professional proficiency",
  "Native or bilingual proficiency": "Native or bilingual proficiency",
  "Not specified": "Not specified",
  "Use my own wording": "Use my own wording",
  "Your own wording": "Your own wording",
  Year: "Year",
  Month: "Month",
  "Year only": "Year only",
  "Current date: {date}. Enter a year to replace it.":
    "Current date: {date}. Enter a year to replace it.",
  "Use month and year": "Use month and year",
  "Edit date as text": "Edit date as text",
  "Start date": "Start date",
  "End date": "End date",
  "I currently work here": "I currently work here",
  "This project is ongoing": "This project is ongoing",
  Present: "Present",
  January: "January",
  February: "February",
  March: "March",
  April: "April",
  May: "May",
  June: "June",
  July: "July",
  August: "August",
  September: "September",
  October: "October",
  November: "November",
  December: "December",
  Sections: "Sections",
  "Show sections": "Show sections",
  "Hide sections": "Hide sections",
  "Section overview": "Section overview",
  "Content progress is separate from saving and publication.":
    "Content progress is separate from saving and publication.",
  Empty: "Empty",
  Started: "Started",
  Filled: "Filled",
  Saved: "Saved",
  Unsaved: "Unsaved",
  Settings: "Settings",
  "Optional fields can stay empty. Save your draft to keep changes.":
    "Optional fields can stay empty. Save your draft to keep changes.",
  "Member portal": "Member portal",
  "Back to home": "Back to home",
  "Sign out": "Sign out",
  Cancel: "Cancel",
  Language: "Language",
  "Choose Norwegian Bokmål or English": "Choose Norwegian Bokmål or English",
  "Your member profile": "Your member profile",
  "Build your CV": "Build your CV",
  "Save privately, preview your CV and choose when to share it with sponsors.":
    "Save privately, preview your CV and choose when to share it with sponsors.",
  "Fictional local demo": "Fictional local demo",
  "This demo saves only in this browser. It does not verify Google, Supabase or sponsor access. PDF generation is replaced by an HTML preview.":
    "This demo saves only in this browser. It does not verify Google, Supabase or sponsor access. PDF generation is replaced by an HTML preview.",
  "Your session has ended. Editing is locked.":
    "Your session has ended. Editing is locked.",
  "Sign in again": "Sign in again",
  "Reload saved draft": "Reload saved draft",
  "Your latest CV operation succeeded, but deletion of a retired CV file is still pending. Your saved revision and directory visibility are up to date.":
    "Your latest CV operation succeeded, but deletion of a retired CV file is still pending. Your saved revision and directory visibility are up to date.",
  "Reload saved draft to retry cleanup": "Reload saved draft to retry cleanup",
  "Loading your private CV…": "Loading your private CV…",
  "Your CV could not be opened.": "Your CV could not be opened.",
  "Unsaved changes": "Unsaved changes",
  "Private draft saved": "Private draft saved",
  "Draft revision {revision}": "Draft revision {revision}",
  "Not published": "Not published",
  "Published in Talent Directory": "Published in Talent Directory",
  "Only you can access this draft.": "Only you can access this draft.",
  "Published version {revision}. Draft changes stay private until republished.":
    "Published version {revision}. Draft changes stay private until republished.",
  "Contact and introduction": "Contact and introduction",
  "Your Workspace login address stays linked to your account. Contact details below are shared only when you choose.":
    "Your Workspace login address stays linked to your account. Contact details below are shared only when you choose.",
  "Signed in as {email}": "Signed in as {email}",
  "Full name": "Full name",
  Headline: "Headline",
  "Your field or role": "Your field or role",
  "Contact email": "Contact email",
  Phone: "Phone",
  City: "City",
  "Field of study": "Field of study",
  "Graduation year": "Graduation year",
  Introduction: "Introduction",
  Education: "Education",
  education: "education",
  Institution: "Institution",
  "Degree or programme": "Degree or programme",
  Start: "Start",
  "2024 or Sep 2024": "2024 or Sep 2024",
  "End or expected end": "End or expected end",
  "2028 or Present": "2028 or Present",
  Description: "Description",
  "Add at least one institution and degree before publishing.":
    "Add at least one institution and degree before publishing.",
  Experience: "Experience",
  experience: "experience",
  "Employer or organisation": "Employer or organisation",
  Role: "Role",
  Projects: "Projects",
  "+ Add Helix role": "+ Add Helix role",
  "+ Add another role": "+ Add another role",
  "Add another role at {organization}": "Add another role at {organization}",
  "Organisation not specified": "Organisation not specified",
  "Role details (optional)": "Role details (optional)",
  Department: "Department",
  "Role link": "Role link",
  "Move role to Experience": "Move role to Experience",
  "Move {project} role to Experience": "Move {project} role to Experience",
  project: "project",
  "Project or department": "Project or department",
  "Your role": "Your role",
  Season: "Season",
  "Project link": "Project link",
  "Your contribution": "Your contribution",
  Languages: "Languages",
  language: "language",
  "Level in your own words": "Level in your own words",
  Links: "Links",
  link: "link",
  Label: "Label",
  "LinkedIn, GitHub or portfolio": "LinkedIn, GitHub or portfolio",
  URL: "URL",
  "https://": "https://",
  "2028": "2028",
  Remove: "Remove",
  "Remove {entry} {number}": "Remove {entry} {number}",
  "+ Add {entry}": "+ Add {entry}",
  Skills: "Skills",
  "Enter one skill per line. Use up to 50 skills.":
    "Enter one skill per line. Use up to 50 skills.",
  "Your skills": "Your skills",
  "CAD\nPrototyping\nTeamwork": "CAD\nPrototyping\nTeamwork",
  "Share with sponsors": "Share with sponsors",
  "These choices apply when you publish. Email and phone choices also apply inside the generated CV.":
    "These choices apply when you publish. Email and phone choices also apply inside the generated CV.",
  "Share generated CV": "Share generated CV",
  "Share contact email": "Share contact email",
  "Share phone number": "Share phone number",
  "A published profile is visible in Talent Directory even when CV download is off. Sponsors need an eligible agreement.":
    "A published profile is visible in Talent Directory even when CV download is off. Sponsors need an eligible agreement.",
  "Preview and publication": "Preview and publication",
  "Preview uses your current inputs and sharing choices, including unsaved changes.":
    "Preview uses your current inputs and sharing choices, including unsaved changes.",
  "Saving…": "Saving…",
  "Save private draft": "Save private draft",
  "Generating…": "Generating…",
  "Preview demo CV": "Preview demo CV",
  "Preview PDF": "Preview PDF",
  "Download PDF": "Download PDF",
  "Publishing…": "Publishing…",
  "Publish to Talent Directory": "Publish to Talent Directory",
  "Publish new version": "Publish new version",
  "Withdraw published profile": "Withdraw published profile",
  "Publication saves and shares this version. Later draft edits stay private. Withdrawal keeps your draft and prevents new access. Files already downloaded cannot be recalled.":
    "Publication saves and shares this version. Later draft edits stay private. Withdrawal keeps your draft and prevents new access. Files already downloaded cannot be recalled.",
  "Fill fictional example": "Fill fictional example",
  "CV preview": "CV preview",
  "Demo CV preview": "Demo CV preview",
  "Generated CV preview": "Generated CV preview",
  "Close preview": "Close preview",
  "This preview follows your current email and phone sharing choices.":
    "This preview follows your current email and phone sharing choices.",
  "CV download is currently off for sponsors.":
    "CV download is currently off for sponsors.",
  "Download this PDF": "Download this PDF",
  "Generated CV PDF": "Generated CV PDF",
  "Fictional demo · HTML preview": "Fictional demo · HTML preview",
  "Your name": "Your name",
  "Private draft saved. Your published version has not changed.":
    "Private draft saved. Your published version has not changed.",
  "Published. Sponsors with Talent Directory access can see this version with your sharing choices.":
    "Published. Sponsors with Talent Directory access can see this version with your sharing choices.",
  "Profile withdrawn from Talent Directory. Your private draft is kept.":
    "Profile withdrawn from Talent Directory. Your private draft is kept.",
  "Saved draft reloaded.": "Saved draft reloaded.",
  "Fictional example added. Save or publish to keep it.":
    "Fictional example added. Save or publish to keep it.",
  "Reloading replaces your unsaved input with the saved draft. Continue?":
    "Reloading replaces your unsaved input with the saved draft. Continue?",
  "Your latest changes are not saved. Sign out anyway?":
    "Your latest changes are not saved. Sign out anyway?",
  "Sign in to build your CV": "Sign in to build your CV",
  "Use your @helixnmbu.no Google Workspace account. Your profile starts as a private draft. You choose when to publish it to Talent Directory.":
    "Use your @helixnmbu.no Google Workspace account. Your profile starts as a private draft. You choose when to publish it to Talent Directory.",
  "Verifying your Helix account…": "Verifying your Helix account…",
  "Member sign-in is not configured yet. Please contact Helix.":
    "Member sign-in is not configured yet. Please contact Helix.",
  "Open fictional local demo": "Open fictional local demo",
} as const;

export type MemberCopyKey = keyof typeof englishCopy;
export const norwegianCopy: Record<MemberCopyKey, string> = {
  References: "Referanser",
  "References (optional)": "Referanser (valgfritt)",
  "Provided on request": "Oppgis på forespørsel",
  "No content yet": "Ikke noe innhold ennå",
  "Some content is missing": "Noe innhold mangler",
  "Grade (optional)": "Karakter (valgfritt)",
  "Day (optional)": "Dag (valgfritt)",
  "Day is optional. Use day, month, year.": "Dag er valgfritt. Bruk dag, måned, år.",
  "Use numeric date": "Bruk numerisk dato",
  "Changes are saved automatically as a private draft.": "Endringer lagres automatisk som et privat utkast.",
  "Saving draft…": "Lagrer utkast…",
  "All changes saved": "Alle endringer er lagret",
  "Changes waiting to be saved": "Endringer venter på lagring",
  "Automatic saving paused. Your input is kept.": "Automatisk lagring er satt på pause. Det du har skrevet, er beholdt.",
  "Retry saving": "Prøv å lagre igjen",
  "Complete the date before saving.": "Fullfør datoen før du lagrer.",
  "Enter a month from 01 to 12.": "Skriv inn en måned fra 01 til 12.",
  "Enter a valid calendar day.": "Skriv inn en gyldig kalenderdag.",
  "Enter a four-digit year.": "Skriv inn et år med fire sifre.",

  "Expand {section}": "Åpne {section}",
  "Collapse {section}": "Lukk {section}",
  Grade: "Karakter",
  "Activities and societies": "Aktiviteter og verv",
  "Job title": "Stillingstittel",
  "Company or organisation": "Bedrift eller organisasjon",
  "Employment type": "Ansettelsesform",
  Location: "Sted",
  "Location type": "Arbeidssted",
  Proficiency: "Språknivå",
  "Full-time": "Heltid",
  "Part-time": "Deltid",
  "Self-employed": "Selvstendig næringsdrivende",
  Freelance: "Frilans",
  Contract: "Oppdrag",
  Internship: "Praksis",
  Apprenticeship: "Lærling",
  Seasonal: "Sesongarbeid",
  "On-site": "På arbeidsplassen",
  Hybrid: "Hybrid",
  Remote: "Fjernarbeid",
  "Elementary proficiency": "Grunnleggende ferdigheter",
  "Limited working proficiency": "Begrensede arbeidsferdigheter",
  "Professional working proficiency": "Profesjonelle arbeidsferdigheter",
  "Full professional proficiency": "Full profesjonell kompetanse",
  "Native or bilingual proficiency": "Morsmål eller tospråklig",
  "Not specified": "Ikke angitt",
  "Use my own wording": "Bruk egen beskrivelse",
  "Your own wording": "Egen beskrivelse",
  Year: "År",
  Month: "Måned",
  "Year only": "Kun år",
  "Current date: {date}. Enter a year to replace it.":
    "Nåværende dato: {date}. Skriv inn et år for å erstatte den.",
  "Use month and year": "Bruk måned og år",
  "Edit date as text": "Rediger dato som tekst",
  "Start date": "Startdato",
  "End date": "Sluttdato",
  "I currently work here": "Jeg jobber her fortsatt",
  "This project is ongoing": "Prosjektet pågår fortsatt",
  Present: "Nå",
  January: "Januar",
  February: "Februar",
  March: "Mars",
  April: "April",
  May: "Mai",
  June: "Juni",
  July: "Juli",
  August: "August",
  September: "September",
  October: "Oktober",
  November: "November",
  December: "Desember",
  Sections: "Seksjoner",
  "Show sections": "Vis seksjoner",
  "Hide sections": "Skjul seksjoner",
  "Section overview": "Seksjonsoversikt",
  "Content progress is separate from saving and publication.":
    "Utfylt innhold vises separat fra lagring og publisering.",
  Empty: "Tom",
  Started: "Påbegynt",
  Filled: "Utfylt",
  Saved: "Lagret",
  Unsaved: "Ulagret",
  Settings: "Innstillinger",
  "Optional fields can stay empty. Save your draft to keep changes.":
    "Valgfrie felt kan stå tomme. Lagre utkastet for å beholde endringene.",
  "Member portal": "Medlemsportal",
  "Back to home": "Til forsiden",
  "Sign out": "Logg ut",
  Cancel: "Avbryt",
  Language: "Språk",
  "Choose Norwegian Bokmål or English": "Velg norsk bokmål eller engelsk",
  "Your member profile": "Din medlemsprofil",
  "Build your CV": "Lag CV-en din",
  "Save privately, preview your CV and choose when to share it with sponsors.":
    "Lagre et privat utkast, forhåndsvis CV-en og velg når du vil dele den med sponsorer.",
  "Fictional local demo": "Lokal demo med fiktive opplysninger",
  "This demo saves only in this browser. It does not verify Google, Supabase or sponsor access. PDF generation is replaced by an HTML preview.":
    "Demoen lagrer bare i denne nettleseren. Den bekrefter ikke innlogging med Google, lagring i Supabase eller sponsortilgang. CV-en forhåndsvises som HTML i stedet for PDF.",
  "Your session has ended. Editing is locked.":
    "Du er ikke lenger innlogget. Du må logge inn igjen for å redigere.",
  "Sign in again": "Logg inn igjen",
  "Reload saved draft": "Last inn lagret utkast",
  "Your latest CV operation succeeded, but deletion of a retired CV file is still pending. Your saved revision and directory visibility are up to date.":
    "Handlingen er gjennomført, men en tidligere CV-fil er ennå ikke slettet. Lagret versjon og synligheten i talentoversikten er oppdatert.",
  "Reload saved draft to retry cleanup":
    "Last inn utkastet for å prøve slettingen på nytt",
  "Loading your private CV…": "Laster den private CV-en din…",
  "Your CV could not be opened.": "CV-en din kunne ikke åpnes.",
  "Unsaved changes": "Ulagrede endringer",
  "Private draft saved": "Privat utkast lagret",
  "Draft revision {revision}": "Utkastversjon {revision}",
  "Not published": "Ikke publisert",
  "Published in Talent Directory": "Publisert i talentoversikten",
  "Only you can access this draft.": "Bare du har tilgang til dette utkastet.",
  "Published version {revision}. Draft changes stay private until republished.":
    "Publisert versjon {revision}. Endringer i utkastet forblir private til du publiserer på nytt.",
  "Contact and introduction": "Kontakt og introduksjon",
  "Your Workspace login address stays linked to your account. Contact details below are shared only when you choose.":
    "Google Workspace-adressen er knyttet til kontoen din. Du velger selv om kontaktopplysningene nedenfor skal deles.",
  "Signed in as {email}": "Innlogget som {email}",
  "Full name": "Fullt navn",
  Headline: "Overskrift",
  "Your field or role": "Fagområde eller rolle",
  "Contact email": "Kontaktadresse for e-post",
  Phone: "Telefon",
  City: "By",
  "Field of study": "Studieretning",
  "Graduation year": "År for fullført utdanning",
  Introduction: "Introduksjon",
  Education: "Utdanning",
  education: "utdanning",
  Institution: "Studiested",
  "Degree or programme": "Grad eller studieprogram",
  Start: "Start",
  "2024 or Sep 2024": "2024 eller sep. 2024",
  "End or expected end": "Slutt eller forventet slutt",
  "2028 or Present": "2028 eller pågående",
  Description: "Beskrivelse",
  "Add at least one institution and degree before publishing.":
    "Legg til minst ett studiested og en grad før du publiserer.",
  Experience: "Erfaring",
  experience: "erfaring",
  "Employer or organisation": "Arbeidsgiver eller organisasjon",
  Role: "Rolle",
  Projects: "Prosjekter",
  "+ Add Helix role": "+ Legg til Helix-rolle",
  "+ Add another role": "+ Legg til en ny rolle",
  "Add another role at {organization}": "Legg til en ny rolle i {organization}",
  "Organisation not specified": "Organisasjon ikke oppgitt",
  "Role details (optional)": "Rolledetaljer (valgfritt)",
  Department: "Avdeling",
  "Role link": "Lenke til rollen",
  "Move role to Experience": "Flytt rolle til erfaring",
  "Move {project} role to Experience": "Flytt rollen i {project} til erfaring",
  project: "prosjekt",
  "Project or department": "Prosjekt eller avdeling",
  "Your role": "Din rolle",
  Season: "Sesong",
  "Project link": "Prosjektlenke",
  "Your contribution": "Ditt bidrag",
  Languages: "Språk",
  language: "språk",
  "Level in your own words": "Beskriv nivået ditt",
  Links: "Lenker",
  link: "lenke",
  Label: "Navn på lenken",
  "LinkedIn, GitHub or portfolio": "LinkedIn, GitHub eller portefølje",
  URL: "Nettadresse",
  "https://": "https://",
  "2028": "2028",
  Remove: "Fjern",
  "Remove {entry} {number}": "Fjern {entry} {number}",
  "+ Add {entry}": "+ Legg til {entry}",
  Skills: "Ferdigheter",
  "Enter one skill per line. Use up to 50 skills.":
    "Skriv én ferdighet per linje. Du kan legge til opptil 50 ferdigheter.",
  "Your skills": "Dine ferdigheter",
  "CAD\nPrototyping\nTeamwork": "CAD\nPrototyping\nSamarbeid",
  "Share with sponsors": "Del med sponsorer",
  "These choices apply when you publish. Email and phone choices also apply inside the generated CV.":
    "Valgene gjelder når du publiserer. Valg for e-post og telefon gjelder også i den genererte CV-en.",
  "Share generated CV": "Del generert CV",
  "Share contact email": "Del e-postadresse",
  "Share phone number": "Del telefonnummer",
  "A published profile is visible in Talent Directory even when CV download is off. Sponsors need an eligible agreement.":
    "En publisert profil er synlig i talentoversikten selv om CV-nedlasting er av. Sponsorene må ha en avtale som gir tilgang.",
  "Preview and publication": "Forhåndsvisning og publisering",
  "Preview uses your current inputs and sharing choices, including unsaved changes.":
    "Forhåndsvisningen bruker opplysningene og delingsvalgene i skjemaet, også endringer som ikke er lagret.",
  "Saving…": "Lagrer…",
  "Save private draft": "Lagre privat utkast",
  "Generating…": "Lager forhåndsvisning…",
  "Preview demo CV": "Forhåndsvis demo-CV",
  "Preview PDF": "Forhåndsvis PDF",
  "Download PDF": "Last ned PDF",
  "Publishing…": "Publiserer…",
  "Publish to Talent Directory": "Publiser i talentoversikten",
  "Publish new version": "Publiser ny versjon",
  "Withdraw published profile": "Trekk tilbake publisert profil",
  "Publication saves and shares this version. Later draft edits stay private. Withdrawal keeps your draft and prevents new access. Files already downloaded cannot be recalled.":
    "Publisering lagrer og deler denne versjonen. Senere endringer i utkastet forblir private. Når du trekker tilbake profilen, beholder du utkastet og stenger for ny tilgang. Filer som allerede er lastet ned, kan ikke trekkes tilbake.",
  "Fill fictional example": "Fyll inn fiktivt eksempel",
  "CV preview": "Forhåndsvisning av CV",
  "Demo CV preview": "Forhåndsvisning av demo-CV",
  "Generated CV preview": "Forhåndsvisning av generert CV",
  "Close preview": "Lukk forhåndsvisning",
  "This preview follows your current email and phone sharing choices.":
    "Forhåndsvisningen følger delingsvalgene dine for e-post og telefon.",
  "CV download is currently off for sponsors.":
    "CV-nedlasting er av for sponsorer.",
  "Download this PDF": "Last ned denne PDF-en",
  "Generated CV PDF": "Generert CV som PDF",
  "Fictional demo · HTML preview": "Fiktiv demo · HTML-forhåndsvisning",
  "Your name": "Ditt navn",
  "Private draft saved. Your published version has not changed.":
    "Det private utkastet er lagret. Den publiserte versjonen er uendret.",
  "Published. Sponsors with Talent Directory access can see this version with your sharing choices.":
    "Publisert. Sponsorer med tilgang til talentoversikten kan se denne versjonen med delingsvalgene dine.",
  "Profile withdrawn from Talent Directory. Your private draft is kept.":
    "Profilen er trukket tilbake fra talentoversikten. Det private utkastet beholdes.",
  "Saved draft reloaded.": "Det lagrede utkastet er lastet inn.",
  "Fictional example added. Save or publish to keep it.":
    "Det fiktive eksempelet er fylt inn. Lagre eller publiser for å beholde det.",
  "Reloading replaces your unsaved input with the saved draft. Continue?":
    "Når du laster inn på nytt, blir ulagrede endringer erstattet med det lagrede utkastet. Vil du fortsette?",
  "Your latest changes are not saved. Sign out anyway?":
    "De siste endringene er ikke lagret. Vil du likevel logge ut?",
  "Sign in to build your CV": "Logg inn for å lage CV-en din",
  "Use your @helixnmbu.no Google Workspace account. Your profile starts as a private draft. You choose when to publish it to Talent Directory.":
    "Bruk Google Workspace-kontoen din på @helixnmbu.no. Profilen starter som et privat utkast. Du velger når du vil publisere den i talentoversikten.",
  "Verifying your Helix account…": "Bekrefter Helix-kontoen din…",
  "Member sign-in is not configured yet. Please contact Helix.":
    "Medlemsinnlogging er ikke satt opp ennå. Kontakt Helix.",
  "Open fictional local demo": "Åpne lokal demo med fiktive opplysninger",
};

type PlaceholderNames<Text extends string> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholderNames<Rest>
    : never;
export type StaticMemberCopyKey = {
  [Key in MemberCopyKey]: PlaceholderNames<
    (typeof englishCopy)[Key]
  > extends never
    ? Key
    : never;
}[MemberCopyKey];
export type CopyArguments<Key extends MemberCopyKey> =
  PlaceholderNames<(typeof englishCopy)[Key]> extends never
    ? []
    : [
        values: Record<
          PlaceholderNames<(typeof englishCopy)[Key]>,
          string | number
        >,
      ];

export function memberText<Key extends MemberCopyKey>(
  locale: MemberLocale,
  key: Key,
  ...args: CopyArguments<Key>
): string {
  const template = locale === "nb" ? norwegianCopy[key] : englishCopy[key];
  const values = args[0] as Record<string, string | number> | undefined;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!values || !(name in values))
      throw new Error(`Missing UI copy parameter ${name}.`);
    return String(values[name]);
  });
}

export function browserMemberLocale(
  languages: readonly string[],
): MemberLocale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (["nb", "nn", "no"].includes(base)) return "nb";
    if (base === "en") return "en";
  }
  return "en";
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export function initialMemberLocale(
  storage: PreferenceStorage | null,
  languages: readonly string[],
): MemberLocale {
  try {
    const saved = storage?.getItem(MEMBER_LOCALE_KEY);
    if (saved === "nb" || saved === "en") return saved;
  } catch {
    /* Language selection remains available when storage is blocked. */
  }
  return browserMemberLocale(languages);
}
export function persistMemberLocale(
  storage: PreferenceStorage | null,
  locale: MemberLocale,
): void {
  try {
    storage?.setItem(MEMBER_LOCALE_KEY, locale);
  } catch {
    /* Keep the selection for this page even if persistence is unavailable. */
  }
}
function preferenceStorage(): PreferenceStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function useMemberLocale() {
  const [locale, updateLocale] = useState<MemberLocale>(() =>
    initialMemberLocale(
      preferenceStorage(),
      typeof navigator !== "undefined" ? navigator.languages : [],
    ),
  );
  const setLocale = (next: MemberLocale) => {
    updateLocale(next);
    persistMemberLocale(preferenceStorage(), next);
  };
  const t = <Key extends MemberCopyKey>(
    key: Key,
    ...args: CopyArguments<Key>
  ) => memberText(locale, key, ...args);
  return { locale, setLocale, t };
}
