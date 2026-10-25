import { useEffect, useState, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
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
import {
  MemberSettingsPreview,
  TeamWorkspacePreview,
  WorkspaceHomePreview,
} from "./WorkspacePreview";
import "@fontsource-variable/geist";
import "./member-platform.css";
import "./member-theme.css";

export function MemberAccess({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [landing, setLanding] = useState<MemberLanding | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    return watchMemberSession(() => navigate("/login", { replace: true }));
  }, [navigate, location.pathname]);

  if (!landing)
    return (
      <main className="member-platform-status" role="status">
        Verifying your Helix account…
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
        <Alert variant="destructive">
          <AlertDescription>
            Member sign-in is temporarily unavailable. Please try again.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearMemberLanding();
            setLanding(null);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </main>
    );
  return children;
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

export default function MemberPlatform() {
  return (
    <MemberThemeProvider>
      <MemberNavigationProvider>
        <div className="member-platform portal-root">
          <Routes>
            <Route path="/login" element={<CVBankLogin />} />
            <Route
              path="/"
              element={
                <MemberAccess>
                  <MemberShell>
                    <WorkspaceHomePreview />
                  </MemberShell>
                </MemberAccess>
              }
            />
            <Route
              path="/profile"
              element={
                <MemberAccess>
                  <MemberShell>
                    <MemberCV />
                  </MemberShell>
                </MemberAccess>
              }
            />
            <Route
              path="/settings"
              element={
                <MemberAccess>
                  <MemberShell>
                    <MemberSettingsPreview />
                  </MemberShell>
                </MemberAccess>
              }
            />
            <Route
              path="/teams/:teamId/:sectionId"
              element={
                <MemberAccess>
                  <MemberShell>
                    <TeamWorkspacePreview />
                  </MemberShell>
                </MemberAccess>
              }
            />
            <Route
              path="/member/login"
              element={<LegacyMemberRedirect to="/login" />}
            />
            <Route
              path="/member/profile"
              element={<LegacyMemberRedirect to="/profile" />}
            />
            <Route
              path="/cv-bank"
              element={<LegacyMemberRedirect to="/login" />}
            />
            <Route
              path="/cv-bank/login"
              element={<LegacyMemberRedirect to="/login" />}
            />
            <Route
              path="/cv-bank/profile"
              element={<LegacyMemberRedirect to="/profile" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </MemberNavigationProvider>
    </MemberThemeProvider>
  );
}
