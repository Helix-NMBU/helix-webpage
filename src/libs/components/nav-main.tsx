"use client";

import { useRef } from "react";
import { IconChevronRight, IconGripVertical, type TablerIcon } from "@tabler/icons-react";

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
  onReorder,
}: {
  title?: string;
  collapsible?: boolean;
  activeUrl: string;
  onNavigate: (to: string, opener?: HTMLElement) => void;
  disabled: boolean;
  onReorder?: (source: string, target: string) => void;
  items: {
    title: string;
    url: string;
    icon?: TablerIcon;
    isActive?: boolean;
    defaultOpen?: boolean;
    badge?: number;
    subMenuClassName?: string;
    items?: {
      title: string;
      url: string;
      icon?: TablerIcon;
    }[];
  }[];
}) {
  const { state, setOpen } = useSidebar();
  const dragging = useRef<string | null>(null);
  const reorderProps = (url: string) => onReorder ? {
    onDragOver: (event: React.DragEvent) => { if (dragging.current) event.preventDefault(); },
    onDrop: (event: React.DragEvent) => { event.preventDefault(); if (dragging.current && dragging.current !== url) onReorder(dragging.current, url); dragging.current = null; },
  } : {};
  const handle = (url: string, title: string, index: number) => onReorder && <button type="button" draggable={!disabled} disabled={disabled} aria-label={`Reorder ${title}`} title="Drag to reorder, or use arrow keys" className="absolute right-0 top-1 flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden" onDragStart={event => { dragging.current = url; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", url); }} onDragEnd={() => { dragging.current = null; }} onKeyDown={event => { const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0; if (offset && items[index + offset]) { event.preventDefault(); onReorder(url, items[index + offset].url); } }}><IconGripVertical aria-hidden="true" className="size-4" /></button>;
  const menu = (
    <SidebarMenu>
      {items.map((item, index) =>
        !item.items ? (
          <SidebarMenuItem key={item.title} {...reorderProps(item.url)}>
            <SidebarMenuButton
              tooltip={item.title}
              className={onReorder ? "pr-8" : undefined}
              aria-label={item.title}
              isActive={item.isActive}
              disabled={disabled}
              onClick={(event) => onNavigate(item.url, event.currentTarget)}
            >
              {item.icon && <item.icon aria-hidden="true" />}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {handle(item.url, item.title, index)}
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
            key={`${item.title}:${item.isActive ? "active" : "idle"}`}
            asChild
            defaultOpen={item.defaultOpen ?? item.isActive}
            className="group/collapsible"
          >
            <SidebarMenuItem {...reorderProps(item.url)}>
              <div className={`flex min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${onReorder ? "pr-7" : ""}`}>
                <SidebarMenuButton
                  tooltip={item.title}
                  disabled={disabled}
                  className="min-w-0 flex-1 bg-transparent hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                  onClick={(event) => onNavigate(item.url, event.currentTarget)}
                >
                  {item.icon && <item.icon aria-hidden="true" />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Toggle ${item.title} pages`}
                    disabled={disabled}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-sidebar-foreground/70 outline-none transition-colors hover:bg-transparent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => {
                      if (state === "collapsed") setOpen(true);
                    }}
                  >
                    <IconChevronRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                  </button>
                </CollapsibleTrigger>
              </div>
              {handle(item.url, item.title, index)}
              <CollapsibleContent>
                <SidebarMenuSub className={`mr-0 pr-0 ${item.subMenuClassName ?? ""}`}>
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
                          {subItem.icon && <subItem.icon aria-hidden="true" />}
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
