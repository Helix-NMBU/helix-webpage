import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Toaster } from "@libs/components/ui/sonner";
import { getApplicationUrl, resolveAppHost } from "@libs/lib/app-hosts";
import { claimNeonAuthSession } from "./features/MemberCV/session";
import { WorkspaceShellSkeleton } from "./features/MemberPlatform/LoadingSkeletons";
import { useNotify } from "./features/MemberPlatform/MemberNotifications";
import { isMemberPlatform } from "./features/MemberPlatform/routes";

const loadMemberPlatform = () => import("./features/MemberPlatform/MemberPlatform");
const loadPartnerPortal = () => import("./features/PartnerPortal/PartnerPortal");
const loadPublicApp = () => import("./features/PublicApp/PublicApp");

const partnerEntryPaths = new Set(["/sponsor", "/sponsorportal", "/sponsorportal-login"]);

function reloadPage() {
  window.location.reload();
}

function AppEntry({ load, fallback }: {
  load: () => Promise<{ default: ComponentType }>;
  fallback: ReactNode;
}) {
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const notify = useNotify();

  // Keep the host entry off the Suspense retry path so account verification
  // can start as soon as the entry and its dependencies finish loading.
  useEffect(() => {
    let active = true;
    void load().then(
      ({ default: Component }) => { if (active) setAppComponent(() => Component); },
      () => { if (active) setLoadFailed(true); },
    );
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!loadFailed) return;
    notify("Could not load this page", "Reload the page to try again.", {
      id: "app-entry", variant: "error", href: null,
      action: { label: "Reload page", onClick: reloadPage },
    });
  }, [loadFailed, notify]);

  if (AppComponent) return <AppComponent />;
  if (loadFailed) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Button variant="outline" onClick={reloadPage}>Reload page</Button>
        <Toaster theme="system" position="top-right" closeButton />
      </main>
    );
  }
  return fallback;
}

function PageSkeleton() {
  return (
    <main role="status" aria-label="Loading page" className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}

function PartnerEntry() {
  const source = window.location.origin;
  const permanent = resolveAppHost(window.location.hostname).environment === "production";
  const destination = permanent ? getApplicationUrl("partner", source, "/login") : null;
  useEffect(() => { if (destination) window.location.replace(destination); }, [destination]);
  return destination ? null : <AppEntry load={loadPartnerPortal} fallback={<PageSkeleton />} />;
}

function AppContent() {
  const { pathname } = useLocation();
  useEffect(() => { void claimNeonAuthSession(); }, []);
  const host = resolveAppHost(window.location.hostname);

  if (host.application === "partner") {
    return <AppEntry key="partner" load={loadPartnerPortal} fallback={<PageSkeleton />} />;
  }
  if (partnerEntryPaths.has(pathname)) return <PartnerEntry />;
  if (isMemberPlatform()) {
    return <AppEntry key="member" load={loadMemberPlatform} fallback={<WorkspaceShellSkeleton />} />;
  }
  return <AppEntry key="public" load={loadPublicApp} fallback={<PageSkeleton />} />;
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
