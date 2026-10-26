import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import SponsorLogin from "./SponsorLogin";
import AdminPanel from "./AdminPanel";
import { DirectoryPanel } from "./DirectoryPanel";
import RequestsPanel from "./RequestsPanel";
import { loadSponsorSession, sponsorRequest, sponsorSignOut, SponsorRequestError } from "./session";
import { isLocalSponsorMode, localSponsorRequest, localSponsorSession, localSponsorSignOut } from "./local";
import type { SponsorContext } from "./types";
import type { SponsorTransport } from "./admin-types";
import { SponsorShell } from "./SponsorShell";
import "@fontsource-variable/geist";
import "../MemberPlatform/member-theme.css";

function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useState<SponsorContext | null>(null);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const login = location.pathname === "/sponsor/login";
  const local = isLocalSponsorMode();
  const request: SponsorTransport = useCallback(async <T,>(action: string, options?: RequestInit & { query?: Record<string, string> }): Promise<T> => {
    try { return await (isLocalSponsorMode() ? localSponsorRequest<T>(action, options) : sponsorRequest<T>(action, options)); }
    catch (failure) {
      if (failure instanceof SponsorRequestError && failure.status === 401) { setContext(null); setEnded(true); }
      else if (failure instanceof SponsorRequestError && failure.status === 403) {
        // A permission failure can mean a request was reassigned. Preserve the
        // unsent form unless a fresh session check also rejects workspace access.
        try {
          const current = await (isLocalSponsorMode() ? localSponsorRequest<SponsorContext>("session") : sponsorRequest<SponsorContext>("session"));
          setContext(current);
        } catch (sessionFailure) {
          if (sessionFailure instanceof SponsorRequestError && [401, 403].includes(sessionFailure.status)) { setContext(null); setEnded(true); }
        }
      }
      throw failure;
    }
  }, []);
  useEffect(() => {
    if (login) return;
    let active = true;
    void (local ? localSponsorSession() : loadSponsorSession()).then((value) => { if (active) { setContext(value); setError(""); } }).catch((failure: unknown) => {
      if (!active) return;
      if (failure instanceof SponsorRequestError && [401, 403].includes(failure.status)) setEnded(true);
      else setError(failure instanceof Error ? failure.message : "Could not load your workspace.");
    });
    return () => { active = false; };
  }, [login, local, attempt]);
  useEffect(() => {
    if (!context) return;
    let active = true;
    const check = () => { void request<SponsorContext>("session").then((value) => { if (active) setContext(value); }).catch(() => { /* The transport ends rejected access; temporary failures preserve the current view. */ }); };
    window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, [context?.authUserId, request]);
  if (login) return <SponsorLogin />;
  if (ended) return <Navigate to="/sponsor/login" replace />;
  if (!context) return <main className="mx-auto max-w-lg px-6 py-20">{error ? <Alert variant="destructive"><AlertDescription>{error}<Button className="mt-3" variant="outline" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Try again</Button></AlertDescription></Alert> : <p role="status">Verifying your sponsor access…</p>}</main>;
  const selected = location.pathname.endsWith("/admin") ? "admin" : location.pathname.endsWith("/requests") ? "requests" : "directory";
  const page = selected === "directory" && !context.directory ? context.portal ? "requests" : context.role === "admin" ? "admin" : "access" : selected;
  return <SponsorShell context={context} page={page} signingOut={signingOut} onSignOut={() => {
      setSigningOut(true);
      void (local ? localSponsorSignOut() : sponsorSignOut()).then(() => { setContext(null); setEnded(true); navigate("/sponsor/login", { replace: true }); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Could not sign out. Try again.")).finally(() => setSigningOut(false));
    }}>
        {error && <Alert className="mb-5" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {page === "admin" ? context.role === "admin" ? <AdminPanel key={context.authUserId} request={request} /> : <p role="alert">Administrator access is required.</p>
          : page === "requests" ? <RequestsPanel key={context.authUserId} context={context} request={request} />
          : page === "directory" ? <DirectoryPanel key={context.authUserId} context={context} request={request} />
          : <p>Your developer sign-in is active. Sponsor records require an assigned organization and current agreement.</p>}
  </SponsorShell>;
}

export default function SponsorWorkspace() { return <MemberThemeProvider><div className="member-platform portal-root min-h-screen bg-background text-foreground"><Workspace /></div></MemberThemeProvider>; }
