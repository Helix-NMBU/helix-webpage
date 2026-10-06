import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@libs/components/ui/card";
import { supabase } from "../../libs/lib/utils";
import { memberLoginDestination } from "../MemberCV/repository";
import { useMemberLocale } from "../MemberCV/locale";
import { LanguageSwitcher } from "../MemberCV/LanguageSwitcher";
import { localizeCvError } from "../MemberCV/errors";
import "../Portal/portal.css";
import "../MemberCV/member-cv.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const configured = Boolean(googleClientId && supabase);

export default function CVBankLogin() {
  const { locale, setLocale, t } = useMemberLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const destination = memberLoginDestination(location.state);
  async function handleSuccess(response: CredentialResponse) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!response.credential || !supabase)
        throw new Error("Sign-in is unavailable. Please try again later.");
      const result = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const body = await result.json().catch(() => ({}));
      if (!result.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Sign-in failed. Use your Helix Google Workspace account.",
        );
      if (
        typeof body.access_token !== "string" ||
        typeof body.refresh_token !== "string"
      )
        throw new Error(
          "Could not start your member session. Please try again.",
        );
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessionError)
        throw new Error(
          "Could not start your member session. Please try again.",
        );
      navigate(destination, { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in failed. Please try again.",
      );
    } finally {
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
              {t(
                "Use your @helixnmbu.no Google Workspace account. Your profile starts as a private draft. You choose when to publish it to Talent Directory.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="mcv-login-content">
            {configured ? (
              <div className="mcv-google-button" aria-busy={busy}>
                {busy ? (
                  <p role="status">{t("Verifying your Helix account…")}</p>
                ) : (
                  <GoogleLogin
                    locale={locale === "nb" ? "no" : "en"}
                    onSuccess={(response) => void handleSuccess(response)}
                    onError={() =>
                      setError("Google sign-in failed. Please try again.")
                    }
                    shape="rectangular"
                    size="large"
                  />
                )}
              </div>
            ) : (
              <Alert variant="destructive" className="mcv-error">
                <AlertDescription>
                  {t(
                    "Member sign-in is not configured yet. Please contact Helix.",
                  )}
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mcv-error">
                <AlertDescription>
                  {localizeCvError(error, locale)}
                </AlertDescription>
              </Alert>
            )}
            {import.meta.env.DEV && (
              <Button asChild variant="outline" className="mcv-demo-button">
                <Link to="/member/profile?demo=1">
                  {t("Open fictional local demo")}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
