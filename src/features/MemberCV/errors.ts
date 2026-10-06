const generalError = "Noe gikk galt i medlemsportalen. Prøv igjen senere.";
const networkError = "Kunne ikke koble til medlemsportalen. Det du har skrevet, er beholdt. Kontroller nettforbindelsen. Last inn lagret CV på nytt før du prøver å lagre eller publisere igjen.";

const messages: Record<string, string> = {
  "CV data must be an object.": "Ugyldige CV-opplysninger.",
  "Invalid CV data.": "Ugyldige CV-opplysninger.",
  "Links must be valid http or https URLs.": "Lenker må være gyldige nettadresser som begynner med http eller https.",
  "The CV is too large.": "CV-en er for stor. Kort ned innholdet.",
  "Use at most 50 skills.": "Bruk maks 50 ferdigheter.",
  "Enter a valid contact email.": "Skriv inn en gyldig kontaktadresse for e-post.",
  "Enter a four-digit graduation year.": "Skriv inn fullføringsåret med fire sifre.",
  "Add your name and an education entry with institution and degree before publishing.": "Legg til navn og minst én utdanning med studiested og grad før du publiserer.",
  "Invalid sharing choices.": "Ugyldige delingsvalg.",
  "Could not complete the request. Your input has been kept.": "Kunne ikke fullføre forespørselen. Det du har skrevet, er beholdt.",
  "The fictional demo is only available in development.": "Den fiktive demoen er bare tilgjengelig i utviklingsmiljøet.",
  "Another tab saved a newer version. Reload the saved draft before continuing. Your input has been kept.": "En annen fane har lagret en nyere versjon. Last inn lagret utkast på nytt før du fortsetter. Det du har skrevet, er beholdt.",
  "The fictional demo uses an HTML preview. Server PDF generation needs the configured application.": "Den fiktive demoen viser en forhåndsvisning i nettleseren. PDF-generering krever at medlemsportalen er satt opp.",
  "Your session has ended. Sign in again to continue.": "Du er logget ut. Logg inn på nytt for å fortsette.",
  "The signed-in account changed. Sign in again to open your CV.": "Den innloggede kontoen er endret. Logg inn på nytt for å åpne CV-en din.",
  "Could not load your CV.": "Kunne ikke laste inn CV-en din.",
  "Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again.": "En annen innlogging har lagret en nyere versjon. Det du har skrevet, er beholdt. Kopier endringene du vil beholde. Last deretter inn lagret utkast på nytt før du lagrer igjen.",
  "The request failed. Your input has been kept.": "Forespørselen mislyktes. Det du har skrevet, er beholdt.",
  "Could not reload. Your input has been kept.": "Kunne ikke laste inn CV-en på nytt. Det du har skrevet, er beholdt.",
  "Could not sign out. Please try again.": "Kunne ikke logge ut. Prøv igjen.",
  "Sign-in is unavailable. Please try again later.": "Innlogging er ikke tilgjengelig. Prøv igjen senere.",
  "Sign-in failed. Use your Helix Google Workspace account.": "Innlogging mislyktes. Bruk Google Workspace-kontoen din fra Helix.",
  "Could not start your member session. Please try again.": "Kunne ikke logge deg inn i medlemsportalen. Prøv igjen.",
  "Sign-in failed. Please try again.": "Innlogging mislyktes. Prøv igjen.",
  "Google sign-in failed. Please try again.": "Google-innlogging mislyktes. Prøv igjen.",
  "Member sign-in is not configured yet. Please contact Helix.": "Medlemsinnlogging er ikke satt opp ennå. Kontakt Helix.",
  "Method not allowed.": "Denne handlingen er ikke støttet.",
  "A Google sign-in credential is required.": "Logg inn med Google for å fortsette.",
  "Google sign-in could not be verified. Try again.": "Kunne ikke bekrefte Google-innloggingen. Prøv igjen.",
  "Invalid or expired Google credential.": "Google-innloggingen er ugyldig eller har utløpt. Logg inn på nytt.",
  "Use your verified @helixnmbu.no Google Workspace account.": "Bruk den verifiserte Google Workspace-kontoen din på @helixnmbu.no.",
  "Google and Supabase identities do not match.": "Google-kontoen samsvarer ikke med medlemskontoen. Logg inn med Helix-kontoen din på nytt.",
  "Member sign-in is temporarily unavailable. Try again.": "Medlemsinnlogging er midlertidig utilgjengelig. Prøv igjen.",
  "Member Google sign-in is not configured.": "Google-innlogging for medlemmer er ikke satt opp ennå. Kontakt Helix.",
  "Could not create your member session.": "Kunne ikke logge deg inn i medlemsportalen. Prøv igjen.",
  "Could not prepare your private member profile. Try signing in again.": "Kunne ikke opprette den private medlemsprofilen din. Prøv å logge inn på nytt.",
  "A valid saved revision is required.": "Last inn en gyldig lagret versjon av CV-en før du fortsetter.",
  "The generated PDF must be smaller than 5 MB.": "Den genererte PDF-en må være mindre enn 5 MB.",
  "The publication result could not be confirmed. Reload your CV before retrying. Its generated file remains tracked.": "Kunne ikke bekrefte om CV-en ble publisert. Last inn lagret CV på nytt før du prøver igjen. Den genererte filen følges fortsatt opp.",
  "The member portal request failed. Your input has been kept. Try again.": "Forespørselen til medlemsportalen mislyktes. Det du har skrevet, er beholdt. Prøv igjen.",
  "Invalid request.": "Ugyldig forespørsel.",
  "Invalid or oversized CV request.": "CV-forespørselen er ugyldig eller for stor.",
  "Member portal server configuration is missing.": "Medlemsportalen er ikke satt opp ennå. Kontakt Helix.",
  "Log in to continue.": "Logg inn for å fortsette.",
  "Your session has expired. Log in again.": "Innloggingen din har utløpt. Logg inn på nytt.",
  "Could not verify member access.": "Kunne ikke bekrefte tilgangen din til medlemsportalen. Prøv igjen.",
  "Log in with your verified Helix Google Workspace account.": "Logg inn med den verifiserte Google Workspace-kontoen din fra Helix.",
  "Your Google identity no longer matches this profile. Log in with Helix Google again.": "Google-kontoen din samsvarer ikke lenger med denne profilen. Logg inn med Helix-kontoen din på nytt.",
  "This CV changed in another session. Reload the saved version before trying again.": "CV-en er endret fra en annen innlogging. Last inn lagret versjon på nytt før du prøver igjen.",
  "The save result could not be confirmed. Reload your CV before retrying.": "Kunne ikke bekrefte om CV-en ble lagret. Last inn lagret CV på nytt før du prøver igjen.",
  "Could not prepare the generated file. Publication has not changed.": "Kunne ikke klargjøre CV-filen. Publiseringen er ikke endret.",
  "Could not store the generated CV. Publication has not changed.": "Kunne ikke lagre den genererte CV-filen. Publiseringen er ikke endret.",
  "CV file cleanup is pending.": "Sletting av tidligere CV-filer gjenstår.",
  "Could not verify retired CV cleanup. The files have been preserved.": "Kunne ikke bekrefte sletting av tidligere CV-filer. Filene er beholdt.",
  "CV file cleanup is pending while an uncertain upload settles.": "Sletting av CV-filer gjenstår mens systemet avklarer en usikker opplasting.",
  "Publication visibility has changed, but retired file deletion is pending. Reload your CV to retry cleanup.": "Synligheten er endret, men tidligere CV-filer er ikke slettet ennå. Last inn CV-en på nytt for å prøve slettingen igjen.",
  "Failed to fetch": networkError,
  "fetch failed": networkError,
  "NetworkError when attempting to fetch resource.": networkError,
  "Network request failed": networkError,
  "Load failed": networkError,
  "The network connection was lost.": networkError,
  "A network error occurred.": networkError,
  "The operation was aborted.": "Forespørselen ble avbrutt. Det du har skrevet, er beholdt.",
  "The user aborted a request.": "Forespørselen ble avbrutt. Det du har skrevet, er beholdt.",
};

