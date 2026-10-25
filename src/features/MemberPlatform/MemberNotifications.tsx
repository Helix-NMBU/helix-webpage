import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@libs/components/ui/sonner";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent } from "@libs/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { useMemberTheme } from "./MemberTheme";

type MemberNotification = { id: string; title: string; description: string; createdAt: string; read: boolean };
type NotificationsContextValue = {
  items: MemberNotification[];
  unread: number;
  notify: (title: string, description: string) => void;
  markAllRead: () => void;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Session-scoped messages. Remount this provider when the verified member changes. */
export function MemberNotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MemberNotification[]>([]);
  const toastIds = useRef<(string | number)[]>([]);
  const { theme } = useMemberTheme();
  const notify = useCallback((title: string, description: string) => {
    const notification = { id: crypto.randomUUID(), title, description, createdAt: new Date().toISOString(), read: false };
    setItems((previous) => [notification, ...previous].slice(0, 50));
    toastIds.current.push(toast.success(title, { description, duration: 5000 }));
  }, []);
  const markAllRead = useCallback(() => setItems((previous) => previous.some((item) => !item.read)
    ? previous.map((item) => ({ ...item, read: true })) : previous), []);
  useEffect(() => () => { toastIds.current.forEach((id) => toast.dismiss(id)); }, []);
  return <NotificationsContext.Provider value={{ items, unread: items.filter((item) => !item.read).length, notify, markAllRead }}>
    {children}
    <Toaster theme={theme} position="top-right" closeButton />
  </NotificationsContext.Provider>;
}

export function useMemberNotifications() { return useContext(NotificationsContext); }

export function MemberNotificationsPage() {
  const notifications = useMemberNotifications();
  const navigate = useNavigate();
  const items = notifications?.items ?? [];
  const markAllRead = notifications?.markAllRead;
  useEffect(() => { markAllRead?.(); }, [markAllRead, items.length]);
  return <section className="mx-auto w-full max-w-4xl py-8" aria-labelledby="member-notifications-title">
    <div className="mb-6 space-y-2"><h1 id="member-notifications-title" className="text-3xl font-medium tracking-tight">Notifications</h1>
      <p className="text-sm text-muted-foreground">Updates from your member platform.</p></div>
    {items.length ? <Card className="gap-0 py-0 shadow-none"><CardContent className="divide-y p-0">
      {items.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1"><h2 className="text-sm font-medium">{item.title}</h2><p className="text-sm text-muted-foreground">{item.description}</p>
          <time className="block text-xs text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
        <Button variant="outline" size="sm" onClick={() => navigate("/profile")}>View profile</Button>
      </article>)}
    </CardContent></Card> : <Empty className="min-h-72 border border-solid"><EmptyHeader><EmptyTitle>You're all caught up</EmptyTitle><EmptyDescription>Your notifications will appear here.</EmptyDescription></EmptyHeader></Empty>}
  </section>;
}
