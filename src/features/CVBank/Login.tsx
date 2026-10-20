import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { memberLoginDestination } from "../MemberCV/repository";
import { useMemberLocale } from "../MemberCV/locale";
import { LanguageSwitcher } from "../MemberCV/LanguageSwitcher";
import { localizeCvError } from "../MemberCV/errors";
import { authClient, claimNeonAuthSession, confirmMemberSession, memberAuthConfigured, startGoogleSignIn } from "../MemberCV/session";
import "../Portal/portal.css";
import "../MemberCV/member-cv.css";

export default function CVBankLogin() {
  const { locale, setLocale, t } = useMemberLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const destination = memberLoginDestination(location.state);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("error")) {
      setError("Google sign-in failed. Please try again.");
      return;
    }
    if (!authClient) return;
    let cancelled = false;
    void (async () => {
      await claimNeonAuthSession();
      let failed = false;
      let signedIn = false;
      try {
        const session = await authClient.getSession();
        failed = Boolean(session.error);
        signedIn = Boolean(session.data?.user);
      } catch {
        failed = true;
      }
      if (cancelled) return;
      if (!signedIn && !failed) return;
      setBusy(true);
      try {
        await confirmMemberSession();
        if (!cancelled) navigate(destination, { replace: true });
      } catch (failure) {
        await authClient.signOut().catch(() => undefined);
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Sign-in failed. Please try again.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [destination, location.search, navigate]);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(location.search);
      await startGoogleSignIn(params.get("redirect") ?? params.get("next") ?? location.state);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Google sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mcv-page portal-root" lang={locale}>
      <header className="mcv-header">
        <Link className="mcv-brand" to="/">
          <img src="/Vector.png" alt="Helix" className="mcv-logo" />
          <span>{t("Member portal")}</span>
        </Link>
        <div className="mcv-header-actions">
          <LanguageSwitcher locale={locale} onChange={setLocale} />
          <Button asChild variant="outline" className="mcv-header-button">
            <Link to="/">{t("Back to home")}</Link>
          </Button>
        </div>
      </header>
      <div className="mcv-container">
        <Card className="mcv-login-card">
          <CardHeader className="mcv-login-header">
            <p className="mcv-eyebrow">{t("Member portal")}</p>
            <CardTitle>
              <h1>{t("Sign in to build your CV")}</h1>
            </CardTitle>
            <CardDescription className="mcv-login-help">
              {t("Use your @helixnmbu.no Google Workspace account. Your profile starts as a private draft. You choose when to publish it to Talent Directory.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mcv-login-content">
            {memberAuthConfigured ? (
              <div className="mcv-google-button" aria-busy={busy}>
                {busy ? <p role="status">{t("Verifying your Helix account…")}</p> : (
                  <Button type="button" onClick={() => void signIn()}>{t("Sign in with Google")}</Button>
                )}
              </div>
            ) : (
              <Alert variant="destructive" className="mcv-error">
                <AlertDescription>{t("Member sign-in is not configured yet. Please contact Helix.")}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mcv-error">
                <AlertDescription>{localizeCvError(error, locale)}</AlertDescription>
              </Alert>
            )}
            {import.meta.env.DEV && (
              <Button asChild variant="outline" className="mcv-demo-button">
                <Link to="/member/profile?demo=1">{t("Open fictional local demo")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
