# Medlemsportal for CV

Status: ready-for-prepare
Oppdatert: 2026-10-06
Feature: member-cv-portal
Repository: Helix-NMBU/helix-webpage

## Formål

Helix-medlemmer skal kunne logge inn med sin Google Workspace-konto, fylle ut et CV-skjema og få en CV generert fra opplysningene. Medlemmet skal kunne publisere CV-en til Talent Directory i sponsorportalen. Dette er første leveranse i den videre utviklingen av sponsorportalen.

Medlemsportalen er siden der medlemmet oppretter og redigerer sin Member Profile. Talent Directory er sponsorens oversikt over publiserte profiler. De to bruker samme profesjonelle opplysninger, men har ulike tilganger og handlinger.

Dette dokumentet avklarer leveransen. Det beskriver krav og forslag, ikke en ferdig eller produksjonstestet løsning.

## Bekreftede krav og beslutninger

- Innlogging skjer med en Google-autentisert Helix-konto. Helix bruker Google Workspace.
- En gyldig Google Workspace-konto på `helixnmbu.no` gir selvbetjent adgang. Systemet oppretter profilen ved første Helix-innlogging, uten krav om forhåndsregistrering i et separat medlemsregister. Brukeren bekreftet dette 2026-10-06.
- Medlemmet oppretter og vedlikeholder egen CV gjennom strukturerte input-felt.
- Systemet genererer CV-en fra opplysningene. En ferdig CV som medlemmet må laste opp selv, oppfyller ikke hovedbehovet.
- CV-en skal kunne vises gjennom Talent Directory i sponsorportalen.
- Medlemmet lagrer som utkast og velger selv når CV-en publiseres. Brukeren bekreftet dette 2026-10-06.
- Brukeren har en referanse for CV-designet. Referansen og endelig utforming behandles senere.
- Profilbilde og videre profiltilpasning kan behandles senere.

## Foreslått første brukerflyt

1. Medlemmet velger «Logg inn med Google» og bruker sin Helix-konto.
2. Ved første godkjente innlogging oppretter systemet en privat profil. Navn og innloggingsadresse kan fylles inn fra den verifiserte identiteten.
3. Medlemmet fyller ut CV-skjemaet. Flere oppføringer kan legges til under utdanning, erfaring og prosjekter.
4. «Lagre utkast» lagrer ufullstendige opplysninger. Medlemmet kan fortsette etter utlogging og på en annen enhet.
5. «Forhåndsvis CV» viser en CV laget av opplysningene og valgene for deling.
6. «Publiser» gjør den ferdige profilen og CV-en tilgjengelig for sponsorer med Talent Directory-tilgang.
7. Medlemmet kan redigere, publisere en ny versjon eller trekke profilen tilbake.

Punkt 1 til 7 er foreslått konkretisering av kravene. Utkast og selvvalgt publisering er bekreftet. De øvrige detaljene er anbefalinger til forberedelsen.

## Foreslåtte CV-felt

Feltlisten er sendt til brukeren for avklaring. Den er foreløpig et forslag.

| Del | Opplysninger |
| --- | --- |
| Kontakt | Navn, verifisert Helix-adresse, valgfri kontaktadresse, telefon og bosted på bynivå |
| Introduksjon | Kort tekst som medlemmet skriver selv |
| Utdanning | Studiested, studieprogram/grad, start og forventet eller fullført slutt |
| Erfaring | Arbeidsgiver/organisasjon, rolle, periode og beskrivelse |
| Helix og prosjekter | Helix-rolle, avdeling/sesong, prosjektnavn, bidrag og valgfri lenke |
| Ferdigheter | Ferdigheter medlemmet legger inn selv |
| Språk | Språk og selvvalgt beskrivelse av nivå |
| Lenker | LinkedIn, GitHub og portefølje der det er relevant |

Innloggingsadressen er knyttet til kontoen og kan ikke endres gjennom CV-skjemaet. Kontaktadresse er et eget felt. Erfaring og lenker er valgfrie. Studenter uten tidligere arbeidserfaring skal kunne publisere en CV.

Forslag til minimum ved publisering er navn og minst én utdanningsoppføring. Utkast kan være ufullstendige. Endelige obligatoriske felt avklares i forberedelsen.

## Publisering og synlighet

