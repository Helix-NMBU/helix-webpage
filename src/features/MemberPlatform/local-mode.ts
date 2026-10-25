import type { MemberAccount } from "./account";

// The dedicated Vite mode is restricted to a development server on loopback.
// A production build never enables this path, even with the same mode name.
export function isLocalMemberMode(origin = typeof window === "undefined" ? "" : window.location?.origin ?? ""): boolean {
  if (!import.meta.env.DEV || import.meta.env.MODE !== "member-local" || !origin) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export const localMemberAccount: MemberAccount = {
  name: "Alex Example",
  email: "alex@example.invalid",
  role: "Admin",
};

const SESSION_KEY = "helix-member-local-session-v1";
export function localMemberSignedIn(): boolean {
  return localStorage.getItem(SESSION_KEY) !== "signed-out";
}
export function setLocalMemberSignedIn(signedIn: boolean): void {
  localStorage.setItem(SESSION_KEY, signedIn ? "signed-in" : "signed-out");
}
