import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../libs/lib/utils";
import { currentSeason } from "../../libs/lib/season";

type ApplicationRow = {
  id: string;
  created_at: string;
  season: string;
  full_name: string;
  email: string;
  phone: string;
  study_program: string;
  study_program_other: string | null;
  year_of_study: number;
  motivation: string;
  position_id: string;
  position_title: string;
  interested_departments: string[];
  cv_path: string;
  photo_path: string | null;
};

type AuthState = "loading" | "unauthed" | "denied" | "ok";
type SignedUrls = { cv?: string; photo?: string };

const ALL_SEASONS = "All seasons";

const eyebrowStyle: React.CSSProperties = {
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "rgba(3,9,74,0.4)",
};

const tagStyle: React.CSSProperties = {
  backgroundColor: "#002EC4",
  color: "#FDFDFD",
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "3px 10px",
  borderRadius: "999px",
  whiteSpace: "nowrap",
  display: "inline-block",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecruitmentPortal() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = useState<string>(currentSeason());
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, SignedUrls>>({});
  const [rejectTarget, setRejectTarget] = useState<ApplicationRow | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Auth guard: needs a Supabase session AND a spot on the recruiter allowlist.
  useEffect(() => {
    (async () => {
      if (!supabase) {
        setAuthState("unauthed");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setAuthState("unauthed");
        return;
      }
      const { data: isRecruiter, error } = await supabase.rpc("is_recruiter");
      setAuthState(!error && isRecruiter ? "ok" : "denied");
    })();
  }, []);

  useEffect(() => {
    if (authState !== "ok" || !supabase) return;
    (async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id,created_at,season,full_name,email,phone,study_program,study_program_other,year_of_study,motivation,position_id,position_title,interested_departments,cv_path,photo_path",
        )
        .order("created_at", { ascending: false });
      if (error) {
        setLoadError(`Could not load applications: ${error.message}`);
        return;
      }
      setApplications((data ?? []) as ApplicationRow[]);
    })();
  }, [authState]);

  const seasons = useMemo(() => {
    const found = [...new Set(applications.map((a) => a.season))].sort().reverse();
    const current = currentSeason();
    return found.includes(current) ? found : [current, ...found];
  }, [applications]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (seasonFilter !== ALL_SEASONS && a.season !== seasonFilter) return false;
      if (!q) return true;
      return [a.full_name, a.email, a.position_title, a.study_program, a.study_program_other ?? ""]
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [applications, seasonFilter, search]);

  const toggleOpen = async (app: ApplicationRow) => {
    const next = openId === app.id ? null : app.id;
    setOpenId(next);
    if (!next || fileUrls[app.id] || !supabase) return;

    // Fetch signed URLs lazily, once per application.
    const urls: SignedUrls = {};
    const { data: cvData } = await supabase.storage
      .from("applications")
      .createSignedUrl(app.cv_path, 60 * 60);
    if (cvData?.signedUrl) urls.cv = cvData.signedUrl;
    if (app.photo_path) {
      const { data: photoData } = await supabase.storage
        .from("applications")
        .createSignedUrl(app.photo_path, 60 * 60);
      if (photoData?.signedUrl) urls.photo = photoData.signedUrl;
    }
    setFileUrls((prev) => ({ ...prev, [app.id]: urls }));
  };

  const logout = async () => {
    await supabase?.auth.signOut();
    navigate("/recruitment/login", { replace: true });
  };

  const openRejectDialog = (app: ApplicationRow) => {
    setRejectError(null);
    setRejectTarget(app);
  };

  const confirmReject = async () => {
    if (!rejectTarget || rejecting || !supabase) return;
    setRejecting(true);
    setRejectError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      // Inform the applicant first; if the email fails, nothing is deleted
      // and the recruiter can retry.
      const response = await fetch("/api/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to_email: rejectTarget.email,
          applicant_name: rejectTarget.full_name,
          position_title: rejectTarget.position_title,
          season: rejectTarget.season,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to send rejection email.");
      }

      const { error: deleteError } = await supabase
        .from("applications")
        .delete()
        .eq("id", rejectTarget.id);
      if (deleteError) {
        throw new Error(`The email was sent, but removing the application failed: ${deleteError.message}`);
      }

      // Best-effort file cleanup — orphaned files are private and harmless.
      const paths = [rejectTarget.cv_path, rejectTarget.photo_path].filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from("applications").remove(paths);
      }

      setApplications((prev) => prev.filter((a) => a.id !== rejectTarget.id));
      if (openId === rejectTarget.id) setOpenId(null);
      setRejectTarget(null);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "Rejection failed. Please try again.");
    } finally {
      setRejecting(false);
    }
  };

  if (authState === "loading") {
    return (
      <div className="flex items-center justify-center min-h-svh" style={{ backgroundColor: "#FDFDFD" }}>
        <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.4)" }}>Checking access…</p>
      </div>
    );
  }

  if (authState === "unauthed") {
    return <Navigate to="/recruitment/login" replace />;
  }

  if (authState === "denied") {
    return (
      <div className="flex items-center justify-center px-6 min-h-svh" style={{ backgroundColor: "#FDFDFD" }}>
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#03094A", marginBottom: "12px" }}>
            No recruiter access
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.5)", lineHeight: 1.6, marginBottom: "24px" }}>
            Your account is signed in but isn't on the recruiter list. Ask a board member to add
            your email, then reload this page.
          </p>
          <button
            onClick={logout}
            style={{
              backgroundColor: "#03094A",
              color: "#FDFDFD",
              padding: "12px 24px",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#FDFDFD", minHeight: "100vh" }}>
      <div className="px-6 mx-auto pt-16 pb-24 lg:px-16" style={{ maxWidth: "1100px" }}>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4" style={{ marginBottom: "36px" }}>
          <div>
            <p className="mb-3" style={eyebrowStyle}>Recruitment portal</p>
            <h1
              className="font-medium"
              style={{ fontSize: "clamp(26px, 3vw, 40px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "#03094A" }}
            >
              Applications
            </h1>
          </div>
          <button
            onClick={logout}
            style={{
              backgroundColor: "transparent",
              color: "#03094A",
              padding: "10px 18px",
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "1.5px solid rgba(3,9,74,0.25)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "border-color 0.18s ease",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.25)")}
          >
            Sign out
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: "24px" }}>
          <select
            value={seasonFilter}
            onChange={(e) => { setSeasonFilter(e.target.value); setOpenId(null); }}
            style={{
              backgroundColor: "rgba(3,9,74,0.03)",
              border: "1.5px solid rgba(3,9,74,0.18)",
              borderRadius: "8px",
              padding: "9px 12px",
              fontSize: "14px",
              color: "#0C0C0C",
              outline: "none",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value={ALL_SEASONS}>{ALL_SEASONS}</option>
          </select>
          <input
            type="search"
            placeholder="Search name, email, position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flexGrow: 1,
              minWidth: "220px",
              maxWidth: "380px",
              backgroundColor: "rgba(3,9,74,0.03)",
              border: "1.5px solid rgba(3,9,74,0.18)",
              borderRadius: "8px",
              padding: "9px 12px",
              fontSize: "14px",
              color: "#0C0C0C",
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.18)")}
          />
          <p style={{ fontSize: "13px", color: "rgba(3,9,74,0.4)", marginLeft: "auto" }}>
            {filtered.length} {filtered.length === 1 ? "application" : "applications"}
          </p>
        </div>

        {loadError && (
          <p style={{ fontSize: "14px", color: "#dc2626", marginBottom: "16px" }}>{loadError}</p>
        )}

        {/* List */}
        <div style={{ borderTop: "1.5px solid rgba(3,9,74,0.1)" }}>
          {filtered.map((app) => {
            const isOpen = openId === app.id;
            const urls = fileUrls[app.id];
            return (
              <div key={app.id} style={{ borderBottom: "1.5px solid rgba(3,9,74,0.1)" }}>
                <button
                  onClick={() => void toggleOpen(app)}
                  className="flex flex-wrap items-center justify-between w-full gap-3 py-4 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <div style={{ minWidth: "220px" }}>
                    <p style={{ fontSize: "16px", fontWeight: 500, color: "#0C0C0C", letterSpacing: "-0.01em" }}>
                      {app.full_name}
                    </p>
                    <p style={{ fontSize: "13px", color: "rgba(3,9,74,0.45)" }}>{app.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)" }}>{formatDate(app.created_at)}</span>
                    <span style={tagStyle}>{app.position_title}</span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "28px",
                        height: "28px",
                        border: "1.5px solid rgba(3,9,74,0.2)",
                        borderRadius: "50%",
                        transition: "transform 0.25s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        color: "#03094A",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 4.5L6 8L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="grid grid-cols-1 gap-8 pb-8 lg:grid-cols-3">

                        <div className="flex flex-col gap-6 lg:col-span-2">
                          <div>
                            <p className="mb-2" style={eyebrowStyle}>Motivation</p>
                            <p style={{ fontSize: "15px", color: "rgba(12,12,12,0.75)", lineHeight: 1.7 }}>
                              {app.motivation}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div>
                              <p className="mb-2" style={eyebrowStyle}>Email</p>
                              <a
                                href={`mailto:${app.email}`}
                                style={{ fontSize: "14px", color: "#002EC4", textDecoration: "none" }}
                              >
                                {app.email}
                              </a>
                            </div>
                            <div>
                              <p className="mb-2" style={eyebrowStyle}>Phone</p>
                              <a
                                href={`tel:${app.phone.replace(/[\s()-]/g, "")}`}
                                style={{ fontSize: "14px", color: "#002EC4", textDecoration: "none" }}
                              >
                                {app.phone}
                              </a>
                            </div>
                            <div>
                              <p className="mb-2" style={eyebrowStyle}>Study program</p>
                              <p style={{ fontSize: "14px", color: "#0C0C0C" }}>
                                {app.study_program_other || app.study_program}
                              </p>
                            </div>
                            <div>
                              <p className="mb-2" style={eyebrowStyle}>Year of study</p>
                              <p style={{ fontSize: "14px", color: "#0C0C0C" }}>
                                {app.year_of_study}
                                {["st", "nd", "rd"][app.year_of_study - 1] ?? "th"} year
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="mb-2" style={eyebrowStyle}>Also interested in</p>
                            {app.interested_departments.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {app.interested_departments.map((d) => (
                                  <span
                                    key={d}
                                    style={{
                                      ...tagStyle,
                                      backgroundColor: "transparent",
                                      color: "#002EC4",
                                      border: "1.5px solid #002EC4",
                                    }}
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.35)" }}>—</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          {urls?.photo && (
                            <img
                              src={urls.photo}
                              alt={`Photo of ${app.full_name}`}
                              style={{
                                width: "120px",
                                height: "120px",
                                objectFit: "cover",
                                borderRadius: "12px",
                                border: "1.5px solid rgba(3,9,74,0.1)",
                              }}
                            />
                          )}
                          {urls === undefined ? (
                            <p style={{ fontSize: "13px", color: "rgba(3,9,74,0.4)" }}>Loading files…</p>
                          ) : (
                            <a
                              href={urls.cv}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "block",
                                textAlign: "center",
                                backgroundColor: urls.cv ? "#03094A" : "rgba(3,9,74,0.25)",
                                color: "#FDFDFD",
                                padding: "12px 20px",
                                fontSize: "12px",
                                fontWeight: 500,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                textDecoration: "none",
                                borderRadius: "6px",
                                pointerEvents: urls.cv ? "auto" : "none",
                                transition: "background-color 0.18s ease",
                              }}
                              onMouseEnter={(e) => { if (urls.cv) e.currentTarget.style.backgroundColor = "#002EC4"; }}
                              onMouseLeave={(e) => { if (urls.cv) e.currentTarget.style.backgroundColor = "#03094A"; }}
                            >
                              {urls.cv ? "Open CV" : "CV unavailable"}
                            </a>
                          )}
                          <a
                            href={`mailto:${app.email}`}
                            style={{
                              display: "block",
                              textAlign: "center",
                              color: "#03094A",
                              padding: "11px 20px",
                              fontSize: "12px",
                              fontWeight: 500,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              textDecoration: "none",
                              border: "1.5px solid rgba(3,9,74,0.25)",
                              borderRadius: "6px",
                              transition: "border-color 0.18s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#002EC4")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(3,9,74,0.25)")}
                          >
                            Email applicant
                          </a>
                          <button
                            onClick={() => openRejectDialog(app)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "center",
                              backgroundColor: "transparent",
                              color: "#dc2626",
                              padding: "11px 20px",
                              fontSize: "12px",
                              fontWeight: 500,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              border: "1.5px solid rgba(220,38,38,0.4)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.18s ease",
                              fontFamily: "inherit",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#dc2626";
                              e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "rgba(220,38,38,0.4)";
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            Reject candidate
                          </button>
                          <p style={{ fontSize: "12px", color: "rgba(3,9,74,0.35)", textAlign: "center" }}>
                            Season {app.season}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {filtered.length === 0 && !loadError && (
            <p className="py-16 text-center" style={{ color: "rgba(3,9,74,0.3)", fontSize: "15px" }}>
              No applications {seasonFilter !== ALL_SEASONS ? `for ${seasonFilter}` : ""} yet.
            </p>
          )}
        </div>
      </div>

      {/* Reject confirmation dialog */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => { if (!rejecting) setRejectTarget(null); }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(3,9,74,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              zIndex: 50,
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-dialog-title"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "440px",
                backgroundColor: "#FDFDFD",
                borderRadius: "12px",
                border: "1.5px solid rgba(3,9,74,0.1)",
                padding: "28px",
                boxShadow: "0 24px 64px rgba(3,9,74,0.18)",
              }}
            >
              <h2
                id="reject-dialog-title"
                style={{ fontSize: "20px", fontWeight: 500, color: "#03094A", letterSpacing: "-0.01em", marginBottom: "10px" }}
              >
                Reject {rejectTarget.full_name}?
              </h2>
              <p style={{ fontSize: "14px", color: "rgba(12,12,12,0.65)", lineHeight: 1.6, marginBottom: "6px" }}>
                {rejectTarget.full_name} will receive an email letting them know their application
                for <strong style={{ color: "#03094A", fontWeight: 500 }}>{rejectTarget.position_title}</strong> was
                not successful this time.
              </p>
              <p style={{ fontSize: "13px", color: "rgba(3,9,74,0.45)", lineHeight: 1.6, marginBottom: "22px" }}>
                The application, CV and photo are then permanently deleted. This cannot be undone.
              </p>

              {rejectError && (
                <p style={{ fontSize: "13px", color: "#dc2626", lineHeight: 1.5, marginBottom: "16px" }}>
                  {rejectError}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRejectTarget(null)}
                  disabled={rejecting}
                  style={{
                    backgroundColor: "transparent",
                    color: "#03094A",
                    padding: "11px 20px",
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "1.5px solid rgba(3,9,74,0.25)",
                    borderRadius: "6px",
                    cursor: rejecting ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void confirmReject()}
                  disabled={rejecting}
                  style={{
                    backgroundColor: rejecting ? "rgba(220,38,38,0.5)" : "#dc2626",
                    color: "#FDFDFD",
                    padding: "11px 20px",
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "none",
                    borderRadius: "6px",
                    cursor: rejecting ? "not-allowed" : "pointer",
                    transition: "background-color 0.18s ease",
                    fontFamily: "inherit",
                  }}
                >
                  {rejecting ? "Rejecting…" : "Reject & send email"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
