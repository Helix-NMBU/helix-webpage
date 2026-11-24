const KEY = "helix-member-local-profile-v1";

function selectedProfile(enabled: boolean): string | null {
  if (!enabled || typeof window === "undefined") return null;
  const profile = new URLSearchParams(window.location.search).get("memberRole");
  if (profile && ["project_member", "default", "platform_tester"].includes(profile)) localStorage.setItem(KEY, profile);
  return localStorage.getItem(KEY);
}

/** Selection only. Callers must supply the dedicated development/loopback gate. */
export function isProjectMemberPreview(enabled: boolean): boolean {
  return selectedProfile(enabled) === "project_member";
}

export function isPlatformTesterPreview(enabled: boolean): boolean {
  return selectedProfile(enabled) === "platform_tester";
}
