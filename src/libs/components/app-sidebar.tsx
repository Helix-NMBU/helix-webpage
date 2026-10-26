import * as React from "react";
import { Bell, Home, Mail, Shield, UsersRound } from "lucide-react";
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
  const featureAccess = useMemberFeatureAccess();
  const visibleTeams = previewTeams.filter((team) => featureAccess.canAccess(`team:${team.id}`));
  const activeTeam = visibleTeams.find((team) =>
    location.pathname.startsWith(`/teams/${team.id}/`),
  );
  const teamItems = [
    ...visibleTeams.map((team) => ({
      title: team.title,
      url: `/teams/${team.id}`,
      icon: team.icon,
      isActive: activeTeam?.id === team.id,
      items: team.sections.map((section) => ({
        title: section.title,
        url: `/teams/${team.id}/${section.id}`,
      })),
    })),
    ...(featureAccess.canAccess("recruitment.manage") && recruitment.access === "allowed" ? [{
      title: "Recruiting",
      url: "/recruiting",
      icon: UsersRound,
      isActive: location.pathname === "/recruiting",
    }] : []),
    ...(featureAccess.canAccess("member_access.manage") ? [{
      title: "Member access", url: "/admin/access", icon: Shield,
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
              icon: Home,
              isActive: location.pathname === "/",
            },
            { title: "Notifications", url: "/notifications", icon: Bell, isActive: location.pathname === "/notifications", badge: notifications?.unread || undefined },
            { title: "Mail", url: "/mail", icon: Mail, isActive: location.pathname.startsWith("/mail") },
          ]}
          activeUrl={location.pathname}
          onNavigate={onNavigate}
          disabled={disabled}
        />
        <NavMain
          key={activeTeam?.id ?? "teams"}
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
