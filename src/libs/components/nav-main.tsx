"use client";

import { useId, useRef, useState } from "react";
import { IconChevronRight, type TablerIcon } from "@tabler/icons-react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, useSidebar,
} from "@libs/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon?: TablerIcon;
  isActive?: boolean;
  defaultOpen?: boolean;
  badge?: number;
  subMenuClassName?: string;
  items?: { title: string; url: string; icon?: TablerIcon }[];
};

type EntryProps = {
  item: NavItem;
  activeUrl: string;
  onNavigate: (to: string, opener?: HTMLElement) => void;
  disabled: boolean;
  reorder?: {
    start: () => void;
    end: () => void;
    move: (url: string, offset: number) => void;
    busy: boolean;
    hintId: string;
  };
};

function NavEntry({ item, activeUrl, onNavigate, disabled, reorder }: EntryProps) {
  const { state, setOpen } = useSidebar();
  const controls = useDragControls();
  const dragged = useRef(false);
  const reduceMotion = useReducedMotion();
  const buttonProps = reorder ? {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && !reorder.busy && event.button === 0) {
        dragged.current = false;
        controls.start(event);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const offset = event.altKey && event.key === "ArrowUp" ? -1 : event.altKey && event.key === "ArrowDown" ? 1 : 0;
      if (offset && !reorder.busy) { event.preventDefault(); reorder.move(item.url, offset); }
    },
    "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown",
    "aria-describedby": reorder.hintId,
    style: { touchAction: "none" },
  } : {};
  const preventDragClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (dragged.current) { event.preventDefault(); dragged.current = false; return true; }
    return false;
  };
  const navigate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!preventDragClick(event)) onNavigate(item.url, event.currentTarget);
  };
  const content = !item.items ? <>
    <SidebarMenuButton tooltip={item.title} aria-label={item.title} isActive={item.isActive} disabled={disabled} className={reorder ? "active:cursor-grabbing" : undefined} {...buttonProps} onClick={navigate}>
      {item.icon && <item.icon aria-hidden="true" />}<span>{item.title}</span>
    </SidebarMenuButton>
    {Boolean(item.badge) && <SidebarMenuBadge aria-label={`${item.badge} unread notifications`}>{item.badge}</SidebarMenuBadge>}
  </> : <Collapsible key={`${item.title}:${item.isActive ? "active" : "idle"}`} defaultOpen={item.defaultOpen ?? item.isActive} className="group/collapsible">
    <div className="flex min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <CollapsibleTrigger asChild>
        <SidebarMenuButton tooltip={item.title} disabled={disabled} className={`min-w-0 flex-1 bg-transparent hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent ${reorder ? "active:cursor-grabbing" : ""}`} {...buttonProps} onClick={event => {
          if (!preventDragClick(event) && state === "collapsed") setOpen(true);
        }}>
          {item.icon && <item.icon aria-hidden="true" />}<span>{item.title}</span>
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleTrigger asChild>
        <button type="button" aria-label={`Toggle ${item.title} pages`} disabled={disabled} className="flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent group-data-[collapsible=icon]:hidden text-sidebar-foreground/70 outline-none transition-colors hover:bg-transparent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50" onClick={() => { if (state === "collapsed") setOpen(true); }}>
          <IconChevronRight aria-hidden="true" className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent><SidebarMenuSub className={`mr-0 pr-0 ${item.subMenuClassName ?? ""}`}>
      {item.items.map(subItem => <SidebarMenuSubItem key={subItem.title}><SidebarMenuSubButton asChild isActive={activeUrl === subItem.url}>
        <a href={subItem.url} aria-disabled={disabled} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); if (!disabled) onNavigate(subItem.url, event.currentTarget);
        }}>{subItem.icon && <subItem.icon aria-hidden="true" />}<span>{subItem.title}</span></a>
      </SidebarMenuSubButton></SidebarMenuSubItem>)}
    </SidebarMenuSub></CollapsibleContent>
  </Collapsible>;
  if (!reorder) return <SidebarMenuItem>{content}</SidebarMenuItem>;
  return <Reorder.Item
    as="li" value={item.url} dragListener={false} dragControls={controls} dragMomentum={false}
    data-sidebar="menu-item" data-slot="sidebar-menu-item"
    className="group/menu-item relative"
    whileDrag={{ zIndex: 10, scale: reduceMotion ? 1 : 1.02, boxShadow: "0 6px 18px rgb(0 0 0 / 0.15)", backgroundColor: "var(--sidebar-accent)", cursor: "grabbing", borderRadius: "0.375rem" }}
    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
    onDragStart={() => { dragged.current = true; reorder.start(); }}
    onDragEnd={() => { reorder.end(); window.setTimeout(() => { dragged.current = false; }, 0); }}
  >{content}</Reorder.Item>;
}

