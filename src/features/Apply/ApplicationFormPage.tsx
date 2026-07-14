import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { supabase } from "../../libs/lib/utils";
import { currentSeason } from "../../libs/lib/season";

gsap.registerPlugin(useGSAP);

type Position = {
  id: string;
  title: string;
  department: string;
};

// Draft list of NMBU study programs — adjust freely.
const STUDY_PROGRAMS = [
  "Mechanical Engineering & Product Development (Maskin- og produktutvikling)",
  "Applied Robotics (Anvendt robotikk)",
  "Data Science (Datavitenskap)",
  "Environmental Physics & Renewable Energy (Miljøfysikk og fornybar energi)",
  "Industrial Economics (Industriell økonomi)",
  "Structural Engineering & Architecture (Byggeteknikk og arkitektur)",
  "Water & Environmental Engineering (Vann- og miljøteknikk)",
  "Geomatics (Geomatikk)",
  "Business Administration (Økonomi og administrasjon)",
  "Renewable Energy (Fornybar energi)",
  "Chemistry & Biotechnology (Kjemi og bioteknologi)",
  "Biotechnology (Bioteknologi)",
];
const OTHER_PROGRAM = "Not listed / other";

const STUDY_YEARS = ["1st year", "2nd year", "3rd year", "4th year", "5th year"];

const MAX_MOTIVATION_CHARS = 250;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirrors the bucket's file_size_limit
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STEPS = [
  { key: "position", title: "Position", question: "Which position are you applying for?" },
  { key: "fullName", title: "Your name", question: "What is your full name?" },
  { key: "email", title: "Email", question: "What is your email address?" },
  { key: "phone", title: "Phone", question: "What is your phone number?" },
  { key: "studyProgram", title: "Study program", question: "Please choose your study program" },
  { key: "yearOfStudy", title: "Study year", question: "Please select your current year of study" },
  { key: "motivation", title: "Motivation", question: "Why do you want to join Helix?" },
  { key: "cv", title: "Your CV", question: "Upload your CV" },
  { key: "photo", title: "Photo", question: "Upload a photo of you" },
  { key: "interested", title: "Other departments", question: "Any other departments you would like to be considered for?" },
  { key: "consent", title: "Consent", question: "One last thing" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type SubmitStatus =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "duplicate" }
  | { state: "error"; message: string };

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(3,9,74,0.03)",
  border: "1.5px solid rgba(3,9,74,0.18)",
  borderRadius: "8px",
  padding: "12px 14px",
  fontSize: "15px",
  color: "#0C0C0C",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.18s ease",
};

const questionStyle: React.CSSProperties = {
  display: "block",
  fontSize: "clamp(20px, 2.4vw, 26px)",
  fontWeight: 500,
  color: "#03094A",
  letterSpacing: "-0.01em",
  lineHeight: 1.3,
  marginBottom: "6px",
};

const hintStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "rgba(3,9,74,0.45)",
  marginBottom: "20px",
};

const errorTextStyle: React.CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  color: "#dc2626",
};

const focusBlue = (e: React.FocusEvent<HTMLElement>) =>
  ((e.currentTarget as HTMLElement).style.borderColor = "#002EC4");
const blurGrey = (e: React.FocusEvent<HTMLElement>) =>
  ((e.currentTarget as HTMLElement).style.borderColor = "rgba(3,9,74,0.18)");

