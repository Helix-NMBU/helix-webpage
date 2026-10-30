import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { memberLoadFailure, memberSessionToken, signOutMember, watchMemberSession, NEON_AUTH_SESSION_VERIFIER_PARAM } from "./session";
import { createDemoRepository, fictionalCv } from "./demo";
import {
  createCvRepository,
  CvRequestError,
} from "./repository";
import type { CvData, CvEducation, CvEnvelope, CvExperience, CvLanguage, CvLink, CvMutation, CvSharing, CvOutputLanguage } from "./types";
import { classifyCvRequestFailure, createPrivateAutosave, cvSnapshotKey } from "./autosave";
import { validateProfileMutation } from "./validate-profile-mutation";
import { Button } from "@libs/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { ProfileContentSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Switch } from "@libs/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import { IconArrowLeft, IconArrowRight, IconChevronDown, IconDots, IconEye, IconFileText, IconX } from "@tabler/icons-react";
import { ChoiceInput, PeriodInputs } from "./ProfileInputs";
import {
  employmentTypes,
  locationTypes,
  languageLevels,
} from "./profile-inputs";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { avatarFallbackStyle } from "@libs/components/avatar-colors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
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
import { ExperienceEditor } from "./ExperienceEditor";
import { moveProjectRoleToExperience } from "./experience";
import { hasRegisteredCv } from "./translations";
import { CvTranslationsProvider, FieldTranslations } from "./CvTranslations";
import {
  useMemberLocale,
  memberText,
  type StaticMemberCopyKey,
  type MemberLocale,
} from "./locale";
import { memberPaths } from "../MemberPlatform/routes";
import { useMemberAccount } from "../MemberPlatform/MemberAccountContext";
import { accountInitials } from "../MemberPlatform/account";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { CvTemplatePreview } from "./CvTemplatePreview";
import { EditProfileDialog } from "./EditProfileDialog";
import { useMemberNavigation, type MemberEditorActions } from "../MemberPlatform/MemberNavigation";
import { localizeCvError } from "./errors";
import "../Portal/portal.css";
import "./member-cv.css";

type Row = { id: string; [key: string]: string | undefined };
const cvSteps = [
  { id: "basics", label: "Contact details" },
  { id: "introduction", label: "About you" },
  { id: "education", label: "Education" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "languages", label: "Languages" },
  { id: "links", label: "Social links" },
  { id: "references", label: "References" },
] as const;
type CvStep = typeof cvSteps[number]["id"];

const addableSections = ["education", "languages", "links"] as const;
type AddableSection = typeof addableSections[number];
type EntryDraft = Partial<CvEducation & CvLanguage & CvLink>;

function isAddableSection(section: string): section is AddableSection {
  return section === "education" || section === "languages" || section === "links";
}

function hasEntryInput(section: AddableSection, entry: EntryDraft) {
  const values = section === "education"
    ? [entry.institution, entry.degree, entry.fieldOfStudy, entry.startDate, entry.endDate]
    : section === "languages" ? [entry.name, entry.level] : [entry.label, entry.url];
  return values.some((value) => value?.trim());
}

function CvLanguageSelect({ value, onChange, label, disabled }: { value: CvOutputLanguage; onChange: (language: CvOutputLanguage) => void; label: string; disabled?: boolean }) {
  return <Select value={value} onValueChange={(next) => onChange(next as CvOutputLanguage)} disabled={disabled}>
    <SelectTrigger aria-label={label} className="cv-control w-36"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="nb">Norwegian</SelectItem></SelectContent>
  </Select>;
}
type FieldDefinition = {
  key: string;
  label: StaticMemberCopyKey;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: StaticMemberCopyKey;
  choices?: readonly StaticMemberCopyKey[];
  date?: boolean;
};
const period: FieldDefinition[] = [
  {
    key: "startDate",
    label: "Start date",
    date: true,
    maxLength: 30,
    placeholder: "2024 or Sep 2024",
  },
  {
    key: "endDate",
    label: "End or expected end",
    date: true,
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
      { key: "fieldOfStudy", label: "Field of study" },
      ...period,
    ],
  },
  {
    key: "experience",
    title: "Experience",
    singular: "experience",
    fields: [
      { key: "title", label: "Job title" },
      { key: "organization", label: "Company or organisation" },
      {
        key: "employmentType",
        label: "Employment type",
        choices: employmentTypes,
      },
      { key: "location", label: "Location" },
      { key: "locationType", label: "Location type", choices: locationTypes },
      ...period,
      { key: "description", label: "Description", multiline: true },
    ],
  },
  {
    key: "projects",
    title: "Projects",
    singular: "project",
    fields: [
      { key: "name", label: "Project or department" },
      { key: "role", label: "Your role" },
      { key: "season", label: "Season", maxLength: 30 },
      ...period,
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
      {
        key: "level",
        label: "Proficiency",
        maxLength: 100,
        choices: languageLevels,
      },
    ],
  },
  {
    key: "links",
    title: "Social links",
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
  fullWidth = false,
  maxLength = 500,
  placeholder,
  type = "text",
  translationKey,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  fullWidth?: boolean;
  maxLength?: number;
  placeholder?: string;
  type?: string;
  translationKey?: string;
}) {
  const id = useId();
  return (
    <div className={multiline || fullWidth ? "mcv-field mcv-full" : "mcv-field"}>
      <div className="mcv-field-header flex items-center justify-between gap-2"><Label htmlFor={id}>{label}</Label><FieldTranslations path={translationKey} label={label} value={value} maxLength={multiline && maxLength === 500 ? 8000 : maxLength} /></div>
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
  open,
  onOpenChange,
  locale,
  expandable = true,
  showHeading = true,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: MemberLocale;
  expandable?: boolean;
  showHeading?: boolean;
}) {
  return (
    <Collapsible open={expandable ? open : true} onOpenChange={onOpenChange} asChild>
      <section
        className="mcv-section mcv-collapsible"
        id={`mcv-${id}`}
        aria-labelledby={showHeading ? `mcv-${id}-title` : undefined}
        aria-label={showHeading ? undefined : title}
      >
        <Card className="mcv-card">
          {showHeading ? <CardHeader className="mcv-card-header">
            <CardTitle>
              <h2 id={`mcv-${id}-title`} tabIndex={-1}>
                {expandable ? <CollapsibleTrigger asChild>
                  <Button
                    className="mcv-section-trigger"
                    variant="ghost"
                    type="button"
                    aria-label={memberText(
                      locale,
                      open ? "Collapse {section}" : "Expand {section}",
                      { section: title },
                    )}
                  >
                    <span>{title}</span>
                    <IconChevronDown
                      aria-hidden="true"
                      className={open ? "mcv-nav-chevron-open" : ""}
                    />
                  </Button>
                </CollapsibleTrigger> : title}
              </h2>
            </CardTitle>
          </CardHeader> : <h2 id={`mcv-${id}-title`} className="sr-only">{title}</h2>}
          <CollapsibleContent
            className="mcv-section-content"
            forceMount
            aria-hidden={expandable && !open}
          >
            <CardContent className="mcv-card-content">
              {hint && (
                <CardDescription className="mcv-hint mcv-section-hint">
                  {hint}
                </CardDescription>
              )}
              {children}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </section>
    </Collapsible>
  );
}

