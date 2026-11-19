import { isLocalMemberMode, localMemberSignedIn } from "./local-mode";

export type LocalFinanceProfile = "finance" | "head_of_finance";

let selectedProfile: LocalFinanceProfile | undefined;
const observedWindows = new WeakSet<Window>();

/** In-memory synthetic profile: undefined keeps ordinary local access, null refuses a selection.
 * Never stores roles/grants, and never participates in real member authorization.
 */
export function localFinanceProfileSelection(): LocalFinanceProfile | null | undefined {
  if (!isLocalMemberMode() || !localMemberSignedIn() || typeof window === "undefined") {
    selectedProfile = undefined;
    return null;
  }
  if (!observedWindows.has(window)) {
    observedWindows.add(window);
    window.addEventListener("helix-member-local-session-changed", () => { selectedProfile = undefined; });
  }
  const value = new URLSearchParams(window.location.search).get("financeRole");
  if (value === null) return selectedProfile;
  if (value === "finance" || value === "head_of_finance") {
    selectedProfile = value;
    return value;
  }
  selectedProfile = undefined;
  return null;
}
