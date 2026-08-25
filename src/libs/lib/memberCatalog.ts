import { supabase } from "./utils";

const CURRENT_SEASON = "S26";
const NO_SEASON_ROLE = `No ${CURRENT_SEASON} role`;
const NO_SEASON_POSITION = `No ${CURRENT_SEASON} position`;

export const DEPARTMENTS = [
  "Autonomous",
  "Marketing",
  "Finance",
  "Mechanical and Production",
  "Electronics",
  "Software",
  "The Board",
];

export interface MemberRecord {
  id: string;
  name: string;
  fieldOfStudy: string;
  graduationYear: number | string;
  department: string;
  position?: string;
  linkedin: string;
  email: string;
  personalEmail?: string;
  personalPhone?: string;
  phone: string;
  profileImage?: string;
  cvUrl?: string;
}

type LoadResult = {
  members: MemberRecord[];
  usedFallback: boolean;
  fallbackReason: string | null;
};

function extractStoragePath(urlString: string, bucket?: string) {
  let candidate = urlString;

  try {
    const url = new URL(urlString);
    const idx = url.pathname.indexOf("/object/");
    if (idx >= 0) {
      candidate = decodeURIComponent(url.pathname.slice(idx + "/object/".length));
    }
  } catch {
    // ignore non-URL strings
  }

  candidate = candidate.replace(/^\/+/, "");

  if (bucket) {
    const bucketPrefix = `${bucket}/`;
    const publicBucketPrefix = `public/${bucket}/`;
    if (candidate.startsWith(publicBucketPrefix)) {
      candidate = candidate.slice(publicBucketPrefix.length);
    } else if (candidate.startsWith(bucketPrefix)) {
      candidate = candidate.slice(bucketPrefix.length);
    }
  }

  return candidate;
}

function isSupabaseStorageUrl(urlString: string, supabaseUrl?: string) {
  if (!urlString.startsWith("http")) return false;
  if (!supabaseUrl) return urlString.includes("/storage/v1/object/");

  try {
    const base = new URL(supabaseUrl);
    const target = new URL(urlString);
    return target.host === base.host && target.pathname.includes("/storage/v1/object/");
  } catch {
    return urlString.includes("/storage/v1/object/");
  }
}

async function loadFromStatic(): Promise<MemberRecord[]> {
  const response = await fetch("/members.json");
  if (!response.ok) {
    throw new Error(`Fallback fetch feilet med status ${response.status}`);
  }

  const data = await response.json();
  return (data ?? []).map((row: any) => {
    const department = row.department ?? NO_SEASON_ROLE;
    const position = row.title ?? row.position ?? NO_SEASON_POSITION;
    return {
      id: String(row.id),
      name: row.name,
      fieldOfStudy: row.fieldOfStudy,
      graduationYear: row.graduation_year ?? row.graduationYear ?? row.yearOfStudy ?? "alumni",
      department,
      position,
      linkedin: row.linkedin ?? "",
      email: row.email ?? "",
      personalEmail: row.personalEmail ?? undefined,
      personalPhone: row.personalPhone ?? undefined,
      phone: row.phone ?? "",
      profileImage: row.profileImage ?? undefined,
      cvUrl: row.cvUrl ?? undefined,
    };
  });
}

