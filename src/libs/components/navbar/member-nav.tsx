import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type MemberLanguageAppearance = "on-dark" | "on-light";

export type MemberNavActions = {
  signOutLabel: string;
  signOutDisabled: boolean;
  onSignOut: (opener?: HTMLElement) => void;
  renderLanguage: (appearance: MemberLanguageAppearance) => ReactNode;
};

type MemberNavContextValue = {
  actions: MemberNavActions | null;
  setActions: (actions: MemberNavActions | null) => void;
};

const MemberNavContext = createContext<MemberNavContextValue | null>(null);

export function MemberNavProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<MemberNavActions | null>(null);
  const value = useMemo(() => ({ actions, setActions }), [actions]);
  return <MemberNavContext.Provider value={value}>{children}</MemberNavContext.Provider>;
}

export function useMemberNav(): MemberNavContextValue {
  const value = useContext(MemberNavContext);
  if (!value) throw new Error("MemberNavProvider is missing");
  return value;
}
