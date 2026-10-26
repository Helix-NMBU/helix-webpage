import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";
import { useNotify } from "./MemberNotifications";

export type PlatformRoleKey = "project_manager" | "department_lead" | "team_member" | "platform_administrator";
export type PlatformRole = { key: PlatformRoleKey; label: string };
export type MemberFeatureState = {
  memberId: string;
  email: string;
  name: string;
  departmentId: string | null;
  roles: PlatformRole[];
  features: string[];
};

type FeatureStatus = "loading" | "ready" | "unavailable";
type FeatureContextValue = {
  authUserId: string | null;
  status: FeatureStatus;
  member: MemberFeatureState | null;
  canAccess: (feature: string) => boolean;
  reload: () => void;
};
const FeatureContext = createContext<FeatureContextValue>({
  authUserId: null, status: "loading", member: null, canAccess: () => false, reload: () => undefined,
});

const LOCAL_MEMBER: MemberFeatureState = {
  memberId: "local-member",
  email: localMemberAccount.email,
  name: localMemberAccount.name,
  departmentId: "mechanical-production",
  roles: [
    { key: "team_member", label: "Team Member" },
    { key: "platform_administrator", label: "Platform administrator" },
  ],
  features: [
    "team.business-marketing", "team.mechanical-production", "team.electrical",
    "team.software-autonomous", "team.logistics", "recruitment.manage", "member_access.manage",
  ],
};

export function MemberFeatureAccessProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [member, setMember] = useState<MemberFeatureState | null>(null);
  const [status, setStatus] = useState<FeatureStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const notify = useNotify();
  const owner = useRef<string | null>(userId);
  owner.current = userId;
  const request = useRef<Promise<MemberFeatureState> | null>(null);
  const reload = useCallback(() => { request.current = null; setAttempt((value) => value + 1); }, []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    if (isLocalMemberMode() && localMemberSignedIn()) {
      setMember(LOCAL_MEMBER);
      setStatus("ready");
      return () => { active = false; };
    }
    request.current ??= (async () => {
        const token = await memberSessionToken(owner);
        const response = await fetch("/api/member-access?action=self", {
          cache: "no-store",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as MemberFeatureState | { error?: unknown } | null;
        if (!response.ok) throw new Error(body && "error" in body && typeof body.error === "string" ? body.error : "Could not load your feature access.");
        if (!body || !Array.isArray((body as MemberFeatureState).roles) || !Array.isArray((body as MemberFeatureState).features)) throw new Error("The access response was incomplete.");
        return body as MemberFeatureState;
    })();
    void request.current.then(body => {
      if (!active) return;
      setMember(body);
      setStatus("ready");
    }).catch(() => {
        if (!active) return;
        setMember(null);
        setStatus("unavailable");
        notify("Could not load platform access", "Please try again.", {
          id: "member-feature-access", variant: "error", href: null,
          action: { label: "Try again", onClick: reload },
        });
    });
    return () => { active = false; };
  }, [notify, reload, userId, attempt]);


  const canAccess = useCallback((feature: string) => member?.features.includes(feature) ?? false, [member?.features]);
  const value = useMemo(() => ({ authUserId: userId, status, member, canAccess, reload }), [userId, status, member, canAccess, reload]);
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useMemberFeatureAccess() { return useContext(FeatureContext); }

export function RequireMemberFeature({ feature, children }: { feature: string; children: ReactNode }) {
  const access = useMemberFeatureAccess();
  const notify = useNotify();
  useEffect(() => {
    if (access.status === "ready" && !access.canAccess(feature)) {
      notify("Feature access required", "Your account does not have access to this area.", { id: `feature-denied:${feature}`, variant: "error", href: null });
    }
  }, [access.status, access.canAccess, feature, notify]);
  if (access.status === "loading") return <div role="status" aria-label="Loading feature access" className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (access.status === "unavailable") return <Button className="self-start" variant="outline" onClick={access.reload}>Try again</Button>;
  if (!access.canAccess(feature)) return <Navigate to="/" replace />;
  return children;
}
