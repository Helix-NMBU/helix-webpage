import * as React from "react";
import {
  IconChartBar,
  IconBell,
  IconLayoutKanban,
  IconSmartHome,
  IconCube,
  IconUsers,
  IconUserSquare,
  IconCheckbox,
  IconMail,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useLocation } from "react-router-dom";
import { NavMain } from "@libs/components/nav-main";
import { NavUser } from "@libs/components/nav-user";
import { TeamSwitcher } from "@libs/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@libs/components/ui/sidebar";
import { useMemberNotifications, useNotify } from "@/features/MemberPlatform/MemberNotifications";
import { useWorkspace } from "@/features/Workspace/WorkspaceContext";
import { getDepartmentIcon } from "@/features/Workspace/department-icons";
import { departmentPath } from "@/features/Workspace/types";
import { useRecruitmentAccess } from "@/features/MemberPlatform/RecruitmentAccess";
import { useFinanceAccess } from "@/features/MemberPlatform/FinanceAccess";
import { useMemberFeatureAccess } from "@/features/MemberPlatform/MemberFeatureAccess";
import { canViewAgreements, pipelineRepository } from "@/features/PartnerDeals/repository";

export type MemberSidebarActions = {
  onNavigate: (to: string, opener?: HTMLElement) => void;
  onSignOut: () => void;
  disabled: boolean;
};

export function AppSidebar({
  onNavigate,
  onSignOut,
  disabled,
  ...props
}: React.ComponentProps<typeof Sidebar> & MemberSidebarActions) {
  const location = useLocation();
  const notifications = useMemberNotifications();
  const recruitment = useRecruitmentAccess();
  const finance = useFinanceAccess();
  const featureAccess = useMemberFeatureAccess();
  const workspaceSession = useWorkspace();
  const workspace = workspaceSession?.data;
  const notify = useNotify();
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [pipelineAllowed, setPipelineAllowed] = React.useState(false);
  const [agreementsAllowed, setAgreementsAllowed] = React.useState(false);
  React.useEffect(() => {
    let active = true; let version = 0;
    const check = () => {
      const request = ++version;
      void canViewAgreements().then(allowed => { if (active && request === version) setAgreementsAllowed(allowed); }).catch(() => { if (active && request === version) setAgreementsAllowed(false); });
      void pipelineRepository().load().then(result => { if (active && request === version) setPipelineAllowed(result.canManage); }).catch(() => { if (active && request === version) setPipelineAllowed(false); });
    };
    check(); window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, [location.pathname]);
  const spaceItems = [
    ...(agreementsAllowed ? [{ title: "Partner agreements", url: "/partner-deals", icon: IconUsersGroup, isActive: location.pathname === "/partner-deals" }] : []),
    ...(pipelineAllowed ? [{ title: "Sponsor pipeline", url: "/sponsor-pipeline", icon: IconLayoutKanban, isActive: location.pathname === "/sponsor-pipeline" }] : []),
    ...(workspace?.projectAccess
      ? [
          {
            title: "Season Overview",
            url: "/season-overview",
            icon: IconLayoutKanban,
            isActive: location.pathname === "/season-overview",
          },
        ]
      : []),
    ...(featureAccess.canAccess("recruitment.manage") && recruitment.access === "allowed"
      ? [
          {
            title: "Recruiting",
            url: "/recruiting",
            icon: IconUsersGroup,
            isActive: location.pathname === "/recruiting",
          },
        ]
      : []),
    ...(finance.access === "allowed" ? [{
      title: "Financials",
      url: "/finance",
      icon: IconChartBar,
      isActive: location.pathname.startsWith("/finance"),
      defaultOpen: true,
      subMenuClassName: "border-l-0",
      items: [
        { title: "Overview", url: "/finance" },
        { title: "Purchases", url: "/finance/purchases" },
        { title: "Budgets", url: "/finance/budgets" },
        ...(finance.capabilities?.financing ? [{ title: "Financing", url: "/finance/financing" }] : []),
      ],
    }] : []),
    ...(workspace?.departments?.filter((department) => department.memberIds.includes(workspace.viewerId))
      .map((department) => {
        const url = departmentPath(department.name);
        return {
          title: department.name,
          url,
          icon: getDepartmentIcon(department.name),
          isActive: location.pathname === url || location.pathname.startsWith(`${url}/`),
          subMenuClassName: "border-l-0",
          items: [
            { title: "Home", url, icon: IconSmartHome },
            { title: "Tasks", url: `${url}/tasks`, icon: IconCheckbox },
            { title: "Projects", url: `${url}/projects`, icon: IconCube },
          ],
        };
      }) ?? []),
  ];
  const order = workspace?.spaceOrder ?? [];
  spaceItems.sort((a, b) => {
    const ai = order.indexOf(a.url), bi = order.indexOf(b.url);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  async function reorder(urls: string[]) {
    if (!workspaceSession || savingOrder) return;
    // Keep preferences for spaces temporarily unavailable to the member.
    const next = [...urls, ...order.filter(url => !urls.includes(url))];
    setSavingOrder(true);
    try { await workspaceSession.saveSpaceOrder(next); }
    catch { notify("Could not save space order", "Try rearranging your spaces again.", { variant: "error", href: null }); }
    finally { setSavingOrder(false); }
  }
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher onNavigate={onNavigate} disabled={disabled} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={[
            {
              title: "Home",
              url: "/",
              icon: IconSmartHome,
              isActive: location.pathname === "/",
            },
            {
              title: "Notifications",
              url: "/notifications",
              icon: IconBell,
              isActive: location.pathname === "/notifications",
              badge: notifications?.unread || undefined,
            },
            {
              title: "Mail",
              url: "/mail",
              icon: IconMail,
              isActive: location.pathname.startsWith("/mail"),
            },
            {
              title: "Tasks",
              url: "/tasks",
              icon: IconCheckbox,
              isActive: location.pathname === "/tasks" || location.pathname.startsWith("/tasks/"),
            },
          ]}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
        <NavMain
          title="Workspace"
          collapsible
          items={[
            {
              title: "Members",
              url: "/members",
              icon: IconUsers,
              isActive: location.pathname === "/members",
            },
            {
              title: "Projects",
              url: "/projects",
              icon: IconCube,
              isActive: location.pathname.startsWith("/projects"),
            },
            {
              title: "Departments",
              url: "/departments",
              icon: IconUserSquare,
              isActive: location.pathname === "/departments",
            },
          ]}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
        <NavMain
          title="Your spaces"
          collapsible
          onReorder={reorder}
          items={spaceItems}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          disabled={disabled}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
