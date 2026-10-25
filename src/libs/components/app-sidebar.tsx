import * as React from "react";
import { Bell, Home } from "lucide-react";
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
  const activeTeam = previewTeams.find((team) =>
    location.pathname.startsWith(`/teams/${team.id}/`),
  );
  const items = previewTeams.map((team) => ({
    title: team.title,
    url: `/teams/${team.id}`,
    icon: team.icon,
    isActive: activeTeam?.id === team.id,
    items: team.sections.map((section) => ({
      title: section.title,
      url: `/teams/${team.id}/${section.id}`,
    })),
  }));
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
              icon: Home,
              isActive: location.pathname === "/",
            },
            { title: "Notifications", url: "/notifications", icon: Bell, isActive: location.pathname === "/notifications", badge: notifications?.unread || undefined },
          ]}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
        <NavMain
          key={activeTeam?.id ?? "teams"}
          title="Teams"
          items={items}
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
