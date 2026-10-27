import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconSelector, IconHeartHandshake, IconLogout, IconShieldCheck, IconUsers } from "@tabler/icons-react";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@libs/components/ui/breadcrumb";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Separator } from "@libs/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@libs/components/ui/sidebar";
import { TooltipProvider } from "@libs/components/ui/tooltip";
import { accountInitials } from "../MemberPlatform/account";
import { avatarFallbackStyle } from "@libs/components/avatar-colors";
import { useMemberTheme, type MemberTheme } from "../MemberPlatform/MemberTheme";
import type { SponsorContext } from "./types";

type SponsorPage = "directory" | "requests" | "admin" | "access";
type ShellProps = {
  context: SponsorContext;
  page: SponsorPage;
  signingOut: boolean;
  onSignOut: () => void;
  variant?: "sponsor" | "partner";
  children: ReactNode;
};

const pageTitles: Record<SponsorPage, string> = {
  directory: "Talent Directory", requests: "Collaboration requests",
  admin: "Administration", access: "Workspace access",
};
const roleTitles = { sponsor: "Sponsor", developer: "Developer", admin: "Administrator" };

function AccountMenu({ context, signingOut, onSignOut }: Pick<ShellProps, "context" | "signingOut" | "onSignOut">) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useMemberTheme();
  const [open, setOpen] = useState(false);
  const name = context.organizationName || context.email;
  return <SidebarMenu><SidebarMenuItem>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton size="lg" aria-label="Sponsor account menu" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
          <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg" style={avatarFallbackStyle(context.email)}>{accountInitials(name)}</AvatarFallback></Avatar>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium" title={name}>{name}</span>
            <span className="truncate text-xs">{roleTitles[context.role]}</span>
          </div>
          <IconSelector aria-hidden="true" className="ml-auto size-4" />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent aria-label="Sponsor account" className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-1" side={isMobile ? "top" : "right"} align="end" sideOffset={4}>
        <div className="space-y-1 px-2 py-2 text-sm">
          <p className="break-words font-medium">{name}</p>
          <p className="break-all text-xs text-muted-foreground">{context.email}</p>
          <p className="text-xs text-muted-foreground">{roleTitles[context.role]}</p>
        </div>
        <Separator className="my-1" />
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <Label htmlFor="sponsor-appearance" className="font-normal">Appearance</Label>
          <Select value={theme} onValueChange={(value) => setTheme(value as MemberTheme)}>
            <SelectTrigger id="sponsor-appearance" aria-label="Appearance" className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System</SelectItem></SelectContent>
          </Select>
        </div>
        <Separator className="my-1" />
        <Button variant="ghost" disabled={signingOut} className="w-full justify-start font-normal" onClick={onSignOut}>
          <IconLogout aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </PopoverContent>
    </Popover>
  </SidebarMenuItem></SidebarMenu>;
}

function WorkspaceLayout({ context, page, signingOut, onSignOut, variant = "sponsor", children }: ShellProps) {
  const { setOpenMobile } = useSidebar();
  const partner = variant === "partner";
  const titles = partner ? { ...pageTitles, requests: "Engagement Requests" } : pageTitles;
  const home = partner ? "/directory" : "/sponsor";
  const items = [
    ...(context.directory ? [{ page: "directory", label: titles.directory, to: home, icon: IconUsers }] : []),
    ...(context.portal || context.role === "admin" ? [{ page: "requests", label: titles.requests, to: partner ? "/requests" : "/sponsor/requests", icon: IconHeartHandshake }] : []),
    ...(context.role === "admin" ? [{ page: "admin", label: pageTitles.admin, to: "/sponsor/admin", icon: IconShieldCheck }] : []),
  ];
  function closeOnNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setOpenMobile(false);
  }
  return <>
    <Sidebar collapsible="icon" aria-label="Sponsor workspace">
      <SidebarHeader>
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" tooltip={partner ? "Partner portal" : "Sponsor portal"}>
          <Link to={home} aria-label={`Helix NMBU · ${partner ? "Partner" : "Sponsor"} portal`} onClick={closeOnNavigation}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><img src="/Vector.png" alt="" className="h-5 w-3 object-contain" /></div>
            <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">Helix NMBU</span><span className="truncate text-xs">{partner ? "Partner portal" : "Sponsor portal"}</span></div>
          </Link>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarHeader>
      <SidebarContent><SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent><nav aria-label="Sponsor navigation"><SidebarMenu>
          {items.map(({ page: destination, label, to, icon: Icon }) => <SidebarMenuItem key={destination}>
            <SidebarMenuButton asChild isActive={page === destination} tooltip={label}>
              <Link to={to} aria-current={page === destination ? "page" : undefined} onClick={closeOnNavigation}><Icon aria-hidden="true" /><span>{label}</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu></nav></SidebarGroupContent>
      </SidebarGroup></SidebarContent>
      <SidebarFooter><AccountMenu context={context} signingOut={signingOut} onSignOut={onSignOut} /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className="min-w-0">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Breadcrumb><BreadcrumbList>
          <BreadcrumbItem className="hidden sm:block">{partner ? "Partner portal" : "Sponsor portal"}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem><BreadcrumbPage>{titles[page]}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb>
        {partner && <Button className="ml-auto" variant="outline" size="sm" disabled={signingOut} onClick={onSignOut}>{signingOut ? "Signing out…" : "Sign out"}</Button>}
      </header>
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 p-4 md:p-6">{children}</div>
    </SidebarInset>
  </>;
}

export function SponsorShell(props: ShellProps) {
  return <TooltipProvider><SidebarProvider><WorkspaceLayout {...props} /></SidebarProvider></TooltipProvider>;
}
