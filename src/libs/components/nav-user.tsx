import { useState } from "react";
import { IconChevronDown, IconSelector, IconLogout, IconSettings, IconBrightness, IconUser } from "@tabler/icons-react";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@libs/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import { Separator } from "@libs/components/ui/separator";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@libs/components/ui/sidebar";
import {
  useMemberTheme,
  type MemberTheme,
} from "@/features/MemberPlatform/MemberTheme";
import { useMemberAccount } from "@/features/MemberPlatform/MemberAccountContext";
import { accountInitials } from "@/features/MemberPlatform/account";

export function NavUser({
  onNavigate,
  onSignOut,
  disabled,
}: {
  onNavigate: (to: string, opener?: HTMLElement) => void;
  onSignOut: () => void;
  disabled: boolean;
}) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useMemberTheme();
  const account = useMemberAccount();
  const name = account?.name || account?.email || "Helix member";
  const role = account?.role ?? "Member";
  const initials = accountInitials(name);
  const [open, setOpen] = useState(false);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Profile menu"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium" title={account?.email}>
                  {name}
                </span>
                <span className="truncate text-xs">{role}</span>
              </div>
              <IconSelector aria-hidden="true" className="ml-auto size-4" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Account menu"
            className="w-64 gap-0 rounded-lg p-1"
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={4}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-h-8 w-full justify-start gap-2 px-2 py-1 font-normal"
              disabled={disabled}
              onClick={(event) => {
                setOpen(false);
                onNavigate("/profile", event.currentTarget);
              }}
            >
              <IconUser aria-hidden="true" />
              Profile
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-h-8 w-full justify-start gap-2 px-2 py-1 font-normal"
              disabled={disabled}
              onClick={(event) => {
                setOpen(false);
                onNavigate("/settings", event.currentTarget);
              }}
            >
              <IconSettings aria-hidden="true" />
              Settings
            </Button>
            <div className="flex h-8 items-center justify-between gap-2 rounded-md px-2 text-sm">
              <Label id="member-appearance-label" className="flex items-center gap-2 font-normal">
                <IconBrightness aria-hidden="true" className="size-4 text-muted-foreground" />
                Appearance
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-labelledby="member-appearance-label member-appearance-value"
                    className="shadow-none"
                  >
                    <span id="member-appearance-value">{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
                    <IconChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as MemberTheme)}>
                    <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Separator className="my-0.5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-h-8 w-full justify-start gap-2 px-2 py-1 font-normal"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <IconLogout aria-hidden="true" />
              Sign out
            </Button>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
