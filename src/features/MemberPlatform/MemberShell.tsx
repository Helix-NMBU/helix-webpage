import { IconCube } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
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
import { useNotify } from "./MemberNotifications";
import { signOutMember } from "../MemberCV/session";
import { useMemberNavigation } from "./MemberNavigation";
import { previewPage } from "./workspace-preview-data";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { departmentPath } from "../Workspace/types";
import { CATEGORY_LABELS, type TaskCategory } from "../ProjectManagement/types";

function Workspace({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const navigation = useMemberNavigation();
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const profile = location.pathname === "/profile";
  const mail = location.pathname.startsWith("/mail");
  const page = previewPage(location.pathname);
  const projectManagement = location.pathname.startsWith("/project-management");
  const projectSection = location.pathname.split("/")[2];
  const directory = useWorkspace()?.data;
  const department = directory?.departments.find(item => departmentPath(item.name) === location.pathname);
  const project = directory?.projects.find(item => location.pathname === `/projects/${item.id}`);
  const workspaceTitle = location.pathname.startsWith("/members") ? "Members" : location.pathname.startsWith("/projects") ? project?.name ?? "Projects" : location.pathname.startsWith("/departments") ? department?.name ?? "Departments" : null;
  const pageTitle = workspaceTitle ?? (projectManagement ? (projectSection === "overview" ? "Project Overview" : CATEGORY_LABELS[projectSection as TaskCategory] ?? "Project Management") : location.pathname === "/tasks" ? "Tasks" : profile
    ? "Profile"
    : location.pathname === "/settings"
      ? "Settings"
      : location.pathname === "/recruiting"
        ? "Recruiting"
      : location.pathname === "/notifications"
        ? "Notifications"
        : location.pathname.startsWith("/mail")
          ? "Mail"
          : (page?.section.title ?? "Home"));
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
    try {
      await signOutMember();
      navigate("/login", { replace: true });
    } catch {
      notify("Could not sign out", "Please try again.", { variant: "error", href: null });
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
      <SidebarInset className={`member-workspace-content min-w-0 ${mail ? "h-svh min-h-0 overflow-hidden" : ""}`}>
        {mail ? (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            {children ?? <Outlet />}
          </div>
        ) : (
          <>
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <div className="flex min-w-0 items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList className="min-w-0 flex-nowrap">
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
                    {(page || projectManagement) && (
                      <>
                        <BreadcrumbItem className="hidden lg:block">
                          {projectManagement ? "Project Management" : page?.team.title}
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="hidden lg:block" />
                      </>
                    )}
                    {project && <>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <button type="button" disabled={disabled} onClick={event => go("/projects", event.currentTarget)}>Projects</button>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>}
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="flex min-w-0 items-center gap-2">
                        {project && <IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{pageTitle}</span>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {children ?? <Outlet />}
            </div>
          </>
        )}
      </SidebarInset>
    </>
  );
}

export function MemberShell({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider>
      <Workspace>{children}</Workspace>
    </SidebarProvider>
  );
}
