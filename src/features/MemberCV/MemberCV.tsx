import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import "./member-cv.css";

type Row = { id: string; [key: string]: string };
type FieldDefinition = {
  key: string;
  label: string;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
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
  title: string;
  singular: string;
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
  return (
    <label className={multiline ? "mcv-field mcv-full" : "mcv-field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          maxLength={maxLength === 500 ? 8000 : maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mcv-card">
      <h2>{title}</h2>
      {hint && <p className="mcv-hint">{hint}</p>}
      {children}
    </section>
  );
}

function DemoPreview({ data, sharing }: { data: CvData; sharing: CvSharing }) {
  const cv = sharedCvData(data, sharing);
  return (
    <article className="mcv-demo-document">
      <p className="mcv-demo-label">Fictional demo · HTML preview</p>
      <h1>{cv.fullName || "Your name"}</h1>
      {cv.headline && <p>{cv.headline}</p>}
      <p>{[cv.city, cv.contactEmail, cv.phone].filter(Boolean).join(" · ")}</p>
      {cv.summary && <p className="mcv-preserve">{cv.summary}</p>}
      {definitions.map(
        ({ key, title, fields }) =>
          cv[key].length > 0 && (
            <section key={key}>
              <h2>{title}</h2>
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
          <h2>Skills</h2>
          <p>{cv.skills.join(", ")}</p>
        </section>
      )}
    </article>
  );
}

export default function MemberCV() {
  const location = useLocation();
  const navigate = useNavigate();
  const demo =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("demo") === "1";
  const boundUserId = useRef<string | null>(null);
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
  const [notice, setNotice] = useState("");
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
      if (subscription) subscription.data.subscription.unsubscribe();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [demo, navigate, repository]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(action: CvMutation["action"], download = false) {
    if (!draft || !envelope || busy || ended) return;
    const current = generation.current;
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
  async function reload() {
    if (
      dirty &&
      !window.confirm(
        "Reloading replaces your unsaved input with the saved draft. Continue?",
      )
    )
      return;
    const current = generation.current;
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
  async function logout() {
    if (
      dirty &&
      !window.confirm("Your latest changes are not saved. Sign out anyway?")
    )
      return;
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
    <main className="mcv-page">
      <header className="mcv-header">
        <Link className="mcv-brand" to="/">
          HELIX <span>Member portal</span>
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={Boolean(busy)}
        >
          Sign out
        </button>
      </header>
      <div className="mcv-container">
        {demo && (
          <div className="mcv-demo-banner">
            <strong>Fictional local demo</strong>
            <p>
              This demo saves only in this browser. It does not verify Google,
              Supabase or sponsor access. PDF generation is replaced by an HTML
              preview.
            </p>
          </div>
        )}
        <div className="mcv-intro">
          <p className="mcv-eyebrow">Your member profile</p>
          <h1>Build your CV</h1>
          <p>
            Save privately, preview your CV and choose when to share it with
            sponsors.
          </p>
        </div>
        {ended && (
          <div className="mcv-error" role="alert">
            Your session has ended. Editing is locked.{" "}
            <Link to="/member/login" state={{ from: "/member/profile" }}>
              Sign in again
            </Link>
            .
          </div>
        )}
        {error && (
          <div className="mcv-error" role="alert">
            {error}
            {!ended && (
              <button
                type="button"
                onClick={() => void reload()}
                disabled={Boolean(busy)}
              >
                Reload saved draft
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className="mcv-notice" role="status">
            {notice}
          </div>
        )}
        {ended ? null : !draft || !envelope ? (
          <p role="status">
            {busy ? "Loading your private CV…" : "Your CV could not be opened."}
          </p>
        ) : (
          <>
            <div className="mcv-status" aria-live="polite">
              <span>
                <strong>
                  {dirty ? "Unsaved changes" : "Private draft saved"}
                </strong>
                <br />
                Draft revision {envelope.document.revision}
              </span>
              <span>
                <strong>
                  {envelope.document.publishedRevision === null
                    ? "Not published"
                    : "Published in Talent Directory"}
                </strong>
                <br />
                {envelope.document.publishedRevision === null
                  ? "Only you can access this draft."
                  : `Published version ${envelope.document.publishedRevision}. Draft changes stay private until republished.`}
              </span>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run("save");
              }}
            >
              <fieldset
                disabled={Boolean(busy) || ended}
                className="mcv-form-fieldset"
              >
                <div className="mcv-layout">
                  <div className="mcv-editor">
                    <Section
                      title="Contact and introduction"
                      hint="Your Workspace login address stays linked to your account. Contact details below are shared only when you choose."
                    >
                      <p className="mcv-account">
                        Signed in as {envelope.identity.email}
                      </p>
                      <div className="mcv-grid">
                        <Field
                          label="Full name"
                          value={draft.fullName}
                          onChange={(value) => edit("fullName", value)}
                        />
                        <Field
                          label="Headline"
                          value={draft.headline}
                          placeholder="Your field or role"
                          onChange={(value) => edit("headline", value)}
                        />
                        <Field
                          label="Contact email"
                          type="email"
                          value={draft.contactEmail}
                          onChange={(value) => edit("contactEmail", value)}
                        />
                        <Field
                          label="Phone"
                          type="tel"
                          value={draft.phone}
                          maxLength={100}
                          onChange={(value) => edit("phone", value)}
                        />
                        <Field
                          label="City"
                          value={draft.city}
                          onChange={(value) => edit("city", value)}
                        />
                        <Field
                          label="Field of study"
                          value={draft.fieldOfStudy}
                          onChange={(value) => edit("fieldOfStudy", value)}
                        />
                        <Field
                          label="Graduation year"
                          value={draft.graduationYear}
                          maxLength={4}
                          placeholder="2028"
                          onChange={(value) => edit("graduationYear", value)}
                        />
                        <Field
                          label="Introduction"
                          value={draft.summary}
                          multiline
                          onChange={(value) => edit("summary", value)}
                        />
                      </div>
                    </Section>
                    {definitions.map(({ key, title, singular, fields }) => (
                      <Section
                        key={key}
                        title={title}
                        hint={
                          key === "education"
                            ? "Add at least one institution and degree before publishing."
                            : undefined
                        }
                      >
                        {(draft[key] as Row[]).map((row, index) => (
                          <div className="mcv-entry" key={row.id}>
                            <div className="mcv-entry-title">
                              <h3>
                                {title} {index + 1}
                              </h3>
                              <button
                                type="button"
                                className="mcv-remove"
                                aria-label={`Remove ${singular} ${index + 1}`}
                                onClick={() =>
                                  edit(
                                    key,
                                    draft[key].filter(
                                      (entry) => entry.id !== row.id,
                                    ) as CvData[typeof key],
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                            <div className="mcv-grid">
                              {fields.map((field) => (
                                <Field
                                  {...field}
                                  key={field.key}
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
                        <button
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
                          + Add {singular}
                        </button>
                      </Section>
                    ))}
                    <Section
                      title="Skills"
                      hint="Enter one skill per line. Use up to 50 skills."
                    >
                      <Field
                        label="Your skills"
                        value={draft.skills.join("\n")}
                        multiline
                        maxLength={5050}
                        placeholder={"CAD\nPrototyping\nTeamwork"}
                        onChange={(value) => edit("skills", value.split("\n"))}
                      />
                    </Section>
                  </div>
                  <aside className="mcv-sidebar">
                    <Section
                      title="Share with sponsors"
                      hint="These choices apply when you publish. Email and phone choices also apply inside the generated CV."
                    >
                      {(["cv", "email", "phone"] as const).map((key) => (
                        <label className="mcv-checkbox" key={key}>
                          <input
                            type="checkbox"
                            checked={sharing[key]}
                            onChange={(event) =>
                              setSharing((previous) => ({
                                ...previous,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            {key === "cv"
                              ? "Share generated CV"
                              : key === "email"
                                ? "Share contact email"
                                : "Share phone number"}
                          </span>
                        </label>
                      ))}
                      <p className="mcv-hint">
                        A published profile is visible in Talent Directory even
                        when CV download is off. Sponsors need an eligible
                        agreement.
                      </p>
                    </Section>
                    <Section title="Preview and publication">
                      <p className="mcv-hint">
                        Preview uses your current inputs and sharing choices,
                        including unsaved changes.
                      </p>
                      <div className="mcv-actions">
                        <button type="submit" className="mcv-primary">
                          {busy === "save" ? "Saving…" : "Save private draft"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void run("preview")}
                        >
                          {busy === "preview"
                            ? "Generating…"
                            : demo
                              ? "Preview demo CV"
                              : "Preview PDF"}
                        </button>
                        {!demo && (
                          <button
                            type="button"
                            onClick={() => void run("preview", true)}
                          >
                            Download PDF
                          </button>
                        )}
                        <button
                          type="button"
                          className="mcv-primary"
                          onClick={() => void run("publish")}
                        >
                          {busy === "publish"
                            ? "Publishing…"
                            : envelope.document.publishedRevision === null
                              ? "Publish to Talent Directory"
                              : "Publish new version"}
                        </button>
                        {envelope.document.publishedRevision !== null && (
                          <button
                            type="button"
                            className="mcv-withdraw"
                            onClick={() => void run("withdraw")}
                          >
                            Withdraw published profile
                          </button>
                        )}
                      </div>
                      <p className="mcv-hint">
                        Publication saves and shares this version. Later draft
                        edits stay private. Withdrawal keeps your draft and
                        prevents new access. Files already downloaded cannot be
                        recalled.
                      </p>
                      {demo && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(fictionalCv());
                            setNotice(
                              "Fictional example added. Save or publish to keep it.",
                            );
                          }}
                        >
                          Fill fictional example
                        </button>
                      )}
                    </Section>
                  </aside>
                </div>
              </fieldset>
            </form>
          </>
        )}
      </div>
      {preview && (
        <div
          className="mcv-modal"
          role="dialog"
          aria-modal="true"
          aria-label="CV preview"
          onKeyDown={(event) => {
            if (event.key === "Escape") clearPreview();
            if (event.key === "Tab") {
              const controls =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button, a[href], iframe",
                );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="mcv-preview-panel">
            <header>
              <h2>{demo ? "Demo CV preview" : "Generated CV preview"}</h2>
              <button autoFocus type="button" onClick={clearPreview}>
                Close preview
              </button>
            </header>
            <p className="mcv-preview-caption">
              This preview follows your current email and phone sharing choices.
              {!sharing.cv && " CV download is currently off for sponsors."}
            </p>
            {preview.url ? (
              <>
                <a href={preview.url} download="Helix-CV.pdf">
                  Download this PDF
                </a>
                <iframe src={preview.url} title="Generated CV PDF" />
              </>
            ) : (
              <DemoPreview data={preview.draft} sharing={preview.sharing} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
