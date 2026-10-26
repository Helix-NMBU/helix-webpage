import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveX,
  Forward,
  File,
  Inbox,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  PenSquare,
  Reply,
  RefreshCw,
  Mail,
  MailOpen,
  Search,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Skeleton } from "@libs/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenuButton,
  SidebarProvider,
} from "@libs/components/ui/sidebar";
import { memberGmailRequest } from "./gmail-api";
import { useMemberAccount } from "./MemberAccountContext";
import { useNotify } from "./MemberNotifications";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { emailSignatureRequest } from "./email-signature-api";
import type { SignatureSnapshot } from "./email-signature";
import {
  getCachedGmailConnection,
  getCachedGmailList,
  getCachedGmailMessage,
  loadCachedGmailMessage,
  removeCachedGmailMessage,
  setCachedGmailConnection,
  setCachedGmailList,
  setCachedGmailMessage,
  updateCachedGmailUnread,
} from "./gmail-session-cache";

type MailFolder = {
  id: string;
  label: string;
  icon: typeof Inbox;
};

type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
};

type GmailMessage = GmailMessageSummary & {
  body: string;
  htmlBody: string;
  replyTo: string;
};

type MessageAction = "archive" | "trash" | "junk";
type ComposeMode = "new" | "reply" | "forward";

function mailListCacheKey(folder: string, search: string, unreadOnly: boolean): string {
  return `${folder}:${search.trim()}:${unreadOnly}`;
}

const mailFolders: MailFolder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "archive", label: "Archive", icon: ArchiveX },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "trash", label: "Trash", icon: Trash2 },
];

export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 192 192"
      fill="none"
      role="img"
      aria-label="Gmail"
    >
      <path
        fill="url(#gmail-mark-green)"
        d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z"
      />
      <path
        fill="#fc413d"
        d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z"
      />
      <path
        fill="url(#gmail-mark-red)"
        d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z"
      />
      <defs>
        <linearGradient id="gmail-mark-green" x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60d673" />
          <stop offset=".17" stopColor="#42c868" />
          <stop offset=".39" stopColor="#0ebc5f" />
          <stop offset=".62" stopColor="#00a9bb" />
          <stop offset=".86" stopColor="#3c90ff" />
          <stop offset="1" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient id="gmail-mark-red" x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse">
          <stop offset=".08" stopColor="#ff63a0" />
          <stop offset=".3" stopColor="#fc413d" />
          <stop offset=".5" stopColor="#fc413d" />
          <stop offset=".65" stopColor="#fc413d" />
          <stop offset=".72" stopColor="#fc5c30" />
          <stop offset=".86" stopColor="#feb10c" />
          <stop offset=".91" stopColor="#fec700" />
          <stop offset=".96" stopColor="#ffdb0f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MailListSkeleton() {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading messages">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className={`h-3 ${index % 2 === 0 ? "w-28" : "w-36"}`} />
            <Skeleton className="h-2.5 w-12" />
          </div>
          <Skeleton className={`h-3 ${index % 3 === 0 ? "w-44" : "w-32"}`} />
          <Skeleton className="h-2.5 w-11/12" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      ))}
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}

function MailContentSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" role="status" aria-label="Loading message">
      <div className="shrink-0 space-y-4 border-b px-5 py-5 md:px-8">
        <Skeleton className="h-6 w-2/3 max-w-md" />
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 p-6 md:p-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-10/12" />
        <Skeleton className="h-3 w-8/12" />
        <Skeleton className="mt-8 h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-9/12" />
        <Skeleton className="h-3 w-7/12" />
      </div>
      <span className="sr-only">Loading message…</span>
    </div>
  );
}

