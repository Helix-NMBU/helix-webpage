import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@libs/lib/utils";
import type { PortalContext } from "./types";
import { previewContext } from "./previewData";

type AuthState = {
  session: Session | null;
  context: PortalContext | null;
  isPreview: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  enterPreview: () => void;
  signOut: () => Promise<void>;
};

const PortalAuthContext = createContext<AuthState | null>(null);

function mapContext(raw: Record<string, unknown>, session: Session): PortalContext {
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    isMember: Boolean(raw.is_member),
    isAdmin: Boolean(raw.is_admin),
    sponsorContactId: typeof raw.sponsor_contact_id === "string" ? raw.sponsor_contact_id : null,
    organizationId: typeof raw.organization_id === "string" ? raw.organization_id : null,
    organizationName: typeof raw.organization_name === "string" ? raw.organization_name : null,
    organizationLogoUrl: typeof raw.organization_logo_url === "string" ? raw.organization_logo_url : null,
    tier: (raw.tier as PortalContext["tier"]) ?? null,
    agreementId: typeof raw.agreement_id === "string" ? raw.agreement_id : null,
    agreementStartsAt: typeof raw.agreement_starts_at === "string" ? raw.agreement_starts_at : null,
    agreementEndsAt: typeof raw.agreement_ends_at === "string" ? raw.agreement_ends_at : null,
    isReturningSponsor: Boolean(raw.is_returning_sponsor),
    hasUpcomingAgreement: Boolean(raw.has_upcoming_agreement),
    talentDirectory: Boolean(raw.talent_directory),
    thesisCredits: typeof raw.thesis_credits === "number" ? raw.thesis_credits : null,
  };
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<PortalContext | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (import.meta.env.DEV && sessionStorage.getItem("helix-sponsor-preview") === "true") {
      setSession(null);
      setContext(previewContext);
      setIsPreview(true);
      setError(null);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setSession(null);
      setContext(null);
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      setSession(null);
      setContext(null);
      setError(sessionError?.message ?? null);
      setLoading(false);
      return;
    }
    setSession(data.session);
    const { data: rawContext, error: contextError } = await supabase.rpc("current_portal_context");
    if (contextError) {
      setContext(null);
      setError(contextError.message);
    } else {
      setContext(mapContext((rawContext ?? {}) as Record<string, unknown>, data.session));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(() => ({
    session,
    context,
    isPreview,
    loading,
    error,
    refresh: load,
    enterPreview: () => {
      if (!import.meta.env.DEV) return;
      sessionStorage.setItem("helix-sponsor-preview", "true");
      setContext(previewContext);
      setIsPreview(true);
      setError(null);
      setLoading(false);
    },
    signOut: async () => {
      sessionStorage.removeItem("helix-sponsor-preview");
      await supabase?.auth.signOut();
      setSession(null);
      setContext(null);
      setIsPreview(false);
    },
  }), [context, error, isPreview, load, loading, session]);

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth() {
  const value = useContext(PortalAuthContext);
  if (!value) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return value;
}

function LoadingScreen() {
  return <div className="portal-state">Checking access…</div>;
}

export function RequireSponsor({ children }: { children: ReactNode }) {
  const { session, context, isPreview, loading } = usePortalAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session && !isPreview) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;
  if (!context?.organizationId || !context.agreementId || context.tier === "Service") {
    return <Navigate to="/portal/access-unavailable" replace />;
  }
  return children;
}

export function RequireMember({ children }: { children: ReactNode }) {
  const { session, context, loading } = usePortalAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/cv-bank/login" replace state={{ from: location.pathname }} />;
  if (!context?.isMember) return <Navigate to="/portal/access-unavailable" replace />;
  return children;
}

export function RequirePortalAdmin({ children }: { children: ReactNode }) {
  const { session, context, loading } = usePortalAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/cv-bank/login" replace />;
  if (!context?.isAdmin) return <Navigate to="/portal/access-unavailable" replace />;
  return children;
}
