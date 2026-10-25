import * as React from "react";
import { BookOpen, Home, UserRound } from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavMain } from "@libs/components/nav-main";
import { NavUser } from "@libs/components/nav-user";
import { TeamSwitcher } from "@libs/components/team-switcher";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@libs/components/ui/sidebar";

export type MemberSidebarActions = {
  onNavigate: (to: string, opener?: HTMLElement) => void;
  onSignOut: () => void;
  disabled: boolean;
};

export function AppSidebar({ onNavigate, onSignOut, disabled, ...props }: React.ComponentProps<typeof Sidebar> & MemberSidebarActions) {
  const location = useLocation();
  const active = location.pathname === "/profile" ? location.hash.replace("#mcv-", "") || "contact" : "overview";
  const cv = active === "sharing" || active === "publication";
  const items = [
    { title: "Overview", url: "/", icon: Home, isActive: active === "overview" },
    { title: "My profile", url: "/profile", icon: UserRound, isActive: active !== "overview" && !cv, items: [
      { title: "Contact and introduction", url: "/profile#mcv-contact" },
      { title: "Education", url: "/profile#mcv-education" },
      { title: "Experience", url: "/profile#mcv-experience" },
      { title: "Projects", url: "/profile#mcv-projects" },
      { title: "Languages", url: "/profile#mcv-languages" },
      { title: "Links", url: "/profile#mcv-links" },
    ] },
    { title: "My CV", url: "/profile#mcv-publication", icon: BookOpen, isActive: cv, items: [
      { title: "Sponsor sharing", url: "/profile#mcv-sharing" },
      { title: "Preview and publish", url: "/profile#mcv-publication" },
    ] },
  ];
  return <Sidebar collapsible="icon" {...props}>
    <SidebarHeader><TeamSwitcher onNavigate={onNavigate} disabled={disabled} /></SidebarHeader>
    <SidebarContent><NavMain key={active === "overview" ? "overview" : cv ? "cv" : "profile"} items={items} activeUrl={`${location.pathname}${location.hash}`} onNavigate={onNavigate} disabled={disabled} /></SidebarContent>
    <SidebarFooter><NavUser onNavigate={onNavigate} onSignOut={onSignOut} disabled={disabled} /></SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
