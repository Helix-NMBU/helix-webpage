import { SidebarMenu, SidebarMenuItem } from "@libs/components/ui/sidebar";

export function TeamSwitcher() {
  return <SidebarMenu><SidebarMenuItem>
    <div className="flex h-12 w-full items-center gap-2 overflow-hidden p-2 text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-[#002ec4] text-white">
        <img src="/Vector.png" alt="" className="h-5 w-3 object-contain" />
      </div>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-medium">Helix NMBU</span>
        <span className="truncate text-xs">Member platform</span>
      </div>
    </div>
  </SidebarMenuItem></SidebarMenu>;
}
