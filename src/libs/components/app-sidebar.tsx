import * as React from "react";
import { IconBell, IconLayoutKanban, IconHome, IconCheckbox, IconMail, IconUsersGroup } from "@tabler/icons-react";
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
import { previewTeams } from "@/features/MemberPlatform/workspace-preview-data";
import { useRecruitmentAccess } from "@/features/MemberPlatform/RecruitmentAccess";
import { CATEGORY_LABELS, TASK_CATEGORIES } from "@/features/ProjectManagement/types";

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
  const activeTeam = previewTeams.find((team) =>
    location.pathname.startsWith(`/teams/${team.id}/`),
  );
  const projectManagement = location.pathname.startsWith("/project-management");
  const teamItems = [
    ...previewTeams.map((team) => ({
      title: team.title,
      url: `/teams/${team.id}`,
      icon: team.icon,
      isActive: activeTeam?.id === team.id,
      items: team.sections.map((section) => ({
        title: section.title,
        url: `/teams/${team.id}/${section.id}`,
      })),
    })),
    {
      title: "Project Management",
      url: "/project-management/overview",
      icon: IconLayoutKanban,
      isActive: projectManagement,
      items: [{ title: "Overview", url: "/project-management/overview" }, ...TASK_CATEGORIES.map(category => ({ title: CATEGORY_LABELS[category], url: `/project-management/${category}` }))],
    },
    ...(recruitment.access === "allowed" ? [{
      title: "Recruiting",
      url: "/recruiting",
      icon: IconUsersGroup,
      isActive: location.pathname === "/recruiting",
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
              icon: IconHome,
              isActive: location.pathname === "/",
            },
            { title: "Notifications", url: "/notifications", icon: IconBell, isActive: location.pathname === "/notifications", badge: notifications?.unread || undefined },
            { title: "Mail", url: "/mail", icon: IconMail, isActive: location.pathname.startsWith("/mail") },
            { title: "Tasks", url: "/tasks", icon: IconCheckbox, isActive: location.pathname === "/tasks" },
          ]}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
        <NavMain
          key={projectManagement ? "project-management" : activeTeam?.id ?? "teams"}
          title="Teams"
          items={teamItems}
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