function RepeatableEntry({
  entryId,
  title,
  removeLabel,
  onRemove,
  children,
}: {
  entryId?: string;
  title: string;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mcv-entry" data-entry-id={entryId}>
      <div className="mcv-entry-title">
        <h3 className="mcv-entry-heading" tabIndex={-1}>{title}</h3>
        <Button variant="ghost" type="button" className="mcv-remove" aria-label={removeLabel} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="mcv-entry-content">
        {children}
      </div>
    </div>
  );
}

export default function MemberCV() {
  const { locale, t } = useMemberLocale();
  const account = useMemberAccount();
  const notify = useNotify();
  const paths = memberPaths();
  const platformNavigation = useMemberNavigation();
  const PageContainer = platformNavigation ? "div" : "main";
  const setEditor = platformNavigation?.setEditor;
  const editorActions = useRef<MemberEditorActions | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [setupOpen, setSetupOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<CvStep>("basics");
  const [pendingEntryIds, setPendingEntryIds] = useState<Partial<Record<AddableSection, string>>>({});
  const [newExperienceIds, setNewExperienceIds] = useState<Set<string>>(() => new Set());
  const activeEntrySection: AddableSection | null = isAddableSection(wizardStep) ? wizardStep : null;
  const isLastCvStep = wizardStep === cvSteps[cvSteps.length - 1].id;
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadLanguage, setDownloadLanguage] = useState<CvOutputLanguage>("nb");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement | null>(null);
  const deleteCancel = useRef<HTMLButtonElement | null>(null);
  const [outputLanguage, setOutputLanguage] = useState<CvOutputLanguage>("en");
  const demo = isLocalMemberMode();
  const sharingId = useId();
  function sectionProps(id: string) {
    return {
      id,
      locale,
      open: true,
      expandable: false,
      onOpenChange: () => {},
    };
  }
  const boundUserId = useRef<string | null>(null);
  const previewOpener = useRef<HTMLElement | null>(null);
  const previewClose = useRef<HTMLButtonElement | null>(null);
  const confirmationCancel = useRef<HTMLButtonElement | null>(null);
  const confirmationOpener = useRef<HTMLElement | null>(null);
  const setupExitCancel = useRef<HTMLButtonElement | null>(null);
  const setupExitOpener = useRef<HTMLElement | null>(null);
  const setupStart = useRef<{ draft: CvData; sharing: CvSharing } | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState<UnsavedAction | null>(null);
  const [setupExitOpen, setSetupExitOpen] = useState(false);
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
      const shown = (element: HTMLElement) => {
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return element.getClientRects().length > 0;
      };
      const trigger = [...document.querySelectorAll<HTMLElement>('[aria-label="Profile menu"]')].find(shown);
      (document.querySelector<HTMLElement>('[aria-labelledby="member-cv-title"] [data-slot="empty"] button') ?? trigger)?.focus();
    }
  }, []);
  const repository = useMemo(
    () =>
      demo
        ? createDemoRepository(localStorage, import.meta.env.DEV, isLocalMemberMode() ? fictionalCv() : undefined)
        : createCvRepository(() => memberSessionToken(boundUserId)),
    [demo],
  );
  const [envelope, setEnvelope] = useState<CvEnvelope | null>(null);
  const helixRole = envelope?.identity.helixRole === undefined ? account?.helixRole : envelope.identity.helixRole;
  const memberName = envelope?.identity.name || account?.name || "Helix member";
  const [draft, setDraft] = useState<CvData | null>(null);
  const [sharing, setSharing] = useState<CvSharing>({
    cv: false,
    email: false,
    phone: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [ended, setEnded] = useState(false);
  const [preview, setPreview] = useState<{
    url?: string;
    language: CvOutputLanguage;
    draft: CvData;
    sharing: CvSharing;
  } | null>(null);
  const previewUrl = useRef<string | null>(null);
  const previewGeneration = useRef(0);
  const generation = useRef(0);
  const autosave = useRef<ReturnType<typeof createPrivateAutosave> | null>(null);
  const acknowledgedInput = useRef<string | null>(null);
  const manualOperation = useRef(false);
  const latestInput = useRef({ draft, sharing, envelope });
  latestInput.current = { draft, sharing, envelope };
  const profileMounted = useRef(true);
  useEffect(() => {
    profileMounted.current = true;
    return () => { profileMounted.current = false; };
  }, []);
  const notificationActions = useRef({ reload: () => {} });
  notificationActions.current = {
    reload: () => { if (profileMounted.current) void reload(); else navigate(paths.profile); },
  };
  useEffect(() => {
    if (error && !ended) notify("Action could not be completed", localizeCvError(error, locale), {
      id: "cv-error", variant: "error", action: { label: "Reload draft", onClick: () => notificationActions.current.reload() },
    });
  }, [error, ended, locale, notify]);
  const endSession = useCallback(() => {
    setEnded(true);
    notify("Session ended", memberText(locale, "Your session has ended. Editing is locked."), {
      id: "cv-session", variant: "warning", href: paths.login, action: { label: memberText(locale, "Sign in again"), onClick: () => navigate(paths.login, { state: { from: paths.profile } }) },
    });
  }, [locale, notify, navigate, paths.login, paths.profile]);
  const cleanupPending = Boolean(envelope && "cleanupPending" in envelope && envelope.cleanupPending);
  useEffect(() => {
    if (cleanupPending && !ended) notify("File cleanup pending", memberText(locale, "Your latest CV operation succeeded, but deletion of a retired CV file is still pending. Your saved revision and directory visibility are up to date."), {
      id: "cv-cleanup", variant: "warning", action: { label: "Retry cleanup", onClick: () => notificationActions.current.reload() },
    });
  }, [cleanupPending, ended, locale, notify]);
  const editorLoaded = Boolean(draft);
  useEffect(() => {
    const section = location.hash.replace(/^#mcv-/, "");
    if (!editorLoaded || !["contact", "basics", "introduction", "education", "experience", "projects", "languages", "links", "references"].includes(section)) return;
    if (section !== "contact") {
      const current = latestInput.current;
      if (current.draft) setupStart.current = structuredClone({ draft: current.draft, sharing: current.sharing });
      autosave.current?.setBlocked(true);
      setDraft((previous) => previous && !hasRegisteredCv(previous) ? { ...previous, cvRegistered: false, cvLanguage: previous.cvLanguage ?? "nb" } : previous);
      setSetupOpen(true);
      setWizardStep(section as CvStep);
    }
    const frame = requestAnimationFrame(() => {
      const targetSection = section;
      document.getElementById(`mcv-${targetSection}-title`)?.focus({ preventScroll: true });
      document.getElementById(`mcv-${targetSection}`)?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [editorLoaded, location.hash, location.key]);

  useLayoutEffect(() => {
    setEditor?.({
      busy: Boolean(busy),
      navigate: (to, opener) => editorActions.current?.navigate(to, opener),
      signOut: (opener) => editorActions.current?.signOut(opener),
    });
  }, [busy, setEditor]);
  useEffect(() => () => setEditor?.(null), [setEditor]);
  const inputKey = draft ? cvSnapshotKey({ draft, sharing }) : null;
  const dirty = Boolean(
    draft &&
    envelope &&
    inputKey !== acknowledgedInput.current &&
    inputKey !== cvSnapshotKey({ draft: envelope.document.draft, sharing: envelope.document.sharing }),
  );

  function clearPreview() {
    previewGeneration.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    boundUserId.current = null;
    autosave.current?.dispose();
    autosave.current = null;
    acknowledgedInput.current = null;
    manualOperation.current = false;
    unsavedConfirmation.resolve(false);
    setBusy("load");
    setEnded(false);
    setEnvelope(null);
    setDraft(null);
    setPendingEntryIds({});
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
        autosave.current = createPrivateAutosave({
          initialEnvelope: result,
          mutate: (mutation) => repository.mutate(mutation),
          validate: (mutation) => validateProfileMutation(mutation, latestInput.current.envelope?.document.draft),
          onSaved: (saved, submitted) => {
            if (!active || generation.current !== current) return;
            acknowledgedInput.current = cvSnapshotKey(submitted);
            setEnvelope(saved);
            setError(null);
            notify("Draft saved", "Your private draft is up to date.", { id: "cv-autosave" });
          },
          onFailure: (failure, kind) => {
            if (!active || generation.current !== current) return;
            setError(failure instanceof CvRequestError && failure.status === 409
              ? "Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again."
              : failure instanceof Error ? failure.message : "The request failed. Your input has been kept.");
            if (kind === "session") {
              generation.current++;
              autosave.current?.dispose();
              unsavedConfirmation.resolve(false);
              endSession();
              setBusy(null);
              if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
              previewUrl.current = null;
              setPreview(null);
            }
          },
        });
        setBusy(null);
      })
      .catch((failure: unknown) => {
        if (!active || generation.current !== current) return;
        const outcome = memberLoadFailure(failure);
        if ("redirectTo" in outcome) {
          navigate(outcome.redirectTo, {
            replace: true,
            state: { from: paths.profile },
          });
          return;
        }
        setBusy(null);
        setError(outcome.message);
      });
    const stopWatching = !demo
      ? watchMemberSession(() => {
          generation.current++;
          autosave.current?.dispose();
          unsavedConfirmation.resolve(false);
          endSession();
          setBusy(null);
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = null;
          setPreview(null);
        }, undefined, boundUserId)
      : undefined;
    return () => {
      active = false;
      generation.current++;
      autosave.current?.dispose();
      autosave.current = null;
      unsavedConfirmation.dispose();
      stopWatching?.();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [demo, navigate, paths.profile, repository, unsavedConfirmation, notify, endSession]);
  useEffect(() => {
    const controller = autosave.current;
    if (!controller) return;
    controller.setBlocked(Boolean(busy) || ended || Boolean(confirmation) || setupOpen);
    const wasValidationPaused = controller.getState().paused === "validation";
    if (draft) controller.update(draft, sharing);
    if (wasValidationPaused && controller.getState().paused === null) setError(null);
  }, [draft, sharing, busy, ended, confirmation, setupOpen]);

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

  function finishManual(current: number) {
    if (generation.current !== current) return;
    manualOperation.current = false;
    autosave.current?.unlock();
    setBusy(null);
  }

  function hasUnsavedInput(saved: CvEnvelope | null) {
    const live = latestInput.current;
    if (!live.draft || !saved) return false;
    const key = cvSnapshotKey({ draft: live.draft, sharing: live.sharing });
    return key !== acknowledgedInput.current && key !== cvSnapshotKey({
      draft: saved.document.draft,
      sharing: saved.document.sharing,
    });
  }

  async function run(
    action: CvMutation["action"],
    download = false,
    opener?: HTMLElement,
    profileChanges?: Partial<CvData>,
    language: CvOutputLanguage = outputLanguage,
    sharingChanges?: Partial<CvSharing>,
  ) {
    if (!draft || !envelope || busy || ended || manualOperation.current) return;
    const current = generation.current;
    const controller = autosave.current;
    manualOperation.current = true;
    controller?.setBlocked(true);
    if (action === "preview" && !download && !preview)
      previewOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setBusy(action);
    let submittedRequest = false;
    try {
      const saved = controller ? await controller.lock() : envelope;
      if (generation.current !== current) return;
      const pause = controller?.getState().paused;
      if (action !== "preview" && pause === "conflict") {
        throw new Error("Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again.");
      }
      if (action !== "preview" && pause === "uncertain" && action !== "save") {
        throw new Error("The save result could not be confirmed. Reload your CV before retrying.");
      }
      const live = latestInput.current;
      if (!live.draft) return;
      const submitted = { draft: structuredClone({ ...live.draft, ...profileChanges }), sharing: { ...live.sharing, ...sharingChanges } };
      const mutation = validateProfileMutation({
        action,
        ...(["withdraw", "delete"].includes(action) ? {} : submitted),
        expectedRevision: saved.document.revision,
        ...(action === "preview" ? { language } : {}),
      }, saved.document.draft);
      setError(null);
      if (action === "preview") {
        const request = ++previewGeneration.current;
          submittedRequest = true;
          const blob = await repository.preview(mutation);
          if (generation.current !== current || request !== previewGeneration.current) return;
          const url = URL.createObjectURL(blob);
          if (download) {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `CV-${submitted.draft.fullName.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 80) || "Helix"}-${language}.pdf`;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else {
            const previousUrl = previewUrl.current;
            previewUrl.current = url;
            setPreview({ url, language, ...submitted });
            if (previousUrl) URL.revokeObjectURL(previousUrl);
          }
      } else {
        submittedRequest = true;
        const result = await repository.mutate(mutation);
        if (generation.current !== current) return;
        setEnvelope(result);
        if (action === "delete") {
          controller?.reset(result);
          clearPreview();
          setSetupOpen(false);
        } else controller?.acknowledge(result, action === "withdraw" ? undefined : submitted);
        if (action !== "withdraw") {
          acknowledgedInput.current = cvSnapshotKey(action === "delete" ? { draft: result.document.draft, sharing: result.document.sharing } : submitted);
          setDraft(result.document.draft);
          setSharing(result.document.sharing);
        }
        const message = action === "delete" ? "CV deleted. Your profile details have been kept." : action === "save"
          ? "Private draft saved. Your published version has not changed."
          : action === "publish"
            ? "Published. Sponsors with Talent Directory access can see this version with your sharing choices."
            : "Profile withdrawn from Talent Directory. Your private draft is kept.";
        const title = action === "delete" ? "CV deleted" : action === "save" ? "Changes saved" : action === "publish"
          ? `${submitted.sharing.cv ? "CV" : "Profile"} visible in Talent Directory` : "CV hidden from Talent Directory";
        notify(title, t(message));
      }
      return true;
    } catch (failure) {
      if (generation.current !== current) return;
      if (failure instanceof CvRequestError) {
        controller?.pause(classifyCvRequestFailure(failure));
      } else if (!controller?.getState().paused) {
        controller?.pause(submittedRequest ? "uncertain" : "validation");
      }
      if (failure instanceof CvRequestError && (failure.status === 401 || failure.status === 403)) {
        autosave.current?.dispose();
        endSession();
        clearPreview();
      }
      setError(failure instanceof CvRequestError && failure.status === 409
        ? "Another session saved a newer version. Your input has been kept. Copy any changes you need, then reload the saved draft before saving again."
        : failure instanceof Error ? failure.message : "The request failed. Your input has been kept.");
      return false;
    } finally {
      finishManual(current);
    }
  }

  async function reload(opener?: HTMLElement) {
    if (busy || ended || manualOperation.current) return;
    const current = generation.current;
    const controller = autosave.current;
    manualOperation.current = true;
    controller?.setBlocked(true);
    setBusy("load");
    try {
      const saved = controller ? await controller.lock() : envelope;
      if (generation.current !== current) return;
      if (hasUnsavedInput(saved) && !(await confirmUnsaved("reload", opener))) return;
      if (generation.current !== current) return;
      setError(null);
      const result = await (repository.refresh?.() ?? repository.load());
      if (generation.current !== current) return;
      controller?.reset(result);
      acknowledgedInput.current = null;
      setEnvelope(result);
      setDraft(result.document.draft);
      setSharing(result.document.sharing);
      setPendingEntryIds({});
      notify("Draft reloaded", t("Saved draft reloaded."));
    } catch (failure) {
      if (generation.current !== current) return;
      if (failure instanceof CvRequestError && (failure.status === 401 || failure.status === 403)) {
        controller?.dispose();
        endSession();
        clearPreview();
      }
      setError(failure instanceof Error ? failure.message : "Could not reload. Your input has been kept.");
    } finally {
      finishManual(current);
    }
  }

  async function leaveProfile(action: "home" | "logout", opener?: HTMLElement, destination = paths.home) {
    if (action === "home" && new URL(destination, window.location.origin).pathname === paths.profile) {
      const search = new URLSearchParams(location.search);
      search.delete(NEON_AUTH_SESSION_VERIFIER_PARAM);
      navigate({ pathname: paths.profile, search: search.toString(), hash: new URL(destination, window.location.origin).hash });
      return;
    }
    if (busy || manualOperation.current) return;
    const current = generation.current;
    const controller = autosave.current;
    manualOperation.current = true;
    controller?.setBlocked(true);
    setBusy(action);
    try {
      const saved = controller ? await controller.lock() : envelope;
      if (generation.current !== current) return;
      if (hasUnsavedInput(saved) && !(await confirmUnsaved(action, opener))) return;
      if (generation.current !== current) return;
      if ((!demo || isLocalMemberMode()) && action === "logout") await signOutMember();
      generation.current++;
      controller?.dispose();
      clearPreview();
      setDraft(null);
      setEnvelope(null);
      setEnded(true);
      navigate(action === "home" ? destination : paths.login, { replace: true });
    } catch (failure) {
      if (generation.current !== current) return;
      setError(failure instanceof Error ? failure.message : "Could not sign out. Please try again.");
    } finally {
      finishManual(current);
    }
  }
  editorActions.current = {
    busy: Boolean(busy),
    navigate: (to, opener) => { void leaveProfile("home", opener, to); },
    signOut: (opener) => { void leaveProfile("logout", opener); },
  };
  const edit = (key: keyof CvData, value: CvData[keyof CvData]) =>
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );

  function changeRowField(
    key: (typeof definitions)[number]["key"],
    rowId: string,
    fieldKey: string,
    value: string,
  ) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            [key]: previous[key].map((entry) =>
              entry.id === rowId ? { ...entry, [fieldKey]: value } : entry,
            ),
          }
        : previous,
    );
  }

  function addExperience(organization: string, beforeId?: string) {
    const role: CvExperience = {
      id: crypto.randomUUID(), organization, title: "", startDate: "", endDate: "", description: "",
    };
    setDraft((previous) => {
      if (!previous || previous.experience.length >= 30) return previous;
      const index = beforeId ? previous.experience.findIndex((entry) => entry.id === beforeId) : previous.experience.length;
      const insertAt = index < 0 ? previous.experience.length : index;
      return { ...previous, experience: [
        ...previous.experience.slice(0, insertAt), role, ...previous.experience.slice(insertAt),
      ] };
    });
    setNewExperienceIds((previous) => new Set(previous).add(role.id));
    setWizardStep("experience");
  }

  function cancelEntry(section: AddableSection) {
    const id = pendingEntryIds[section];
    if (!id) return;
    setDraft((previous) => previous ? { ...previous, [section]: previous[section].filter((entry) => entry.id !== id) } : previous);
    setPendingEntryIds((previous) => ({ ...previous, [section]: undefined }));
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#mcv-${section} [data-add-entry]`)?.focus());
  }

  function beginEntry(section: AddableSection) {
    if (!draft || pendingEntryIds[section] || busy || ended || draft[section].length >= 30) return;
    const id = crypto.randomUUID();
    const entries = {
      education: { id, institution: "", degree: "", fieldOfStudy: "", startDate: "", endDate: "", description: "" },
      languages: { id, name: "", level: "" },
      links: { id, label: "", url: "" },
    };
    setDraft((previous) => previous ? { ...previous, [section]: [...previous[section], entries[section]] } : previous);
    setPendingEntryIds((previous) => ({ ...previous, [section]: id }));
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`.mcv-entry-form[data-section="${section}"] input`)?.focus());
  }

  function addEntry(section: AddableSection) {
    const current = latestInput.current;
    if (!current.draft) return false;
    const entry = current.draft[section].find((item) => item.id === pendingEntryIds[section]);
    if (!entry || !hasEntryInput(section, entry) || busy || ended) return false;
    try {
      const baseline = current.envelope?.document.draft ?? current.draft;
      validateProfileMutation({ action: "save", draft: { ...baseline, [section]: [entry] }, sharing: current.sharing }, baseline);
      setPendingEntryIds((previous) => ({ ...previous, [section]: undefined }));
      setError(null);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.mcv-entry[data-entry-id="${entry.id}"] .mcv-entry-heading`)?.focus());
      return true;
    } catch (failure) {
      const title = section === "education" ? "Check education entry" : section === "languages" ? "Check language" : "Check social link";
      notify(title, failure instanceof Error ? localizeCvError(failure.message, locale) : "Could not add this entry. Your input has been kept.", { id: `${section}-validation`, variant: "error" });
      return false;
    }
  }

  function moveProjectRole(projectId: string) {
    const roleId = crypto.randomUUID();
    // Check the same transfer before scheduling a functional draft edit. Failures keep all input.
    try {
      const current = latestInput.current.draft;
      if (!current) return;
      moveProjectRoleToExperience(current, projectId, roleId);
      setDraft((previous) => previous ? moveProjectRoleToExperience(previous, projectId, roleId) : previous);
      setWizardStep("experience");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed. Your input has been kept.");
    }
  }

  function openCvSetup() {
    if (!draft || busy || ended) return;
    autosave.current?.setBlocked(true);
    setupStart.current = structuredClone({ draft, sharing });
    setPendingEntryIds({});
    setNewExperienceIds(new Set());
    setSetupExitOpen(false);
    if (!hasRegisteredCv(draft)) setDraft((previous) => previous ? { ...previous, cvRegistered: false, cvLanguage: previous.cvLanguage ?? "nb" } : previous);
    setWizardStep("basics");
    setSetupOpen(true);
  }
  function requestSetupExit(opener?: HTMLElement) {
    if (busy) return;
    setupExitOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSetupExitOpen(true);
  }
  function closeCvSetup() {
    setupStart.current = null;
    setSetupExitOpen(false);
    setSetupOpen(false);
    setPendingEntryIds({});
    setNewExperienceIds(new Set());
  }
  function abortCvSetup() {
    const initial = setupStart.current;
    if (initial) {
      setDraft(structuredClone(initial.draft));
      setSharing(structuredClone(initial.sharing));
      setError(null);
      notify("Changes discarded", t("Changes discarded."), { variant: "info" });
    }
    closeCvSetup();
  }
  function nextCvStep(offset: number) {
    const sections: readonly AddableSection[] = activeEntrySection ? [activeEntrySection] : [];
    if (offset > 0) for (const section of sections) {
      const id = pendingEntryIds[section];
      if (!id) continue;
      const entry = latestInput.current.draft?.[section].find((item) => item.id === id);
      if (entry && hasEntryInput(section, entry)) {
        if (!addEntry(section)) return;
      } else {
        setDraft((previous) => previous ? { ...previous, [section]: previous[section].filter((item) => item.id !== id) } : previous);
        setPendingEntryIds((previous) => ({ ...previous, [section]: undefined }));
      }
    }
    const index = cvSteps.findIndex((step) => step.id === wizardStep);
    setWizardStep(cvSteps[Math.max(0, Math.min(cvSteps.length - 1, index + offset))].id);
  }
  async function saveCvSetup(register: boolean) {
    const entries = draft ? Object.fromEntries(addableSections.map((section) => [section, draft[section].filter((entry) => entry.id !== pendingEntryIds[section] || hasEntryInput(section, entry))])) as Pick<CvData, AddableSection> : {};
    if (await run("save", false, undefined, { ...(register ? { cvRegistered: true } : {}), ...entries })) closeCvSetup();
  }

  return (
    <PageContainer className="mcv-page mcv-profile portal-root" lang={locale}>
      <div className="mcv-container">
        {!platformNavigation && <div className="mcv-account-actions">
          {!platformNavigation && paths.home !== paths.profile
            ? <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={(event) => void leaveProfile("home", event.currentTarget)}>{t("Member home")}</Button>
            : <span />}
          <div>
            {!platformNavigation && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={(event) => void leaveProfile("logout", event.currentTarget)}>{t("Sign out")}</Button>}
          </div>
        </div>}
        <div className="mcv-profile-heading">
          <h1>Profile</h1>
          <p>Manage your profile, CV and sponsor visibility.</p>
        </div>
        {busy === "load" && !draft ? <ProfileContentSkeleton /> : (account || envelope) && <Card className="mcv-profile-identity shadow-none" id="mcv-contact" aria-labelledby="mcv-contact-title">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className="text-xl" style={avatarFallbackStyle(account?.email || envelope?.identity.email || memberName)}>
                    {accountInitials(memberName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-1">
                  <p id="mcv-contact-title" tabIndex={-1} className="break-words text-lg font-medium">{memberName}</p>
                  {helixRole && <p className="break-words text-sm text-muted-foreground">{helixRole}</p>}
                  <p className="break-all text-sm text-muted-foreground">{account?.email || envelope?.identity.email}</p>
                  {draft?.phone && <p className="break-words text-sm text-muted-foreground">{draft.phone}</p>}
                </div>
              </div>
              {draft && <EditProfileDialog draft={draft} disabled={Boolean(busy) || ended}
                onSave={async (details) => Boolean(await run("save", false, undefined, details))} />}
            </div>
            <dl className="grid gap-5 border-t pt-5 text-sm sm:grid-cols-2">
              <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">Field of study</dt><dd className="break-words">{draft?.fieldOfStudy || "Not set"}</dd></div>
              <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">Graduation year</dt><dd>{draft?.graduationYear || "Not set"}</dd></div>
            </dl>
          </CardContent>
        </Card>}
        {draft && envelope && !ended && <section className="mt-8 space-y-4" aria-labelledby="member-cv-title">
          <h2 id="member-cv-title" className="text-xl font-medium">CV</h2>
          {hasRegisteredCv(draft) ? <Card className="gap-0 py-0 shadow-none"><CardContent className="flex flex-row flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 space-y-3">
              <p className="font-medium">CV {memberName}</p>
              <div className="flex items-center gap-2">
                <Switch id={`${sharingId}-directory`} className="cv-control data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-500" checked={envelope.document.cvVisible ?? envelope.document.publishedRevision !== null}
                  disabled={Boolean(busy)} onCheckedChange={(visible) => void run(visible ? "publish" : "withdraw", false, undefined, { cvRegistered: true }, "nb", visible ? { cv: true } : undefined)} />
                <Label htmlFor={`${sharingId}-directory`} className="text-xs font-normal text-muted-foreground">Visible in Talent Directory</Label>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="icon" className="cv-control size-8" aria-label="Preview CV" title="Preview CV" disabled={Boolean(busy)} onClick={(event) => void run("preview", false, event.currentTarget)}><IconEye aria-hidden="true" /></Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button ref={actionsTrigger} variant="outline" size="icon" className="cv-control size-8" aria-label="CV actions" title="CV actions" disabled={Boolean(busy)}><IconDots aria-hidden="true" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openCvSetup}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { setDownloadLanguage("nb"); setDownloadOpen(true); }}>Download</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => setDeleteOpen(true)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent></Card> : <Empty className="min-h-80 border border-solid bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconFileText aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No CV yet</EmptyTitle>
              <EmptyDescription>You haven't set up your CV yet.<br />Get started by creating your CV.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button className="cv-control" onClick={openCvSetup} disabled={Boolean(busy)}>Setup CV</Button></EmptyContent>
          </Empty>}
        </section>}

      </div>
      <Dialog open={downloadOpen} onOpenChange={(open) => { if (!busy) setDownloadOpen(open); }}>
        <DialogContent className="portal-root" showCloseButton={!busy} onCloseAutoFocus={(event) => { event.preventDefault(); restoreOpener(actionsTrigger.current); }}>
          <DialogHeader><DialogTitle>Download CV</DialogTitle><DialogDescription>Choose the language for your CV.</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label>Language</Label><CvLanguageSelect label="Download language" value={downloadLanguage} onChange={setDownloadLanguage} disabled={Boolean(busy) || ended} /></div>
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setDownloadOpen(false)}>Cancel</Button>
            <Button disabled={Boolean(busy) || ended} onClick={async () => { if (await run("preview", true, undefined, undefined, downloadLanguage)) setDownloadOpen(false); }}>{busy === "preview" ? "Downloading…" : "Download"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!busy) setDeleteOpen(open); }}>
        <DialogContent className="portal-root" showCloseButton={!busy}
          onOpenAutoFocus={(event) => { event.preventDefault(); deleteCancel.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); restoreOpener(actionsTrigger.current); }}>
          <DialogHeader><DialogTitle>Delete CV?</DialogTitle><DialogDescription>This will delete your CV and remove it from Talent Directory. Your profile details will be kept. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button ref={deleteCancel} variant="outline" disabled={Boolean(busy)} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={Boolean(busy) || ended} onClick={async () => { if (await run("delete")) setDeleteOpen(false); }}>{busy === "delete" ? "Deleting…" : "Delete CV"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={setupOpen} onOpenChange={(open) => {
        if (busy) return;
        if (open) setSetupOpen(true);
        else requestSetupExit();
      }}>
        {draft && envelope && <DialogContent className="portal-root mcv-wizard flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={false}
          onCloseAutoFocus={(event) => { event.preventDefault(); restoreOpener(actionsTrigger.current); }}>
          <CvTranslationsProvider draft={draft} disabled={Boolean(busy) || ended} onChange={(value) => edit("translations", value)}>
            <DialogHeader className="mcv-wizard-dialog-header p-5 pb-3">
              <div>
                <p className="mcv-wizard-step-count">Step {cvSteps.findIndex((step) => step.id === wizardStep) + 1} of {cvSteps.length}</p>
                <DialogTitle>{cvSteps.find((step) => step.id === wizardStep)?.label}</DialogTitle>
              </div>
              <div className="mcv-wizard-navigation">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mcv-wizard-nav-button"
                  aria-label="Previous step"
                  title="Previous step"
                  disabled={Boolean(busy) || ended || wizardStep === cvSteps[0].id}
                  onClick={() => nextCvStep(-1)}
                >
                  <IconArrowLeft aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mcv-wizard-nav-button"
                  aria-label="Next step"
                  title="Next step"
                  disabled={Boolean(busy) || ended || isLastCvStep}
                  onClick={() => nextCvStep(1)}
                >
                  <IconArrowRight aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mcv-wizard-nav-button"
                  aria-label="Close"
                  title="Close"
                  disabled={Boolean(busy)}
                  onClick={(event) => requestSetupExit(event.currentTarget)}
                >
                  <IconX aria-hidden="true" />
                </Button>
              </div>
            </DialogHeader>
            <nav aria-label="CV setup progress" className="mcv-wizard-progress px-5 pb-4">
              <div className="mcv-wizard-progress-bar" aria-hidden="true">
                {cvSteps.map((step, index) => {
                  const currentIndex = cvSteps.findIndex((item) => item.id === wizardStep);
                  return <span key={step.id} data-current={index === currentIndex} data-complete={index < currentIndex} />;
                })}
              </div>
            </nav>
            <div key={wizardStep} className="min-h-0 flex-1 overflow-y-auto p-5 pt-0">
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (activeEntrySection && pendingEntryIds[activeEntrySection]) addEntry(activeEntrySection);
                else if (isLastCvStep) void saveCvSetup(true);
                else nextCvStep(1);
              }}
            >
              <div className="mcv-layout">
                <fieldset
                  disabled={Boolean(busy) || ended}
                  className="mcv-form-fieldset"
                >
                  <div className="mcv-editor">
                    {wizardStep === "basics" && <Section {...sectionProps("basics")} title="Contact details" showHeading={false}>
                      <div className="mcv-grid">
                        <Field label={t("Contact email")} type="email" value={draft.contactEmail} onChange={(value) => edit("contactEmail", value)} />
                        <Field label={t("City")} translationKey="city" value={draft.city} onChange={(value) => edit("city", value)} />
                      </div>
                    </Section>}
                    {wizardStep === "introduction" && <Section {...sectionProps("introduction")} title={t("About you")} showHeading={false}>
                      <div className="mcv-grid">
                        <Field label={t("Introduction")} value={draft.summary} translationKey="summary" multiline onChange={(value) => edit("summary", value)} />
                      </div>
                    </Section>}
                    {definitions.filter(({ key }) => key === wizardStep).map(({ key, title, singular, fields }) => (
                      <Section
                        key={key}
                        {...sectionProps(key)}
                        title={t(title)}
                        showHeading={false}
                      >
                        {key === "experience" ? (
                          <ExperienceEditor rows={draft.experience} locale={locale} disabled={Boolean(busy) || ended}
                            newEntryIds={newExperienceIds}
                            onChange={(id, field, value) => changeRowField("experience", id, field, value)}
                            onRemove={(id) => setDraft((previous) => previous ? {
                              ...previous, experience: previous.experience.filter((entry) => entry.id !== id),
                            } : previous)}
                            onAdd={addExperience} />
                        ) : <>
                        {(draft[key] as Row[]).map((row, index) => {
                          const entryTitle = key === "education"
                            ? row.fieldOfStudy?.trim() || row.degree?.trim() || row.institution?.trim() || t("Education")
                            : key === "languages" ? row.name?.trim() || t("Language")
                              : key === "links" ? row.label?.trim() || row.url?.trim() || t("Social link")
                                : `${t(title)} ${index + 1}`;
                          const entryContent = <>
                            <div className="mcv-grid">
                              {fields.map((field) => {
                                if (field.date)
                                  return field.key === "startDate" ? (
                                    <PeriodInputs
                                      key="period"
                                      startDate={row.startDate ?? ""}
                                      endDate={row.endDate ?? ""}
                                      endLabel={key === "education" ? t("Expected end date") : undefined}
                                      locale={locale}
                                      disabled={Boolean(busy) || ended}
                                      ongoingLabel={
                                        key === "projects" ? t("This project is ongoing") : undefined
                                      }
                                      onChange={(dateKey, value) =>
                                        changeRowField(
                                          key,
                                          row.id,
                                          dateKey,
                                          value,
                                        )
                                      }
                                    />
                                  ) : null;
                                const change = (value: string) =>
                                  changeRowField(key, row.id, field.key, value);
                                return field.choices ? (
                                  <ChoiceInput
                                    key={field.key}
                                    label={t(field.label)}
                                    translationKey={field.key === "url" ? undefined : `${key}:${row.id}:${field.key}`}
                                    value={row[field.key] ?? ""}
                                    onChange={change}
                                    options={field.choices}
                                    locale={locale}
                                    disabled={Boolean(busy) || ended}
                                  />
                                ) : (
                                  <Field
                                    {...field}
                                    key={field.key}
                                    label={t(field.label)}
                                    fullWidth={key === "education" && field.key === "fieldOfStudy"}
                                    translationKey={field.key === "url" ? undefined : `${key}:${row.id}:${field.key}`}
                                    placeholder={
                                      field.placeholder
                                        ? t(field.placeholder)
                                        : undefined
                                    }
                                    value={row[field.key] ?? ""}
                                    onChange={change}
                                  />
                                );
                              })}
                            </div>
                            {key === "projects" && (
                              <Button variant="outline" type="button" className="mcv-project-transfer"
                                aria-label={t("Move {project} role to Experience", { project: row.name || `${t("Projects")} ${index + 1}` })}
                                onClick={() => moveProjectRole(row.id)}>
                                {t("Move role to Experience")}
                              </Button>
                            )}
                          </>;
                          if (isAddableSection(key) && row.id === pendingEntryIds[key]) return (
                            <div key={row.id} className="mcv-entry-form" data-section={key} role="group" aria-label={key === "education" ? "Education entry" : key === "languages" ? "Language entry" : "Social link entry"}>
                              {entryContent}
                              <div className="mt-4 flex justify-end gap-2">
                                {key === "education" && <Button type="button" variant="outline" onClick={() => cancelEntry(key)}>{t("Cancel")}</Button>}
                                <Button type="button" disabled={!hasEntryInput(key, row) || Boolean(busy) || ended} onClick={() => addEntry(key)}>{t("Add")}</Button>
                              </div>
                            </div>
                          );
                          return <RepeatableEntry
                            key={row.id}
                            entryId={row.id}
                            title={entryTitle}
                            removeLabel={key === "education" ? t("Remove {entry}", { entry: entryTitle }) : t("Remove {entry} {number}", { entry: t(singular), number: index + 1 })}
                            onRemove={() => edit(key, draft[key].filter((entry) => entry.id !== row.id) as CvData[typeof key])}
                          >
                            {entryContent}
                          </RepeatableEntry>;
                        })}
                        {(!isAddableSection(key) || !pendingEntryIds[key]) && <Button
                          variant="outline"
                          type="button"
                          data-add-entry=""
                          disabled={draft[key].length >= 30}
                          onClick={() => isAddableSection(key) ? beginEntry(key) :
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
                        </Button>}
                        </>}
                      </Section>
                    ))}
                    {wizardStep === "references" && <Section {...sectionProps("references")} title={t("References")} showHeading={false}>
                      <Field label={t("References (optional)")} value={draft.references ?? ""} translationKey="references" multiline maxLength={2000} placeholder={t("Provided on request")} onChange={(value) => edit("references", value)} />
                    </Section>}
                  </div>
                </fieldset>
              </div>
            </form>
            </div>
            <DialogFooter className="flex-row flex-wrap items-center justify-end border-t p-4">
              <Button type="button" disabled={Boolean(busy) || ended} onClick={() => isLastCvStep ? void saveCvSetup(true) : nextCvStep(1)}>{busy === "save" ? t("Saving draft…") : isLastCvStep ? t("Finish") : t("Next")}</Button>
            </DialogFooter>
          </CvTranslationsProvider>
        </DialogContent>}
      </Dialog>
      <Dialog
        open={setupExitOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setSetupExitOpen(false);
        }}
      >
        <DialogContent
          className="portal-root sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            setupExitCancel.current?.focus();
          }}
          lang={locale}
          showCloseButton={false}
          overlayClassName="mcv-dialog-overlay"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreOpener(setupExitOpener.current);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Save your progress?")}</DialogTitle>
            <DialogDescription>
              {t("Your changes stay private until you publish. Save them as a draft to continue later, or discard changes made during this setup.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <DialogClose asChild>
              <Button ref={setupExitCancel} variant="ghost" type="button" disabled={Boolean(busy)}>
                {t("Keep editing")}
              </Button>
            </DialogClose>
            <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={Boolean(busy)} onClick={abortCvSetup}>
              {t("Discard changes")}
            </Button>
            <Button type="button" disabled={Boolean(busy) || ended} onClick={() => void saveCvSetup(false)}>
              {busy === "save" ? t("Saving draft…") : t("Save as draft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                  {t("Generated CV preview")}
                </DialogTitle>
                <div className="mcv-preview-controls">
                  <CvLanguageSelect label="Preview language" value={preview.language} disabled={Boolean(busy)} onChange={(language) => { setOutputLanguage(language); void run("preview", false, undefined, undefined, language); }} />
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
            {preview.url && <>
              <Button asChild variant="outline" className="mcv-preview-download"><a href={preview.url} download={`Helix-CV-${preview.language}.pdf`}>{t("Download this PDF")}</a></Button>
              <CvTemplatePreview data={preview.draft} sharing={preview.sharing} locale={preview.language} />
            </>}
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
            </div>
            <DialogDescription>
              {confirmation === "reload"
                ? t(
                    "Reloading replaces your unsaved input with the saved draft. Continue?",
                  )
                : confirmation === "home"
                  ? t("Your latest changes are not saved. Leave this page anyway?")
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
                : confirmation === "home" ? t("Member home") : t("Sign out")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
