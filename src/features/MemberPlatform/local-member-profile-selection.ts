const KEY = "helix-member-local-profile-v1";

/** Selection only. Callers must supply the dedicated development/loopback gate. */
export function isProjectMemberPreview(enabled: boolean): boolean {
  if (!enabled || typeof window === "undefined") return false;
  const profile = new URLSearchParams(window.location.search).get("memberRole");
  if (profile === "project_member" || profile === "default") {
    localStorage.setItem(KEY, profile);
  }
  return localStorage.getItem(KEY) === "project_member";
}
