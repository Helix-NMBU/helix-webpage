import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@libs/lib/utils";
import { usePortalAuth } from "./PortalAuth";
import "./portal.css";

const gridLines = `
  linear-gradient(rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.16) 1px, transparent 1px),
  linear-gradient(rgba(253,253,253,0.06) 1px, transparent 1px),
  linear-gradient(90deg, rgba(253,253,253,0.06) 1px, transparent 1px)
`;

const gridSize = "120px 120px, 120px 120px, 20px 20px, 20px 20px";

export default function SponsorLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, context, isPreview, enterPreview } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/portal";

  useEffect(() => {
    if ((session || isPreview) && context?.organizationId) navigate(from, { replace: true });
  }, [context, from, isPreview, navigate, session]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) { setError("The portal is not configured yet."); return; }
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    });
    setLoading(false);
    if (signInError) setError(signInError.message);
    else setSent(true);
  };

  return (
    <div className="portal-login-page">
      <div
        aria-hidden
        className="portal-login-grid"
        style={{
          backgroundImage: gridLines,
          backgroundSize: gridSize,
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, transparent 75%)",
        }}
      />
      <div className="portal-login-panel">
        <p className="portal-login-title">Sponsor portal</p>
        {sent ? (
          <p className="portal-login-message">Check <strong>{email}</strong> for your sign-in link.</p>
        ) : (
          <form className="portal-login-form" onSubmit={submit}>
            <label htmlFor="sponsor-email" className="sr-only">Work email</label>
            <input
              id="sponsor-email"
              type="email"
              placeholder="your-company@email.no"
              required
              autoComplete="email"
              className="portal-login-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {error && <p className="portal-login-error">{error}</p>}
            <button type="submit" disabled={loading} className="portal-login-submit">
              {loading ? "Sending…" : "Request login info"} <ArrowRight aria-hidden />
            </button>
          </form>
        )}
        {import.meta.env.DEV && (
          <div className="portal-login-foot">
            <button type="button" className="portal-login-muted-link" onClick={enterPreview}>Preview with sample data</button>
          </div>
        )}
      </div>
    </div>
  );
}
