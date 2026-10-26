import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider, useNotify } from "../MemberPlatform/MemberNotifications";
import { PartnerDirectoryView } from "./PartnerDirectoryView";
import RequestsPanel from "../SponsorWorkspace/RequestsPanel";
import { SponsorShell } from "../SponsorWorkspace/SponsorShell";
import { partnerRepository } from "./repository";
import { hasPartnerAuthSession, PartnerRequestError, sendPartnerOtp, signOutPartner, verifyPartnerOtp, watchPartnerAuthSession } from "./session";
import type { PartnerSession } from "./types";
import "@fontsource-variable/geist";
import "../MemberPlatform/member-theme.css";
import "./partner-portal.css";

function PartnerPortalContent() {
  const notify = useNotify();
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [organizationId, setOrganizationId] = useState("");
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);

  const load = useCallback(async (knownSession?: boolean) => {
    const current = ++generation.current;
    setSession(null);
    setLoading(true);
    try {
      // Session-atom callbacks already resolved authentication. Fetching it
      // again here would trigger another atom update and a reload loop.
      const authenticated = knownSession ?? await hasPartnerAuthSession();
      if (current !== generation.current) return;
      setHasSession(authenticated);
      if (!authenticated) return;
      const next = await partnerRepository.session();
      if (current === generation.current) {
        setSession(next);
        const eligible = next.organizations.filter((organization) => organization.entitlements.directory || organization.entitlements.requests);
        setOrganizationId((previous) => eligible.some((organization) => organization.id === previous) ? previous : eligible[0]?.id ?? "");
        setOtp(""); setOtpEmail(null);
      }
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof PartnerRequestError && error.status === 401) setHasSession(false);
      notify("Partner access unavailable", error instanceof Error ? error.message : "Could not load the partner portal. Try again.", {
        id: "partner-access", variant: "error", href: null,
        action: { label: "Try again", onClick: () => { void load(); } },
      });
    } finally { if (current === generation.current) setLoading(false); }
  }, [notify]);

  useEffect(() => {
    const stop = watchPartnerAuthSession(() => {
      ++generation.current;
      setSession(null);
      setHasSession(false);
      setLoading(true);
    }, authenticated => { void load(authenticated); });
    return () => { stop(); generation.current += 1; };
  }, [load]);
  useEffect(() => {
    const recheck = () => { void load(); };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [load]);
  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy || Date.now() < resendAt) return;
    setBusy(true);
    try {
      const destination = otpEmail ?? email.trim().toLowerCase();
      await sendPartnerOtp(destination);
      setOtpEmail(destination);
      setOtp("");
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      notify("Check your email", "If your email can sign in, a code will arrive shortly. Partner access requires an approved invitation.", { variant: "info", href: null });
    } catch (error) {
      notify("Could not request code", error instanceof Error ? error.message : "Try again shortly.", { variant: "error", href: null });
    } finally { setBusy(false); }
  }
  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (busy || !otpEmail) return;
    setBusy(true);
    try {
      await verifyPartnerOtp(otpEmail, otp);
      setHasSession(true);
      setOtp("");
      setOtpEmail(null);
      await load();
    } catch (error) {
      setOtp("");
      notify("Code not verified", error instanceof Error ? error.message : "Check the code or request a new one.", { variant: "error", href: null });
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (busy) return;
    ++generation.current;
    setSession(null);
    setBusy(true);
    try {
      await signOutPartner();
      ++generation.current;
      setSession(null);
      setHasSession(false);
      setOtpEmail(null);
      setOtp("");
      setEmail("");
      setResendAt(0);
    } catch (error) {
      notify("Could not sign out", error instanceof Error ? error.message : "Try again.", {
        variant: "error", href: null, action: { label: "Try again", onClick: () => { void signOut(); } },
      });
    } finally { setBusy(false); setLoading(false); }
  }
  const accessLost = useCallback((error: PartnerRequestError) => {
    ++generation.current;
    setSession(null);
    if (error.status === 401) setHasSession(false);
    notify("Partner access unavailable", error.message, { id: "partner-access", variant: "error", href: null,
      action: { label: "Try again", onClick: () => { void load(); } } });
  }, [notify, load]);

  const eligibleOrganizations = useMemo(() => session?.organizations.filter((item) => item.entitlements.directory || item.entitlements.requests) ?? [], [session]);
  const organization = eligibleOrganizations.find((item) => item.id === organizationId);
  const page = location.pathname === "/requests" ? "requests" : "directory";
  const entitledPage = page === "requests" ? organization?.entitlements.requests : organization?.entitlements.directory;
  useEffect(() => {
    if (!session || loading || eligibleOrganizations.length === 0) return;
    if (!organization) { setOrganizationId(eligibleOrganizations[0]?.id ?? ""); return; }
    if (location.pathname === "/" || location.pathname === "/login") {
      navigate(organization.entitlements.directory ? "/directory" : "/requests", { replace: true });
    } else if (location.pathname !== "/directory" && location.pathname !== "/requests") {
      navigate(organization.entitlements.directory ? "/directory" : "/requests", { replace: true });
    } else if (!entitledPage) {
      notify("Page access unavailable", "Your current agreement does not include this page.", { variant: "warning", href: null });
      navigate(page === "directory" && organization.entitlements.requests ? "/requests" : "/directory", { replace: true });
    }
  }, [session, loading, eligibleOrganizations, organization, location.pathname, entitledPage, page, navigate, notify]);

  useEffect(() => {
    if (session && !loading && eligibleOrganizations.length === 0) {
      notify("No current portal access", "Your active agreement does not include the Talent Directory or Engagement Requests. Contact Helix if you think this is incorrect.", { id: "partner-entitlement", variant: "warning", href: null });
    }
  }, [session, loading, eligibleOrganizations.length, notify]);

  const request = useCallback(async <T,>(action: string, options?: RequestInit & { query?: Record<string, string> }): Promise<T> => {
    const orgId = organizationId;
    if (!orgId || !organization?.entitlements.requests) throw new PartnerRequestError("Engagement Requests access is not available for this organization.", 403);
    try {
      if (action === "requests" && (!options?.method || options.method === "GET")) return await partnerRepository.requests(orgId) as T;
      if (action === "request" && (!options?.method || options.method === "GET")) return await partnerRepository.request(orgId, options?.query?.id ?? "") as T;
      const payload = JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>;
      if (action === "requests" && options?.method === "POST") return await partnerRepository.createRequest(orgId, payload) as T;
      if (action === "request" && options?.method === "POST") return await partnerRepository.mutateRequest(orgId, payload) as T;
      throw new PartnerRequestError("This request is not available.", 405);
    } catch (error) {
      if (error instanceof PartnerRequestError && [401, 403].includes(error.status)) {
        if (error.status === 401) accessLost(error);
        else notify("Partner access changed", error.message, { variant: "warning", href: null, action: { label: "Refresh access", onClick: () => { void load(); } } });
      }
      throw error;
    }
  }, [organizationId, organization?.entitlements.requests, notify, load, accessLost]);

  return <div className={`member-platform partner-portal min-h-dvh bg-background text-foreground${hasSession ? "" : " partner-login-scene"}`}>
    {!hasSession && <>
      <div aria-hidden="true" className="partner-login-grid" />
      <a href="https://www.helixnmbu.no" className="partner-login-back">Go back to the webpage</a>
    </>}
    {loading ? <main className="mx-auto max-w-6xl p-6" aria-busy="true"><span className="sr-only">Loading partner portal</span></main>
      : session && eligibleOrganizations.length === 0 ? <main className="mx-auto max-w-lg space-y-4 px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Partner portal access unavailable</h1>
          <p className="text-sm text-muted-foreground">Your active agreement does not include the Talent Directory or Engagement Requests. Contact <a className="underline" href="mailto:post@helixnmbu.no">Helix</a> if you think this is incorrect.</p>
          <Button variant="outline" disabled={busy} onClick={() => { void signOut(); }}>{busy ? "Signing out…" : "Sign out"}</Button>
        </main>
      : session && organization ? <SponsorShell context={{
          authUserId: session.user.email, email: session.user.email, contactId: null, organizationId: organization.id,
          organizationName: organization.name, role: "sponsor", portal: organization.entitlements.requests, directory: organization.entitlements.directory,
        }} page={page} signingOut={busy} onSignOut={() => { void signOut(); }} variant="partner">
          {eligibleOrganizations.length > 1 && <div className="max-w-sm space-y-2"><Label htmlFor="partner-organization">Organization</Label>
            <Select value={organization.id} onValueChange={(nextId) => setOrganizationId(nextId)}><SelectTrigger id="partner-organization"><SelectValue /></SelectTrigger><SelectContent>{eligibleOrganizations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          </div>}
          {page === "requests" && organization.entitlements.requests ? <RequestsPanel key={`${session.user.email}:${organization.id}`} context={{
            authUserId: session.user.email, email: session.user.email, contactId: null, organizationId: organization.id,
            organizationName: organization.name, role: "sponsor", portal: organization.entitlements.requests, directory: organization.entitlements.directory,
          }} request={request} heading="Engagement Requests" /> : organization.entitlements.directory ? <PartnerDirectoryView key={`${session.user.email}:${organization.id}`} session={session} selectedOrganizationId={organization.id} onOrganizationChange={setOrganizationId} onAccessLost={accessLost} /> : <div aria-busy="true" className="min-h-32" />}
        </SponsorShell>
      : <main className="partner-login-main">
        {hasSession && <Button className="fixed right-5 top-5 z-10" variant="outline" disabled={busy} onClick={() => { void signOut(); }}>Sign out</Button>}
        <h1 className="partner-login-title">Partner portal</h1>
        <div className="partner-login-form">
        <Card className="partner-login-card"><CardHeader><h2 className="font-medium">{otpEmail ? "Enter your sign-in code" : "Sign in with email"}</h2>
          <CardDescription>{otpEmail ? `If this address can sign in, enter the code for ${otpEmail}.` : "Use the email address in your partner invitation. We'll send you a one-time code."}</CardDescription>
        </CardHeader><CardContent>
          {otpEmail ? <form className="space-y-5" onSubmit={(event) => { void verifyCode(event); }}>
            <div className="space-y-2"><Label htmlFor="partner-code">Sign-in code</Label><Input autoFocus id="partner-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} /></div>
            <Button className="w-full" type="submit" disabled={busy || otp.length !== 6}>{busy ? "Verifying…" : "Verify and sign in"}</Button>
            <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" disabled={busy || now < resendAt} onClick={() => { void requestCode(); }}>
              {now < resendAt ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s` : "Resend code"}</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOtpEmail(null); setOtp(""); }}>Change email</Button></div>
          </form> : <form className="space-y-5" onSubmit={(event) => { void requestCode(event); }}>
            <div className="space-y-2"><Label htmlFor="partner-email">Email</Label><Input id="partner-email" type="email" autoComplete="email" value={email}
              maxLength={254} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></div>
            <Button className="w-full" type="submit" disabled={busy || now < resendAt}>{busy ? "Requesting code…" : "Send sign-in code"}</Button>
          </form>}
        </CardContent></Card>
        <p className="partner-login-footer">Partner access is by invitation. For access, <a href="mailto:post@helixnmbu.no">contact Helix</a>.</p>
        </div>
      </main>}
  </div>;
}

// The parent router mounts this at the partner host root and legacy partner URLs.
export default function PartnerPortal() {
  return <MemberThemeProvider><MemberNotificationsProvider><PartnerPortalContent /></MemberNotificationsProvider></MemberThemeProvider>;
}
