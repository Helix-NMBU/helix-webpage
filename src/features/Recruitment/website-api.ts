import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "../MemberPlatform/local-mode";

export type ApplicationRow = {
  id: string; created_at: string; season: string; full_name: string; email: string; phone: string;
  study_program: string; study_program_other: string | null; year_of_study: number; motivation: string;
  position_id: string; position_title: string; interested_departments: string[];
  cv_path: string; photo_path: string | null; consent: boolean;
};
export type WebsitePosition = {
  id: string;
  title: string;
  department: string;
  applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string;
  tasks: string[];
  achieve: string[];
  visible: boolean;
};
export type WebsitePositionInput = Omit<WebsitePosition, "id">;
export class RecruitmentRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function createRecruitmentApi(owner: { current: string | null }) {
  async function request<T>(query: string, body?: object): Promise<T> {
    // Read a fresh member JWT for every server-authorized operation.
    const token = await memberSessionToken(owner);
    const response = await fetch(`/api/website${query}`, {
      method: body ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new RecruitmentRequestError(result.error || "Could not complete the request. Please try again.", response.status);
    return result as T;
  }
  return {
    session: () => {
      if (isLocalMemberMode() && localMemberSignedIn()) return Promise.resolve({ email: localMemberAccount.email, name: localMemberAccount.name });
      return request<{ email: string; name: string }>("?action=session");
    },
    async list() {
      if (isLocalMemberMode() && localMemberSignedIn()) return [];
      const applications: ApplicationRow[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page: { applications: ApplicationRow[]; nextOffset: number | null } = await request(`?action=applications&offset=${offset}`);
        applications.push(...page.applications);
        offset = page.nextOffset;
      }
      return applications;
    },
    async managedPositions() {
      const result = await request<{ positions: WebsitePosition[] }>("?action=managed-positions");
      return result.positions;
    },
    createPosition: (position: WebsitePositionInput) => request<{ position: WebsitePosition }>("", { action: "create-position", position }),
    updatePosition: (position: WebsitePosition) => request<{ position: WebsitePosition }>("", { action: "update-position", position }),
    setPositionVisibility: (id: string, visible: boolean) => request<{ position: WebsitePosition }>("", { action: "set-position-visibility", id, visible }),
    deletePosition: (id: string) => request<{ deleted: boolean }>("", { action: "delete-position", id }),
    file: (id: string, kind: "cv" | "photo") => request<{ url: string; expiresIn: number }>(`?action=file&id=${encodeURIComponent(id)}&kind=${kind}`),
    reject: (id: string) => request<{ emailStatus: "sent" | "skipped"; cleanupPending: boolean }>("", { action: "reject", application_id: id }),
    remove: (id: string) => request<{ emailStatus: "skipped"; cleanupPending: boolean }>("", { action: "delete", application_id: id }),
  };
}

export async function cvBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read your CV. Select the file again."));
    reader.readAsDataURL(file);
  });
}
