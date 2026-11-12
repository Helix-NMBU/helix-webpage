import * as React from "react";
import {
  IconBell,
  IconLayoutKanban,
  IconLayoutDashboard,
  IconContract,
  IconSmartHome,
  IconCube,
  IconUsers,
  IconUserSquare,
  IconCheckbox,
  IconMail,
  IconReceipt,
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
import { financeRoutes } from "@/features/Finance/routes";

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
  const sponsorPages = featureAccess.member?.sponsorPages;
  const businessPath = departmentPath("Business & Marketing");
  const businessDepartment = workspace?.departments?.find(department => departmentPath(department.name) === businessPath);
  const businessItems = [
    ...(sponsorPages?.pipeline ? [{ title: "Pipeline", url: "/sponsor-pipeline", icon: IconLayoutKanban }] : []),
    ...(sponsorPages?.agreements ? [{ title: "Partner agreements", url: "/partner-deals", icon: IconContract }] : []),
  ];
  const businessActive = businessItems.some(item => item.url === location.pathname);
  const managementPath = departmentPath("Management");
  const managementDepartment = workspace?.departments?.find(department => departmentPath(department.name) === managementPath);
  const recruitingAllowed = featureAccess.canAccess("recruitment.manage") && recruitment.access === "allowed";
  const purchasesAllowed = finance.access === "allowed" && (finance.capabilities?.ownRequests || finance.capabilities?.registerActual);
  const managementItems = [
    ...(recruitingAllowed ? [{ title: "Recruiting", url: "/recruiting", icon: IconUsersGroup }] : []),
    ...(purchasesAllowed ? [{ title: "Purchases", url: financeRoutes.purchases, icon: IconReceipt }] : []),
  ];
  const managementActive = managementItems.some(item => item.url === location.pathname);
  const financePath = departmentPath("Finance");
  const financeDepartment = workspace?.departments?.find(department => departmentPath(department.name) === financePath);
  const financeItems = finance.access === "allowed" ? [
    { title: "Financial overview", url: "/finance" },
    { title: "Budgets", url: "/finance/budgets" },
    ...(sponsorPages?.financeReviews ? [{ title: "Sponsor funding reviews", url: "/finance/sponsor-reviews" }] : []),
    ...(finance.capabilities?.financing ? [{ title: "Financing", url: "/finance/financing" }] : []),
  ] : [];
  const financeActive = financeItems.some(item => item.url === location.pathname);
  const spaceItems = [
    ...(workspace?.projectAccess
      ? [
          {
            title: "Season Overview",
            url: "/season-overview",
            icon: IconLayoutDashboard,
            isActive: location.pathname === "/season-overview",
          },
        ]
      : []),
    ...(workspace?.departments?.filter((department) => department.memberIds.includes(workspace.viewerId) || (businessItems.length > 0 && departmentPath(department.name) === businessPath) || (managementItems.length > 0 && departmentPath(department.name) === managementPath) || (financeItems.length > 0 && departmentPath(department.name) === financePath))
      .map((department) => {
        const url = departmentPath(department.name);
        const member = department.memberIds.includes(workspace.viewerId);
        const isBusiness = url === businessPath;
        const isManagement = url === managementPath;
        const isFinance = url === financePath;
        return {
          title: department.name,
          url,
          icon: getDepartmentIcon(department.name),
          isActive: location.pathname === url || location.pathname.startsWith(`${url}/`) || (isBusiness && businessActive) || (isManagement && managementActive) || (isFinance && financeActive),
          subMenuClassName: "border-l-0",
          items: [
            ...(member ? [
              { title: "Home", url, icon: IconSmartHome },
              { title: "Tasks", url: `${url}/tasks`, icon: IconCheckbox },
              { title: "Projects", url: `${url}/projects`, icon: IconCube },
            ] : []),
            ...(isBusiness ? businessItems : []),
            ...(isManagement ? managementItems : []),
            ...(isFinance ? financeItems : []),
          ],
        };
      }) ?? []),
    ...(financeItems.length > 0 && !financeDepartment ? [{ title: "Finance", url: financePath, icon: getDepartmentIcon("Finance"), isActive: financeActive, subMenuClassName: "border-l-0", items: financeItems }] : []),
    ...(managementItems.length > 0 && !managementDepartment ? [{ title: "Management", url: managementPath, icon: getDepartmentIcon("Management"), isActive: managementActive, subMenuClassName: "border-l-0", items: managementItems }] : []),
    ...(businessItems.length > 0 && !businessDepartment ? [{ title: "Business & Marketing", url: businessPath, icon: getDepartmentIcon("Business & Marketing"), isActive: businessActive, subMenuClassName: "border-l-0", items: businessItems }] : []),
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
        <TeamSwitcher />
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
