import { useEffect } from "react";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";

/** Recheck authorization and version while a Finance page is visible. */
export function useFinanceRefresh() {
  const session = useFinanceAccess();
  useEffect(() => {
    if (session.access !== "allowed" || typeof session.refresh !== "function") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void session.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [session.access, session.refresh]);
}
