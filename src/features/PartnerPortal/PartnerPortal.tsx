import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider, useNotify } from "../MemberPlatform/MemberNotifications";
import { PartnerDirectoryView } from "./PartnerDirectoryView";
import { partnerRepository } from "./repository";
import { hasPartnerAuthSession, PartnerRequestError, sendPartnerOtp, signOutPartner, verifyPartnerOtp, watchPartnerAuthSession } from "./session";
import type { PartnerSession } from "./types";
import "@fontsource-variable/geist";
import "../MemberPlatform/member-theme.css";
import "./partner-portal.css";

function PartnerPortalContent() {
  const notify = useNotify();
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [resendAt, setResendAt] = useState(0);
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
      if (current === generation.current) { setSession(next); setOtp(""); setOtpEmail(null); }
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
  function accessLost(error: PartnerRequestError) {
    ++generation.current;
    setSession(null);
    if (error.status === 401) setHasSession(false);
    notify("Partner access unavailable", error.message, { id: "partner-access", variant: "error", href: null,
      action: { label: "Try again", onClick: () => { void load(); } } });
  }

  return <div className="member-platform partner-portal min-h-dvh bg-background text-foreground">
    <header className="border-b"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
      {hasSession ? <a href="https://www.helixnmbu.no" className="text-lg font-medium tracking-tight">Helix</a> : <span aria-hidden="true" />}
      {hasSession
        ? <Button variant="outline" disabled={busy} onClick={() => { void signOut(); }}>Sign out</Button>
        : <a href="https://www.helixnmbu.no" className="text-sm underline underline-offset-4">Go back to the webpage</a>}
    </div></header>
    {loading ? <main className="mx-auto max-w-6xl p-6" aria-busy="true"><span className="sr-only">Loading partner portal</span></main>
      : session ? <PartnerDirectoryView key={session.user.email} session={session} onAccessLost={accessLost} />
      : <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div className="space-y-3"><h1 className="text-3xl font-medium tracking-tight">Partner portal</h1>
          <p className="text-sm text-muted-foreground">Meet Helix members and explore the CVs they have chosen to share.</p></div>
        <Card className="shadow-none"><CardHeader><h2 className="font-medium">{otpEmail ? "Enter your sign-in code" : "Sign in with email"}</h2>
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
        <p className="text-sm text-muted-foreground">Partner access is by invitation. For access, <a className="underline underline-offset-4" href="mailto:post@helixnmbu.no">contact Helix</a>.</p>
      </main>}
  </div>;
}

// The parent router mounts this at the partner host root and legacy partner URLs.
export default function PartnerPortal() {
  return <MemberThemeProvider><MemberNotificationsProvider><PartnerPortalContent /></MemberNotificationsProvider></MemberThemeProvider>;
}
