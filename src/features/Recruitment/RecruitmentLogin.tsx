import { useEffect, useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import { parseGoogleCredential } from "../CVBank/session";
import { supabase } from "../../libs/lib/utils";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function RecruitmentLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Already signed in as a recruiter? Straight to the portal.
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: isRecruiter } = await supabase.rpc("is_recruiter");
      if (isRecruiter) navigate("/recruitment", { replace: true });
    })();
  }, [navigate]);

  const handleSuccess = async (response: CredentialResponse) => {
    setChecking(true);
    try {
      if (!response.credential) throw new Error("Missing Google credential.");
      if (!supabase) throw new Error("Supabase is not configured.");

      // No domain restriction here — any Google account can sign in, but
      // access is still gated by is_recruiter() below (the members table).
      parseGoogleCredential(response.credential);

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });
      if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);

      const { data: isRecruiter, error: rpcError } = await supabase.rpc("is_recruiter");
      if (rpcError) throw new Error(`Could not verify recruiter access: ${rpcError.message}`);
      if (!isRecruiter) {
        await supabase.auth.signOut();
        throw new Error("This account doesn't have recruiter access. Ask a board member to add you.");
      }

      navigate("/recruitment", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center px-6 min-h-svh"
      style={{ backgroundColor: "#FDFDFD" }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <p className="mb-4 text-xs tracking-widest uppercase" style={{ color: "rgba(0,0,0,0.35)" }}>
          Recruitment portal
        </p>
        <h1
          className="font-medium"
          style={{ fontSize: "clamp(24px, 3vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "#03094A", marginBottom: "8px" }}
        >
          Recruiter sign in
        </h1>
        <p style={{ fontSize: "14px", color: "rgba(3,9,74,0.5)", lineHeight: 1.6, marginBottom: "32px" }}>
          Sign in with Google. Access is limited to the recruitment team.
        </p>

        <div
          style={{
            border: "1.5px solid rgba(3,9,74,0.1)",
            borderRadius: "12px",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
          }}
        >
          {!googleClientId ? (
            <p style={{ fontSize: "14px", color: "#dc2626" }}>
              VITE_GOOGLE_CLIENT_ID is missing. Set it in .env and restart the dev server.
            </p>
          ) : !supabase ? (
            <p style={{ fontSize: "14px", color: "#dc2626" }}>
              Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
            </p>
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError("Google sign-in failed. Please try again.")}
              shape="rectangular"
              size="large"
            />
          )}

          {checking && (
            <p style={{ fontSize: "13px", color: "rgba(3,9,74,0.45)" }}>Checking access…</p>
          )}
          {error && (
            <p style={{ fontSize: "13px", color: "#dc2626", textAlign: "center" }}>{error}</p>
          )}
        </div>

        <Link
          to="/"
          style={{
            display: "inline-block",
            marginTop: "24px",
            fontSize: "13px",
            color: "rgba(3,9,74,0.5)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#002EC4")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(3,9,74,0.5)")}
        >
          ← Back to helixnmbu.no
        </Link>
      </div>
    </div>
  );
}
