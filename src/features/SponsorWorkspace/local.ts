import type { SponsorContext } from "./types";

export function isLocalSponsorMode(origin = typeof window === "undefined" ? "" : window.location.origin): boolean {
  if (!import.meta.env.DEV || import.meta.env.MODE !== "sponsor-local") return false;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname); }
  catch { return false; }
}

const ACCOUNTS = ["sponsor", "admin", "bronze", "expired", "developer", "unentitled"];
const KEY = "helix-sponsor-local-account-v1";
let boundToken: string | null = null;
let fallbackAccount = "sponsor";
let initialized = false;
function account(): string {
  if (!isLocalSponsorMode()) throw Object.assign(new Error("Local sponsor accounts are unavailable."), { status: 403 });
  if (!initialized) {
    initialized = true;
    const selected = new URL(window.location.href).searchParams.get("account");
    if (selected && ACCOUNTS.includes(selected)) {
      fallbackAccount = selected;
      try { localStorage.setItem(KEY, selected); } catch { /* Keep this tab usable when storage is unavailable. */ }
    }
  }
  try { return localStorage.getItem(KEY) ?? fallbackAccount; } catch { return fallbackAccount; }
}

export async function localSponsorRequest<T>(action: string, options: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const selected = account();
  const token = `sponsor-local-${selected}`;
  if (!ACCOUNTS.includes(selected) || boundToken && token !== boundToken) throw Object.assign(new Error("Your account changed. Sign in again."), { status: 401 });
  const { query = {}, ...init } = options;
  const response = await fetch(`/api/sponsor?${new URLSearchParams({ ...query, action })}`, {
    ...init, cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw Object.assign(new Error(result?.error ?? "Could not complete this request."), { status: response.status });
  return result as T;
}

export async function localSponsorSession(): Promise<SponsorContext> {
  boundToken = null;
  const context = await localSponsorRequest<SponsorContext>("session");
  boundToken = `sponsor-local-${account()}`;
  return context;
}

export async function localSponsorSignOut(): Promise<void> {
  if (!isLocalSponsorMode()) throw new Error("Local sponsor accounts are unavailable.");
  fallbackAccount = "signed-out";
  try { localStorage.setItem(KEY, fallbackAccount); } catch { /* Local state still ends access in this tab. */ }
  boundToken = null;
}