async function resolveCvUrls(list: MemberRecord[], cvBucket?: string): Promise<MemberRecord[]> {
  const needsSigning = list.some((member) => member.cvUrl && !member.cvUrl.startsWith("http"));
  if (!supabase || !cvBucket) {
    if (needsSigning) {
      console.warn("CV bucket missing or Supabase not configured; cannot sign CV URLs.");
    }
    return list;
  }

  const rawPaths = list
    .map((member) => member.cvUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((path) => {
      if (!path.startsWith("http")) return extractStoragePath(path, cvBucket);
      return isSupabaseStorageUrl(path, import.meta.env?.VITE_SUPABASE_URL as string | undefined)
        ? extractStoragePath(path, cvBucket)
        : path;
    })
    .filter((path) => !path.startsWith("http"));

  const uniquePaths = Array.from(new Set(rawPaths));
  if (!uniquePaths.length) return list;

  const { data: signedUrls, error: signError } = await supabase.storage
    .from(cvBucket)
    .createSignedUrls(uniquePaths, 60 * 60 * 6);

  if (signError) {
    console.error("Failed to sign CV URLs:", signError);
    return list;
  }

  const map = new Map<string, string>();
  signedUrls?.forEach((item, idx) => {
    const path = uniquePaths[idx];
    if (item?.signedUrl) {
      map.set(path, item.signedUrl);
    }
  });

  return list.map((member) => {
    if (!member.cvUrl) return member;
    if (member.cvUrl.startsWith("http") && !isSupabaseStorageUrl(member.cvUrl, import.meta.env?.VITE_SUPABASE_URL as string | undefined)) {
      return member;
    }
    const storagePath = extractStoragePath(member.cvUrl, cvBucket);
    const signed = map.get(storagePath);
    if (signed) return { ...member, cvUrl: signed };
    const { data: publicData } = supabase.storage.from(cvBucket).getPublicUrl(storagePath);
    return publicData?.publicUrl ? { ...member, cvUrl: publicData.publicUrl } : member;
  });
}

async function resolveProfileImages(list: MemberRecord[], avatarBucket?: string): Promise<MemberRecord[]> {
  const needsSigning = list.some((member) => member.profileImage && !member.profileImage.startsWith("http"));
  if (!supabase || !avatarBucket) {
    if (needsSigning) {
      console.warn("Avatar bucket missing or Supabase not configured; cannot sign profile images.");
    }
    return list;
  }

  const rawPaths = list
    .map((member) => member.profileImage)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((path) => {
      if (!path.startsWith("http")) return extractStoragePath(path, avatarBucket);
      return isSupabaseStorageUrl(path, import.meta.env?.VITE_SUPABASE_URL as string | undefined)
        ? extractStoragePath(path, avatarBucket)
        : path;
    })
    .filter((path) => !path.startsWith("http"));

  const uniquePaths = Array.from(new Set(rawPaths));
  if (!uniquePaths.length) return list;

  const { data: signedUrls, error: signError } = await supabase.storage
    .from(avatarBucket)
    .createSignedUrls(uniquePaths, 60 * 60 * 6);

  if (signError) {
    console.error("Failed to sign profile images:", signError);
    return list;
  }

  const map = new Map<string, string>();
  signedUrls?.forEach((item, idx) => {
    const path = uniquePaths[idx];
    if (item?.signedUrl) {
      map.set(path, item.signedUrl);
    }
  });

  return list.map((member) => {
    if (!member.profileImage) return member;
    if (member.profileImage.startsWith("http") && !isSupabaseStorageUrl(member.profileImage, import.meta.env?.VITE_SUPABASE_URL as string | undefined)) {
      return member;
    }
    const storagePath = extractStoragePath(member.profileImage, avatarBucket);
    const signed = map.get(storagePath);
    if (signed) return { ...member, profileImage: signed };
    const { data: publicData } = supabase.storage.from(avatarBucket).getPublicUrl(storagePath);
    return publicData?.publicUrl ? { ...member, profileImage: publicData.publicUrl } : member;
  });
}

export async function loadSponsorPortalMembers(): Promise<LoadResult> {
  try {
    if (!supabase) {
      const members = await loadFromStatic();
      return {
        members,
        usedFallback: true,
        fallbackReason: "Supabase-klient ikke konfigurert (mangler eller ugyldige VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).",
      };
    }

    const { data, error: supaError } = await supabase
      .from("students")
      .select("*")
      .order("full_name", { ascending: true });

    if (supaError) throw supaError;

    const { data: positions, error: posError } = await supabase
      .from("positions")
      .select("student_id, season, title, department_id, departments(name)")
      .eq("season", CURRENT_SEASON);
    if (posError) throw posError;

    const deptByStudent = new Map<string, string>();
    const positionByStudent = new Map<string, string>();
    (positions ?? []).forEach((row: any) => {
      const deptName = row?.departments?.name as string | undefined;
      if (deptName) {
        deptByStudent.set(String(row.student_id), deptName);
      }
      const positionTitle = row?.title as string | undefined;
      if (positionTitle) {
        positionByStudent.set(String(row.student_id), positionTitle);
      }
    });

    const mappedRaw: MemberRecord[] = (data ?? []).map((row: any) => {
      const studentId = String(row.id);
      const seasonDept = deptByStudent.get(studentId);
      const department = seasonDept ?? NO_SEASON_ROLE;
      const seasonPosition = positionByStudent.get(studentId);
      const position = seasonPosition ?? NO_SEASON_POSITION;
      return {
        id: studentId,
        name: row.full_name ?? row.name ?? "Ukjent navn",
        fieldOfStudy: row.field_of_study ?? row.fieldOfStudy ?? "Ukjent studieretning",
        graduationYear: row.graduation_year ?? row.year_of_study ?? "alumni",
        department,
        position,
        linkedin: row.linkedin ?? "",
        email: row.email ?? "",
        personalEmail: row.personal_email ?? undefined,
        personalPhone: row.personal_phone ?? undefined,
        phone: row.phone ?? "",
        profileImage: row.profile_image_url ?? row.profileImage ?? undefined,
        cvUrl: row.cv_url ?? row.cvUrl ?? undefined,
      };
    });

    const avatarBucket = import.meta.env?.VITE_SUPABASE_PROFILE_BUCKET as string | undefined;
    const cvBucket = import.meta.env?.VITE_SUPABASE_CV_BUCKET as string | undefined;

    const withAvatars = await resolveProfileImages(mappedRaw, avatarBucket);
    const members = await resolveCvUrls(withAvatars, cvBucket);

    return {
      members,
      usedFallback: false,
      fallbackReason: null,
    };
  } catch (err) {
    const members = await loadFromStatic();
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as any).message)
          : "Kunne ikke laste medlemmer.";

    return {
      members,
      usedFallback: true,
      fallbackReason: message,
    };
  }
}