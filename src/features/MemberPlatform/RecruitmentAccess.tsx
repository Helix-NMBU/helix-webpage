import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { createRecruitmentApi, RecruitmentRequestError } from "../Recruitment/website-api";
import { useMemberAccount } from "./MemberAccountContext";
import { useNotify } from "./MemberNotifications";

type Access = "loading" | "allowed" | "denied" | "unavailable";
const RecruitmentContext = createContext<{ access: Access; retry: () => void; deny: () => void }>({
  access: "denied", retry: () => undefined, deny: () => undefined,
});

// This capability comes from the same server authorization used by every
// recruitment operation. Client roles and successful Google login cannot grant it.
export function RecruitmentAccessProvider({ children }: { children: ReactNode }) {
  const account = useMemberAccount();
  const [access, setAccess] = useState<Access>("loading");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const deny = useCallback(() => setAccess("denied"), []);
  useEffect(() => {
    let active = true;
    const api = createRecruitmentApi({ current: null });
    setAccess("loading");
    void api.session().then(() => { if (active) setAccess("allowed"); }).catch(error => {
      if (active) setAccess(error instanceof RecruitmentRequestError && [401, 403].includes(error.status) ? "denied" : "unavailable");
    });
    return () => { active = false; };
  }, [account?.email, attempt]);
  const value = useMemo(() => ({ access, retry, deny }), [access, retry, deny]);
  return <RecruitmentContext.Provider value={value}>{children}</RecruitmentContext.Provider>;
}

export function useRecruitmentAccess() { return useContext(RecruitmentContext); }

export function RecruitmentAccess({ children }: { children: ReactNode }) {
  const { access, retry } = useRecruitmentAccess();
  const notify = useNotify();
  const announced = useRef<Access | null>(null);
  useEffect(() => {
    if (announced.current === access) return;
    announced.current = access;
    if (access === "denied") notify("Recruitment access required", "Contact a Helix administrator to request recruiter access.", { variant: "error", href: null });
    if (access === "unavailable") notify("Could not check recruitment access", "Please try again.", { variant: "error", href: null, action: { label: "Try again", onClick: retry } });
  }, [access, notify, retry]);
  if (access === "denied") return <Navigate to="/" replace />;
  if (access === "unavailable") return <Button className="self-start" variant="outline" onClick={retry}>Try again</Button>;
  if (access === "loading") return <div role="status" aria-label="Checking recruitment access" className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-40 w-full" /></div>;
  return children;
}
