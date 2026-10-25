import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

export type MemberTheme = "light" | "dark" | "system";
export const MEMBER_THEME_KEY = "helix-member-theme";
export function validMemberTheme(value: unknown): MemberTheme {
  return value === "light" || value === "dark" ? value : "system";
}
function initialTheme(): MemberTheme {
  try { return validMemberTheme(localStorage.getItem(MEMBER_THEME_KEY)); } catch { return "system"; }
}
const ThemeContext = createContext<{ theme: MemberTheme; setTheme: (theme: MemberTheme) => void } | null>(null);

export function MemberThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<MemberTheme>(initialTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const resolved = theme === "system" ? systemDark ? "dark" : "light" : theme;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    change();
    return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.memberTheme;
    const wasDark = root.classList.contains("dark");
    root.dataset.memberTheme = resolved;
    root.classList.toggle("dark", resolved === "dark");
    return () => {
      if (previous) root.dataset.memberTheme = previous;
      else delete root.dataset.memberTheme;
      root.classList.toggle("dark", wasDark);
    };
  }, [resolved]);
  function setTheme(next: MemberTheme) {
    updateTheme(next);
    try { localStorage.setItem(MEMBER_THEME_KEY, next); } catch { /* Keep the current choice when storage is blocked. */ }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useMemberTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("MemberThemeProvider is missing");
  return value;
}
