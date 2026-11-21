/** Notify mounted views after a successful material write, without requiring a browser. */
export function publishFinanceUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("helix-workspace-updated"));
}
