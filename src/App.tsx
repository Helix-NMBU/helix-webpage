import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { DeferredPage } from "@libs/components/DeferredPage";
import { Skeleton } from "@libs/components/ui/skeleton";
import { getApplicationUrl, resolveAppHost } from "@libs/lib/app-hosts";
import { claimNeonAuthSession } from "./features/MemberCV/session";
import { WorkspaceShellSkeleton } from "./features/MemberPlatform/LoadingSkeletons";
import { isMemberPlatform } from "./features/MemberPlatform/routes";

const loadMemberPlatform = () => import("./features/MemberPlatform/MemberPlatform");
const loadPartnerPortal = () => import("./features/PartnerPortal/PartnerPortal");
const loadPublicApp = () => import("./features/PublicApp/PublicApp");

const partnerEntryPaths = new Set(["/sponsor", "/sponsorportal", "/sponsorportal-login"]);

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
  return destination ? null : <DeferredPage renderToaster load={loadPartnerPortal} fallback={<PageSkeleton />} />;
}

function AppContent() {
  const { pathname } = useLocation();
  useEffect(() => { void claimNeonAuthSession(); }, []);
  const host = resolveAppHost(window.location.hostname);

  if (host.application === "partner") {
    return <DeferredPage renderToaster key="partner" load={loadPartnerPortal} fallback={<PageSkeleton />} />;
  }
  if (partnerEntryPaths.has(pathname)) return <PartnerEntry />;
  if (isMemberPlatform()) {
    return <DeferredPage renderToaster key="member" load={loadMemberPlatform} fallback={<WorkspaceShellSkeleton />} />;
  }
  return <DeferredPage renderToaster key="public" load={loadPublicApp} fallback={<PageSkeleton />} />;
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
