import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@libs/components/ui/sonner";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useMemberTheme } from "./MemberTheme";

type MemberNotification = { id: string; title: string; description: string; createdAt: string };
type NotificationsContextValue = {
  items: MemberNotification[];
  unread: number;
  notify: (title: string, description: string) => void;
  markRead: (ids: readonly string[]) => void;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Session-scoped messages. Remount this provider when the verified member changes. */
export function MemberNotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MemberNotification[]>([]);
  const toastIds = useRef<(string | number)[]>([]);
  const { theme } = useMemberTheme();
  const notify = useCallback((title: string, description: string) => {
    const notification = { id: crypto.randomUUID(), title, description, createdAt: new Date().toISOString() };
    setItems((previous) => [notification, ...previous].slice(0, 50));
    toastIds.current.push(toast.success(title, { description, duration: 5000 }));
  }, []);
  const markRead = useCallback((ids: readonly string[]) => {
    const selected = new Set(ids);
    setItems((previous) => previous.filter((item) => !selected.has(item.id)));
  }, []);
  useEffect(() => () => { toastIds.current.forEach((id) => toast.dismiss(id)); }, []);
  return <NotificationsContext.Provider value={{ items, unread: items.length, notify, markRead }}>
    {children}
    <Toaster theme={theme} position="top-right" closeButton />
  </NotificationsContext.Provider>;
}

export function useMemberNotifications() { return useContext(NotificationsContext); }

export function MemberNotificationsPage() {
  const notifications = useMemberNotifications();
  const navigate = useNavigate();
  const items = notifications?.items ?? [];
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedIds = items.filter((item) => selection.has(item.id)).map((item) => item.id);
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  function markSelectedRead() {
    if (!selectedIds.length) return;
    notifications?.markRead(selectedIds);
    setSelection(new Set());
    if (selectedIds.length === items.length) heading.current?.focus();
  }
  return <section className="mx-auto w-full max-w-4xl py-8" aria-labelledby="member-notifications-title">
    <div className="mb-6 space-y-2"><h1 ref={heading} tabIndex={-1} id="member-notifications-title" className="text-3xl font-medium tracking-tight">Notifications</h1>
      <p className="text-sm text-muted-foreground">Updates from your member platform.</p></div>
    {items.length ? <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" role="group" aria-label="Notification actions">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelection(allSelected ? new Set() : new Set(items.map((item) => item.id)))}>{allSelected ? "Deselect all" : "Select all"}</Button>
          <span className="text-sm text-muted-foreground" role="status">{selectedIds.length} selected</span>
        </div>
        <Button size="sm" disabled={!selectedIds.length} onClick={markSelectedRead}>Mark as read</Button>
      </div>
      <Card className="gap-0 py-0 shadow-none"><CardContent className="divide-y p-0">
      {items.map((item) => <article key={item.id} className={`flex items-start gap-3 p-5 ${selection.has(item.id) ? "bg-muted/50" : ""}`}>
        <Checkbox className="mt-1 dark:data-[state=checked]:bg-primary" aria-label={`Select notification: ${item.title}`} checked={selection.has(item.id)}
          onCheckedChange={(checked) => setSelection((previous) => {
            const next = new Set(previous);
            if (checked === true) next.add(item.id);
            else next.delete(item.id);
            return next;
          })} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1"><h2 className="text-sm font-medium">{item.title}</h2><p className="text-sm text-muted-foreground">{item.description}</p>
          <time className="block text-xs text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
        <Button variant="outline" size="sm" onClick={() => navigate("/profile")}>View profile</Button>
        </div>
      </article>)}
    </CardContent></Card></> : <Empty className="min-h-72 border border-solid"><EmptyHeader><EmptyTitle>You're all caught up</EmptyTitle><EmptyDescription>Your notifications will appear here.</EmptyDescription></EmptyHeader></Empty>}
  </section>;
}
