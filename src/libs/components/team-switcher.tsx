import { IconSelector } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@libs/components/ui/sidebar";

export function TeamSwitcher({ onNavigate, disabled }: { onNavigate: (to: string) => void; disabled: boolean }) {
  const { isMobile } = useSidebar();
  return <SidebarMenu><SidebarMenuItem>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[#002ec4] text-white">
            <img src="/Vector.png" alt="" className="h-5 w-3 object-contain" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">Helix NMBU</span>
            <span className="truncate text-xs">Member platform</span>
          </div>
          <IconSelector aria-hidden="true" className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspace</DropdownMenuLabel>
        <DropdownMenuItem disabled={disabled} onSelect={() => onNavigate("/")} className="gap-2 p-2">Helix NMBU</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarMenuItem></SidebarMenu>;
}