Bekreftet: En ny profil er et privat utkast. Medlemmet publiserer selv.

Anbefalt detaljering:

- Skill lagrede utkast fra publisert innhold. Redigering av en publisert CV endrer ikke sponsorens versjon før medlemmet velger å publisere igjen.
- En publisert CV skal være laget av nøyaktig den publiserte versjonen av opplysningene.
- La medlemmet velge om CV, e-post og telefon skal deles. Forhåndsvisningen skal vise hva sponsorene faktisk vil se.
- Delingsvalgene skal gjelde både katalogen, profilvisningen og kontaktopplysninger inne i CV-en. En skjult telefon skal ikke finnes i den delte PDF-en.
- «Trekk tilbake» skjuler profilen og sperrer ny tilgang til delte filer, men beholder medlemmenes eget innhold. PDF-er som allerede er lastet ned, kan ikke trekkes tilbake.
- Sponsorer kan bare lese publisert innhold når deres avtale gir Talent Directory-tilgang. Medlemmer redigerer bare egne opplysninger.

Detaljene over skal behandles som forslag inntil de er avklart. Ikke innfør automatisk publisering eller administrativ godkjenning som erstatning for det bekreftede valget.

## Innlogging og tilgang

Innlogging skal bekrefte en faktisk Google Workspace-identitet for Helix. E-postendelsen alene er ikke tilstrekkelig til å fastslå at Google administrerer kontoen. Serveren må verifisere Google-tokenet og Workspace-domenet. Supabase-sesjonen skal knytte CV-en til en stabil bruker-ID.

Brukeren bekreftet selvbetjent opprettelse ved første verifiserte Helix-innlogging. Medlemsportalens adgang skal derfor ikke kreve en forhåndsregistrert aktiv rad i `public.members`, slik PR #46 gjør i dag. Valget gjelder egen profil og CV. Det gir ikke automatisk adgang til administrasjon eller andre funksjoner som fortsatt krever aktivt medlemskap.

Forberedelsen må velge en serverhåndhevet måte å knytte denne avgrensede profiladgangen til Google-identiteten. Ikke opprett administratorflagg eller tildel andre portalrettigheter som bieffekt av selvbetjent innlogging.

Tilgang må håndheves for database og filer. Klientens domenesjekk og skjulte knapper er ikke tilgangskontroll. Utlogging og utløpt sesjon skal avslutte tilgang til redigering. Ved lagringsfeil skal skjemaet beholde innholdet og vise at det ikke er lagret.

