import { lazy, useCallback, useEffect, useState, type ReactNode } from "react";
import { WorkspaceShellSkeleton } from "./LoadingSkeletons";
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
import { MemberViewportGate } from "./MemberViewportGate";
import { MemberThemeProvider } from "./MemberTheme";
import { MemberNavigationProvider } from "./MemberNavigation";
import { MemberShell } from "./MemberShell";
import { MemberNotificationsProvider, MemberNotificationsPage, MemberNotificationToaster, useNotify } from "./MemberNotifications";
import { MemberAccountProvider } from "./MemberAccountContext";
import { MemberFeatureAccessProvider, RequireMemberFeature } from "./MemberFeatureAccess";
import { clearGmailSessionCache } from "./gmail-session-cache";
import { RecruitmentAccess, RecruitmentAccessProvider } from "./RecruitmentAccess";
import { FinanceAccessProvider } from "./FinanceAccess";
import { WorkspaceProvider } from "../Workspace/WorkspaceContext";
import {
  MemberSettingsPreview,
  TeamWorkspacePreview,
  WorkspaceHomePreview,
} from "./WorkspacePreview";
import "@fontsource-variable/geist";
import "./member-platform.css";
import "./member-theme.css";

const WonDeals = lazy(() => import("../PartnerDeals/WonDeals").then(module => ({ default: module.WonDeals })));
const SponsorPipeline = lazy(() => import("../PartnerDeals/Pipeline"));
const MailWorkspace = lazy(() => import("./MailWorkspace").then(module => ({ default: module.MailWorkspace })));
const RecruitmentPortal = lazy(() => import("../Recruitment/RecruitmentPortal"));
const FinanceEntry = lazy(() => import("../Finance/FinancePages").then(module => ({ default: module.FinanceEntry })));
const MembersPage = lazy(() => import("../Workspace/MembersPage").then(module => ({ default: module.MembersPage })));
const ProjectsPage = lazy(() => import("../Workspace/ProjectsPage").then(module => ({ default: module.ProjectsPage })));
const DepartmentsPage = lazy(() => import("../Workspace/DepartmentsPage").then(module => ({ default: module.DepartmentsPage })));
const DepartmentProjectsPage = lazy(() => import("../Workspace/DepartmentViews").then(module => ({ default: module.DepartmentProjectsPage })));
const DepartmentTasksPage = lazy(() => import("../Workspace/DepartmentViews").then(module => ({ default: module.DepartmentTasksPage })));
const ProjectManagement = lazy(() => import("../ProjectManagement/ProjectManagement"));
const TaskDetailPage = lazy(() => import("../ProjectManagement/TaskDetail"));

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
      <WorkspaceShellSkeleton label="Verifying your Helix account" />
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
        <MemberFeatureAccessProvider key={landing.userId} userId={landing.userId}>
          <RecruitmentAccessProvider key={landing.userId} userId={landing.userId ?? ""}>
            <WorkspaceProvider key={landing.userId}><FinanceAccessProvider key={landing.userId} userId={landing.userId ?? ""}>{children ?? <Outlet />}</FinanceAccessProvider></WorkspaceProvider>
          </RecruitmentAccessProvider>
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

export default function MemberPlatform() {
  return (
    <MemberThemeProvider>
      <MemberViewportGate>
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
                <Route path="sponsor-pipeline" element={<SponsorPipeline />} />
                <Route path="partner-deals" element={<WonDeals />} />
                <Route path="finance" element={<FinanceEntry page="overview" />} />
                <Route path="finance/purchases" element={<FinanceEntry page="purchases" />} />
                <Route path="finance/budgets" element={<FinanceEntry page="budgets" />} />
                <Route path="finance/financing" element={<FinanceEntry page="financing" />} />
                <Route path="teams/finance" element={<LegacyMemberRedirect to="/finance" />} />
                <Route path="teams/finance/budget" element={<LegacyMemberRedirect to="/finance/budgets" />} />
                <Route path="teams/finance/expenses" element={<LegacyMemberRedirect to="/finance/purchases" />} />
                <Route path="teams/finance/*" element={<LegacyMemberRedirect to="/finance" />} />
                <Route path="admin/access" element={<LegacyMemberRedirect to="/members" />} />
                <Route path="mail" element={<MailWorkspace />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="projects/:projectId" element={<ProjectsPage />} />
                <Route path="departments" element={<DepartmentsPage />} />
                <Route path="departments/:departmentId/tasks" element={<DepartmentTasksPage />} />
                <Route path="departments/:departmentId/projects" element={<DepartmentProjectsPage />} />
                <Route path="departments/:departmentId" element={<DepartmentsPage />} />
                <Route path="tasks" element={<ProjectManagement personal />} />
                <Route path="tasks/:taskId" element={<TaskDetailPage />} />
                <Route path="season-overview" element={<ProjectManagement />} />
                <Route path="project-management" element={<LegacyMemberRedirect to="/season-overview" />} />
                <Route path="project-management/*" element={<LegacyMemberRedirect to="/season-overview" />} />
                <Route path="teams/mechanical-production/:sectionId" element={<LegacyMemberRedirect to="/departments/mechanical-and-production" />} />
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
      </MemberViewportGate>
    </MemberThemeProvider>
  );
}
