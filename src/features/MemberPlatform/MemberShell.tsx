import { useState, type ReactNode, type CSSProperties, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, BriefcaseBusiness, ChevronRight, ContactRound, FileText, FolderKanban, GraduationCap, Home, Languages, Link2, LogOut, Monitor, Moon, Send, ShieldCheck, Sun, UserRound } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger, useSidebar } from "@libs/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { signOutMember } from "../MemberCV/session";
import { useMemberNavigation } from "./MemberNavigation";
import { useMemberTheme, type MemberTheme } from "./MemberTheme";

const profileItems = [
  { key: "contact", title: "Contact and introduction", icon: ContactRound },
  { key: "education", title: "Education", icon: GraduationCap },
  { key: "experience", title: "Experience", icon: BriefcaseBusiness },
  { key: "projects", title: "Projects", icon: FolderKanban },
  { key: "languages", title: "Languages", icon: Languages },
  { key: "links", title: "Links", icon: Link2 },
];
const cvItems = [
  { key: "sharing", title: "Sponsor sharing", icon: ShieldCheck },
  { key: "publication", title: "Preview and publish", icon: Send },
];

function ShellNavigation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const navigation = useMemberNavigation();
  const { theme, setTheme } = useMemberTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = location.pathname === "/profile";
  const active = profile ? location.hash.replace("#mcv-", "") || "contact" : "overview";
  const disabled = busy || Boolean(navigation?.editor?.busy);

  function go(to: string, opener?: HTMLElement) {
    if (disabled) return;
    if (isMobile) setOpenMobile(false);
    if (navigation?.editor) navigation.editor.navigate(to, opener);
    else { navigate(to); window.scrollTo({ top: 0 }); }
  }
  async function logout(opener?: HTMLElement) {
    if (disabled) return;
    if (navigation?.editor) { navigation.editor.signOut(opener); return; }
    setBusy(true);
    setError(null);
    try { await signOutMember(); navigate("/login", { replace: true }); }
    catch { setError("Could not sign out. Please try again."); setBusy(false); }
  }
  const click = (to: string) => (event: MouseEvent<HTMLButtonElement>) => go(to, event.currentTarget);

  return <>
    <aside className="member-icon-rail" aria-label="Main navigation">
      <Button variant="ghost" size="icon" className="member-rail-logo" aria-label="Helix home" onClick={click("/")} disabled={disabled}><img src="/Vector.png" alt="" /></Button>
      <SidebarTrigger className="member-rail-toggle" />
      <nav aria-label="Workspace shortcuts" className="member-rail-links">
        <Button variant="ghost" size="icon" aria-label="Overview" title="Overview" data-active={!profile} onClick={click("/")} disabled={disabled}><Home /></Button>
        <Button variant="ghost" size="icon" aria-label="My profile" title="My profile" data-active={profile && !cvItems.some(item => item.key === active)} onClick={click("/profile#mcv-contact")} disabled={disabled}><UserRound /></Button>
        <Button variant="ghost" size="icon" aria-label="My CV" title="My CV" data-active={profile && cvItems.some(item => item.key === active)} onClick={click("/profile#mcv-publication")} disabled={disabled}><FileText /></Button>
      </nav>
      <div className="member-rail-account">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="member-profile-icon" aria-label="Profile menu"><UserRound /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="portal-root member-account-menu" side="right" align="end" sideOffset={14}>
            <DropdownMenuLabel>Helix member</DropdownMenuLabel>
            <DropdownMenuItem disabled={disabled} onSelect={() => go("/profile#mcv-contact")}><UserRound />My profile</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="member-menu-caption">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as MemberTheme)}>
              <DropdownMenuRadioItem value="light"><Sun />Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon />Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor />System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={disabled} onSelect={() => void logout()}><LogOut />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    <Sidebar variant="floating" collapsible="offcanvas" className="member-detail-sidebar">
      <SidebarHeader className="member-sidebar-heading"><span>Workspace</span><SidebarTrigger /></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Helix NMBU</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton isActive={!profile} onClick={click("/")} disabled={disabled}><Home /><span>Overview</span></SidebarMenuButton></SidebarMenuItem>
            {[{ title: "My profile", icon: UserRound, items: profileItems }, { title: "My CV", icon: BookOpen, items: cvItems }].map(group => <Collapsible key={group.title} defaultOpen className="member-nav-group">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild><SidebarMenuButton><ChevronRight className="member-group-chevron" /><group.icon /><span>{group.title}</span></SidebarMenuButton></CollapsibleTrigger>
                <CollapsibleContent><SidebarMenuSub>{group.items.map(item => <SidebarMenuSubItem key={item.key}>
                  <SidebarMenuSubButton asChild isActive={profile && active === item.key}><button type="button" onClick={click(`/profile#mcv-${item.key}`)} disabled={disabled} aria-current={profile && active === item.key ? "location" : undefined}><item.icon /><span>{item.title}</span></button></SidebarMenuSubButton>
                </SidebarMenuSubItem>)}</SidebarMenuSub></CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>)}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    <div className="member-content-panel">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {children}
    </div>
  </>;
}

export function MemberShell({ children }: { children: ReactNode }) {
  return <SidebarProvider className="member-shell" style={{ "--sidebar-width": "264px" } as CSSProperties}><ShellNavigation>{children}</ShellNavigation></SidebarProvider>;
}
