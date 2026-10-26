import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { TooltipProvider } from "@libs/components/ui/tooltip";
import CVBankLogin from "../CVBank/Login";
import MemberCV from "../MemberCV/MemberCV";
import {
  clearMemberLanding,
  ensureMemberLanding,
  watchMemberSession,
  type MemberLanding,
} from "../MemberCV/session";
import { MemberThemeProvider } from "./MemberTheme";
import { MemberNavigationProvider } from "./MemberNavigation";
import { MemberShell } from "./MemberShell";
import { MemberNotificationsProvider, MemberNotificationsPage, MemberNotificationToaster, useNotify } from "./MemberNotifications";
import { MemberAccountProvider } from "./MemberAccountContext";
import { MemberFeatureAccessProvider, RequireMemberFeature } from "./MemberFeatureAccess";
import { MemberAccessPage } from "./MemberAccessPage";
import { clearGmailSessionCache } from "./gmail-session-cache";
import { MailWorkspace } from "./MailWorkspace";
import RecruitmentPortal from "../Recruitment/RecruitmentPortal";
import { RecruitmentAccess, RecruitmentAccessProvider } from "./RecruitmentAccess";
import {
  MemberSettingsPreview,
  TeamWorkspacePreview,
  WorkspaceHomePreview,
} from "./WorkspacePreview";
import "@fontsource-variable/geist";
import "./member-platform.css";
import "./member-theme.css";

export function MemberAccess({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [landing, setLanding] = useState<MemberLanding | null>(null);
  const [attempt, setAttempt] = useState(0);
  const notify = useNotify();
  const retryAccess = useCallback(() => {
    clearMemberLanding();
    setLanding(null);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    if (landing?.phase === "unavailable") notify("Sign-in unavailable", "Member sign-in is temporarily unavailable. Please try again.", {
      id: "member-access", variant: "error", href: null, action: { label: "Try again", onClick: retryAccess },
    });
  }, [landing?.phase, notify, retryAccess]);

  useEffect(() => {
    let active = true;
    void ensureMemberLanding()
      .then((next) => {
        if (active) setLanding(next);
      })
      .catch(() => {
        if (active)
          setLanding({
            phase: "unavailable",
            token: null,
            userId: null,
            status: null,
            error: null,
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    // The CV editor manages its own session expiry and unsaved input.
    if (location.pathname === "/profile") return;
    return watchMemberSession(() => {
      clearGmailSessionCache();
      navigate("/login", { replace: true });
    }, undefined, { current: landing?.userId ?? null });
  }, [navigate, location.pathname, landing?.userId]);

  if (!landing)
    return (
      <main className="member-platform-status">
        <LoaderCircle className="size-6 animate-spin" aria-label="Verifying your Helix account" />
      </main>
    );
  if (landing.phase === "signed-out") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }
  if (landing.phase === "unavailable")
    return (
      <main className="member-platform-status">
        <Button
          type="button"
          variant="outline"
          onClick={retryAccess}
        >
          Try again
        </Button>
      </main>
    );
  return (
    <MemberAccountProvider account={landing.account ?? null}>
      <MemberNotificationsProvider key={landing.userId} renderToaster={false}>
        <MemberFeatureAccessProvider userId={landing.userId}>
          <RecruitmentAccessProvider>{children ?? <Outlet />}</RecruitmentAccessProvider>
        </MemberFeatureAccessProvider>
      </MemberNotificationsProvider>
    </MemberAccountProvider>
  );
}

function LegacyMemberRedirect({ to }: { to: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: to, search: location.search, hash: location.hash }}
      replace
    />
  );
}

function TeamFeatureRoute() {
  const { teamId = "" } = useParams();
  return <RequireMemberFeature feature={`team.${teamId}`}><TeamWorkspacePreview /></RequireMemberFeature>;
}

function RecruitmentFeatureRoute() {
  return <RequireMemberFeature feature="recruitment.manage"><RecruitmentAccess><RecruitmentPortal /></RecruitmentAccess></RequireMemberFeature>;
}

function MemberAccessFeatureRoute() {
  return <RequireMemberFeature feature="member_access.manage"><MemberAccessPage /></RequireMemberFeature>;
}

export default function MemberPlatform() {
  return (
    <MemberThemeProvider>
      <TooltipProvider>
        <MemberNavigationProvider>
        <div className="member-platform portal-root">
          <Routes>
            <Route path="/login" element={<CVBankLogin />} />
            <Route path="/" element={<MemberAccess />}>
              <Route element={<MemberShell />}>
                <Route index element={<WorkspaceHomePreview />} />
                <Route path="profile" element={<MemberCV />} />
                <Route path="notifications" element={<MemberNotificationsPage />} />
                <Route path="recruiting" element={<RecruitmentFeatureRoute />} />
                <Route path="admin/access" element={<MemberAccessFeatureRoute />} />
                <Route path="mail" element={<MailWorkspace />} />
                <Route path="settings" element={<MemberSettingsPreview />} />
                <Route path="teams/:teamId/:sectionId" element={<TeamFeatureRoute />} />
                <Route path="recruiting/login" element={<LegacyMemberRedirect to="/recruiting" />} />
                <Route path="recruitment" element={<LegacyMemberRedirect to="/recruiting" />} />
                <Route path="recruitment/*" element={<LegacyMemberRedirect to="/recruiting" />} />
                <Route path="member/login" element={<LegacyMemberRedirect to="/login" />} />
                <Route path="member/profile" element={<LegacyMemberRedirect to="/profile" />} />
                <Route path="cv-bank" element={<LegacyMemberRedirect to="/login" />} />
                <Route path="cv-bank/login" element={<LegacyMemberRedirect to="/login" />} />
                <Route path="cv-bank/profile" element={<LegacyMemberRedirect to="/profile" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          <MemberNotificationToaster />
        </div>
        </MemberNavigationProvider>
      </TooltipProvider>
    </MemberThemeProvider>
  );
}