export function NavMain({ title, collapsible = false, items, activeUrl, onNavigate, disabled, onReorder }: {
  title?: string;
  collapsible?: boolean;
  activeUrl: string;
  onNavigate: (to: string, opener?: HTMLElement) => void;
  disabled: boolean;
  onReorder?: (order: string[]) => Promise<void>;
  items: NavItem[];
}) {
  const hintId = useId();
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const urls = items.map(item => item.url);
  const displayed = draft ? [...draft.filter(url => urls.includes(url)), ...urls.filter(url => !draft.includes(url))] : urls;
  const updateDraft = (next: string[]) => { draftRef.current = next; setDraft(next); };
  const save = async (next: string[]) => {
    if (!onReorder) return;
    setSaving(true);
    try { await onReorder(next); } finally { draftRef.current = null; setDraft(null); setSaving(false); }
  };
  const reorder = onReorder ? {
    start: () => { if (!draftRef.current) updateDraft(urls); },
    end: () => { const next = draftRef.current; if (next && next.join("\n") !== urls.join("\n")) void save(next); else { draftRef.current = null; setDraft(null); } },
    move: (url: string, offset: number) => {
      const next = [...displayed]; const from = next.indexOf(url); const to = from + offset;
      if (from < 0 || to < 0 || to >= next.length) return;
      next.splice(from, 1); next.splice(to, 0, url); updateDraft(next); void save(next);
    },
    busy: saving,
    hintId,
  } : undefined;
  const menu = onReorder ? <Reorder.Group as="ul" axis="y" values={displayed} onReorder={updateDraft} data-slot="sidebar-menu" data-sidebar="menu" className="flex w-full min-w-0 flex-col gap-1">
    {displayed.map(url => { const item = items.find(entry => entry.url === url)!; return <NavEntry key={url} item={item} activeUrl={activeUrl} onNavigate={onNavigate} disabled={disabled} reorder={reorder} />; })}
  </Reorder.Group> : <SidebarMenu>{items.map(item => <NavEntry key={item.url} item={item} activeUrl={activeUrl} onNavigate={onNavigate} disabled={disabled} />)}</SidebarMenu>;
  return <SidebarGroup>{onReorder && <span id={hintId} className="sr-only">Drag to reorder, or press Alt and the up or down arrow key.</span>}{title && collapsible ? <Collapsible defaultOpen className="group/section">
    <CollapsibleTrigger asChild><SidebarGroupLabel asChild><button type="button" disabled={disabled} aria-label={`Toggle ${title}`} className="w-full cursor-pointer"><span>{title}</span><IconChevronRight aria-hidden="true" className="ml-auto size-3 transition-transform group-data-[state=open]/section:rotate-90" /></button></SidebarGroupLabel></CollapsibleTrigger>
    <CollapsibleContent>{menu}</CollapsibleContent>
  </Collapsible> : <>{title && <SidebarGroupLabel>{title}</SidebarGroupLabel>}{menu}</>}</SidebarGroup>;
}
