import { Dispatch, DragEvent, FormEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCVBankAuth } from "./auth";
import { supabase } from "../../libs/lib/utils";

type UploadState = "idle" | "uploading" | "success" | "error" | "no-endpoint" | "deleting";
type SaveState = "idle" | "saving" | "saved" | "error" | "supabase-missing";

type HelixCareerEntry = {
  season: string;
  position: string;
  departmentId?: string;
  departmentName?: string;
};

type ProfileShape = {
  full_name: string;
  email: string;
  personal_email: string;
  personal_phone: string;
  linkedin: string;
  field_of_study: string;
  graduation_year: string;
  profile_image_url: string;
  cv_url: string;
  helix_career: HelixCareerEntry[];
};

const maxFileSizeBytes = 10 * 1024 * 1024; // 10MB
const maxAvatarSizeBytes = 5 * 1024 * 1024; // 5MB
const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase
);
const cvBucket = import.meta.env.VITE_SUPABASE_CV_BUCKET;
const avatarBucket = import.meta.env.VITE_SUPABASE_PROFILE_BUCKET;

const getFileName = (path: string) => path.split("/").pop() ?? path;

const hasMissingRequired = (p: ProfileShape) =>
  [p.full_name, p.email, p.field_of_study, p.graduation_year].some((v) => !v || String(v).trim() === "");

