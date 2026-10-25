import { useEffect, useRef, useState } from "react";
import {
  ArchiveX,
  File,
  Inbox,
  MoreHorizontal,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@libs/components/ui/button";
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
import { memberSessionToken } from "../MemberCV/session";

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

type GmailMessage = GmailMessageSummary & { body: string };

const mailFolders: MailFolder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "archive", label: "Archive", icon: ArchiveX },
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

function ConnectedMailSidebar({
  activeFolder,
  onFolderChange,
  onReconnect,
  search,
  onSearchChange,
  messages,
  loading,
  error,
  selectedMessageId,
  onMessageSelect,
  nextPageToken,
  onLoadMore,
}: {
  activeFolder: string;
  onFolderChange: (folder: string) => void;
  onReconnect: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  messages: GmailMessageSummary[];
  loading: boolean;
  error: string | null;
  selectedMessageId: string | null;
  onMessageSelect: (messageId: string) => void;
  nextPageToken: string | null;
  onLoadMore: () => void;
}) {
  const folder = mailFolders.find((item) => item.id === activeFolder) ?? mailFolders[0];

  const overflowFolders = mailFolders.filter((item) => !["inbox", "sent", "archive"].includes(item.id));

  return (
    <SidebarProvider className="h-full !min-h-0 min-h-0 w-80 shrink-0">
      <Sidebar collapsible="none" className="hidden h-full !w-80 shrink-0 border-r md:flex">
        <SidebarHeader className="gap-3.5 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-medium text-foreground">{folder.label}</div>
            <div className="flex items-center gap-1">
              {mailFolders.filter((item) => ["inbox", "sent", "archive"].includes(item.id)).map((item) => (
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
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              {error ? (
                <p className="px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
              ) : loading && messages.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground" aria-live="polite">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground" aria-live="polite">No messages in this folder.</p>
              ) : (
                <div className="divide-y divide-border">
                  {messages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      aria-label={`${message.from}, ${message.subject}`}
                      aria-current={selectedMessageId === message.id ? "true" : undefined}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-sidebar-accent ${selectedMessageId === message.id ? "bg-sidebar-accent" : ""}`}
                      onClick={() => onMessageSelect(message.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${message.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>{message.from}</span>
                        <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={message.date}>{formatMessageDate(message.date)}</time>
                      </div>
                      <p className={`mt-1 truncate text-sm ${message.unread ? "font-semibold" : "font-medium"}`}>{message.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.snippet}</p>
                    </button>
                  ))}
                  {nextPageToken && (
                    <div className="p-3">
                      <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={onLoadMore}>
                        {loading ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
                  {error && <p className="px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
                </div>
              )}
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

const emptyFolderMessage: Record<string, string> = {
  inbox: "No messages in your inbox.",
  starred: "No starred messages.",
  sent: "No sent messages.",
  drafts: "No drafts.",
  archive: "No archived messages.",
  trash: "Your trash is empty.",
};

export function MailWorkspace({ connected: connectedOverride }: { connected?: boolean }) {
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"checking" | "connected" | "disconnected" | "unavailable">(() => {
    if (connectedOverride !== undefined) return connectedOverride ? "connected" : "disconnected";
    const justConnected = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("gmail") === "connected";
    return justConnected ? "connected" : "checking";
  });
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const boundUserId = useRef<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  useEffect(() => {
    if (connectedOverride !== undefined) return;
    let active = true;
    void (async () => {
      try {
        const token = await memberSessionToken(boundUserId);
        const response = await fetch("/api/gmail-status", {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as { connected?: unknown } | null;
        if (active) {
          setConnectionState(!response.ok ? "unavailable" : body?.connected === true ? "connected" : "disconnected");
        }
      } catch {
        if (active) setConnectionState("unavailable");
      }
    })();
    return () => { active = false; };
  }, [connectedOverride]);

  async function connectGmail() {
    setConnecting(true);
    setConnectionError(null);
    try {
      const token = await memberSessionToken(boundUserId);
      const response = await fetch("/api/gmail-connect", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null) as { error?: unknown; url?: unknown } | null;
      if (!response.ok || typeof body?.url !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "Gmail connection is temporarily unavailable. Try again.");
      }
      window.location.assign(body.url);
    } catch (error) {
      setConnecting(false);
      setConnectionError(error instanceof Error ? error.message : "Gmail connection is temporarily unavailable. Try again.");
    }
  }

  const connected = connectedOverride ?? connectionState === "connected";
  const folder = mailFolders.find((item) => item.id === activeFolder) ?? mailFolders[0];

  useEffect(() => {
    if (!connected || connectedOverride !== undefined) return;
    const requestId = ++listRequestId.current;
    setMessages([]);
    setSelectedMessageId(null);
    setSelectedMessage(null);
    setNextPageToken(null);
    setListError(null);
    setListLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await memberSessionToken(boundUserId);
          const params = new URLSearchParams({ action: "messages", folder: activeFolder });
          if (search.trim()) params.set("q", search.trim());
          const response = await fetch(`/api/gmail?${params}`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
          if (requestId !== listRequestId.current) return;
          if (!response.ok) throw new Error(body?.error || "Could not load Gmail messages.");
          setMessages(Array.isArray(body?.messages) ? body.messages : []);
          setNextPageToken(body?.nextPageToken ?? null);
        } catch (error) {
          if (requestId === listRequestId.current) setListError(error instanceof Error ? error.message : "Could not load Gmail messages.");
        } finally {
          if (requestId === listRequestId.current) setListLoading(false);
        }
      })();
    }, search ? 300 : 0);
    return () => {
      window.clearTimeout(timer);
      if (requestId === listRequestId.current) listRequestId.current += 1;
    };
  }, [activeFolder, connected, connectedOverride, search]);

  useEffect(() => {
    if (!connected || connectedOverride !== undefined || !selectedMessageId) return;
    const requestId = ++detailRequestId.current;
    setSelectedMessage(null);
    setMessageError(null);
    setMessageLoading(true);
    void (async () => {
      try {
        const token = await memberSessionToken(boundUserId);
        const params = new URLSearchParams({ action: "message", id: selectedMessageId });
        const response = await fetch(`/api/gmail?${params}`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as (GmailMessage & { error?: string }) | null;
        if (requestId !== detailRequestId.current) return;
        if (!response.ok) throw new Error(body?.error || "Could not open this message.");
        setSelectedMessage(body as GmailMessage);
      } catch (error) {
        if (requestId === detailRequestId.current) setMessageError(error instanceof Error ? error.message : "Could not open this message.");
      } finally {
        if (requestId === detailRequestId.current) setMessageLoading(false);
      }
    })();
    return () => { detailRequestId.current += 1; };
  }, [connected, connectedOverride, selectedMessageId]);

  async function loadMoreMessages() {
    if (!nextPageToken || listLoading) return;
    setListLoading(true);
    setListError(null);
    const requestId = ++listRequestId.current;
    try {
      const token = await memberSessionToken(boundUserId);
      const params = new URLSearchParams({ action: "messages", folder: activeFolder, pageToken: nextPageToken });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/gmail?${params}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
      if (requestId !== listRequestId.current) return;
      if (!response.ok) throw new Error(body?.error || "Could not load more messages.");
      setMessages((current) => [...current, ...(Array.isArray(body?.messages) ? body.messages : [])]);
      setNextPageToken(body?.nextPageToken ?? null);
    } catch (error) {
      if (requestId === listRequestId.current) setListError(error instanceof Error ? error.message : "Could not load more messages.");
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
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
            onFolderChange={setActiveFolder}
            onReconnect={connectGmail}
            search={search}
            onSearchChange={setSearch}
            messages={messages}
            loading={listLoading}
            error={listError}
            selectedMessageId={selectedMessageId}
            onMessageSelect={setSelectedMessageId}
            nextPageToken={nextPageToken}
            onLoadMore={loadMoreMessages}
          />
          <main className="min-w-0 flex-1 overflow-auto" aria-live="polite">
            {selectedMessageId ? (
              messageLoading ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Loading message…</div>
              ) : messageError ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-destructive" role="alert">{messageError}</div>
              ) : selectedMessage ? (
                <article className="mx-auto w-full max-w-4xl p-6 md:p-10">
                  <h1 className="text-2xl font-semibold tracking-tight">{selectedMessage.subject}</h1>
                  <div className="mt-5 border-b pb-5 text-sm">
                    <p className="font-medium">{selectedMessage.from}</p>
                    <time className="mt-1 block text-muted-foreground" dateTime={selectedMessage.date}>{selectedMessage.date}</time>
                  </div>
                  <div className="whitespace-pre-wrap break-words py-6 text-sm leading-6 text-foreground">{selectedMessage.body || selectedMessage.snippet}</div>
                </article>
              ) : null
            ) : listLoading && messages.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Loading messages…</div>
            ) : listError && messages.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive" role="alert">{listError}</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <folder.icon className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <h1 className="mt-4 text-lg font-medium tracking-tight">{emptyFolderMessage[folder.id]}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Try another folder or change your search.</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Select a message to read it.</div>
            )}
          </main>
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
              {connectionError && (
                <p role="alert" className="mx-auto mt-4 max-w-sm rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {connectionError}
                </p>
              )}
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
