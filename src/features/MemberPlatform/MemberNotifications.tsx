import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@libs/components/ui/sonner";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useMemberTheme } from "./MemberTheme";
import { createReviewNotificationsApi, type ReviewNotificationsApi } from "./review-notifications-api";

type NotificationOptions = {
  id?: string;
  variant?: "success" | "info" | "warning" | "error";
  action?: { label: string; onClick: () => void };
  href?: string | null;
};
type MemberNotification = NotificationOptions & { id: string; title: string; description: string; createdAt: string };
type Notify = (title: string, description: string, options?: NotificationOptions) => void;
type NotificationsContextValue = {
  items: MemberNotification[];
  unread: number;
  notify: Notify;
  markRead: (ids: readonly string[]) => void;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function showNotification(title: string, description: string, options: NotificationOptions = {}) {
  return toast[options.variant ?? "success"](title, {
    id: options.id,
    description,
    duration: options.variant === "error" || options.variant === "warning" ? 8000 : 5000,
    action: options.action,
  });
}

export function MemberNotificationToaster() {
  const { theme } = useMemberTheme();
  return <Toaster theme={theme} position="top-right" closeButton />;
}

/** Session-scoped messages. Remount this provider when the verified member changes. */
export function MemberNotificationsProvider({ children, renderToaster = true, reviewApi }: { children: ReactNode; renderToaster?: boolean; reviewApi?: ReviewNotificationsApi }) {
  const [localItems, setLocalItems] = useState<MemberNotification[]>([]);
  const [reviewItems, setReviewItems] = useState<MemberNotification[]>([]);
  const api = useMemo(() => reviewApi ?? createReviewNotificationsApi(), [reviewApi]);
  const active = useRef(false);
  const generation = useRef(0);
  const pendingReads = useRef(new Set<string>());
  const toastIds = useRef(new Set<string | number>());
  const notify = useCallback<Notify>((title, description, options = {}) => {
    const notification = { href: "/profile", ...options, id: options.id ?? crypto.randomUUID(), title, description, createdAt: new Date().toISOString() };
    setLocalItems((previous) => [notification, ...previous.filter((item) => item.id !== notification.id)].slice(0, 50));
    toastIds.current.add(showNotification(title, description, { ...options, id: notification.id }));
  }, []);
  const refreshReviews = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await api.list();
      if (active.current && current === generation.current) setReviewItems(result.filter(item => !pendingReads.current.has(item.id)).map(item => ({...item,id:`review:${item.id}`})));
    } catch {
      if (active.current && current === generation.current) setReviewItems([]);
    }
  }, [api]);
  useEffect(() => {
    active.current = true;
    void refreshReviews();
    const timer = window.setInterval(() => { void refreshReviews(); }, 30000);
    const refresh = () => { if (document.visibilityState !== "hidden") void refreshReviews(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active.current = false; generation.current++; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [refreshReviews]);
  const markRead = useCallback((ids: readonly string[]) => {
    const selected = new Set(ids);
    setLocalItems(previous => previous.filter(item => !selected.has(item.id)));
    const durable = ids.filter(id => id.startsWith("review:")).map(id => id.slice("review:".length));
    if (!durable.length) return;
    durable.forEach(id => pendingReads.current.add(id));
    setReviewItems(previous => previous.filter(item => !selected.has(item.id)));
    const batches = Array.from({length: Math.ceil(durable.length / 100)}, (_, index) => durable.slice(index * 100, (index + 1) * 100));
    void Promise.all(batches.map(batch => api.markRead(batch))).then(() => {
      durable.forEach(id => pendingReads.current.delete(id));
      if (active.current) void refreshReviews();
    }).catch(() => {
      durable.forEach(id => pendingReads.current.delete(id));
      if (active.current) {
        notify("Could not mark notifications as read", "Please try again.", { variant: "error", href: null, action: { label: "Refresh", onClick: () => { void refreshReviews(); } } });
        void refreshReviews();
      }
    });
  }, [api, notify, refreshReviews]);
  const items = [...reviewItems, ...localItems].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => () => { toastIds.current.forEach((id) => toast.dismiss(id)); }, []);
  return <NotificationsContext.Provider value={{ items, unread: items.length, notify, markRead }}>
    {children}
    {renderToaster && <MemberNotificationToaster />}
  </NotificationsContext.Provider>;
}

export function useMemberNotifications() { return useContext(NotificationsContext); }

/** Also supports sign-in and access errors before a member has been verified. */
export function useNotify(): Notify {
  const notifications = useMemberNotifications();
  return notifications?.notify ?? showNotification;
}

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
        {item.action ? <Button variant="outline" size="sm" onClick={item.action.onClick}>{item.action.label}</Button>
          : item.href && <Button variant="outline" size="sm" onClick={() => navigate(item.href!)}>{item.href === "/profile" ? "View profile" : "View"}</Button>}
        </div>
      </article>)}
    </CardContent></Card></> : <Empty className="min-h-72 border border-solid"><EmptyHeader><EmptyTitle>You're all caught up</EmptyTitle><EmptyDescription>Your notifications will appear here.</EmptyDescription></EmptyHeader></Empty>}
  </section>;
}
