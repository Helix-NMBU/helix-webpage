import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { RecruitmentPageSkeleton, TeamPageSkeleton } from "./LoadingSkeletons";
import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";
import { useNotify } from "./MemberNotifications";
import { MEMBER_ACCESS_CHANGED, localMemberHasPartnerSpace } from "./member-access-api";
import type { SponsorPageAccess } from "../Workspace/access";

export type PlatformRoleKey = "project_manager" | "department_lead" | "team_member" | "platform_administrator" | "financials";
export type PlatformRole = { key: PlatformRoleKey; label: string };
export type MemberFeatureState = {
  memberId: string;
  email: string;
  name: string;
  departmentId: string | null;
  roles: PlatformRole[];
  features: string[];
  sponsorPages: SponsorPageAccess;
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

const LOCAL_MEMBER: Omit<MemberFeatureState, "sponsorPages"> = {
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

async function readMemberAccess(userId: string | null): Promise<MemberFeatureState> {
  if (isLocalMemberMode() && localMemberSignedIn()) {
    return {
      ...LOCAL_MEMBER,
      sponsorPages: {
        pipeline: localMemberHasPartnerSpace("pipeline"),
        agreements: localMemberHasPartnerSpace("partner-agreements"),
        financeReviews: false,
      },
    };
  }

  const token = await memberSessionToken({ current: userId });
  const response = await fetch("/api/member-access?action=self", {
    cache: "no-store",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null) as (MemberFeatureState & { error?: unknown }) | null;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Could not load your feature access.");
  if (!body || !Array.isArray(body.roles) || !Array.isArray(body.features)) throw new Error("The access response was incomplete.");
  return {
    ...body,
    sponsorPages: {
      pipeline: body.sponsorPages?.pipeline === true,
      agreements: body.sponsorPages?.agreements === true,
      financeReviews: body.sponsorPages?.financeReviews === true,
    },
  };
}

export function MemberFeatureAccessProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [result, setResult] = useState<{ userId: string | null; member: MemberFeatureState | null } | null>(null);
  const notify = useNotify();
  const request = useRef<{ userId: string | null; pending: Promise<MemberFeatureState> } | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const reload = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let changedDuringRefresh = false;
    setResult(previous => previous?.userId === userId ? previous : null);

    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      if (!request.current || request.current.userId !== userId) {
        request.current = { userId, pending: readMemberAccess(userId) };
      }
      const current = request.current;
      void current.pending.then(member => {
        if (active && !changedDuringRefresh) setResult({ userId, member });
      }).catch(() => {
        if (!active || changedDuringRefresh) return;
        setResult({ userId, member: null });
        notify("Could not load platform access", "Please try again.", {
          id: "member-feature-access", variant: "error", href: null,
          action: { label: "Try again", onClick: reload },
        });
      }).finally(() => {
        if (request.current === current) request.current = null;
        refreshing = false;
        if (active && changedDuringRefresh) {
          changedDuringRefresh = false;
          refresh();
        }
      });
    };

    const onAccessChange = () => {
      // A save may finish after the current request read the old grants.
      if (refreshing) changedDuringRefresh = true;
      else refresh();
    };
    refreshRef.current = refresh;
    window.addEventListener("focus", refresh);
    window.addEventListener(MEMBER_ACCESS_CHANGED, onAccessChange);
    refresh();
    return () => {
      active = false;
      refreshRef.current = () => undefined;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MEMBER_ACCESS_CHANGED, onAccessChange);
    };
  }, [notify, reload, userId]);

  const current = result?.userId === userId ? result : null;
  const member = current?.member ?? null;
  const status: FeatureStatus = current ? (member ? "ready" : "unavailable") : "loading";
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
  if (access.status === "loading") return feature === "recruitment.manage" ? <RecruitmentPageSkeleton label="Loading feature access" /> : <TeamPageSkeleton />;
  if (access.status === "unavailable") return <Button className="self-start" variant="outline" onClick={access.reload}>Try again</Button>;
  if (!access.canAccess(feature)) return <Navigate to="/" replace />;
  return children;
}
