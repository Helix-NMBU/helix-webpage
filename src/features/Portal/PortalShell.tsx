import type { CSSProperties, ReactNode } from "react";
import { FileText, Handshake, Home, LogOut, Mail, Users } from "lucide-react";
import { usePortalAuth } from "./PortalAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@libs/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@libs/components/ui/sidebar";
import "./portal.css";

export type PortalSection = "overview" | "talent" | "work" | "resources";

const partnershipItems = [
  { id: "talent" as const, label: "Talent Directory", icon: Users },
  { id: "work" as const, label: "Work with Helix", icon: Handshake },
];

function organizationInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "SP";
}

export function PortalShell({ section, onSectionChange, children }: { section: PortalSection; onSectionChange: (section: PortalSection) => void; children: ReactNode }) {
  const { context, isPreview, signOut } = usePortalAuth();
  const organizationName = context?.organizationName ?? "Sponsor organization";
  return (
    <SidebarProvider open onOpenChange={() => undefined} className="portal-root portal-shell-root" style={{ "--sidebar-width": "calc(var(--spacing) * 72)" } as CSSProperties}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={section === "overview"} onClick={() => onSectionChange("overview")} tooltip="Overview">
                    <Home />
                    <span>Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Partnership</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {partnershipItems.map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton isActive={section === id} onClick={() => onSectionChange(id)} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={section === "resources"} onClick={() => onSectionChange("resources")} tooltip="Resources">
                    <FileText />
                    <span>Resources</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Contact">
                    <a href="mailto:sponsorships@helixnmbu.no"><Mail /><span>Contact</span></a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" className="cursor-default hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent">
                <div><Avatar className="size-8 rounded-lg border border-sidebar-border bg-sidebar"><AvatarImage className="object-contain p-1" src={context?.organizationLogoUrl ?? undefined} alt={`${organizationName} logo`} /><AvatarFallback className="rounded-lg bg-sidebar text-xs font-semibold text-sidebar-foreground">{organizationInitials(organizationName)}</AvatarFallback></Avatar><div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{organizationName}</span><span className="truncate text-xs opacity-70">{isPreview ? "Preview mode" : `${context?.tier ?? "Sponsor"} sponsor`}</span></div></div>
              </SidebarMenuButton>
              <SidebarMenuAction className="portal-sign-out top-2.5 size-7" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut /><span className="sr-only">Sign out</span></SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden bg-background">
        <div className="portal-content">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