export default function CVBankProfile() {
  const { user, logout } = useCVBankAuth();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [mustCompleteProfile, setMustCompleteProfile] = useState(false);
  const [modalDismissible, setModalDismissible] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [careerSaveState, setCareerSaveState] = useState<SaveState>("idle");
  const [careerSaveMessage, setCareerSaveMessage] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<UploadState>("idle");
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [newCareerSeason, setNewCareerSeason] = useState("");
  const [newCareerPosition, setNewCareerPosition] = useState("");
  const [newCareerDepartment, setNewCareerDepartment] = useState("");
  const [originalCareer, setOriginalCareer] = useState<HelixCareerEntry[]>([]);
  const [showCareerModal, setShowCareerModal] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [profile, setProfile] = useState<ProfileShape>({
    full_name: "",
    email: "",
    personal_email: "",
    personal_phone: "",
    linkedin: "",
    field_of_study: "",
    graduation_year: "",
    profile_image_url: "",
    cv_url: "",
    helix_career: [],
  });

  const avatarFallback = useMemo(() => user?.name?.[0]?.toUpperCase() ?? "", [user]);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const seasonOptions = useMemo(() => ["S26", "S25", "S24"], []);
  const availableSeasons = useMemo(
    () =>
      seasonOptions.filter(
        (s) => s === newCareerSeason || !profile.helix_career.some((entry) => entry.season === s)
      ),
    [seasonOptions, newCareerSeason, profile.helix_career]
  );
  const isCareerDirty = useMemo(() => {
    if (profile.helix_career.length !== originalCareer.length) return true;
    return profile.helix_career.some((entry, idx) => {
      const orig = originalCareer[idx];
      return (
        entry.season !== orig?.season ||
        entry.position !== orig?.position ||
        (entry.departmentId ?? "") !== (orig?.departmentId ?? "")
      );
    });
  }, [profile.helix_career, originalCareer]);

  useEffect(() => {
    let hasLoggedOut = false;

    const performLogout = () => {
      if (hasLoggedOut) return;
      hasLoggedOut = true;
      logout();
    };

    const handleBeforeUnload = () => performLogout();
    const handlePageHide = () => performLogout();

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [logout]);

  useEffect(() => {
    const resolveAvatarUrl = async (path: string | null | undefined) => {
      if (!path) return "";
      if (!supabase || !avatarBucket) return path;

      // Try to extract the storage object path (strip bucket/public prefixes)
      const extractStoragePath = (urlString: string) => {
        let candidate = urlString;
        try {
          const url = new URL(urlString);
          const idx = url.pathname.indexOf("/object/");
          if (idx >= 0) {
            candidate = decodeURIComponent(url.pathname.slice(idx + "/object/".length));
          }
        } catch {
          /* ignore */
        }

        // Remove leading slashes
        candidate = candidate.replace(/^\/+/, "");

        // Remove optional public/ or bucket prefix so Supabase signing gets the bare object path
        const bucketPrefix = `${avatarBucket}/`;
        const publicBucketPrefix = `public/${avatarBucket}/`;
        if (candidate.startsWith(publicBucketPrefix)) {
          candidate = candidate.slice(publicBucketPrefix.length);
        } else if (candidate.startsWith(bucketPrefix)) {
          candidate = candidate.slice(bucketPrefix.length);
        }

        return candidate;
      };

      const needsRenewal = path.includes("token=");
      const storagePath = extractStoragePath(path);

      const { data, error } = await supabase.storage.from(avatarBucket).createSignedUrl(storagePath, 60 * 60 * 6);
      if (error) {
        if (!needsRenewal) {
          // return original if signing fails but not an expiring token
          return path;
        }
        console.warn("Could not sign avatar URL", error);
        return path;
      }
      return data?.signedUrl ?? path;
    };

    const loadProfile = async () => {
      if (!supabaseConfigured || !supabase) {
        setSaveState("supabase-missing");
        setProfileError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
        setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);
        setProfileError(null);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const supaUser = userData.user;
        if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

        const { data, error } = await supabase
          .from("students")
          .select(
            "full_name,email,personal_email,personal_phone,linkedin,field_of_study,graduation_year,profile_image_url,cv_url"
          )
          .eq("id", supaUser.id)
          .maybeSingle();
        if (error) throw error;

        const { data: positionsData, error: positionsError } = await supabase
          .from("positions")
          .select("season,title,department_id,departments(name)")
          .eq("student_id", supaUser.id)
          .order("season", { ascending: false });
        if (positionsError) throw positionsError;

        const profileImageUrl = await resolveAvatarUrl(data?.profile_image_url ?? "");

        const nextProfile: ProfileShape = {
          full_name: data?.full_name ?? supaUser.user_metadata?.full_name ?? user?.name ?? "",
          email: data?.email ?? supaUser.email ?? user?.email ?? "",
          personal_email: data?.personal_email ?? "",
          personal_phone: data?.personal_phone ?? "",
          linkedin: data?.linkedin ?? "",
          field_of_study: data?.field_of_study ?? "",
          graduation_year: data?.graduation_year ? String(data.graduation_year) : "",
          profile_image_url: profileImageUrl,
          cv_url: data?.cv_url ?? "",
          helix_career: (positionsData ?? []).map((p) => ({
            season: p.season ?? "",
            position: p.title ?? "",
            departmentId: (p as any).department_id ?? "",
            departmentName: (p as any).departments?.name ?? "",
          })),
        };

  setProfile(nextProfile);
  setOriginalCareer(nextProfile.helix_career ?? []);
        const missing = hasMissingRequired(nextProfile);
        setMustCompleteProfile(missing);
        setModalDismissible(!missing);
      } catch (err) {
        const msg = (err as any)?.message ?? JSON.stringify(err) ?? "Could not load profile.";
        setProfileError(msg);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  useEffect(() => {
    const loadDepartments = async () => {
      if (!supabaseConfigured || !supabase) return;
      try {
        const { data, error } = await supabase
          .from("departments")
          .select("id, name")
          .order("name", { ascending: true });
        if (error) throw error;
        const rows = (data ?? [])
          .map((d: any) => ({ id: String(d.id ?? ""), name: d.name as string }))
          .filter((d) => d.id && d.name);
        setDepartments(rows);
        if (rows.length > 0) {
          setNewCareerDepartment((prev) => prev || rows[0].id);
        }
      } catch (err) {
        console.warn("Could not load departments", err);
      }
    };

    loadDepartments();
  }, []);

  useEffect(() => {
    if (departments.length > 0) {
      setNewCareerDepartment((prev) => prev || departments[0].id);
    }
  }, [departments]);

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();

    if (!file) {
      setStatus("error");
      setMessage("Please choose a file before uploading.");
      return;
    }

    if (!supabaseConfigured || !supabase) {
      setStatus("no-endpoint");
      setMessage("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    if (!cvBucket) {
      setStatus("no-endpoint");
      setMessage("Missing VITE_SUPABASE_CV_BUCKET. Please set the bucket name.");
      return;
    }

    try {
      setStatus("uploading");
      setMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const supaUser = userData.user;
      if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

      const objectPath = `${supaUser.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from(cvBucket).upload(objectPath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const updates = {
        id: supaUser.id,
        full_name: profile.full_name,
        email: profile.email,
        personal_email: profile.personal_email || null,
        personal_phone: profile.personal_phone || null,
        linkedin: profile.linkedin || null,
        field_of_study: profile.field_of_study || null,
        graduation_year: profile.graduation_year ? Number(profile.graduation_year) : null,
        profile_image_url: profile.profile_image_url || null,
        cv_url: objectPath,
      };

      const { error } = await supabase.from("students").upsert(updates);
      if (error) throw error;

      setStatus("success");
      setMessage("Upload complete!");
      setProfile((p) => ({ ...p, cv_url: objectPath }));
      setFile(null);
    } catch (err) {
      console.error("Upload error", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed. Please try again or contact the web team.");
    }
  };

  const handleDeleteCv = async () => {
    if (!supabaseConfigured || !supabase) {
      setStatus("error");
      setMessage("Supabase is not configured. Cannot delete CV.");
      return;
    }

    if (!cvBucket) {
      setStatus("error");
      setMessage("Missing VITE_SUPABASE_CV_BUCKET. Cannot delete file.");
      return;
    }

    try {
      setStatus("deleting");
      setMessage(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const supaUser = userData.user;
      if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

      const updates = {
        id: supaUser.id,
        full_name: profile.full_name,
        email: profile.email,
        personal_email: profile.personal_email || null,
        personal_phone: profile.personal_phone || null,
        linkedin: profile.linkedin || null,
        field_of_study: profile.field_of_study || null,
        graduation_year: profile.graduation_year ? Number(profile.graduation_year) : null,
        profile_image_url: profile.profile_image_url || null,
        cv_url: null,
      };

      if (profile.cv_url) {
        const { error: removeError } = await supabase.storage.from(cvBucket).remove([profile.cv_url]);
        if (removeError) throw removeError;
      }

      const { error } = await supabase.from("students").upsert(updates);
      if (error) throw error;
      setProfile((p) => ({ ...p, cv_url: "" }));
      setFile(null);
      setStatus("idle");
      setMessage("CV deleted.");
      setShowDeleteConfirm(false);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not delete CV.");
    }
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const success = await upsertProfile(profile, setSaveState, setSaveMessage, "Profile updated.");
    if (success) {
      const missing = hasMissingRequired(profile);
      setMustCompleteProfile(missing);
      setModalDismissible(!missing);
      if (!missing) setMustCompleteProfile(false);
    }
  };

  const handleSaveCareer = async () => {
    if (!supabaseConfigured || !supabase) {
      setCareerSaveState("supabase-missing");
      setCareerSaveMessage("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    // Guard against duplicates or excess entries
    const seasons = profile.helix_career.map((e) => e.season);
    const uniqueSeasons = new Set(seasons);
    if (seasons.length !== uniqueSeasons.size) {
      setCareerSaveState("error");
      setCareerSaveMessage("Du kan kun ha én entry per sesong.");
      return;
    }
    if (profile.helix_career.length > 3) {
      setCareerSaveState("error");
      setCareerSaveMessage("Maks 3 entries kan lagres.");
      return;
    }

    try {
      setCareerSaveState("saving");
      setCareerSaveMessage(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const supaUser = userData.user;
      if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

      // Replace existing positions for this student with the current list
      const { error: delError } = await supabase.from("positions").delete().eq("student_id", supaUser.id);
      if (delError) throw delError;

      if (profile.helix_career.length > 0) {
        const rows = profile.helix_career.map((entry) => ({
          student_id: supaUser.id,
          season: entry.season,
          title: entry.position,
          department_id: entry.departmentId || null,
        }));
        const { error: insertError } = await supabase.from("positions").insert(rows);
        if (insertError) throw insertError;
      }

  setCareerSaveState("saved");
  setCareerSaveMessage("Career history saved.");
  setOriginalCareer(profile.helix_career);
    } catch (err) {
      setCareerSaveState("error");
      const message = (err as any)?.message || (err ? JSON.stringify(err) : "Could not save career history.");
      console.error("Save career history error", err);
      setCareerSaveMessage(message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/cv-bank/login", { replace: true });
  };

  const handlePickedFile = (picked: File | null) => {
    if (!picked) return;

    if (picked.type !== "application/pdf") {
      setStatus("error");
      setMessage("Only PDF files are allowed.");
      setFile(null);
      return;
    }

    if (picked.size > maxFileSizeBytes) {
      setStatus("error");
      setMessage("File is too large. Max 10MB.");
      setFile(null);
      return;
    }

    setFile(picked);
    setStatus("idle");
    setMessage(null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    handlePickedFile(dropped ?? null);
  };

  const handlePickedAvatar = async (picked: File | null) => {
    if (!picked) return;

    if (!picked.type.startsWith("image/")) {
      setAvatarStatus("error");
      setAvatarMessage("Only image files are allowed.");
      return;
    }

    if (picked.size > maxAvatarSizeBytes) {
      setAvatarStatus("error");
      setAvatarMessage("Image is too large. Max 5MB.");
      return;
    }

    if (!supabaseConfigured || !supabase) {
      setAvatarStatus("no-endpoint");
      setAvatarMessage("Supabase is not configured. Cannot upload avatar.");
      return;
    }

    if (!avatarBucket) {
      setAvatarStatus("no-endpoint");
      setAvatarMessage("Missing VITE_SUPABASE_PROFILE_BUCKET. Please set the bucket name.");
      return;
    }

    try {
      setAvatarStatus("uploading");
      setAvatarMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const supaUser = userData.user;
      if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

      const objectPath = `${supaUser.id}/avatar-${Date.now()}-${picked.name}`;

      const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(objectPath, picked, {
        cacheControl: "3600",
        upsert: true,
        contentType: picked.type,
        metadata: { owner: supaUser.id },
      });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from(avatarBucket).getPublicUrl(objectPath);
      const storedUrl = publicData?.publicUrl || objectPath; // store stable path/URL
      const { data: signedData } = await supabase.storage.from(avatarBucket).createSignedUrl(objectPath, 60 * 60 * 6);
      const displayUrl = signedData?.signedUrl || storedUrl;

      const { error: updateError } = await supabase
        .from("students")
        .update({ profile_image_url: storedUrl })
        .eq("id", supaUser.id);
      if (updateError) throw updateError;

      setProfile((p) => ({ ...p, profile_image_url: displayUrl }));
      setAvatarStatus("success");
      setAvatarMessage("Profile picture updated.");
    } catch (err) {
      console.error("Avatar upload error", err);
      setAvatarStatus("error");
      setAvatarMessage(err instanceof Error ? err.message : "Could not upload avatar.");
    }
  };

  const openCareerModal = () => {
    if (profile.helix_career.length >= 3) return;
    setCareerSaveState("idle");
    setCareerSaveMessage(null);
    const defaultSeason = availableSeasons[0] ?? "";
    setNewCareerSeason(defaultSeason);
    setNewCareerPosition("");
    const defaultDepartment = departments[0]?.id ?? "";
    setNewCareerDepartment(defaultDepartment);
    setShowCareerModal(true);
  };

  const closeCareerModal = () => {
    setShowCareerModal(false);
    setCareerSaveState("idle");
    setCareerSaveMessage(null);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const addCareerEntry = () => {
    const season = newCareerSeason.trim();
    const position = newCareerPosition.trim();
    const departmentId = newCareerDepartment.trim();
    const departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";
    if (!season || !position) {
      setCareerSaveState("error");
      setCareerSaveMessage("Fyll inn både sesong og rolle før du legger til.");
      return;
    }

    if (!departmentId) {
      setCareerSaveState("error");
      setCareerSaveMessage("Velg avdeling før du legger til.");
      return;
    }

    if (profile.helix_career.length >= 3) {
      setCareerSaveState("error");
      setCareerSaveMessage("Maks 3 entries kan lagres.");
      return;
    }

    const seasonExists = profile.helix_career.some((entry) => entry.season === season);
    if (seasonExists) {
      setCareerSaveState("error");
      setCareerSaveMessage("Du kan kun ha én entry per sesong.");
      return;
    }

    setProfile((p) => ({
      ...p,
      helix_career: [...(p.helix_career ?? []), { season, position, departmentId, departmentName }],
    }));
    setNewCareerSeason("");
    setNewCareerPosition("");
    setNewCareerDepartment("");
    setCareerSaveState("idle");
    setCareerSaveMessage(null);
    setShowCareerModal(false);
  };

  const removeCareerEntry = (index: number) => {
    setProfile((p) => ({
      ...p,
      helix_career: p.helix_career.filter((_, i) => i !== index),
    }));
  };

  const upsertProfile = async (
    nextProfile: ProfileShape,
    setState: Dispatch<SetStateAction<SaveState>>,
    setMsg: Dispatch<SetStateAction<string | null>>,
    successMessage = "Profile updated."
  ) => {
    if (!supabaseConfigured || !supabase) {
      setState("supabase-missing");
      setMsg("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return false;
    }

    try {
      setState("saving");
      setMsg(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const supaUser = userData.user;
      if (!supaUser) throw new Error("No Supabase user session. Please sign in again.");

      const updates = {
        id: supaUser.id,
        full_name: nextProfile.full_name,
        email: nextProfile.email,
        personal_email: nextProfile.personal_email || null,
        personal_phone: nextProfile.personal_phone || null,
        linkedin: nextProfile.linkedin || null,
        field_of_study: nextProfile.field_of_study || null,
        graduation_year: nextProfile.graduation_year ? Number(nextProfile.graduation_year) : null,
        profile_image_url: nextProfile.profile_image_url || null,
        cv_url: nextProfile.cv_url || null,
      };

      const { error } = await supabase.from("students").upsert(updates);
      if (error) throw error;
      setState("saved");
      setMsg(successMessage);
      return true;
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Could not save profile.");
      return false;
    }
  };

  const openEditModal = () => {
    const missing = hasMissingRequired(profile);
    setModalDismissible(!missing);
    setMustCompleteProfile(true);
  };

  const handleCloseModal = () => {
    if (!modalDismissible) return;
    setMustCompleteProfile(false);
    setSaveState("idle");
    setSaveMessage(null);
  };

  const hasCv = Boolean(file || profile.cv_url);
  const messageTone =
    status === "success"
      ? "border border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
      : status === "no-endpoint"
        ? "border border-amber-300/60 bg-amber-500/10 text-amber-100"
        : "border border-red-300/60 bg-red-500/10 text-red-100";

  return (
    <div className="flex items-center justify-center px-4 py-12 text-white min-h-svh bg-menu-background">
      {mustCompleteProfile && !profileLoading && !profileError && (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4 py-6 bg-black/80">
          <div className="relative w-full max-w-2xl p-6 text-white border shadow-2xl rounded-2xl border-amber-200/40 bg-slate-900">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={!modalDismissible}
              className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white/80 transition hover:border-red-400 hover:text-red-200 ${modalDismissible ? "" : "opacity-40 cursor-not-allowed"}`}
              aria-label={modalDismissible ? "Close" : "Complete required fields to close"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="mb-2 text-xl font-semibold">Please complete your profile</h2>
            <p className="mb-4 text-sm text-white/80">
              Full name, email, field of study, and graduation year are required before you can continue. LinkedIn, personal email and phone are optional but recommended. Profile image and CV filename are optional.
            </p>
            <form onSubmit={handleSaveProfile} className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/70">Field of study *</span>
                <input
                  type="text"
                  className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                  value={profile.field_of_study}
                  onChange={(e) => setProfile((p) => ({ ...p, field_of_study: e.target.value }))}
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/70">Graduation year *</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                  value={profile.graduation_year}
                  onChange={(e) => setProfile((p) => ({ ...p, graduation_year: e.target.value }))}
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/70">LinkedIn (optional)</span>
                <input
                  type="url"
                  placeholder="https://linkedin.com/in/your-profile"
                  className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                  value={profile.linkedin}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/70">Personal email (optional)</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                  value={profile.personal_email}
                  onChange={(e) => setProfile((p) => ({ ...p, personal_email: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/70">Personal phone (optional)</span>
                <input
                  type="tel"
                  placeholder="+47 123 45 678"
                  className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                  value={profile.personal_phone}
                  onChange={(e) => setProfile((p) => ({ ...p, personal_phone: e.target.value }))}
                />
              </label>

              <div className="flex flex-col gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={saveState === "saving"}
                  className="w-full px-4 py-3 text-sm font-semibold text-black transition rounded-xl bg-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveState === "saving" ? "Saving…" : "Save required fields"}
                </button>
                {saveMessage && (
                  <p
                    className={`rounded-lg px-3 py-2 text-sm ${
                      saveState === "saved"
                        ? "border border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
                        : saveState === "supabase-missing"
                          ? "border border-amber-300/60 bg-amber-500/10 text-amber-100"
                          : "border border-red-300/60 bg-red-500/10 text-red-100"
                    }`}
                  >
                    {saveMessage}
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4 py-6 bg-black/80">
          <div className="w-full max-w-md p-6 text-white border shadow-2xl rounded-2xl border-white/15 bg-slate-900">
            <h3 className="text-lg font-semibold">Delete CV?</h3>
            <p className="mt-2 text-sm text-white/80">This will remove your CV reference from the profile.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-white/20 text-white/80 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCv}
                disabled={status === "deleting"}
                className="px-4 py-2 text-sm font-semibold text-white transition bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "deleting" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCareerModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6 bg-black/80">
          <div className="relative w-full max-w-lg p-6 text-white border shadow-2xl rounded-2xl border-white/15 bg-slate-900">
            <button
              type="button"
              onClick={closeCareerModal}
              className="absolute inline-flex items-center justify-center w-10 h-10 transition border rounded-lg right-3 top-3 border-white/20 text-white/80 hover:border-red-400 hover:text-red-200"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-lg font-semibold">Add career entry</h3>
            <p className="mt-1 text-sm text-white/70">Choose season and role, then save to store your history.</p>

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                addCareerEntry();
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Season</span>
                  <select
                    className="px-3 py-2 border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                    value={newCareerSeason}
                    onChange={(e) => setNewCareerSeason(e.target.value)}
                  >
                    <option value="" disabled>
                      Select season
                    </option>
                    {availableSeasons.map((season) => (
                      <option
                        key={season}
                        value={season}
                        className="bg-slate-900 text-white"
                        style={{ color: "#111827", backgroundColor: "#ffffff" }}
                      >
                        {season}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Department</span>
                  <select
                    className="px-3 py-2 font-light border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                    value={newCareerDepartment}
                    onChange={(e) => setNewCareerDepartment(e.target.value)}
                  >
                    <option value="" disabled style={{ color: "#111827", backgroundColor: "#ffffff" }}>
                      Velg avdeling
                    </option>
                    {departments.map((dept) => (
                      <option
                        key={dept.id}
                        value={dept.id}
                        className="bg-slate-900 text-white"
                        style={{ color: "#111827", backgroundColor: "#ffffff" }}
                      >
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-white/70">Position</span>
                  <input
                    type="text"
                    placeholder="Deputy Project Manager"
                    className="px-3 py-2 text-white border rounded-lg border-white/20 bg-white/5 focus:border-accent focus:outline-none"
                    value={newCareerPosition}
                    onChange={(e) => setNewCareerPosition(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-black transition rounded-xl bg-accent hover:bg-accent/90"
                >
                  Add entry
                </button>
                <button
                  type="button"
                  onClick={closeCareerModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition border rounded-xl border-white/20 text-white/90 hover:border-accent hover:text-accent"
                >
                  Cancel
                </button>
              </div>

              {careerSaveMessage && careerSaveState === "error" && (
                <p className="px-3 py-2 text-sm text-red-100 border rounded-lg border-red-300/60 bg-red-500/10">
                  {careerSaveMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl p-8 border shadow-2xl rounded-2xl border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="relative flex items-center justify-center w-16 h-16 overflow-hidden text-2xl font-semibold text-white rounded-full cursor-pointer bg-accent/40 group"
              onClick={() => avatarInputRef.current?.click()}
              title="Click to upload profile picture"
            >
              {profile.profile_image_url ? (
                <img src={profile.profile_image_url} className="object-cover w-full h-full" />
              ) : user?.picture ? (
                <img src={user.picture} className="object-cover w-full h-full" />
              ) : (
                avatarFallback
              )}
              <div className="absolute inset-0 items-center justify-center hidden text-xs font-medium text-white/90 bg-black/50 group-hover:flex">
                Change
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePickedAvatar(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-white/60">Signed in</p>
              <h1 className="text-2xl font-semibold">{user?.name ?? "Helix member"}</h1>
              <p className="text-sm text-white/70">{user?.email}</p>
            </div>
          </div>

          {avatarMessage && (
            <div
              className={`mt-2 text-xs px-3 py-2 rounded-lg ${
                avatarStatus === "success"
                  ? "border border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
                  : avatarStatus === "no-endpoint"
                    ? "border border-amber-300/60 bg-amber-500/10 text-amber-100"
                    : "border border-red-300/60 bg-red-500/10 text-red-100"
              }`}
            >
              {avatarMessage}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openEditModal}
              className="inline-flex items-center justify-center gap-2 px-2 py-2 transition border rounded-lg cursor-pointer border-white/20 text-white/80 hover:border-accent hover:text-accent"
              title="Edit profile fields"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition border rounded-lg border-white/20 hover:border-red-400 hover:text-red-100"
            >
              Log out
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-6 mt-8 border rounded-xl border-white/10 bg-white/5 md:gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Your profile</h2>
            {profileLoading && <p className="text-sm text-white/70">Loading profile…</p>}
            {profileError && (
              <p className="px-3 py-2 text-sm text-red-100 border rounded-lg border-red-300/60 bg-red-500/10">{profileError}</p>
            )}
            {!profileLoading && !profileError && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Field of study</span>
                  <div className="text-white">
                    <span className="truncate text-white/90">{profile.field_of_study || "Not set"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Graduation year</span>
                  <div className="text-white">
                    <span className="text-white/90">{profile.graduation_year || "Not set"}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">LinkedIn</span>
                  <div className="text-white">
                    {profile.linkedin ? (
                      <a
                        href={profile.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-accent hover:underline"
                      >
                        {profile.linkedin}
                      </a>
                    ) : (
                      <span className="text-white/60">Not set</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Personal email</span>
                  <div className="text-white">
                    {profile.personal_email ? (
                      <a href={`mailto:${profile.personal_email}`} className="text-white/90 hover:underline">
                        {profile.personal_email}
                      </a>
                    ) : (
                      <span className="text-white/60">Not set</span>
                    )}
                  </div>
                </div>  
              </div>
            )}
          </div>

          <div className="h-px bg-white/10 md:col-span-2" />

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Helix Career</h2>

            <div className="space-y-4">
              {profile.helix_career?.length ? (
                <ul className="space-y-3">
                  {profile.helix_career.map((entry, idx) => (
                    <li
                      key={`${entry.season}-${entry.position}-${idx}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 border rounded-xl border-white/15 bg-white/5"
                    >
                      <div className="flex items-center min-w-0 gap-3">
                        <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 text-sm font-semibold rounded-lg bg-accent/10 text-accent">
                          {entry.season}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entry.position}</p>
                          <p className="text-xs text-white/60">{entry.departmentName || "Department"}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCareerEntry(idx)}
                        className="inline-flex items-center justify-center w-10 h-10 text-sm font-medium transition border rounded-lg border-white/20 text-white/80 hover:border-red-400 hover:text-red-200"
                        aria-label="Remove entry"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-3">
                {profile.helix_career.length < 3 ? (
                  <button
                    type="button"
                    onClick={openCareerModal}
                    className="inline-flex items-center justify-center w-full gap-2 px-4 py-4 text-sm transition border border-dashed cursor-pointer rounded-xl border-white/30 text-white/80 bg-white/5 hover:border-accent hover:text-white"
                  >
                    <span className="text-lg leading-none">+</span>
                    Add entry
                  </button>
                ) : (
                  <p className="text-sm text-white/70">You have reached the maximum of 3 entries.</p>
                )}

                {isCareerDirty && (
                  <button
                    type="button"
                    onClick={handleSaveCareer}
                    disabled={careerSaveState === "saving"}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition border rounded-xl border-white/20 text-white/90 hover:border-accent hover:text-accent disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {careerSaveState === "saving" ? "Saving…" : "Save career history"}
                  </button>
                )}
              </div>

              {careerSaveMessage && (
                <p
                  className={`rounded-lg px-3 py-2 text-sm ${
                    careerSaveState === "saved"
                      ? "border border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
                      : careerSaveState === "supabase-missing"
                        ? "border border-amber-300/60 bg-amber-500/10 text-amber-100"
                        : "border border-red-300/60 bg-red-500/10 text-red-100"
                  }`}
                >
                  {careerSaveMessage}
                </p>
              )}
            </div>
          </div>

          <div className="h-px bg-white/10 md:col-span-2" />

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">CV</h2>

            {hasCv ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 px-4 py-3 border rounded-xl border-white/15 bg-white/5">
                  <div className="flex items-center min-w-0 gap-3">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-shrink-0 text-accent"
                    >
                      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                      <polyline points="14 2 14 8 20 8" />
                      <path d="M8 13h8" />
                      <path d="M8 17h5" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file?.name || getFileName(profile.cv_url)}</p>
                      <p className="text-xs text-white/60">PDF</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file ? (
                      <>
                        <button
                          type="button"
                          onClick={handleUpload}
                          disabled={status === "uploading"}
                          className="px-3 py-2 text-sm font-semibold text-black transition rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {status === "uploading" ? "Uploading…" : "Upload"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="px-3 py-2 text-sm font-medium transition border rounded-lg border-white/20 text-white/80 hover:text-white"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        title="Delete CV"
                        className="inline-flex items-center justify-center w-10 h-10 transition border rounded-lg border-white/20 text-white/80 hover:border-red-400 hover:text-red-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {message && <p className={`rounded-lg px-3 py-2 text-sm ${messageTone}`}>{message}</p>}
              </div>
            ) : (
              <form onSubmit={handleUpload} className="space-y-4">
                <label
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`flex flex-col items-center justify-center gap-3 px-4 py-10 text-center transition border border-dashed cursor-pointer rounded-xl bg-white/5 ${dragActive ? "border-accent bg-white/10" : "border-white/30 hover:border-accent"}`}
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => handlePickedFile(e.target.files?.[0] ?? null)}
                  />
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  <div className="text-sm text-white/80">Click to choose your PDF</div>
                  <p className="text-xs text-white/60">Max 10MB • PDF only</p>
                </label>

                {message && <p className={`rounded-lg px-3 py-2 text-sm ${messageTone}`}>{message}</p>}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