const selectChevron: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage:
    `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 4.5L6 8L10 4.5' stroke='%2303094A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: "38px",
  cursor: "pointer",
};

const stepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -48 }),
};

export default function ApplicationFormPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const [positions, setPositions] = useState<Position[]>([]);

  // Arriving from an Apply button pre-fills the position, so start past that step.
  const [step, setStep] = useState(() => (searchParams.get("position") ? 1 : 0));
  const [direction, setDirection] = useState(1);

  const [values, setValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    studyProgram: "",
    studyProgramOther: "",
    yearOfStudy: "",
    positionId: searchParams.get("position") ?? "",
    motivation: "",
    website: "", // honeypot — humans never see or fill this
  });
  const [interested, setInterested] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SubmitStatus>({ state: "idle" });

  useEffect(() => {
    fetch("/positions.json")
      .then((r) => r.json())
      .then((data: Position[]) => {
        setPositions(data.map(({ id, title, department }) => ({ id, title, department })));
        // A tampered/stale ?position= that matches nothing sends the user back
        // to the position step instead of carrying an invalid value along.
        const param = searchParams.get("position");
        if (param && !data.some((p) => p.id === param)) {
          setValues((prev) => ({ ...prev, positionId: "" }));
          setStep(0);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGSAP(
    () => {
      gsap.fromTo(".apply-eyebrow",
        { opacity: 0, y: -14 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", delay: 0.1, clearProps: "opacity,transform" },
      );
      gsap.fromTo(".apply-title",
        { opacity: 0, y: -22 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", delay: 0.22, clearProps: "opacity,transform" },
      );
      gsap.fromTo(".form-shell",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.55, ease: "power2.out", delay: 0.4, clearProps: "opacity,transform" },
      );
    },
    { scope: containerRef },
  );

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const toggleInterested = (id: string) =>
    setInterested((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const selectedPosition = positions.find((p) => p.id === values.positionId) ?? null;
  const departmentChoices = [...new Set(positions.map((p) => p.department))].filter(
    (d) => d !== "Open" && d !== selectedPosition?.department,
  );

  const validateStep = (key: StepKey): Record<string, string> => {
    const next: Record<string, string> = {};
    switch (key) {
      case "fullName":
        if (!values.fullName.trim()) next.fullName = "Please enter your full name.";
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
          next.email = "Please enter a valid email address.";
        break;
      case "phone":
        if (!/^\+?[\d\s()-]{8,}$/.test(values.phone.trim()))
          next.phone = "Please enter a valid phone number.";
        break;
      case "studyProgram":
        if (!values.studyProgram) next.studyProgram = "Please choose your study program.";
        if (values.studyProgram === OTHER_PROGRAM && !values.studyProgramOther.trim())
          next.studyProgramOther = "Please tell us your study program.";
        break;
      case "yearOfStudy":
        if (!values.yearOfStudy) next.yearOfStudy = "Please select your current year of study.";
        break;
      case "position":
        if (!positions.some((p) => p.id === values.positionId))
          next.positionId = "Please choose the position you are applying for.";
        break;
      case "interested":
        break; // optional
      case "motivation":
        if (!values.motivation.trim()) next.motivation = "Please tell us briefly about your motivation.";
        else if (values.motivation.length > MAX_MOTIVATION_CHARS)
          next.motivation = `Please keep your motivation under ${MAX_MOTIVATION_CHARS} characters.`;
        break;
      case "cv":
        if (!cvFile) next.cv = "Please upload your CV as a PDF.";
        else if (cvFile.type !== "application/pdf") next.cv = "Your CV must be a PDF file.";
        else if (cvFile.size > MAX_FILE_BYTES) next.cv = "Your CV must be smaller than 10 MB.";
        break;
      case "photo":
        if (photoFile) {
          if (!PHOTO_TYPES.includes(photoFile.type)) next.photo = "The photo must be a JPG, PNG or WebP image.";
          else if (photoFile.size > MAX_FILE_BYTES) next.photo = "The photo must be smaller than 10 MB.";
        }
        break;
      case "consent":
        if (!consent) next.consent = "We need your consent to store your application.";
        break;
    }
    return next;
  };

  const goNext = () => {
    const stepErrors = validateStep(STEPS[step].key);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    if (status.state === "duplicate" || status.state === "error") setStatus({ state: "idle" });
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submitApplication = async () => {
    if (values.website) {
      // Honeypot tripped — pretend everything went fine.
      setStatus({ state: "success" });
      return;
    }

    // Safety net: re-validate everything before sending.
    const allErrors = STEPS.reduce<Record<string, string>>(
      (acc, s) => ({ ...acc, ...validateStep(s.key) }),
      {},
    );
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) return;

    if (!supabase) {
      setStatus({ state: "error", message: "The application service isn't configured. Please try again later or contact us." });
      return;
    }

    setStatus({ state: "submitting" });

    try {
      const season = currentSeason();
      const applicationId = crypto.randomUUID();

      const cvPath = `${season}/${applicationId}/cv.pdf`;
      const { error: cvError } = await supabase.storage
        .from("applications")
        .upload(cvPath, cvFile!, { contentType: "application/pdf", upsert: false });
      if (cvError) throw cvError;

      let photoPath: string | null = null;
      if (photoFile) {
        const ext = photoFile.type === "image/png" ? "png" : photoFile.type === "image/webp" ? "webp" : "jpg";
        photoPath = `${season}/${applicationId}/photo.${ext}`;
        const { error: photoError } = await supabase.storage
          .from("applications")
          .upload(photoPath, photoFile, { contentType: photoFile.type, upsert: false });
        if (photoError) throw photoError;
      }

      const { error: insertError } = await supabase.from("applications").insert({
        id: applicationId,
        season,
        full_name: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        phone: values.phone.trim(),
        study_program: values.studyProgram,
        study_program_other: values.studyProgram === OTHER_PROGRAM ? values.studyProgramOther.trim() : null,
        year_of_study: Number(values.yearOfStudy),
        motivation: values.motivation.trim(),
        position_id: values.positionId,
        position_title: selectedPosition?.title ?? values.positionId,
        interested_departments: interested.filter((d) => d !== selectedPosition?.department),
        cv_path: cvPath,
        photo_path: photoPath,
        consent: true,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          setStatus({ state: "duplicate" });
          return;
        }
        throw insertError;
      }

      // Confirmation email is best-effort — the application is already in.
      void fetch("/api/apply-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, email: values.email.trim().toLowerCase() }),
      }).catch((error) => console.warn("Confirmation email request failed", error));

      setStatus({ state: "success" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Failed to submit application", error);
      setStatus({ state: "error", message: "Something went wrong while sending your application. Please try again in a moment." });
    }
  };

  const isLastStep = step === STEPS.length - 1;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.state === "submitting") return;
    if (isLastStep) void submitApplication();
    else goNext();
  };

  const currentStep = STEPS[step];

  return (
    <div ref={containerRef} style={{ backgroundColor: "#FDFDFD", minHeight: "100vh" }}>

      {/* Page header */}
      <div style={{ backgroundColor: "#FDFDFD" }} className="px-6 pb-12 pt-36">
        <div className="mx-auto" style={{ maxWidth: "680px" }}>
          <p className="mb-4 text-xs tracking-widest uppercase apply-eyebrow" style={{ color: "rgba(0,0,0,0.35)" }}>
            Join the team
          </p>
          <h1
            className="font-medium apply-title"
            style={{ fontSize: "clamp(22px, 2.5vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "#03094A" }}
          >
            {status.state === "success" ? "Application sent" : `Application for ${currentSeason()}, Helix NMBU`}
          </h1>
        </div>
      </div>

      <div className="px-6 pb-24 mx-auto" style={{ maxWidth: "680px" }}>
        <AnimatePresence mode="wait" initial={false}>
          {status.state === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  border: "1.5px solid #002EC4",
                  color: "#002EC4",
                  marginBottom: "24px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4.5 11.5L9 16L17.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ fontSize: "17px", color: "rgba(12,12,12,0.75)", lineHeight: 1.7, marginBottom: "12px" }}>
                Thank you for applying{selectedPosition ? ` for ${selectedPosition.title}` : ""}. We've received your
                application and will get back to you once the recruitment round closes.
              </p>
              <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.45)", lineHeight: 1.7, marginBottom: "32px" }}>
                You can submit one application per season — if anything changes, reach out via the contact page.
              </p>
              <Link
                to="/apply"
                style={{
                  display: "inline-block",
                  backgroundColor: "#03094A",
                  color: "#FDFDFD",
                  padding: "14px 28px",
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "6px",
                  transition: "background-color 0.18s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#002EC4")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#03094A")}
              >
                Back to open positions
              </Link>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              className="form-shell"
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Progress bar */}
              <div style={{ marginBottom: "48px" }}>
                <div className="flex items-baseline justify-between" style={{ marginBottom: "10px" }}>
                  <p className="text-xs tracking-widest uppercase" style={{ color: "rgba(3,9,74,0.4)" }}>
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <p className="text-xs tracking-widest uppercase" style={{ color: "#002EC4", fontWeight: 500 }}>
                    {currentStep.title}
                  </p>
                </div>
                <div
                  style={{
                    height: "3px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(3,9,74,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                    transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                    style={{ height: "100%", borderRadius: "999px", backgroundColor: "#002EC4" }}
                  />
                </div>
              </div>

              {/* Honeypot — hidden from humans, tempting for bots. Outside the
                  animated steps so it's always present in the DOM. */}
              <div style={{ position: "absolute", left: "-9999px", top: 0 }} aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={values.website}
                  onChange={(e) => setValue("website", e.target.value)}
                />
              </div>

              {/* Current step */}
              <div style={{ minHeight: "280px" }}>
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.div
                    key={currentStep.key}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  >
                    {currentStep.key === "fullName" && (
                      <>
                        <label htmlFor="fullName" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>As it appears on your student ID.</p>
                        <input
                          id="fullName"
                          type="text"
                          autoFocus
                          placeholder="Your full name"
                          value={values.fullName}
                          onChange={(e) => setValue("fullName", e.target.value)}
                          style={{ ...inputStyle, borderColor: errors.fullName ? "#dc2626" : undefined }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        />
                        {errors.fullName && <p style={errorTextStyle}>{errors.fullName}</p>}
                      </>
                    )}

                    {currentStep.key === "email" && (
                      <>
                        <label htmlFor="email" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>We'll use this to get back to you about your application.</p>
                        <input
                          id="email"
                          type="email"
                          autoFocus
                          placeholder="your.email@example.com"
                          value={values.email}
                          onChange={(e) => setValue("email", e.target.value)}
                          style={{ ...inputStyle, borderColor: errors.email ? "#dc2626" : undefined }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        />
                        {errors.email && <p style={errorTextStyle}>{errors.email}</p>}
                      </>
                    )}

                    {currentStep.key === "phone" && (
                      <>
                        <label htmlFor="phone" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>So we can reach you quickly about interviews.</p>
                        <input
                          id="phone"
                          type="tel"
                          autoFocus
                          placeholder="+47 123 45 678"
                          value={values.phone}
                          onChange={(e) => setValue("phone", e.target.value)}
                          style={{ ...inputStyle, borderColor: errors.phone ? "#dc2626" : undefined }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        />
                        {errors.phone && <p style={errorTextStyle}>{errors.phone}</p>}
                      </>
                    )}

                    {currentStep.key === "studyProgram" && (
                      <>
                        <label htmlFor="studyProgram" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>Pick the closest match — or "{OTHER_PROGRAM}" if yours is missing.</p>
                        <select
                          id="studyProgram"
                          autoFocus
                          value={values.studyProgram}
                          onChange={(e) => setValue("studyProgram", e.target.value)}
                          style={{
                            ...inputStyle,
                            ...selectChevron,
                            color: values.studyProgram ? "#0C0C0C" : "rgba(12,12,12,0.4)",
                            borderColor: errors.studyProgram ? "#dc2626" : undefined,
                          }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        >
                          <option value="" disabled>Choose your study program</option>
                          {STUDY_PROGRAMS.map((program) => (
                            <option key={program} value={program}>{program}</option>
                          ))}
                          <option value={OTHER_PROGRAM}>{OTHER_PROGRAM}</option>
                        </select>
                        {errors.studyProgram && <p style={errorTextStyle}>{errors.studyProgram}</p>}

                        <AnimatePresence initial={false}>
                          {values.studyProgram === OTHER_PROGRAM && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                              style={{ overflow: "hidden" }}
                            >
                              <div style={{ paddingTop: "16px" }}>
                                <label
                                  htmlFor="studyProgramOther"
                                  style={{
                                    display: "block",
                                    marginBottom: "6px",
                                    fontSize: "12px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    color: "rgba(3,9,74,0.5)",
                                    fontWeight: 500,
                                  }}
                                >
                                  Didn't find your study program? Please tell us here
                                </label>
                                <input
                                  id="studyProgramOther"
                                  type="text"
                                  placeholder="Your study program"
                                  value={values.studyProgramOther}
                                  onChange={(e) => setValue("studyProgramOther", e.target.value)}
                                  style={{ ...inputStyle, borderColor: errors.studyProgramOther ? "#dc2626" : undefined }}
                                  onFocus={focusBlue}
                                  onBlur={blurGrey}
                                />
                                {errors.studyProgramOther && <p style={errorTextStyle}>{errors.studyProgramOther}</p>}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}

                    {currentStep.key === "yearOfStudy" && (
                      <>
                        <label htmlFor="yearOfStudy" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>Count from the start of your degree — 5-year programs go all the way to 5th.</p>
                        <select
                          id="yearOfStudy"
                          autoFocus
                          value={values.yearOfStudy}
                          onChange={(e) => setValue("yearOfStudy", e.target.value)}
                          style={{
                            ...inputStyle,
                            ...selectChevron,
                            color: values.yearOfStudy ? "#0C0C0C" : "rgba(12,12,12,0.4)",
                            borderColor: errors.yearOfStudy ? "#dc2626" : undefined,
                          }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        >
                          <option value="" disabled>Select your year</option>
                          {STUDY_YEARS.map((label, i) => (
                            <option key={label} value={i + 1}>{label}</option>
                          ))}
                        </select>
                        {errors.yearOfStudy && <p style={errorTextStyle}>{errors.yearOfStudy}</p>}
                      </>
                    )}

                    {currentStep.key === "position" && (
                      <>
                        <label htmlFor="positionId" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>Picking a position takes you straight to the next step.</p>
                        <select
                          id="positionId"
                          autoFocus
                          value={values.positionId}
                          onChange={(e) => {
                            setValue("positionId", e.target.value);
                            if (e.target.value) {
                              setDirection(1);
                              setStep((s) => Math.min(s + 1, STEPS.length - 1));
                            }
                          }}
                          style={{
                            ...inputStyle,
                            ...selectChevron,
                            color: values.positionId ? "#0C0C0C" : "rgba(12,12,12,0.4)",
                            borderColor: errors.positionId ? "#dc2626" : undefined,
                          }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        >
                          <option value="" disabled>Choose a position</option>
                          {positions.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                        {errors.positionId && <p style={errorTextStyle}>{errors.positionId}</p>}
                      </>
                    )}

                    {currentStep.key === "interested" && (
                      <>
                        <p style={questionStyle}>{currentStep.question}</p>
                        <p style={hintStyle}>Optional — check any other departments and we'll consider you for those too.</p>
                        {departmentChoices.length > 0 ? (
                          <div className="flex flex-col" style={{ gap: "12px" }}>
                            {departmentChoices.map((dept) => {
                              const active = interested.includes(dept);
                              return (
                                <label
                                  key={dept}
                                  className="flex items-start gap-3"
                                  style={{ cursor: "pointer", userSelect: "none" }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: "18px",
                                      height: "18px",
                                      marginTop: "1px",
                                      flexShrink: 0,
                                      borderRadius: "5px",
                                      border: `1.5px solid ${active ? "#002EC4" : "rgba(3,9,74,0.3)"}`,
                                      backgroundColor: active ? "#002EC4" : "transparent",
                                      transition: "all 0.18s ease",
                                    }}
                                  >
                                    {active && (
                                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#FDFDFD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleInterested(dept)}
                                    style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                                  />
                                  <span style={{ fontSize: "15px", color: "#0C0C0C", lineHeight: 1.45 }}>
                                    {dept}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.4)" }}>
                            No other departments to choose from — just continue.
                          </p>
                        )}
                      </>
                    )}

                    {currentStep.key === "motivation" && (
                      <>
                        <label htmlFor="motivation" style={questionStyle}>{currentStep.question}</label>
                        <p style={hintStyle}>A couple of sentences is plenty — max {MAX_MOTIVATION_CHARS} characters.</p>
                        <textarea
                          id="motivation"
                          rows={4}
                          autoFocus
                          maxLength={MAX_MOTIVATION_CHARS}
                          placeholder="Tell us briefly what motivates you to apply"
                          value={values.motivation}
                          onChange={(e) => setValue("motivation", e.target.value)}
                          style={{
                            ...inputStyle,
                            resize: "vertical",
                            borderColor: errors.motivation ? "#dc2626" : undefined,
                          }}
                          onFocus={focusBlue}
                          onBlur={blurGrey}
                        />
                        <p
                          style={{
                            marginTop: "4px",
                            textAlign: "right",
                            fontSize: "12px",
                            color: values.motivation.length >= MAX_MOTIVATION_CHARS ? "#dc2626" : "rgba(3,9,74,0.4)",
                          }}
                        >
                          {values.motivation.length}/{MAX_MOTIVATION_CHARS}
                        </p>
                        {errors.motivation && <p style={errorTextStyle}>{errors.motivation}</p>}
                      </>
                    )}

                    {currentStep.key === "cv" && (
                      <>
                        <p style={questionStyle}>{currentStep.question}</p>
                        <p style={hintStyle}>PDF, max 10 MB.</p>
                        <FileDropField
                          accept="application/pdf"
                          hint="PDF, max 10 MB"
                          file={cvFile}
                          error={errors.cv}
                          onSelect={(file) => {
                            setCvFile(file);
                            setErrors((prev) => { const n = { ...prev }; delete n.cv; return n; });
                          }}
                        />
                      </>
                    )}

                    {currentStep.key === "photo" && (
                      <>
                        <p style={questionStyle}>{currentStep.question}</p>
                        <p style={hintStyle}>Optional — JPG, PNG or WebP, max 10 MB. It helps us put a face to your name.</p>
                        <FileDropField
                          accept="image/jpeg,image/png,image/webp"
                          hint="JPG, PNG or WebP, max 10 MB"
                          file={photoFile}
                          error={errors.photo}
                          onSelect={(file) => {
                            setPhotoFile(file);
                            setErrors((prev) => { const n = { ...prev }; delete n.photo; return n; });
                          }}
                        />
                      </>
                    )}

                    {currentStep.key === "consent" && (
                      <>
                        <p style={questionStyle}>{currentStep.question}</p>
                        <p style={hintStyle}>We handle your application data according to GDPR.</p>
                        <label
                          htmlFor="consent"
                          className="flex items-start gap-3"
                          style={{ cursor: "pointer", userSelect: "none" }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "20px",
                              height: "20px",
                              marginTop: "1px",
                              flexShrink: 0,
                              borderRadius: "5px",
                              border: `1.5px solid ${errors.consent ? "#dc2626" : consent ? "#002EC4" : "rgba(3,9,74,0.3)"}`,
                              backgroundColor: consent ? "#002EC4" : "transparent",
                              transition: "all 0.18s ease",
                            }}
                          >
                            {consent && (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#FDFDFD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <input
                            id="consent"
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => {
                              setConsent(e.target.checked);
                              setErrors((prev) => { const n = { ...prev }; delete n.consent; return n; });
                            }}
                            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                          />
                          <span style={{ fontSize: "14px", color: "rgba(12,12,12,0.7)", lineHeight: 1.6 }}>
                            I consent to Helix NMBU storing the information in this application, including my CV
                            {" "}and photo, for recruitment purposes during the current season.
                          </span>
                        </label>
                        {errors.consent && <p style={errorTextStyle}>{errors.consent}</p>}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div
                className="flex items-center justify-between gap-4"
                style={{ borderTop: "1.5px solid rgba(3,9,74,0.1)", paddingTop: "24px" }}
              >
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0 || status.state === "submitting"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "transparent",
                    color: step === 0 ? "rgba(3,9,74,0.25)" : "#03094A",
                    padding: "13px 22px",
                    fontSize: "13px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: `1.5px solid ${step === 0 ? "rgba(3,9,74,0.1)" : "rgba(3,9,74,0.25)"}`,
                    borderRadius: "6px",
                    cursor: step === 0 || status.state === "submitting" ? "not-allowed" : "pointer",
                    transition: "all 0.18s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (step > 0 && status.state !== "submitting") e.currentTarget.style.borderColor = "#002EC4";
                  }}
                  onMouseLeave={(e) => {
                    if (step > 0) e.currentTarget.style.borderColor = "rgba(3,9,74,0.25)";
                  }}
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={status.state === "submitting"}
                  style={{
                    backgroundColor: status.state === "submitting" ? "rgba(3,9,74,0.4)" : "#03094A",
                    color: "#FDFDFD",
                    padding: "14px 32px",
                    fontSize: "13px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "none",
                    borderRadius: "6px",
                    cursor: status.state === "submitting" ? "not-allowed" : "pointer",
                    transition: "background-color 0.18s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (status.state !== "submitting") e.currentTarget.style.backgroundColor = "#002EC4";
                  }}
                  onMouseLeave={(e) => {
                    if (status.state !== "submitting") e.currentTarget.style.backgroundColor = "#03094A";
                  }}
                >
                  {isLastStep
                    ? status.state === "submitting" ? "Sending application…" : "Send application"
                    : "Continue"}
                </button>
              </div>

              {status.state === "duplicate" && (
                <p style={{ ...errorTextStyle, marginTop: "16px" }}>
                  It looks like you've already submitted an application this season. If you'd like to change
                  something, please <Link to="/contact" style={{ color: "#002EC4" }}>get in touch</Link>.
                </p>
              )}
              {status.state === "error" && (
                <p style={{ ...errorTextStyle, marginTop: "16px" }}>{status.message}</p>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileDropField({
  hint,
  accept,
  file,
  error,
  onSelect,
}: {
  hint: string;
  accept: string;
  file: File | null;
  error?: string;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const borderColor = error ? "#dc2626" : dragging || file ? "#002EC4" : "rgba(3,9,74,0.25)";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        style={{
          border: `1.5px dashed ${borderColor}`,
          borderRadius: "8px",
          backgroundColor: dragging ? "rgba(0,46,196,0.04)" : "rgba(3,9,74,0.02)",
          padding: "32px 16px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.18s ease",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
        onBlur={(e) => (e.currentTarget.style.borderColor = borderColor)}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <span
              style={{
                fontSize: "14px",
                color: "#03094A",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "280px",
              }}
            >
              {file.name}
            </span>
            <span style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)", flexShrink: 0 }}>
              {formatBytes(file.size)}
            </span>
            <button
              type="button"
              aria-label="Remove file"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                flexShrink: 0,
                borderRadius: "50%",
                border: "1.5px solid rgba(3,9,74,0.25)",
                background: "none",
                cursor: "pointer",
                color: "#03094A",
              }}
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: "14px", color: "#03094A", fontWeight: 500, marginBottom: "2px" }}>
              Click or drop a file here
            </p>
            <p style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)" }}>{hint}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) onSelect(picked);
          }}
        />
      </div>
      {error && <p style={errorTextStyle}>{error}</p>}
    </div>
  );
}
