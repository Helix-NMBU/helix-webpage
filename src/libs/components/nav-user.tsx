import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@libs/components/ui/sidebar";
import { useMemberTheme, type MemberTheme } from "@/features/MemberPlatform/MemberTheme";

export function NavUser({ onNavigate, onSignOut, disabled }: { onNavigate: (to: string) => void; onSignOut: () => void; disabled: boolean }) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useMemberTheme();
  return <SidebarMenu><SidebarMenuItem><DropdownMenu>
    <DropdownMenuTrigger asChild>
      <SidebarMenuButton size="lg" aria-label="Profile menu" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
        <Avatar className="h-8 w-8 rounded-lg"><AvatarFallback className="rounded-lg"><UserRound className="size-4" /></AvatarFallback></Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">Helix member</span><span className="truncate text-xs">Member account</span></div>
        <ChevronsUpDown className="ml-auto size-4" />
      </SidebarMenuButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
      <DropdownMenuLabel className="p-0 font-normal"><div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
        <Avatar className="h-8 w-8 rounded-lg"><AvatarFallback className="rounded-lg"><UserRound className="size-4" /></AvatarFallback></Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">Helix member</span><span className="truncate text-xs">Member account</span></div>
      </div></DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled} onSelect={() => onNavigate("/profile#mcv-contact")}><UserRound />My profile</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as MemberTheme)}>
        <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled} onSelect={onSignOut}><LogOut />Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu></SidebarMenuItem></SidebarMenu>;
}
