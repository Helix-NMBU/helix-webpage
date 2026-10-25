import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import CVBankLogin from "../CVBank/Login";
import MemberCV from "../MemberCV/MemberCV";
import { clearMemberLanding, ensureMemberLanding, signOutMember, watchMemberSession, type MemberLanding } from "../MemberCV/session";
import "@fontsource-variable/geist";
import "./member-platform.css";

export function MemberAccess({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [landing, setLanding] = useState<MemberLanding | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void ensureMemberLanding().then((next) => { if (active) setLanding(next); }).catch(() => {
      if (active) setLanding({ phase: "unavailable", token: null, userId: null, status: null, error: null });
    });
    return () => { active = false; };
  }, [attempt]);

  if (!landing) return <main className="member-platform-status" role="status">Verifying your Helix account…</main>;
  if (landing.phase === "signed-out") {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  if (landing.phase === "unavailable") return (
    <main className="member-platform-status">
      <Alert variant="destructive"><AlertDescription>Member sign-in is temporarily unavailable. Please try again.</AlertDescription></Alert>
      <Button type="button" variant="outline" onClick={() => { clearMemberLanding(); setLanding(null); setAttempt((value) => value + 1); }}>Try again</Button>
    </main>
  );
  return children;
}

function MemberHome() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => watchMemberSession(() => navigate("/login", { replace: true })), [navigate]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOutMember();
      navigate("/login", { replace: true });
    } catch {
      setError("Could not sign out. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="member-platform-home">
      <div className="member-platform-home-intro">
        <span className="member-platform-logo"><img src="/Vector.png" alt="" /></span>
        <h1>Helix member platform</h1>
        <p>Your internal Helix workspace.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Profile and CV</CardTitle><CardDescription>Manage your member profile and CV.</CardDescription></CardHeader>
        <CardContent><Button asChild><Link to="/profile">Open profile and CV</Link></Button></CardContent>
      </Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void logout()}>Sign out</Button>
    </main>
  );
}

function LegacyMemberRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} replace />;
}

export default function MemberPlatform() {
  return (
    <div className="member-platform portal-root">
      <Routes>
        <Route path="/login" element={<CVBankLogin />} />
        <Route path="/" element={<MemberAccess><MemberHome /></MemberAccess>} />
        <Route path="/profile" element={<MemberAccess><MemberCV /></MemberAccess>} />
        <Route path="/member/login" element={<LegacyMemberRedirect to="/login" />} />
        <Route path="/member/profile" element={<LegacyMemberRedirect to="/profile" />} />
        <Route path="/cv-bank" element={<LegacyMemberRedirect to="/login" />} />
        <Route path="/cv-bank/login" element={<LegacyMemberRedirect to="/login" />} />
        <Route path="/cv-bank/profile" element={<LegacyMemberRedirect to="/profile" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
