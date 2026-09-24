import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@libs/lib/utils";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
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
      <Card className="portal-login-card gap-0 overflow-hidden py-0">
        <CardHeader className="px-8 pb-5 pt-8">
          <p className="portal-eyebrow">Helix Sponsor Portal</p>
          <CardTitle className="text-[42px] leading-none tracking-[-.045em]">Welcome back.</CardTitle>
          <CardDescription className="pt-2 text-base leading-relaxed">Use the email address Helix invited. We will send you a secure one-time sign-in link.</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {sent ? (
            <Alert><AlertDescription>Check <strong>{email}</strong> for your sign-in link.</AlertDescription></Alert>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-2"><Label htmlFor="sponsor-email">Work email</Label><Input id="sponsor-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button disabled={loading}>{loading ? "Sending…" : "Email me a sign-in link"}</Button>
            </form>
          )}
          {import.meta.env.DEV && <div className="mt-4"><Button className="w-full" variant="outline" type="button" onClick={enterPreview}>Preview with sample data</Button><p className="mt-2 text-center text-xs text-muted-foreground">Local preview only. Nothing is saved or emailed.</p></div>}
          <Button asChild variant="link" className="mt-4 h-auto px-0 text-muted-foreground"><Link to="/">Back to helixnmbu.no</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
