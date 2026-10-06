import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../libs/lib/utils";
import { memberLoginDestination } from "../MemberCV/repository";
import "../Portal/portal.css";
import "../MemberCV/member-cv.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const configured = Boolean(googleClientId && supabase);

export default function CVBankLogin() {
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
    <main className="mcv-page portal-root">
      <header className="mcv-header">
        <Link className="mcv-brand" to="/">
          <img src="/Vector.png" alt="Helix" className="mcv-logo" />
          <span>Member portal</span>
        </Link>
        <Link to="/">Back to home</Link>
      </header>
      <div className="mcv-container">
        <section className="mcv-login-card">
          <p className="mcv-eyebrow">Member portal</p>
          <h1>Sign in to build your CV</h1>
          <p className="mcv-login-help">
            Use your @helixnmbu.no Google Workspace account. Your profile starts
            as a private draft. You choose when to publish it to Talent
            Directory.
          </p>
          {configured ? (
            <div className="mcv-google-button" aria-busy={busy}>
              {busy ? (
                <p role="status">Verifying your Helix account…</p>
              ) : (
                <GoogleLogin
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
            <p className="mcv-error" role="alert">
              Member sign-in is not configured yet. Please contact Helix.
            </p>
          )}
          {error && (
            <p className="mcv-error" role="alert">
              {error}
            </p>
          )}
          {import.meta.env.DEV && (
            <p className="mcv-login-help">
              <Link to="/member/profile?demo=1">Open fictional local demo</Link>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
