import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { memberLoginDestination } from "../MemberCV/repository";
import { memberPaths } from "../MemberPlatform/routes";
import { memberText, type StaticMemberCopyKey } from "../MemberCV/locale";
import { localizeCvError } from "../MemberCV/errors";
import { authClient, ensureMemberLanding, loginAction, memberAuthConfigured, startGoogleSignIn, type MemberFrame } from "../MemberCV/session";
import "@fontsource-variable/geist";
import "../Portal/portal.css";
import "../MemberCV/member-cv.css";
import "./login.css";

export default function CVBankLogin() {
  const locale = "en";
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
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
          <Link className="member-login-brand" to={memberPaths().home}>
            <span className="member-login-brand-icon"><img src="/Vector.png" alt="" /></span>
            <span>Helix NMBU</span>
          </Link>
        </header>
        <div className="member-login-center">
          <section className="member-login-form" aria-labelledby="member-login-title">
            <div className="member-login-intro">
              <h1 id="member-login-title">{t("Log in to your account")}</h1>
              <p>{t("Sign in with your Helix account.")}</p>
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
          </section>
        </div>
      </div>
      <div className="member-login-brand-panel" aria-hidden="true">
        <img src="/Vector.png" alt="" />
      </div>
    </main>
  );
}
