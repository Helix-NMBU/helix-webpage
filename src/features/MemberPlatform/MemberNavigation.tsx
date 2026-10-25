import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type MemberEditorActions = {
  busy: boolean;
  navigate: (to: string, opener?: HTMLElement) => void;
  signOut: (opener?: HTMLElement) => void;
};
const NavigationContext = createContext<{
  editor: MemberEditorActions | null;
  setEditor: (actions: MemberEditorActions | null) => void;
} | null>(null);
export function MemberNavigationProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<MemberEditorActions | null>(null);
  const value = useMemo(() => ({ editor, setEditor }), [editor]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useMemberNavigation() { return useContext(NavigationContext); }
