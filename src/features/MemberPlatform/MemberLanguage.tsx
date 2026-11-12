import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMemberAccount } from "./MemberAccountContext";
import { platformNorwegian } from "./platform-copy";

export type PlatformLanguage = "en" | "nb";
export const MEMBER_LANGUAGE_KEY = "helix-member-language-v1";
export function memberLanguageStorageKey(email: string) {
  return `${MEMBER_LANGUAGE_KEY}:${email.trim().toLowerCase()}`;
}
function readLanguage(key: string): PlatformLanguage {
  try { return localStorage.getItem(key) === "nb" ? "nb" : "en"; }
  catch { return "en"; }
}
export function platformText(language: PlatformLanguage, text: string, values?: Record<string, string | number>) {
  const template = language === "nb" ? platformNorwegian[text] ?? text : text;
  return values ? template.replace(/\{(\w+)\}/g, (placeholder, key: string) => key in values ? String(values[key]) : placeholder) : template;
}
const LanguageContext = createContext({ language: "en" as PlatformLanguage, setLanguage: (_language: PlatformLanguage) => {}, t: (text: string, values?: Record<string, string | number>) => platformText("en", text, values) });

/** Preferences are scoped to the signed-in account and this browser. */
export function MemberLanguageProvider({ children }: { children: ReactNode }) {
  const account = useMemberAccount();
  const storageKey = memberLanguageStorageKey(account?.email ?? "");
  const [preference, setPreference] = useState(() => ({ key: storageKey, language: readLanguage(storageKey) }));
  const language = preference.key === storageKey ? preference.language : readLanguage(storageKey);
  const setLanguage = useCallback((next: PlatformLanguage) => {
    if (next !== "en" && next !== "nb") return;
    setPreference({ key: storageKey, language: next });
    try { localStorage.setItem(storageKey, next); } catch { /* The choice still applies for this visit. */ }
  }, [storageKey]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference({ key: storageKey, language: readLanguage(storageKey) });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const value = useMemo(() => ({ language, setLanguage, t: (text: string, values?: Record<string, string | number>) => platformText(language, text, values) }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useMemberLanguage() { return useContext(LanguageContext); }