Teknisk kilde: [Google om verifisering av ID-token og Workspace-domenet](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token). [Supabase om Google-innlogging](https://supabase.com/docs/guides/auth/social-login/auth-google).

## CV-generering

Første leveranse skal generere en lesbar CV fra skjemaet og støtte visning gjennom Talent Directory. Anbefalt format er en PDF som også kan forhåndsvises og lastes ned av medlemmet. Den kan bruke en enkel midlertidig mal før brukerens designreferanse er tilgjengelig.

Skjemadata skal være lagret uavhengig av malen. Det skal være mulig å endre CV-utformingen senere uten at medlemmene må registrere opplysningene på nytt. Generatoren formaterer medlemmenes egne opplysninger og legger ikke til erfaring, ferdigheter eller annen tekst som medlemmet ikke har skrevet.

## Hva som finnes fra før

[PR #46: Sponsorportal v2: forslag til retning](https://github.com/Helix-NMBU/helix-webpage/pull/46) ble kontrollert direkte på GitHub 2026-10-06. Den er åpen og Draft, med Jørgen `joasmund` som forespurt reviewer. Head er `sponsor-portal-v2` ved `f99939dfadaa43d869ad6429034608f0bc7f9429`. Den lokale referansen peker på samme commit. PR-en er et eksisterende grunnlag, ikke en produksjonsbekreftelse.

Koden på denne referansen har:

- React, TypeScript, Vite og Supabase som eksisterende teknisk grunnlag.
- Google-innlogging gjennom `src/features/CVBank/Login.tsx` og Supabase `signInWithIdToken`.
- Krav om aktiv medlemsoppføring gjennom `current_portal_context` og `RequireMember`.
- Medlemsprofil på `/member/profile`, med kontaktopplysninger, studieinformasjon, Helix-roller, bildeopplasting og opplasting av ferdig CV.
- Valg for `visible_to_sponsors`, `share_cv`, `share_email` og `share_phone`.
- Sponsorvisning i `src/features/Portal/TalentProfile.tsx`, som åpner og laster ned delte filer fra privat lagring.
- Databaseoppsett i `supabase/sponsor-portal-v2.sql` og driftsveiledning i `docs/sponsor-portal-setup.md`.

Vesentlige forskjeller fra ønsket første leveranse:

- Profilen er ikke en komplett CV-editor. Den har ikke skjema for alle foreslåtte seksjoner eller generering av CV fra skjemadata.
- Synlighet gjelder en profilrad som oppdateres direkte. Det finnes ikke et tydelig skille mellom CV-utkast og publisert CV-versjon.
- `parseGoogleCredential` sjekker e-postdomene i klienten. Workspace-avgrensning må bekreftes i serverens verifisering før selvbetjent medlemsadgang kan innføres.
- `public.students` og `public.positions` er eksisterende lagring. Ikke innfør en ny parallell profilkilde uten å avklare hvordan Talent Directory skal lese den.

Disse observasjonene gjelder kildekoden. Google, database, lagringspolicyer og reelle sponsorroller er ikke testet live i denne avklaringen.

## Fasing

| Trinn | Konkret resultat |
| --- | --- |
| 1. Medlemsportal og CV | Verifisert Helix-innlogging, eget CV-skjema, varig lagring av utkast, enkel CV-generering, forhåndsvisning og medlemstyrt publisering til Talent Directory |
| 2. CV-design og profilbilde | Tilpass malen til brukerens designreferanse og ferdigstill bildehåndtering og profiltilpasning |
| 3. Videre sponsorportal | Ta opp øvrige sponsorfunksjoner fra PR-en i egne leveranser etter at CV-flyten fungerer |

Forslag: Gjør trinn 1 til en avgrenset leveranse i `helix-webpage` med det eksisterende portalgrunnlaget. Denne chatens nåværende arbeidsmappe er CRM-service, som inneholder sponsorarbeid i Google Chat og Attio. Den er ikke riktig sted for medlemsportalen.

## Verifisering før første leveranse kan tas i bruk

- Et medlem logger inn, lagrer et utkast, logger ut og finner samme utkast igjen ved ny innlogging.
- Privat Google-konto og feil Workspace-domene får ikke medlemsadgang, heller ikke gjennom direkte database- eller filkall.
- Et medlem kan ikke lese eller endre et annet medlems utkast.
- Generert CV gjengir oppføringer, tegn, lenker og lengre tekst uten å kutte innhold. Tomme valgfrie seksjoner vises ikke.
- En sponsor med tilgang ser bare publisert innhold. Bronze, Service og uautentiserte besøkende kan ikke lese Talent Directory eller CV-filer.
- Publiser, rediger utkast, publiser ny versjon og trekk tilbake gir riktig visning og filtilgang.
- Delingsvalg for kontaktopplysninger fungerer også inne i PDF-en.
- Medlemsflyten prøves i nettleser på mobil og desktop. Relevante typecheck, lint, tester og build kjøres.
- Google-konfigurasjon, sesjoner, databaseregler og private filer verifiseres med faktiske testroller før produksjon. Lokale tester alene bekrefter ikke dette.

## Åpne avklaringer og neste steg

1. Selvbetjent Google Workspace-adgang og selvvalgt publisering er bekreftet. Det er ingen gjenværende blokkerende produktavklaring for forberedelsen.
2. Spørsmålet om feltlisten er sendt og foreløpig ubesvart. Listen kan brukes som foreslått utgangspunkt i forberedelsen. Den er ikke brukerbekreftet, og obligatoriske felt må fortsatt konkretiseres.
3. Konkretiser detaljen om redigering etter publisering i implementeringsspesifikasjonen. Anbefalingen er separate utkast og publiserte versjoner.
4. CV-designreferansen trengs til trinn 2. Den hindrer ikke forberedelse av datamodell og enkel CV-generering.

Dokumentet er tilstrekkelig avklart til å forberede en konkret implementeringsspesifikasjon. `ready-for-prepare` bekrefter ikke godkjenning av alle foreslåtte detaljer. Ingen kode er implementert, ingen branch er opprettet eller byttet, og ingen endringer er publisert i denne avklaringen.
