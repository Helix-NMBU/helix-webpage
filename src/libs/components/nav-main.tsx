"use client";

import { IconChevronRight, type TablerIcon } from "@tabler/icons-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@libs/components/ui/sidebar";

export function NavMain({
  title,
  collapsible = false,
  items,
  activeUrl,
  onNavigate,
  disabled,
}: {
  title?: string;
  collapsible?: boolean;
  activeUrl: string;
  onNavigate: (to: string, opener?: HTMLElement) => void;
  disabled: boolean;
  items: {
    title: string;
    url: string;
    icon?: TablerIcon;
    isActive?: boolean;
    badge?: number;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const { state, setOpen } = useSidebar();
  const menu = (
    <SidebarMenu>
      {items.map((item) =>
        !item.items ? (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              aria-label={item.title}
              isActive={item.isActive}
              disabled={disabled}
              onClick={(event) => onNavigate(item.url, event.currentTarget)}
            >
              {item.icon && <item.icon aria-hidden="true" />}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {Boolean(item.badge) && (
              <SidebarMenuBadge
                aria-label={`${item.badge} unread notifications`}
              >
                {item.badge}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        ) : (
          <Collapsible
            key={item.title}
            asChild
            defaultOpen={item.isActive}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip={item.title}
                  disabled={disabled}
                  onClick={() => {
                    if (state === "collapsed") setOpen(true);
                  }}
                >
                  {item.icon && <item.icon aria-hidden="true" />}
                  <span>{item.title}</span>
                  <IconChevronRight
                    aria-hidden="true"
                    className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={activeUrl === subItem.url}
                      >
                        <a
                          href={subItem.url}
                          aria-disabled={disabled}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            )
                              return;
                            event.preventDefault();
                            if (!disabled)
                              onNavigate(subItem.url, event.currentTarget);
                          }}
                        >
                          <span>{subItem.title}</span>
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ),
      )}
    </SidebarMenu>
  );
  return (
    <SidebarGroup>
      {title && collapsible ? (
        <Collapsible defaultOpen className="group/section">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Toggle ${title}`}
                className="w-full cursor-pointer"
              >
                <span>{title}</span>
                <IconChevronRight
                  aria-hidden="true"
                  className="ml-auto size-3 transition-transform group-data-[state=open]/section:rotate-90"
                />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>{menu}</CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {title && <SidebarGroupLabel>{title}</SidebarGroupLabel>}
          {menu}
        </>
      )}
    </SidebarGroup>
  );
}
