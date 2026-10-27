import * as React from "react";
import {
  IconWallet,
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
import { useMemberNotifications } from "@/features/MemberPlatform/MemberNotifications";
import { useWorkspace } from "@/features/Workspace/WorkspaceContext";
import { getDepartmentIcon } from "@/features/Workspace/department-icons";
import { departmentPath } from "@/features/Workspace/types";
import { useRecruitmentAccess } from "@/features/MemberPlatform/RecruitmentAccess";
import { useFinanceAccess } from "@/features/MemberPlatform/FinanceAccess";
import { useMemberFeatureAccess } from "@/features/MemberPlatform/MemberFeatureAccess";

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
  const workspace = useWorkspace()?.data;
  const spaceItems = [
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
    ...(featureAccess.canAccess("member_access.manage") ? [{
      title: "Member access", url: "/admin/access", icon: IconUsers,
      isActive: location.pathname === "/admin/access",
    }] : []),
  ];
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
            ...(finance.access === "denied" ? [] : [{
              title: "Finance",
              url: "/finance",
              icon: IconWallet,
              isActive: location.pathname.startsWith("/finance"),
              defaultOpen: true,
              items: [
                { title: "Overview", url: "/finance" },
                { title: "Purchases", url: "/finance/purchases" },
                { title: "Budgets", url: "/finance/budgets" },
                ...(finance.capabilities?.financing ? [{ title: "Financing", url: "/finance/financing" }] : []),
              ],
            }]),
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
