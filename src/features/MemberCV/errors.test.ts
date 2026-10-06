import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localizeCvError } from "./errors";
import { emptyCv, validateCvData, validateSharing } from "./model";

const fallback = "Noe gikk galt i medlemsportalen. Prøv igjen senere.";
function validationError(input: unknown): string {
  try { validateCvData(input); }
  catch (error) { if (error instanceof Error) return error.message; }
  throw new Error("The fixture must fail validation.");
}

describe("member error localization", () => {
  it("keeps English messages exactly as received, including Unicode and unknown failures", () => {
    for (const message of ["Invalid summary.", "Failed to fetch", "The save result could not be confirmed. Reload your CV before retrying.", "Åse wrote: æ, ø, å.\nCustom failure", "", "__proto__"]) {
      expect(localizeCvError(message, "en")).toBe(message);
    }
  });

  it.each([
    ["name", "navn"], ["email", "e-postadresse"], ["phone", "telefonnummer"],
    ["city", "bosted"], ["headline", "overskrift"], ["summary", "introduksjon"],
    ["field of study", "studieretning"], ["graduation year", "fullføringsår"],
    ["institution", "studiested"], ["degree", "grad"], ["start date", "startdato"], ["end date", "sluttdato"],
    ["education description", "utdanningsbeskrivelse"], ["organization", "organisasjon"], ["title", "tittel"],
    ["experience description", "erfaringsbeskrivelse"], ["project name", "prosjektnavn"], ["role", "rolle"],
    ["season", "sesong"], ["project description", "prosjektbeskrivelse"], ["language", "språk"],
    ["language level", "språknivå"], ["link label", "lenketekst"], ["skill", "ferdighet"],
    ["link", "lenke"], ["entry ID", "ID for oppføringen"],
  ])("names the invalid %s field in Bokmål", (key, label) => {
    expect(localizeCvError(`Invalid ${key}.`, "nb")).toBe(`Ugyldig ${label}.`);
  });

  it("localizes errors actually produced by malformed or excessive CV input", () => {
    expect(localizeCvError(validationError({ ...emptyCv(), fullName: null }), "nb")).toBe("Ugyldig navn.");
    expect(localizeCvError(validationError({ ...emptyCv(), summary: "x".repeat(8001) }), "nb")).toBe("Ugyldig introduksjon.");
    expect(localizeCvError(validationError({ ...emptyCv(), skills: Array(51).fill("CAD") }), "nb")).toBe("Bruk maks 50 ferdigheter.");
    expect(localizeCvError(validationError({ ...emptyCv(), contactEmail: "not an email" }), "nb")).toContain("gyldig kontaktadresse");
    expect(localizeCvError(validationError({ ...emptyCv(), links: [{ id: "one", label: "Website", url: "javascript:alert(1)" }] }), "nb")).toContain("http eller https");
    try { validateSharing({ cv: true, phone: true, email: "yes" }); }
    catch (error) { expect(localizeCvError((error as Error).message, "nb")).toBe("Ugyldige delingsvalg."); }
  });

  it.each([
    ["education", "utdanning"], ["experience", "erfaring"], ["projects", "prosjekter"],
    ["languages", "språk"], ["links", "lenker"],
  ])("preserves the entry limit and invalid ID distinction for %s", (key, label) => {
    const limit = validationError({ ...emptyCv(), [key]: Array(31).fill({ id: "one" }) });
    expect(localizeCvError(limit, "nb")).toBe(`Ugyldig ${label}. Bruk maks 30 oppføringer.`);
    const id = validationError({ ...emptyCv(), [key]: [{ id: "" }] });
    expect(localizeCvError(id, "nb")).toBe(`Ugyldig ID for en oppføring under ${label}.`);
  });

  it.each(["🚀", "漢", "𝄞"])("identifies an unsupported Unicode character without replacing it: %s", (character) => {
    const message = `The CV font does not support ${character}. Please use supported text.`;
    expect(localizeCvError(message, "nb")).toBe(`CV-skriften støtter ikke tegnet '${character}'. Bruk et tegn som skriften støtter.`);
    expect(localizeCvError(message, "en")).toBe(message);
  });

  it("distinguishes confirmed unchanged publication from uncertain save and publication outcomes", () => {
    const failed = localizeCvError("Could not store the generated CV. Publication has not changed.", "nb");
    expect(failed).toContain("Publiseringen er ikke endret.");
    const save = localizeCvError("The save result could not be confirmed. Reload your CV before retrying.", "nb");
    const publication = localizeCvError("The publication result could not be confirmed. Reload your CV before retrying. Its generated file remains tracked.", "nb");
    expect(save).toContain("Kunne ikke bekrefte om CV-en ble lagret.");
    expect(publication).toContain("Kunne ikke bekrefte om CV-en ble publisert.");
    for (const uncertain of [save, publication]) {
      expect(uncertain).toContain("Last inn lagret CV på nytt før du prøver igjen.");
      expect(uncertain).not.toContain("ikke endret");
    }
    expect(publication).toContain("filen følges fortsatt opp");
  });

  it("retains successful visibility changes when retired-file cleanup is pending", () => {
    const cleanup = localizeCvError("Publication visibility has changed, but retired file deletion is pending. Reload your CV to retry cleanup.", "nb");
    expect(cleanup).toContain("Synligheten er endret");
    expect(cleanup).toContain("tidligere CV-filer er ikke slettet ennå");
    expect(cleanup).not.toContain("Publiseringen er ikke endret");
    expect(localizeCvError("CV file cleanup is pending while an uncertain upload settles.", "nb")).toContain("usikker opplasting");
  });

  it("preserves the user's input and recovery instructions for stale sessions", () => {
    const conflict = localizeCvError("Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again.", "nb");
    expect(conflict).toContain("nyere versjon");
    expect(conflict).toContain("Det du har skrevet, er beholdt");
    expect(conflict).toContain("Kopier endringene");
    expect(conflict).toContain("før du lagrer igjen");
    expect(localizeCvError("Could not reload. Your input has been kept.", "nb")).toContain("beholdt");
  });

  it("preserves authentication and Workspace instructions without exposing backend terminology", () => {
    expect(localizeCvError("Use your verified @helixnmbu.no Google Workspace account.", "nb")).toContain("@helixnmbu.no");
    expect(localizeCvError("Your session has expired. Log in again.", "nb")).toBe("Innloggingen din har utløpt. Logg inn på nytt.");
    const identity = localizeCvError("Google and Supabase identities do not match.", "nb");
    expect(identity).toContain("samsvarer ikke med medlemskontoen");
    expect(identity).not.toContain("Supabase");
  });

  it.each(["Failed to fetch", "fetch failed", "NetworkError when attempting to fetch resource.", "Network request failed", "Load failed", "The network connection was lost.", "A network error occurred."])("localizes %s without claiming an uncertain mutation failed", (message) => {
    const localized = localizeCvError(message, "nb");
    expect(localized).toContain("nettforbindelsen");
    expect(localized).toContain("Det du har skrevet, er beholdt");
    expect(localized).toContain("før du prøver å lagre eller publisere igjen");
    expect(localized).not.toContain("Publiseringen er ikke endret");
  });

  it("uses a safe Bokmål fallback for arbitrary internals and unexpected pattern substitutions", () => {
    for (const message of ["SQL service_role_secret=private", "Invalid private@example.no.", "Invalid constructor.", "__proto__", "constructor", "toString", "The CV font does not support secret content. Please use supported text.", ""]) {
      expect(localizeCvError(message, "nb")).toBe(fallback);
    }
  });

  it("covers current static errors in the member workflow sources", () => {
    const files = [
      "./model.ts", "./repository.ts", "./demo.ts", "./MemberCV.tsx", "../CVBank/Login.tsx",
      "../../../api/member-login.ts", "../../../api/_lib/member-cv-handler.ts", "../../../api/_lib/member-cv-service.ts",
    ];
    const known: string[] = [];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const match of source.matchAll(/"([^"\n]+)"/g)) {
        const message = match[1];
        if (/^(?:Invalid |Could not |Sign-in |Google sign-in |Member (?:sign-in |Google |portal server)|Your (?:session |Google)|The (?:signed-in |CV is |fictional demo |request failed|save result |publication result |member portal request)|Another (?:tab |session)|A (?:valid saved |Google sign-in)|Use (?:at most |your verified )|Enter a |Add your name |Links must |CV (?:data |file cleanup )|Log in |This CV changed |Publication visibility |Method not allowed\.)/.test(message)) known.push(message);
      }
    }
    expect(known.length).toBeGreaterThan(45);
    for (const message of known) expect(localizeCvError(message, "nb"), message).not.toBe(fallback);
  });
});