const fields: Record<string, string> = {
  name: "navn", email: "e-postadresse", phone: "telefonnummer", city: "bosted",
  headline: "overskrift", summary: "introduksjon", "field of study": "studieretning",
  "graduation year": "fullføringsår", institution: "studiested", degree: "grad",
  "start date": "startdato", "end date": "sluttdato", "education description": "utdanningsbeskrivelse",
  organization: "organisasjon", title: "tittel", "experience description": "erfaringsbeskrivelse",
  "project name": "prosjektnavn", role: "rolle", season: "sesong", "project description": "prosjektbeskrivelse",
  language: "språk", "language level": "språknivå", "link label": "lenketekst", skill: "ferdighet",
  link: "lenke", "entry ID": "ID for oppføringen",
};
const sections: Record<string, string> = {
  education: "utdanning", experience: "erfaring", projects: "prosjekter", languages: "språk", links: "lenker",
};

/** Localize known application errors only. Member-authored CV text is not translated. */
export function localizeCvError(message: string, locale: "nb" | "en"): string {
  if (locale === "en") return message;
  if (typeof messages[message] === "string") return messages[message];
  const list = /^Invalid (.+)\. Use at most 30 entries\.$/.exec(message);
  if (list && typeof sections[list[1]] === "string") return `Ugyldig ${sections[list[1]]}. Bruk maks 30 oppføringer.`;
  const entry = /^Invalid (.+) entry ID\.$/.exec(message);
  if (entry && typeof sections[entry[1]] === "string") return `Ugyldig ID for en oppføring under ${sections[entry[1]]}.`;
  const field = /^Invalid (.+)\.$/.exec(message);
  if (field && typeof fields[field[1]] === "string") return `Ugyldig ${fields[field[1]]}.`;
  const unsupported = /^The CV font does not support ([^\u0000-\u001f\u007f])\. Please use supported text\.$/u.exec(message);
  if (unsupported) return `CV-skriften støtter ikke tegnet '${unsupported[1]}'. Bruk et tegn som skriften støtter.`;
  return generalError;
}