function ConnectedMailSidebar({
  activeFolder,
  onFolderChange,
  onNewMessage,
  unreadOnly,
  onUnreadOnlyChange,
  onReconnect,
  search,
  onSearchChange,
  messages,
  loading,
  error,
  selectedMessageId,
  onMessageSelect,
  onMessagePrefetch,
  nextPageToken,
  onLoadMore,
  onRefresh,
}: {
  activeFolder: string;
  onFolderChange: (folder: string) => void;
  onNewMessage: () => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (enabled: boolean) => void;
  onReconnect: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  messages: GmailMessageSummary[];
  loading: boolean;
  error: string | null;
  selectedMessageId: string | null;
  onMessageSelect: (messageId: string) => void;
  onMessagePrefetch: (messageId: string) => void;
  nextPageToken: string | null;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  const folder = mailFolders.find((item) => item.id === activeFolder) ?? mailFolders[0];
  const [listScrolling, setListScrolling] = useState(false);
  const scrollIdleTimeout = useRef<number | null>(null);
  const overflowFolders = mailFolders.filter((item) => item.id !== "inbox");

  useEffect(() => () => {
    if (scrollIdleTimeout.current !== null) window.clearTimeout(scrollIdleTimeout.current);
  }, []);

  function handleListScroll() {
    setListScrolling(true);
    if (scrollIdleTimeout.current !== null) window.clearTimeout(scrollIdleTimeout.current);
    scrollIdleTimeout.current = window.setTimeout(() => {
      setListScrolling(false);
      scrollIdleTimeout.current = null;
    }, 650);
  }

  return (
    <SidebarProvider className="h-full !min-h-0 min-h-0 w-80 shrink-0">
      <Sidebar collapsible="none" className="hidden h-full !w-80 shrink-0 border-r md:flex">
        <SidebarHeader className="gap-3.5 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-medium text-foreground">{folder.label}</div>
            <div className="flex items-center gap-1">
              <SidebarMenuButton type="button" size="sm" aria-label="Refresh mail" tooltip={{ children: "Refresh mail", hidden: false }} className="size-8 justify-center p-0" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin" : ""} /></SidebarMenuButton>
              <SidebarMenuButton
                type="button"
                size="sm"
                tooltip={{ children: "New message", hidden: false }}
                aria-label="New message"
                className="size-8 justify-center p-0"
                onClick={onNewMessage}
              >
                <PenSquare />
                <span className="sr-only">New message</span>
              </SidebarMenuButton>
              {mailFolders.filter((item) => item.id === "inbox").map((item) => (
                <SidebarMenuButton
                  key={item.id}
                  type="button"
                  size="sm"
                  tooltip={{ children: item.label, hidden: false }}
                  isActive={activeFolder === item.id}
                  aria-label={item.label}
                  className="size-8 justify-center p-0"
                  onClick={() => onFolderChange(item.id)}
                >
                  <item.icon />
                  <span className="sr-only">{item.label}</span>
                </SidebarMenuButton>
              ))}
              {activeFolder === "inbox" && (
                <SidebarMenuButton
                  type="button"
                  size="sm"
                  tooltip={{ children: unreadOnly ? "Show all inbox messages" : "Show unread only", hidden: false }}
                  aria-label={unreadOnly ? "Show all inbox messages" : "Show unread only"}
                  aria-pressed={unreadOnly}
                  isActive={unreadOnly}
                  className="size-8 justify-center p-0"
                  onClick={() => onUnreadOnlyChange(!unreadOnly)}
                >
                  <ListFilter />
                  <span className="sr-only">{unreadOnly ? "Show all inbox messages" : "Show unread only"}</span>
                </SidebarMenuButton>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    type="button"
                    size="sm"
                    tooltip={{ children: "More mail folders", hidden: false }}
                    aria-label="More mail folders"
                    className="size-8 justify-center p-0"
                  >
                    <MoreHorizontal />
                    <span className="sr-only">More mail folders</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="min-w-48">
                  <DropdownMenuLabel>More folders</DropdownMenuLabel>
                  {overflowFolders.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => onFolderChange(item.id)}>
                      <item.icon />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onReconnect}>Reconnect Gmail</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <SidebarInput
              aria-label="Search mail"
              placeholder="Search mail"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-8"
            />
          </div>
        </SidebarHeader>
        <SidebarContent
          className="mail-inbox-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
          data-scrolling={listScrolling}
          aria-busy={loading}
          onScroll={handleListScroll}
        >
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              {error && messages.length === 0 ? (
                <div className="p-4"><Button variant="outline" size="sm" onClick={onRefresh}>Reload messages</Button></div>
              ) : loading && messages.length === 0 ? (
                <MailListSkeleton />
              ) : messages.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground" aria-live="polite">{activeFolder === "inbox" && unreadOnly ? "No unread messages in your inbox." : "No messages in this folder."}</p>
              ) : (
                <div className="divide-y divide-border">
                  {messages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      aria-label={`${message.from}, ${message.subject}`}
                      aria-current={selectedMessageId === message.id ? "true" : undefined}
                      disabled={loading}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-sidebar-accent ${selectedMessageId === message.id ? "bg-sidebar-accent" : ""}`}
                      onMouseEnter={() => onMessagePrefetch(message.id)}
                      onFocus={() => onMessagePrefetch(message.id)}
                      onClick={() => onMessageSelect(message.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${message.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>{displaySender(message.from)}</span>
                        <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={message.date}>{formatMessageDate(message.date)}</time>
                      </div>
                      <p className={`mt-1 truncate text-sm ${message.unread ? "font-semibold" : "font-medium"}`}>{message.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.snippet}</p>
                    </button>
                  ))}
                </div>
              )}
              {nextPageToken && <div className="p-3"><Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</Button></div>}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

function formatMessageDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}

function formatMessageDetailDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace(/\s*\+\d{4}\s*$/, "");
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displaySender(from: string): string {
  const bracketed = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (bracketed) return bracketed[1].replace(/^['"]|['"]$/g, "").trim() || bracketed[2];
  const bareAddress = from.match(/^\s*(.*?)\s+([^\s<>]+@[^\s<>]+)\s*$/);
  return bareAddress ? bareAddress[1].trim() || bareAddress[2] : from;
}

function inboxMessages(messages: GmailMessageSummary[], activeFolder: string, unreadOnly: boolean): GmailMessageSummary[] {
  return activeFolder === "inbox" && unreadOnly ? messages.filter((message) => message.unread) : messages;
}

const emptyFolderMessage: Record<string, string> = {
  inbox: "No messages in your inbox.",
  starred: "No starred messages.",
  sent: "No sent messages.",
  drafts: "No drafts.",
  archive: "No archived messages.",
  spam: "No messages in Spam.",
  trash: "Your trash is empty.",
};

function MessageComposer({
  mode,
  from,
  to,
  onToChange,
  cc,
  onCcChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  quotedMessage,
  signature,
  signatureLoading,
  sending,
  onSend,
}: {
  mode: ComposeMode;
  from: string;
  to: string;
  onToChange: (value: string) => void;
  cc: string;
  onCcChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  quotedMessage: GmailMessage | null;
  signature: SignatureSnapshot | null;
  signatureLoading: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const label = mode === "new" ? "New message" : mode === "reply" ? "Reply" : "Forward";
  return (
    <form className="flex h-full min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <DialogHeader className="relative flex h-12 shrink-0 justify-center border-b px-5 pr-14">
        <DialogTitle className="text-sm font-medium">{label}</DialogTitle>
        <DialogDescription className="sr-only">{mode === "reply" ? "Write your reply." : mode === "forward" ? "Forward this message to someone." : "Compose and send an email from your Gmail account."}</DialogDescription>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="Close" disabled={sending} className="absolute right-3 top-1/2 -translate-y-1/2"><X /></Button></DialogClose>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 divide-y divide-border">
          <div className="flex min-h-11 items-center gap-3 px-5">
            <Label htmlFor="compose-to" className="w-12 shrink-0 text-sm font-normal text-muted-foreground">To</Label>
            <Input id="compose-to" type="text" value={to} onChange={(event) => onToChange(event.target.value)} placeholder="name@example.com" autoFocus aria-label="To" className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex min-h-11 items-center gap-3 px-5">
            <Label htmlFor="compose-cc" className="w-12 shrink-0 text-sm font-normal text-muted-foreground">Cc</Label>
            <Input id="compose-cc" type="text" value={cc} onChange={(event) => onCcChange(event.target.value)} placeholder="Optional recipients" aria-label="Cc" className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex min-h-11 items-center gap-3 px-5">
            <Label htmlFor="compose-subject" className="w-12 shrink-0 text-sm font-normal text-muted-foreground">Subject</Label>
            <Input id="compose-subject" value={subject} onChange={(event) => onSubjectChange(event.target.value)} aria-label="Subject" className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex min-h-11 items-center gap-3 px-5">
            <Label htmlFor="compose-from" className="w-12 shrink-0 text-sm font-normal text-muted-foreground">From</Label>
            <Input id="compose-from" value={from} readOnly disabled aria-label="From" className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Label htmlFor="compose-body" className="sr-only">Message</Label>
          <Textarea id="compose-body" className="min-h-40 w-full resize-y rounded-none border-0 px-5 py-5 leading-6 shadow-none focus-visible:ring-0" value={body} onChange={(event) => onBodyChange(event.target.value)} aria-label="Message" />
          {signatureLoading ? <div className="px-5 py-3" role="status" aria-label="Loading signature"><Skeleton className="h-20 w-52" /></div> : signature?.signature.html ? <div className="flex h-48 min-h-0" aria-label="Your email signature"><EmailHtmlFrame html={signature.signature.html} plainText={signature.signature.text} /></div> : null}
          {quotedMessage && <section aria-label="Original message" className="border-t">
            <div className="space-y-1 px-5 py-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">{mode === "reply" ? `On ${formatMessageDetailDate(quotedMessage.date)}, ${quotedMessage.from} wrote:` : "Forwarded message"}</p>{mode === "forward" && <><p>From: {quotedMessage.from}</p><p>Date: {formatMessageDetailDate(quotedMessage.date)}</p><p>Subject: {quotedMessage.subject}</p></>}</div>
            <div className="flex h-96 min-h-0 border-l-2 border-border ml-5"><EmailHtmlFrame html={quotedMessage.htmlBody} plainText={quotedMessage.body} /></div>
          </section>}
        </div>
      </div>
      <DialogFooter className="shrink-0 border-t px-5 py-3">
        <Button type="submit" size="icon" aria-label="Send" title="Send" disabled={sending || signatureLoading || !signature || !to.trim() || !subject.trim()}>
          {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MailWorkspace({ connected: connectedOverride }: { connected?: boolean }) {
  const accountEmail = useMemberAccount()?.email ?? "";
  const notify = useNotify();
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [messages, setMessages] = useState<GmailMessageSummary[]>(() => getCachedGmailList(accountEmail, mailListCacheKey("inbox", "", false))?.messages ?? []);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(() => getCachedGmailList(accountEmail, mailListCacheKey("inbox", "", false))?.nextPageToken ?? null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"checking" | "connected" | "disconnected" | "unavailable">(() => {
    if (connectedOverride !== undefined) return connectedOverride ? "connected" : "disconnected";
    const justConnected = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("gmail") === "connected";
    const cachedConnection = getCachedGmailConnection(accountEmail);
    return justConnected ? "connected" : cachedConnection === null ? "checking" : cachedConnection ? "connected" : "disconnected";
  });
  const [connecting, setConnecting] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [quotedMessage, setQuotedMessage] = useState<GmailMessage | null>(null);
  const [signature, setSignature] = useState<SignatureSnapshot | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<MessageAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const boundUserId = useRef<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const readRequests = useRef(new Set<string>());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [readPending, setReadPending] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  const refreshMail = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener("focus", refreshMail);
    return () => window.removeEventListener("focus", refreshMail);
  }, [refreshMail]);

  const loadSignature = useCallback(async () => {
    setSignatureLoading(true);
    setSignature(null);
    try { setSignature(await emailSignatureRequest(boundUserId)); }
    catch (error) {
      notify("Could not load signature", error instanceof Error ? error.message : "Please try again.", { id: "composer-signature", variant: "error", href: null, action: { label: "Try again", onClick: () => void loadSignature() } });
    } finally { setSignatureLoading(false); }
  }, [notify]);

  useEffect(() => {
    if (connectedOverride !== undefined) return;
    let active = true;
    void (async () => {
      try {
        const response = await memberGmailRequest("/api/gmail-status", boundUserId);
        const body = await response.json().catch(() => null) as { connected?: unknown } | null;
        if (active) {
          if (response.ok && typeof body?.connected === "boolean") {
            setCachedGmailConnection(accountEmail, body.connected);
            setConnectionState(body.connected ? "connected" : "disconnected");
          } else if (getCachedGmailConnection(accountEmail) === null) {
            setConnectionState("unavailable");
          }
        }
      } catch {
        if (active && getCachedGmailConnection(accountEmail) === null) setConnectionState("unavailable");
      }
    })();
    return () => { active = false; };
  }, [accountEmail, connectedOverride]);

  async function connectGmail() {
    setConnecting(true);
    try {
      const response = await memberGmailRequest("/api/gmail-connect", boundUserId, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => null) as { error?: unknown; url?: unknown } | null;
      if (!response.ok || typeof body?.url !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "Gmail connection is temporarily unavailable. Try again.");
      }
      window.location.assign(body.url);
    } catch (error) {
      setConnecting(false);
      notify("Could not connect Gmail", error instanceof Error ? error.message : "Gmail connection is temporarily unavailable. Try again.", { variant: "error", href: null });
    }
  }

  const connected = connectedOverride ?? connectionState === "connected";
  const folder = mailFolders.find((item) => item.id === activeFolder) ?? mailFolders[0];

  useEffect(() => {
    if (!connected || connectedOverride !== undefined) return;
    const requestId = ++listRequestId.current;
    const queryKey = mailListCacheKey(activeFolder, search, unreadOnly);
    const cachedList = getCachedGmailList(accountEmail, queryKey);
    const cachedMessages = inboxMessages(cachedList?.messages ?? [], activeFolder, unreadOnly);
    setMessages(cachedMessages);
    setNextPageToken(cachedList?.nextPageToken ?? null);
    setListError(null);
    setListLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ action: "messages", folder: activeFolder });
          if (search.trim()) params.set("q", search.trim());
          if (activeFolder === "inbox" && unreadOnly) params.set("unreadOnly", "true");
          const response = await memberGmailRequest(`/api/gmail?${params}`, boundUserId);
          const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
          if (requestId !== listRequestId.current) return;
          if (!response.ok) throw new Error(body?.error || "Could not load Gmail messages.");
          const loadedMessages = inboxMessages(Array.isArray(body?.messages) ? body.messages : [], activeFolder, unreadOnly);
          for (const message of loadedMessages) {
            const detail = getCachedGmailMessage(accountEmail, message.id);
            if (detail) setCachedGmailMessage(accountEmail, { ...detail, ...message });
          }
          setSelectedMessage((current) => {
            const summary = loadedMessages.find((message) => message.id === current?.id);
            return current && summary ? { ...current, ...summary } : current;
          });
          setCachedGmailList(accountEmail, queryKey, { messages: loadedMessages, nextPageToken: body?.nextPageToken ?? null });
          setMessages(loadedMessages);
          setNextPageToken(body?.nextPageToken ?? null);
        } catch (error) {
          if (requestId === listRequestId.current) {
            const message = error instanceof Error ? error.message : "Could not load Gmail messages.";
            setListError(message);
            notify("Could not load mail", message, { id: "mail-list", variant: "error", href: null, action: { label: "Try again", onClick: refreshMail } });
            if (!cachedList) {
              setMessages([]);
              setNextPageToken(null);
              setSelectedMessageId(null);
              setSelectedMessage(null);
            }
          }
        } finally {
          if (requestId === listRequestId.current) setListLoading(false);
        }
      })();
    }, search ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      if (requestId === listRequestId.current) listRequestId.current += 1;
    };
  }, [accountEmail, activeFolder, connected, connectedOverride, search, unreadOnly, refreshVersion, refreshMail, notify]);

  const updateReadState = useCallback(async (messageId: string, unread: boolean) => {
    if (readRequests.current.has(messageId)) return;
    readRequests.current.add(messageId);
    setReadPending(true);
    try {
      const response = await memberGmailRequest("/api/gmail?action=messageAction", boundUserId, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: unread ? "markUnread" : "markRead", id: messageId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not update the message's read state.");
      updateCachedGmailUnread(accountEmail, messageId, unread);
      // Invalidate lists started before Gmail acknowledged the label change.
      listRequestId.current += 1;
      setListLoading(false);
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, unread } : message));
      setSelectedMessage((current) => current?.id === messageId ? { ...current, unread } : current);
      refreshMail();
    } catch (error) {
      notify("Could not update read state", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null, action: { label: "Try again", onClick: () => void updateReadState(messageId, unread) } });
    } finally {
      readRequests.current.delete(messageId);
      setReadPending(readRequests.current.size > 0);
    }
  }, [accountEmail, notify, refreshMail]);

  useEffect(() => {
    if (!connected || connectedOverride !== undefined || !selectedMessageId) return;
    const requestId = ++detailRequestId.current;
    const cachedMessage = getCachedGmailMessage(accountEmail, selectedMessageId);
    setSelectedMessage(cachedMessage);
    setMessageError(null);
    setMessageLoading(!cachedMessage);
    void (async () => {
      try {
        const body = await loadCachedGmailMessage(accountEmail, selectedMessageId, async () => {
          const params = new URLSearchParams({ action: "message", id: selectedMessageId });
          const response = await memberGmailRequest(`/api/gmail?${params}`, boundUserId);
          const result = await response.json().catch(() => null) as (GmailMessage & { error?: string }) | null;
          if (!response.ok) throw new Error(result?.error || "Could not open this message.");
          return result as GmailMessage;
        });
        if (requestId !== detailRequestId.current) return;
        setSelectedMessage(body);
        // Only opening a selected message marks it read. Hover/focus prefetch is read-only.
        if (body.unread) void updateReadState(body.id, false);
      } catch (error) {
        if (requestId === detailRequestId.current) {
          const message = error instanceof Error ? error.message : "Could not open this message.";
          setMessageError(message);
          notify("Could not open message", message, { variant: "error", href: null, action: { label: "Try again", onClick: () => setDetailRetry((value) => value + 1) } });
        }
      } finally {
        if (requestId === detailRequestId.current) setMessageLoading(false);
      }
    })();
    return () => { detailRequestId.current += 1; };
  }, [accountEmail, connected, connectedOverride, selectedMessageId, updateReadState, detailRetry, notify]);

  async function prefetchMessage(messageId: string) {
    if (getCachedGmailMessage(accountEmail, messageId)) return;
    try {
      await loadCachedGmailMessage(accountEmail, messageId, async () => {
        const params = new URLSearchParams({ action: "message", id: messageId });
        const response = await memberGmailRequest(`/api/gmail?${params}`, boundUserId);
        const body = await response.json().catch(() => null) as (GmailMessage & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || "Could not open this message.");
        return body as GmailMessage;
      });
    } catch {
      // Prefetch is opportunistic; selecting the message will show any real error.
    }
  }

  function selectMessage(messageId: string) {
    if (messageId === selectedMessageId) {
      if (selectedMessage?.unread) void updateReadState(messageId, false);
      return;
    }
    setSelectedMessageId(messageId);
    const cachedMessage = getCachedGmailMessage(accountEmail, messageId);
    setSelectedMessage(cachedMessage);
    setMessageError(null);
    setMessageLoading(!cachedMessage);
  }


  async function loadMoreMessages() {
    if (!nextPageToken || listLoading) return;
    setListLoading(true);
    setListError(null);
    const requestId = ++listRequestId.current;
    try {
      const params = new URLSearchParams({ action: "messages", folder: activeFolder, pageToken: nextPageToken });
      if (search.trim()) params.set("q", search.trim());
      if (activeFolder === "inbox" && unreadOnly) params.set("unreadOnly", "true");
      const response = await memberGmailRequest(`/api/gmail?${params}`, boundUserId);
      const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
      if (requestId !== listRequestId.current) return;
      if (!response.ok) throw new Error(body?.error || "Could not load more messages.");
      const loadedMessages = inboxMessages(Array.isArray(body?.messages) ? body.messages : [], activeFolder, unreadOnly);
      const allMessages = [...new Map([...messages, ...loadedMessages].map((message) => [message.id, message])).values()];
      const queryKey = mailListCacheKey(activeFolder, search, unreadOnly);
      setCachedGmailList(accountEmail, queryKey, { messages: allMessages, nextPageToken: body?.nextPageToken ?? null });
      setMessages(allMessages);
      setNextPageToken(body?.nextPageToken ?? null);
    } catch (error) {
      if (requestId === listRequestId.current) notify("Could not load more messages", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  }

  function startCompose(mode: ComposeMode) {
    setComposeMode(mode);
    setQuotedMessage(mode === "new" ? null : selectedMessage);
    void loadSignature();
    setComposeSubject(mode === "new" ? "" : selectedMessage?.subject ?? "");
    setComposeCc("");
    setComposeBody("");
    const emailAddress = selectedMessage?.replyTo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
    setComposeTo(mode === "reply" ? emailAddress : "");
  }

  async function sendMessage() {
    if (!composeMode || sending || !signature || signatureLoading) return;
    if (composeMode !== "new" && !quotedMessage) return;
    setSending(true);
    try {
      const response = await memberGmailRequest("/api/gmail?action=messageAction", boundUserId, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send", mode: composeMode, to: composeTo, subject: composeSubject,
          cc: composeCc,
          body: composeBody,
          ...(quotedMessage ? { quotedMessageId: quotedMessage.id, replyToMessageId: quotedMessage.id } : {}),
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not send this message.");
      setComposeMode(null);
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
      notify("Message sent", `Your ${composeMode === "reply" ? "reply" : composeMode === "forward" ? "forwarded message" : "message"} was sent.`, { href: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send this message.";
      notify("Could not send message", message, { variant: "error", href: null });
    } finally {
      setSending(false);
    }
  }

  async function performMessageAction(action: MessageAction) {
    if (!selectedMessageId) return;
    setActionPending(true);
    try {
      const response = await memberGmailRequest("/api/gmail?action=messageAction", boundUserId, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: selectedMessageId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not update this message.");
      removeCachedGmailMessage(accountEmail, selectedMessageId);
      const remainingMessages = messages.filter((message) => message.id !== selectedMessageId);
      const selectedIndex = messages.findIndex((message) => message.id === selectedMessageId);
      const nextMessage = selectedIndex >= 0
        ? messages[selectedIndex + 1] ?? messages[selectedIndex - 1]
        : remainingMessages[0];
      setCachedGmailList(accountEmail, mailListCacheKey(activeFolder, search, unreadOnly), {
        messages: remainingMessages,
        nextPageToken,
      });
      setMessages(remainingMessages);
      setSelectedMessageId(nextMessage?.id ?? null);
      setSelectedMessage(null);
      setMessageError(null);
      setMessageLoading(Boolean(nextMessage));
      setConfirmAction(null);
    } catch (error) {
      notify("Could not update message", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {connectionState === "checking" && connectedOverride === undefined ? (
        <main className="flex min-w-0 flex-1 items-center justify-center" aria-live="polite">
          <p className="text-sm text-muted-foreground">Checking your Gmail connection…</p>
        </main>
      ) : connectionState === "unavailable" ? (
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">Couldn’t check your Gmail connection.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </main>
      ) : connected ? (
        <>
          <ConnectedMailSidebar
            activeFolder={activeFolder}
            onFolderChange={(folder) => { setSelectedMessageId(null); setSelectedMessage(null); setActiveFolder(folder); }}
            onNewMessage={() => startCompose("new")}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
            onReconnect={connectGmail}
            search={search}
            onSearchChange={setSearch}
            messages={inboxMessages(messages, activeFolder, unreadOnly)}
            loading={listLoading}
            error={listError}
            selectedMessageId={selectedMessageId}
            onMessageSelect={selectMessage}
            onMessagePrefetch={(messageId) => void prefetchMessage(messageId)}
            nextPageToken={nextPageToken}
            onLoadMore={loadMoreMessages}
            onRefresh={refreshMail}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-live="polite" aria-busy={messageLoading}>
            {selectedMessageId ? (
              messageLoading && !selectedMessage ? (
                <MailContentSkeleton />
              ) : messageError ? (
                <div className="flex h-full items-center justify-center p-6"><Button variant="outline" onClick={() => setDetailRetry((value) => value + 1)}>Reload message</Button></div>
              ) : selectedMessage ? (
                <>
                  <div className="shrink-0 border-b px-5 py-4 md:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h1 className="min-w-0 flex-1 break-words text-xl font-semibold tracking-tight">{selectedMessage.subject}</h1>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="icon" aria-label="Reply" title="Reply" onClick={() => startCompose("reply")} disabled={messageLoading || listLoading}><Reply aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Forward" title="Forward" onClick={() => startCompose("forward")} disabled={messageLoading || listLoading}><Forward aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label={selectedMessage.unread ? "Mark as read" : "Mark as unread"} title={selectedMessage.unread ? "Mark as read" : "Mark as unread"} onClick={() => void updateReadState(selectedMessage.id, !selectedMessage.unread)} disabled={readPending || messageLoading || listLoading}>{selectedMessage.unread ? <MailOpen /> : <Mail />}</Button>
                        <Button variant="ghost" size="icon" aria-label="Archive message" title="Archive" onClick={() => void performMessageAction("archive")} disabled={actionPending || messageLoading || listLoading}><Archive aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Mark as spam" title="Junk" onClick={() => setConfirmAction("junk")} disabled={actionPending || messageLoading || listLoading}><ShieldAlert aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Move to trash" title="Delete" onClick={() => setConfirmAction("trash")} disabled={actionPending || messageLoading || listLoading}><Trash2 aria-hidden="true" /></Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <p className="min-w-0 break-words font-medium">{selectedMessage.from}</p>
                      <time className="text-xs text-muted-foreground" dateTime={selectedMessage.date}>{formatMessageDetailDate(selectedMessage.date)}</time>
                    </div>
                  </div>
                  <EmailHtmlFrame html={selectedMessage.htmlBody} plainText={selectedMessage.body || selectedMessage.snippet} />
                </>
              ) : null
            ) : listLoading && messages.length === 0 ? (
              <MailContentSkeleton />
            ) : listError && messages.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6"><Button variant="outline" onClick={refreshMail}>Reload messages</Button></div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <folder.icon className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <h1 className="mt-4 text-lg font-medium tracking-tight">{activeFolder === "inbox" && unreadOnly ? "No unread messages in your inbox." : emptyFolderMessage[folder.id]}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Try another folder or change your search.</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Select a message to read it.</div>
            )}
          </main>
          <Dialog open={composeMode !== null} onOpenChange={(open) => { if (!open && !sending) setComposeMode(null); }}>
            {composeMode && (
              <DialogContent showCloseButton={false} className="block h-[min(760px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] max-w-3xl overflow-hidden p-0 sm:max-w-3xl">
                <MessageComposer
                  mode={composeMode}
                  from={accountEmail}
                  to={composeTo}
                  onToChange={setComposeTo}
                  cc={composeCc}
                  onCcChange={setComposeCc}
                  subject={composeSubject}
                  onSubjectChange={setComposeSubject}
                  body={composeBody}
                  onBodyChange={setComposeBody}
                  quotedMessage={quotedMessage}
                  signature={signature}
                  signatureLoading={signatureLoading}
                  sending={sending}
                  onSend={() => void sendMessage()}
                />
              </DialogContent>
            )}
          </Dialog>
          <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open && !actionPending) setConfirmAction(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{confirmAction === "junk" ? "Move this message to Spam?" : "Move this message to Trash?"}</DialogTitle>
                <DialogDescription>{confirmAction === "junk" ? "Gmail will mark this message as spam. You can find it in the Spam folder." : "The message will move to Gmail Trash, where it can be restored until Gmail permanently deletes it."}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={actionPending}>Cancel</Button>
                <Button variant="destructive" onClick={() => confirmAction && void performMessageAction(confirmAction)} disabled={actionPending}>
                  {actionPending ? "Working…" : confirmAction === "junk" ? "Move to Spam" : "Move to Trash"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <main className="flex min-w-0 flex-1 flex-col">
          <section
            className="flex flex-1 items-center justify-center px-6 py-12"
            aria-labelledby="connect-gmail-title"
          >
            <div className="w-full max-w-md text-center">
              <div className="mx-auto mb-6 flex size-[3.25rem] items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border">
                <GmailLogo className="size-10" />
              </div>
              <h1 id="connect-gmail-title" className="text-2xl font-medium tracking-tight">
                Connect your Gmail account
              </h1>
              <p id="connect-gmail-description" className="mt-3 text-sm leading-6 text-muted-foreground">
                Connect your Helix mailbox to read and search messages without leaving the member platform.
              </p>
              <Button
                type="button"
                className="mt-6"
                onClick={connectGmail}
                disabled={connecting}
                aria-describedby="connect-gmail-description"
              >
                {connecting ? "Connecting…" : "Connect Gmail account"}
              </Button>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                You will approve access through Google. Helix will not ask for your Google password.
              </p>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
