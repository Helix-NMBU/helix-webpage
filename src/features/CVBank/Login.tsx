import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { memberLoginDestination } from "../MemberCV/repository";
import { useMemberLocale } from "../MemberCV/locale";
import { LanguageSwitcher } from "../MemberCV/LanguageSwitcher";
import { localizeCvError } from "../MemberCV/errors";
import { authClient, ensureMemberLanding, loginAction, memberAuthConfigured, memberPageCopy, startGoogleSignIn, type MemberFrame } from "../MemberCV/session";
import "../Portal/portal.css";
import "../MemberCV/member-cv.css";
import "./login.css";

export default function CVBankLogin() {
  const { locale, setLocale, t } = useMemberLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<MemberFrame>("loading");
  const destination = memberLoginDestination(location.state);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("error")) {
      setFrame("signed-out");
      setError("Google sign-in failed. Please try again.");
      return;
    }
    if (!authClient) {
      setFrame("signed-out");
      return;
    }
    let cancelled = false;
    void ensureMemberLanding().then((landing) => {
      if (cancelled) return;
      const action = loginAction(landing);
      if (action === "profile") {
        navigate(destination, { replace: true });
        return;
      }
      setFrame(action === "form" ? "signed-out" : "loading");
      if (action === "form" && landing.error) setError(landing.error);
    });
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
    <main className="member-login portal-root" lang={locale}>
      <div className="member-login-panel">
        <header className="member-login-header">
          <a className="member-login-brand" href="https://helixnmbu.no" aria-label="Helix NMBU">
            <span className="member-login-mark"><img src="/Vector.png" alt="" /></span>
            <span>HELIX <span className="member-login-nmbu">NMBU</span></span>
          </a>
          <LanguageSwitcher locale={locale} onChange={setLocale} />
        </header>
        <div className="member-login-center">
          <section className="member-login-form" aria-labelledby="member-login-title">
            <div className="member-login-intro">
              <p className="member-login-eyebrow">{t("Member portal")}</p>
              <h1 id="member-login-title">{t(memberPageCopy(frame))}</h1>
              <p>{t("Use your @helixnmbu.no Google Workspace account.")}</p>
            </div>
            {memberAuthConfigured && (frame === "loading" || busy) ? (
              <p role="status">{t("Verifying your Helix account…")}</p>
            ) : memberAuthConfigured ? (
              <Button type="button" variant="outline" className="member-login-google" onClick={() => void signIn()}>
                <img src="/google-g.png" width="20" height="20" alt="" />
                {t("Sign in with Google")}
              </Button>
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
            <p className="member-login-privacy">
              {t("Your profile starts as a private draft. You choose when to publish it to Talent Directory.")}
            </p>
          </section>
        </div>
        <footer className="member-login-footer">
          <a href="https://helixnmbu.no">{t("Back to home")}</a>
        </footer>
      </div>
      <div className="member-login-photo" aria-hidden="true">
        <img src="/birk i bil.webp" alt="" />
        <div className="member-login-photo-brand">
          <img src="/Vector.png" alt="" />
          <span>HELIX NMBU</span>
        </div>
      </div>
    </main>
  );
}
