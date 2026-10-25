import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "@libs/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@libs/components/ui/breadcrumb";
import { Separator } from "@libs/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@libs/components/ui/sidebar";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { signOutMember } from "../MemberCV/session";
import { useMemberNavigation } from "./MemberNavigation";
import { previewPage } from "./workspace-preview-data";

function Workspace({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const navigation = useMemberNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = location.pathname === "/profile";
  const page = previewPage(location.pathname);
  const pageTitle = profile
    ? "Profile"
    : location.pathname === "/settings"
      ? "Settings"
      : location.pathname === "/notifications"
        ? "Notifications"
        : location.pathname.startsWith("/mail")
          ? "Mail"
          : (page?.section.title ?? "Home");
  const disabled = busy || Boolean(navigation?.editor?.busy);

  function go(to: string, opener?: HTMLElement) {
    if (disabled) return;
    if (isMobile) setOpenMobile(false);
    if (navigation?.editor) navigation.editor.navigate(to, opener);
    else {
      navigate(to);
      window.scrollTo({ top: 0 });
    }
  }
  async function logout() {
    if (disabled) return;
    if (navigation?.editor) {
      navigation.editor.signOut();
      return;
    }
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
    <>
      <AppSidebar
        onNavigate={go}
        onSignOut={() => void logout()}
        disabled={disabled}
      />
      <SidebarInset className="member-workspace-content min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={(event) => go("/", event.currentTarget)}
                    >
                      Helix NMBU
                    </button>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                {page && (
                  <>
                    <BreadcrumbItem className="hidden lg:block">
                      {page.team.title}
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden lg:block" />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {children}
        </div>
      </SidebarInset>
    </>
  );
}

export function MemberShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Workspace>{children}</Workspace>
    </SidebarProvider>
  );
}
