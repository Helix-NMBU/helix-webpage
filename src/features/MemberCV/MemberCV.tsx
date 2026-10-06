import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../libs/lib/utils";
import { createDemoRepository, fictionalCv } from "./demo";
import { sharedCvData } from "./model";
import {
  createCvRepository,
  CvRequestError,
  validateMutation,
} from "./repository";
import type { CvData, CvEnvelope, CvMutation, CvSharing } from "./types";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@libs/components/ui/card";
import { Label } from "@libs/components/ui/label";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@libs/components/ui/alert";
import { Badge } from "@libs/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { createUnsavedConfirmation, type UnsavedAction } from "./confirmation";
import { SectionNavigation } from "./SectionNavigation";
import { getSectionStatuses } from "./section-status";
import {
  useMemberLocale,
  memberText,
  type StaticMemberCopyKey,
  type MemberLocale,
} from "./locale";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { localizeCvError } from "./errors";
import "../Portal/portal.css";
import "./member-cv.css";

type Row = { id: string; [key: string]: string };
type FieldDefinition = {
  key: string;
  label: StaticMemberCopyKey;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: StaticMemberCopyKey;
};
const period: FieldDefinition[] = [
  {
    key: "startDate",
    label: "Start",
    maxLength: 30,
    placeholder: "2024 or Sep 2024",
  },
  {
    key: "endDate",
    label: "End or expected end",
    maxLength: 30,
    placeholder: "2028 or Present",
  },
];
const definitions: {
  key: "education" | "experience" | "projects" | "languages" | "links";
  title: StaticMemberCopyKey;
  singular: StaticMemberCopyKey;
  fields: FieldDefinition[];
}[] = [
  {
    key: "education",
    title: "Education",
    singular: "education",
    fields: [
      { key: "institution", label: "Institution" },
      { key: "degree", label: "Degree or programme" },
      ...period,
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "experience",
    title: "Experience",
    singular: "experience",
    fields: [
      { key: "organization", label: "Employer or organisation" },
      { key: "title", label: "Role" },
      ...period,
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "projects",
    title: "Helix roles and projects",
    singular: "project",
    fields: [
      { key: "name", label: "Project or department" },
      { key: "role", label: "Your role" },
      { key: "season", label: "Season", maxLength: 30 },
      {
        key: "url",
        label: "Project link",
        maxLength: 2000,
        placeholder: "https://",
      },
      { key: "description", label: "Your contribution", multiline: true },
    ],
  },
  {
    key: "languages",
    title: "Languages",
    singular: "language",
    fields: [
      { key: "name", label: "Language", maxLength: 100 },
      { key: "level", label: "Level in your own words", maxLength: 100 },
    ],
  },
  {
    key: "links",
    title: "Links",
    singular: "link",
    fields: [
      {
        key: "label",
        label: "Label",
        maxLength: 100,
        placeholder: "LinkedIn, GitHub or portfolio",
      },
      { key: "url", label: "URL", maxLength: 2000, placeholder: "https://" },
    ],
  },
];

function Field({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 500,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className={multiline ? "mcv-field mcv-full" : "mcv-field"}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={4}
          value={value}
          maxLength={maxLength === 500 ? 8000 : maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="mcv-section"
      id={`mcv-${id}`}
      aria-labelledby={`mcv-${id}-title`}
    >
      <Card className="mcv-card">
        <CardHeader className="mcv-card-header">
          <CardTitle>
            <h2 id={`mcv-${id}-title`} tabIndex={-1}>
              {title}
            </h2>
          </CardTitle>
          {hint && (
            <CardDescription className="mcv-hint">{hint}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="mcv-card-content">{children}</CardContent>
      </Card>
    </section>
  );
}

function DemoPreview({
  data,
  sharing,
  locale,
}: {
  data: CvData;
  sharing: CvSharing;
  locale: MemberLocale;
}) {
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  const cv = sharedCvData(data, sharing);
  return (
    <article className="mcv-demo-document">
      <p className="mcv-demo-label">{t("Fictional demo · HTML preview")}</p>
      <h1>{cv.fullName || t("Your name")}</h1>
      {cv.headline && <p>{cv.headline}</p>}
      <p>{[cv.city, cv.contactEmail, cv.phone].filter(Boolean).join(" · ")}</p>
      {cv.summary && <p className="mcv-preserve">{cv.summary}</p>}
      {definitions.map(
        ({ key, title, fields }) =>
          cv[key].length > 0 && (
            <section key={key}>
              <h2>{t(title)}</h2>
              {(cv[key] as Row[]).map((row) => (
                <div key={row.id} className="mcv-preview-entry">
                  {fields.map(
                    (field) =>
                      row[field.key] && (
                        <p className="mcv-preserve" key={field.key}>
                          {row[field.key]}
                        </p>
                      ),
                  )}
                </div>
              ))}
            </section>
          ),
      )}
      {cv.skills.length > 0 && (
        <section>
          <h2>{t("Skills")}</h2>
          <p>{cv.skills.join(", ")}</p>
        </section>
      )}
    </article>
  );
}

export default function MemberCV() {
  const { locale, setLocale, t } = useMemberLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const demo =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("demo") === "1";
  const sharingId = useId();
  const boundUserId = useRef<string | null>(null);
  const previewOpener = useRef<HTMLElement | null>(null);
  const previewClose = useRef<HTMLButtonElement | null>(null);
  const confirmationCancel = useRef<HTMLButtonElement | null>(null);
  const confirmationOpener = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState<UnsavedAction | null>(null);
  const unsavedConfirmation = useMemo(
    () => createUnsavedConfirmation(setConfirmation),
    [],
  );
  const restoreOpener = useCallback((opener: HTMLElement | null) => {
    if (opener?.isConnected) {
      if (opener.matches(":disabled")) {
        pendingFocus.current = opener;
        return;
      }
      pendingFocus.current = null;
      opener.focus();
    } else {
      pendingFocus.current = null;
      document
        .querySelector<HTMLElement>(".mcv-header .mcv-language-trigger")
        ?.focus();
    }
  }, []);
  const repository = useMemo(
    () =>
      demo
        ? createDemoRepository(localStorage, import.meta.env.DEV)
        : createCvRepository(async () => {
            const { data, error } = (await supabase?.auth.getSession()) ?? {
              data: { session: null },
              error: null,
            };
            if (error || !data.session)
              throw new CvRequestError(
                "Your session has ended. Sign in again to continue.",
                401,
              );
            if (
              boundUserId.current &&
              boundUserId.current !== data.session.user.id
            )
              throw new CvRequestError(
                "The signed-in account changed. Sign in again to open your CV.",
                401,
              );
            boundUserId.current = data.session.user.id;
            return data.session.access_token;
          }),
    [demo],
  );
  const [envelope, setEnvelope] = useState<CvEnvelope | null>(null);
  const [draft, setDraft] = useState<CvData | null>(null);
  const [sharing, setSharing] = useState<CvSharing>({
    cv: false,
    email: false,
    phone: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<StaticMemberCopyKey | "">("");
  const [busy, setBusy] = useState<string | null>("load");
  const [ended, setEnded] = useState(false);
  const [preview, setPreview] = useState<{
    url?: string;
    draft: CvData;
    sharing: CvSharing;
  } | null>(null);
  const previewUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const dirty = Boolean(
    draft &&
    envelope &&
    (JSON.stringify(draft) !== JSON.stringify(envelope.document.draft) ||
      JSON.stringify(sharing) !== JSON.stringify(envelope.document.sharing)),
  );

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    boundUserId.current = null;
    unsavedConfirmation.resolve(false);
    setBusy("load");
    setEnded(false);
    setEnvelope(null);
    setDraft(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setError(null);
    void repository
      .load()
      .then((result) => {
        if (!active || generation.current !== current) return;
        setEnvelope(result);
        setDraft(result.document.draft);
        setSharing(result.document.sharing);
        setBusy(null);
      })
      .catch((failure: unknown) => {
        if (!active || generation.current !== current) return;
        if (failure instanceof CvRequestError && failure.status === 401)
          navigate("/member/login", {
            replace: true,
            state: { from: "/member/profile" },
          });
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load your CV.",
        );
        setBusy(null);
      });
    const subscription =
      !demo &&
      supabase?.auth.onAuthStateChange((event, session) => {
        if (
          event === "SIGNED_OUT" ||
          (boundUserId.current &&
            session &&
            session.user.id !== boundUserId.current)
        ) {
          generation.current++;
          unsavedConfirmation.resolve(false);
          setEnded(true);
          setBusy(null);
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = null;
          setPreview(null);
        }
      });
    return () => {
      active = false;
      generation.current++;
      unsavedConfirmation.dispose();
      if (subscription) subscription.data.subscription.unsubscribe();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [demo, navigate, repository, unsavedConfirmation]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!busy && !confirmation && !preview && pendingFocus.current) {
      restoreOpener(pendingFocus.current);
    }
  }, [busy, confirmation, preview, restoreOpener]);

  function confirmUnsaved(action: UnsavedAction, opener?: HTMLElement) {
    confirmationOpener.current =
      opener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    return unsavedConfirmation.request(action);
  }

  async function run(
    action: CvMutation["action"],
    download = false,
    opener?: HTMLElement,
  ) {
    if (!draft || !envelope || busy || ended) return;
    const current = generation.current;
    if (action === "preview" && !download)
      previewOpener.current =
        opener ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
    setBusy(action);
    setError(null);
    setNotice("");
    try {
      const mutation = validateMutation({
        action,
        ...(action === "withdraw" ? {} : { draft, sharing }),
        expectedRevision: envelope.document.revision,
      });
      if (action === "preview") {
        clearPreview();
        if (demo)
          setPreview({
            draft: structuredClone(draft),
            sharing: { ...sharing },
          });
        else {
          const blob = await repository.preview(mutation);
          if (generation.current !== current) return;
          const url = URL.createObjectURL(blob);
          if (download) {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "Helix-CV.pdf";
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else {
            previewUrl.current = url;
            setPreview({
              url,
              draft: structuredClone(draft),
              sharing: { ...sharing },
            });
          }
        }
      } else {
        const result = await repository.mutate(mutation);
        if (generation.current !== current) return;
        setEnvelope(result);
        if (action !== "withdraw") {
          setDraft(result.document.draft);
          setSharing(result.document.sharing);
        }
        setNotice(
          action === "save"
            ? "Private draft saved. Your published version has not changed."
            : action === "publish"
              ? "Published. Sponsors with Talent Directory access can see this version with your sharing choices."
              : "Profile withdrawn from Talent Directory. Your private draft is kept.",
        );
      }
    } catch (failure) {
      if (generation.current !== current) return;
      if (failure instanceof CvRequestError && failure.status === 401) {
        setEnded(true);
        clearPreview();
      }
      setError(
        failure instanceof CvRequestError && failure.status === 409
          ? "Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again."
          : failure instanceof Error
            ? failure.message
            : "The request failed. Your input has been kept.",
      );
    } finally {
      if (generation.current === current) setBusy(null);
    }
  }
  async function reload(opener?: HTMLElement) {
    if (busy || ended) return;
    const current = generation.current;
    if (dirty && !(await confirmUnsaved("reload", opener))) return;
    if (generation.current !== current) return;
    setBusy("load");
    setError(null);
    try {
      const result = await repository.load();
      if (generation.current !== current) return;
      setEnvelope(result);
      setDraft(result.document.draft);
      setSharing(result.document.sharing);
      setNotice("Saved draft reloaded.");
    } catch (failure) {
      if (generation.current !== current) return;
      if (failure instanceof CvRequestError && failure.status === 401) {
        setEnded(true);
        clearPreview();
      }
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reload. Your input has been kept.",
      );
    } finally {
      if (generation.current === current) setBusy(null);
    }
  }
  async function logout(opener?: HTMLElement) {
    if (busy) return;
    const current = generation.current;
    if (dirty && !(await confirmUnsaved("logout", opener))) return;
    if (generation.current !== current) return;
    setBusy("logout");
    if (!demo) {
      const result = await supabase?.auth.signOut();
      if (result?.error) {
        setError("Could not sign out. Please try again.");
        setBusy(null);
        return;
      }
    }
    generation.current++;
    clearPreview();
    setDraft(null);
    setEnvelope(null);
    setEnded(true);
    navigate("/member/login", { replace: true });
  }
  const edit = (key: keyof CvData, value: CvData[keyof CvData]) =>
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );

  return (
    <main className="mcv-page portal-root" lang={locale}>
      <header className="mcv-header">
        <Link className="mcv-brand" to="/">
          <img src="/Vector.png" alt="Helix" className="mcv-logo" />
          <span>{t("Member portal")}</span>
        </Link>
        <div className="mcv-header-actions">
          <LanguageSwitcher locale={locale} onChange={setLocale} />
          <Button
            variant="outline"
            className="mcv-header-button"
            type="button"
            onClick={(event) => void logout(event.currentTarget)}
            disabled={Boolean(busy)}
          >
            {t("Sign out")}
          </Button>
        </div>
      </header>
      <div className="mcv-container">
        {demo && (
          <Alert className="mcv-demo-banner" role="status">
            <AlertTitle>{t("Fictional local demo")}</AlertTitle>
            <AlertDescription>
              {t(
                "This demo saves only in this browser. It does not verify Google, Supabase or sponsor access. PDF generation is replaced by an HTML preview.",
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="mcv-intro">
          <p className="mcv-eyebrow">{t("Your member profile")}</p>
          <h1>{t("Build your CV")}</h1>
          <p>
            {t(
              "Save privately, preview your CV and choose when to share it with sponsors.",
            )}
          </p>
        </div>
        {ended && (
          <Alert className="mcv-error" variant="destructive">
            <AlertDescription>
              {t("Your session has ended. Editing is locked.")}{" "}
              <Link to="/member/login" state={{ from: "/member/profile" }}>
                {t("Sign in again")}
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert className="mcv-error" variant="destructive">
            <AlertDescription>
              {localizeCvError(error, locale)}
            </AlertDescription>
            {!ended && (
              <Button
                variant="outline"
                type="button"
                onClick={(event) => void reload(event.currentTarget)}
                disabled={Boolean(busy)}
              >
                {t("Reload saved draft")}
              </Button>
            )}
          </Alert>
        )}
        {envelope &&
          !ended &&
          "cleanupPending" in envelope &&
          envelope.cleanupPending === true && (
            <Alert className="mcv-cleanup-warning" role="status">
              <AlertDescription>
                {t(
                  "Your latest CV operation succeeded, but deletion of a retired CV file is still pending. Your saved revision and directory visibility are up to date.",
                )}
              </AlertDescription>
              <Button
                variant="outline"
                type="button"
                disabled={Boolean(busy)}
                onClick={(event) => void reload(event.currentTarget)}
              >
                {t("Reload saved draft to retry cleanup")}
              </Button>
            </Alert>
          )}
        {notice && (
          <Alert className="mcv-notice" role="status">
            <AlertDescription>{t(notice)}</AlertDescription>
          </Alert>
        )}
        {ended ? null : !draft || !envelope ? (
          <Alert role="status" className="mcv-notice">
            <AlertDescription>
              {busy
                ? t("Loading your private CV…")
                : t("Your CV could not be opened.")}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mcv-status" aria-live="polite">
              <div>
                <Badge variant="outline" className="mcv-status-badge">
                  {dirty ? t("Unsaved changes") : t("Private draft saved")}
                </Badge>

                <p className="mcv-status-detail">
                  {t("Draft revision {revision}", {
                    revision: envelope.document.revision,
                  })}
                </p>
              </div>
              <div>
                <Badge variant="outline" className="mcv-status-badge">
                  {envelope.document.publishedRevision === null
                    ? t("Not published")
                    : t("Published in Talent Directory")}
                </Badge>

                <p className="mcv-status-detail">
                  {envelope.document.publishedRevision === null
                    ? t("Only you can access this draft.")
                    : t(
                        "Published version {revision}. Draft changes stay private until republished.",
                        { revision: envelope.document.publishedRevision },
                      )}
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run("save");
              }}
            >
              <div className="mcv-layout">
                <SectionNavigation
                  locale={locale}
                  statuses={getSectionStatuses(
                    draft,
                    sharing,
                    envelope.document,
                  )}
                />
                <fieldset
                  disabled={Boolean(busy) || ended}
                  className="mcv-form-fieldset"
                >
                  <div className="mcv-editor">
                    <Section
                      id="contact"
                      title={t("Contact and introduction")}
                      hint={t(
                        "Your Workspace login address stays linked to your account. Contact details below are shared only when you choose.",
                      )}
                    >
                      <p className="mcv-account">
                        {t("Signed in as {email}", {
                          email: envelope.identity.email,
                        })}
                      </p>
                      <div className="mcv-grid">
                        <Field
                          label={t("Full name")}
                          value={draft.fullName}
                          onChange={(value) => edit("fullName", value)}
                        />
                        <Field
                          label={t("Headline")}
                          value={draft.headline}
                          placeholder={t("Your field or role")}
                          onChange={(value) => edit("headline", value)}
                        />
                        <Field
                          label={t("Contact email")}
                          type="email"
                          value={draft.contactEmail}
                          onChange={(value) => edit("contactEmail", value)}
                        />
                        <Field
                          label={t("Phone")}
                          type="tel"
                          value={draft.phone}
                          maxLength={100}
                          onChange={(value) => edit("phone", value)}
                        />
                        <Field
                          label={t("City")}
                          value={draft.city}
                          onChange={(value) => edit("city", value)}
                        />
                        <Field
                          label={t("Field of study")}
                          value={draft.fieldOfStudy}
                          onChange={(value) => edit("fieldOfStudy", value)}
                        />
                        <Field
                          label={t("Graduation year")}
                          value={draft.graduationYear}
                          maxLength={4}
                          placeholder={t("2028")}
                          onChange={(value) => edit("graduationYear", value)}
                        />
                        <Field
                          label={t("Introduction")}
                          value={draft.summary}
                          multiline
                          onChange={(value) => edit("summary", value)}
                        />
                      </div>
                    </Section>
                    {definitions.map(({ key, title, singular, fields }) => (
                      <Section
                        key={key}
                        id={key}
                        title={t(title)}
                        hint={
                          key === "education"
                            ? t(
                                "Add at least one institution and degree before publishing.",
                              )
                            : undefined
                        }
                      >
                        {(draft[key] as Row[]).map((row, index) => (
                          <div className="mcv-entry" key={row.id}>
                            <div className="mcv-entry-title">
                              <h3>
                                {t(title)} {index + 1}
                              </h3>
                              <Button
                                variant="ghost"
                                type="button"
                                className="mcv-remove"
                                aria-label={t("Remove {entry} {number}", {
                                  entry: t(singular),
                                  number: index + 1,
                                })}
                                onClick={() =>
                                  edit(
                                    key,
                                    draft[key].filter(
                                      (entry) => entry.id !== row.id,
                                    ) as CvData[typeof key],
                                  )
                                }
                              >
                                {t("Remove")}
                              </Button>
                            </div>
                            <div className="mcv-grid">
                              {fields.map((field) => (
                                <Field
                                  {...field}
                                  key={field.key}
                                  label={t(field.label)}
                                  placeholder={
                                    field.placeholder
                                      ? t(field.placeholder)
                                      : undefined
                                  }
                                  value={row[field.key]}
                                  onChange={(value) =>
                                    edit(
                                      key,
                                      (draft[key] as Row[]).map((entry) =>
                                        entry.id === row.id
                                          ? { ...entry, [field.key]: value }
                                          : entry,
                                      ) as CvData[typeof key],
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          type="button"
                          disabled={draft[key].length >= 30}
                          onClick={() =>
                            edit(key, [
                              ...draft[key],
                              Object.fromEntries([
                                ["id", crypto.randomUUID()],
                                ...fields.map((field) => [field.key, ""]),
                              ]),
                            ] as CvData[typeof key])
                          }
                        >
                          {t("+ Add {entry}", { entry: t(singular) })}
                        </Button>
                      </Section>
                    ))}
                    <Section
                      id="skills"
                      title={t("Skills")}
                      hint={t("Enter one skill per line. Use up to 50 skills.")}
                    >
                      <Field
                        label={t("Your skills")}
                        value={draft.skills.join("\n")}
                        multiline
                        maxLength={5050}
                        placeholder={t("CAD\nPrototyping\nTeamwork")}
                        onChange={(value) => edit("skills", value.split("\n"))}
                      />
                    </Section>
                    <Section
                      id="sharing"
                      title={t("Share with sponsors")}
                      hint={t(
                        "These choices apply when you publish. Email and phone choices also apply inside the generated CV.",
                      )}
                    >
                      {(["cv", "email", "phone"] as const).map((key) => (
                        <div className="mcv-checkbox" key={key}>
                          <Checkbox
                            id={`${sharingId}-${key}`}
                            disabled={Boolean(busy) || ended}
                            checked={sharing[key]}
                            onCheckedChange={(checked) =>
                              setSharing((previous) => ({
                                ...previous,
                                [key]: checked === true,
                              }))
                            }
                          />
                          <Label htmlFor={`${sharingId}-${key}`}>
                            {key === "cv"
                              ? t("Share generated CV")
                              : key === "email"
                                ? t("Share contact email")
                                : t("Share phone number")}
                          </Label>
                        </div>
                      ))}
                      <p className="mcv-hint">
                        {t(
                          "A published profile is visible in Talent Directory even when CV download is off. Sponsors need an eligible agreement.",
                        )}
                      </p>
                    </Section>
                    <Section
                      id="publication"
                      title={t("Preview and publication")}
                    >
                      <p className="mcv-hint">
                        {t(
                          "Preview uses your current inputs and sharing choices, including unsaved changes.",
                        )}
                      </p>
                      <div className="mcv-actions">
                        <Button type="submit" className="mcv-primary">
                          {busy === "save"
                            ? t("Saving…")
                            : t("Save private draft")}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={(event) =>
                            void run("preview", false, event.currentTarget)
                          }
                        >
                          {busy === "preview"
                            ? t("Generating…")
                            : demo
                              ? t("Preview demo CV")
                              : t("Preview PDF")}
                        </Button>
                        {!demo && (
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => void run("preview", true)}
                          >
                            {t("Download PDF")}
                          </Button>
                        )}
                        <Button
                          variant="default"
                          type="button"
                          className="mcv-primary"
                          onClick={() => void run("publish")}
                        >
                          {busy === "publish"
                            ? t("Publishing…")
                            : envelope.document.publishedRevision === null
                              ? t("Publish to Talent Directory")
                              : t("Publish new version")}
                        </Button>
                        {envelope.document.publishedRevision !== null && (
                          <Button
                            variant="ghost"
                            type="button"
                            className="mcv-withdraw"
                            onClick={() => void run("withdraw")}
                          >
                            {t("Withdraw published profile")}
                          </Button>
                        )}
                      </div>
                      <p className="mcv-hint">
                        {t(
                          "Publication saves and shares this version. Later draft edits stay private. Withdrawal keeps your draft and prevents new access. Files already downloaded cannot be recalled.",
                        )}
                      </p>
                      {demo && (
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => {
                            setDraft(fictionalCv());
                            setNotice(
                              "Fictional example added. Save or publish to keep it.",
                            );
                          }}
                        >
                          {t("Fill fictional example")}
                        </Button>
                      )}
                    </Section>
                  </div>
                </fieldset>
              </div>
            </form>
          </>
        )}
      </div>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) clearPreview();
        }}
      >
        {preview && (
          <DialogContent
            className="portal-root mcv-dialog mcv-preview-panel"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              previewClose.current?.focus();
            }}
            lang={locale}
            showCloseButton={false}
            overlayClassName="mcv-dialog-overlay"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreOpener(previewOpener.current);
            }}
          >
            <DialogHeader className="mcv-preview-header">
              <div className="mcv-preview-title-row">
                <DialogTitle className="mcv-dialog-title">
                  {demo ? t("Demo CV preview") : t("Generated CV preview")}
                </DialogTitle>
                <div className="mcv-preview-controls">
                  <LanguageSwitcher locale={locale} onChange={setLocale} />
                  <DialogClose asChild>
                    <Button ref={previewClose} variant="outline" type="button">
                      {t("Close preview")}
                    </Button>
                  </DialogClose>
                </div>
              </div>
              <DialogDescription className="mcv-preview-caption">
                {t(
                  "This preview follows your current email and phone sharing choices.",
                )}
                {!sharing.cv &&
                  ` ${t("CV download is currently off for sponsors.")}`}
              </DialogDescription>
            </DialogHeader>
            {preview.url ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  className="mcv-preview-download"
                >
                  <a href={preview.url} download="Helix-CV.pdf">
                    {t("Download this PDF")}
                  </a>
                </Button>
                <iframe src={preview.url} title={t("Generated CV PDF")} />
              </>
            ) : (
              <DemoPreview
                data={preview.draft}
                sharing={preview.sharing}
                locale={locale}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) unsavedConfirmation.resolve(false);
        }}
      >
        <DialogContent
          className="portal-root mcv-dialog mcv-confirm-panel"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            confirmationCancel.current?.focus();
          }}
          lang={locale}
          showCloseButton={false}
          overlayClassName="mcv-dialog-overlay"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreOpener(confirmationOpener.current);
          }}
        >
          <DialogHeader className="mcv-confirm-header">
            <div className="mcv-preview-title-row">
              <DialogTitle className="mcv-dialog-title">
                {t("Unsaved changes")}
              </DialogTitle>
              <LanguageSwitcher locale={locale} onChange={setLocale} />
            </div>
            <DialogDescription>
              {confirmation === "reload"
                ? t(
                    "Reloading replaces your unsaved input with the saved draft. Continue?",
                  )
                : t("Your latest changes are not saved. Sign out anyway?")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mcv-confirm-actions">
            <DialogClose asChild>
              <Button ref={confirmationCancel} variant="outline" type="button">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => unsavedConfirmation.resolve(true)}
            >
              {confirmation === "reload"
                ? t("Reload saved draft")
                : t("Sign out")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
