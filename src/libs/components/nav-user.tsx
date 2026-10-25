import { useState } from "react";
import { ChevronsUpDown, LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@libs/components/ui/avatar";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
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
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Account menu"
            className="w-64 rounded-lg p-1"
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={4}
          >
            <div className="flex items-center gap-2 px-2 py-2 text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {role}
                </span>
              </div>
            </div>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              className="w-full justify-start px-2 font-normal"
              disabled={disabled}
              onClick={(event) => {
                setOpen(false);
                onNavigate("/profile", event.currentTarget);
              }}
            >
              <UserRound />
              Profile
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start px-2 font-normal"
              disabled={disabled}
              onClick={(event) => {
                setOpen(false);
                onNavigate("/settings", event.currentTarget);
              }}
            >
              <Settings />
              Settings
            </Button>
            <Separator className="my-1" />
            <div className="flex items-center justify-between gap-3 px-2 py-2">
              <Label htmlFor="member-appearance" className="font-normal">
                Appearance
              </Label>
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value as MemberTheme)}
              >
                <SelectTrigger
                  id="member-appearance"
                  aria-label="Appearance"
                  className="h-8 w-28 shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              className="w-full justify-start px-2 font-normal"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut />
              Sign out
            </Button>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
