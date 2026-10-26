import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArchive,
  IconArchiveOff,
  IconArrowForwardUp,
  IconFile,
  IconInbox,
  IconFilter,
  IconLoader2,
  IconDots,
  IconEdit,
  IconArrowBackUp,
  IconSearch,
  IconSend,
  IconShieldExclamation,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Skeleton } from "@libs/components/ui/skeleton";
import {
  Dialog,
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
import { memberSessionToken } from "../MemberCV/session";
import { useMemberAccount } from "./MemberAccountContext";
import { useNotify } from "./MemberNotifications";
import {
  getCachedGmailConnection,
  getCachedGmailList,
  getCachedGmailMessage,
  loadCachedGmailMessage,
  removeCachedGmailMessage,
  setCachedGmailConnection,
  setCachedGmailList,
} from "./gmail-session-cache";

type MailFolder = {
  id: string;
  label: string;
  icon: typeof IconInbox;
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
  { id: "inbox", label: "Inbox", icon: IconInbox },
  { id: "starred", label: "Starred", icon: IconStar },
  { id: "sent", label: "Sent", icon: IconSend },
  { id: "drafts", label: "Drafts", icon: IconFile },
  { id: "archive", label: "Archive", icon: IconArchiveOff },
  { id: "spam", label: "Spam", icon: IconShieldExclamation },
  { id: "trash", label: "Trash", icon: IconTrash },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function safeDocumentAttributes(element: Element, names: string[]): string {
  return names.flatMap((name) => {
    const value = element.getAttribute(name);
    return value === null ? [] : [`${name}="${escapeHtml(value)}"`];
  }).join(" ");
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript):[^)]*\)/gi, "url()")
    .replace(/(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:[^;}]+;?/gi, "");
}

function emailDocument(html: string, plainText: string): string {
  const source = html.trim() || `<pre>${escapeHtml(plainText)}</pre>`;
  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.querySelectorAll("script, iframe, frame, frameset, object, embed, form, input, button, textarea, select, option, link, meta, base, svg, math, video, audio, source, track, canvas, portal").forEach((element) => element.remove());
  parsed.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || ["srcdoc", "formaction", "xlink:href"].includes(name)) {
        element.removeAttribute(attribute.name);
      } else if (name === "style") {
        element.setAttribute(attribute.name, sanitizeCss(value));
      } else if (name === "href") {
        try {
          const url = new URL(value, window.location.origin);
          if (!["https:", "http:", "mailto:"].includes(url.protocol)) element.removeAttribute(attribute.name);
          else if (url.protocol === "http:" || url.protocol === "https:") {
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
          }
        } catch {
          element.removeAttribute(attribute.name);
        }
      } else if (name === "src" && element.tagName.toLowerCase() === "img") {
        try {
          const url = new URL(value, window.location.origin);
          if (url.protocol === "http:" || url.protocol === "https:") {
            element.setAttribute("src", url.href);
            element.setAttribute("referrerpolicy", "no-referrer");
            element.setAttribute("loading", "eager");
          } else if (url.protocol !== "data:" || !/^data:image\//i.test(value)) {
            element.removeAttribute("src");
          }
        } catch {
          element.removeAttribute("src");
        }
      } else if (["srcset", "background", "poster"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  const styles = [...parsed.querySelectorAll("style")].map((style) => {
    const css = sanitizeCss(style.textContent ?? "");
    return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  }).join("");
  const htmlAttributes = safeDocumentAttributes(parsed.documentElement, ["lang", "dir", "class"]);
  const bodyAttributes = safeDocumentAttributes(parsed.body, ["id", "lang", "dir", "class"]);
  const htmlStyle = `${sanitizeCss(parsed.documentElement.getAttribute("style") ?? "")};height:100%!important;overflow:hidden!important`;
  const bodyStyle = `${sanitizeCss(parsed.body.getAttribute("style") ?? "")};box-sizing:border-box;height:100%!important;max-height:100%;overflow-x:auto!important;overflow-y:auto!important;overscroll-behavior-y:contain!important`;
  const shellStyles = "html{height:100%;overflow:hidden}body{box-sizing:border-box;margin:0;padding:24px;color:#202124;font:14px/1.6 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font:inherit}a{color:#1a73e8}";
  const scrollbarStyles = "body{scrollbar-width:thin;scrollbar-color:transparent transparent;transition:scrollbar-color .45s ease-out}body[data-scrolling='true']{scrollbar-color:color-mix(in srgb,#5f6368 65%,transparent) transparent}body::-webkit-scrollbar{width:8px;height:8px}body::-webkit-scrollbar-track{background:transparent}body::-webkit-scrollbar-thumb{background:transparent;border-radius:8px;transition:background-color .45s ease-out}body[data-scrolling='true']::-webkit-scrollbar-thumb{background:color-mix(in srgb,#5f6368 65%,transparent);transition-duration:120ms}";
  return `<!doctype html><html ${htmlAttributes} style="${escapeHtml(htmlStyle)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline';"><style>${shellStyles}</style>${styles}<style>${scrollbarStyles}</style></head><body ${bodyAttributes} style="${escapeHtml(bodyStyle)}">${parsed.body.innerHTML}</body></html>`;
}

function EmailHtmlFrame({ html, plainText }: { html: string; plainText: string }) {
  const srcDoc = useMemo(() => emailDocument(html, plainText), [html, plainText]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const scrollIdleTimeout = useRef<number | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let scrollBody: HTMLElement | null = null;
    const attachScrollListener = () => {
      scrollBody?.removeEventListener("scroll", handleScroll);
      scrollBody = frame.contentDocument?.body ?? null;
      scrollBody?.addEventListener("scroll", handleScroll, { passive: true });
    };
    const handleScroll = () => {
      if (!scrollBody) return;
      scrollBody.dataset.scrolling = "true";
      if (scrollIdleTimeout.current !== null) window.clearTimeout(scrollIdleTimeout.current);
      scrollIdleTimeout.current = window.setTimeout(() => {
        if (scrollBody) scrollBody.dataset.scrolling = "false";
        scrollIdleTimeout.current = null;
      }, 650);
    };
    frame.addEventListener("load", attachScrollListener);
    attachScrollListener();
    return () => {
      frame.removeEventListener("load", attachScrollListener);
      scrollBody?.removeEventListener("scroll", handleScroll);
      if (scrollIdleTimeout.current !== null) {
        window.clearTimeout(scrollIdleTimeout.current);
        scrollIdleTimeout.current = null;
      }
    };
  }, [srcDoc]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <iframe
        title="Email content"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        ref={frameRef}
        srcDoc={srcDoc}
        className="h-full min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

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
              <SidebarMenuButton
                type="button"
                size="sm"
                tooltip={{ children: "New message", hidden: false }}
                aria-label="New message"
                className="size-8 justify-center p-0"
                onClick={onNewMessage}
              >
                <IconEdit aria-hidden="true" />
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
                  <item.icon aria-hidden="true" />
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
                  <IconFilter aria-hidden="true" />
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
                    <IconDots aria-hidden="true" />
                    <span className="sr-only">More mail folders</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="min-w-48">
                  <DropdownMenuLabel>More folders</DropdownMenuLabel>
                  {overflowFolders.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => onFolderChange(item.id)}>
                      <item.icon aria-hidden="true" />
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
            <IconSearch
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
              {loading && messages.length > 0 && (
                <p className="px-4 py-2 text-xs text-muted-foreground" role="status">Updating messages…</p>
              )}
              {error && messages.length > 0 && (
                <p className="px-4 py-2 text-xs text-destructive" role="alert">{error}</p>
              )}
              {error && messages.length === 0 ? (
                <p className="px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
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
                  {nextPageToken && (
                    <div className="p-3">
                      <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={onLoadMore}>
                        {loading ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
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
  error,
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
  error: string | null;
  sending: boolean;
  onSend: () => void;
}) {
  const label = mode === "new" ? "New message" : mode === "reply" ? "Reply" : "Forward";
  return (
    <form className="flex h-full min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <DialogHeader className="shrink-0 border-b px-5 py-3 pr-14">
        <DialogTitle className="text-sm font-medium">{label}</DialogTitle>
        <DialogDescription className="sr-only">{mode === "reply" ? "Write your reply." : mode === "forward" ? "Forward this message to someone." : "Compose and send an email from your Gmail account."}</DialogDescription>
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
        <div className="flex min-h-0 flex-1 flex-col">
          <Label htmlFor="compose-body" className="sr-only">Message</Label>
          <Textarea id="compose-body" className="min-h-0 flex-1 resize-none rounded-none border-0 px-5 py-5 leading-6 shadow-none focus-visible:ring-0" value={body} onChange={(event) => onBodyChange(event.target.value)} aria-label="Message" />
        </div>
        {error && <p className="shrink-0 px-5 pb-3 text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t px-5 py-3">
        <Button type="submit" size="icon" aria-label="Send" title="Send" disabled={sending || !to.trim() || !subject.trim()}>
          {sending ? <IconLoader2 aria-hidden="true" className="size-4 animate-spin" /> : <IconSend aria-hidden="true" className="size-4" />}
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
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(() => getCachedGmailList(accountEmail, mailListCacheKey("inbox", "", false))?.messages[0]?.id ?? null);
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<MessageAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    const queryKey = mailListCacheKey(activeFolder, search, unreadOnly);
    const cachedList = getCachedGmailList(accountEmail, queryKey);
    const cachedMessages = inboxMessages(cachedList?.messages ?? [], activeFolder, unreadOnly);
    setMessages(cachedMessages);
    setNextPageToken(cachedList?.nextPageToken ?? null);
    setSelectedMessageId((current) => cachedMessages.some((message) => message.id === current)
      ? current
      : cachedMessages[0]?.id ?? null);
    setListError(null);
    setListLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await memberSessionToken(boundUserId);
          const params = new URLSearchParams({ action: "messages", folder: activeFolder });
          if (search.trim()) params.set("q", search.trim());
          if (activeFolder === "inbox" && unreadOnly) params.set("unreadOnly", "true");
          const response = await fetch(`/api/gmail?${params}`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
          if (requestId !== listRequestId.current) return;
          if (!response.ok) throw new Error(body?.error || "Could not load Gmail messages.");
          const loadedMessages = inboxMessages(Array.isArray(body?.messages) ? body.messages : [], activeFolder, unreadOnly);
          setCachedGmailList(accountEmail, queryKey, { messages: loadedMessages, nextPageToken: body?.nextPageToken ?? null });
          setMessages(loadedMessages);
          setNextPageToken(body?.nextPageToken ?? null);
          setSelectedMessageId((current) => loadedMessages.some((message) => message.id === current)
            ? current
            : loadedMessages[0]?.id ?? null);
        } catch (error) {
          if (requestId === listRequestId.current) {
            setListError(error instanceof Error ? error.message : "Could not load Gmail messages.");
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
  }, [accountEmail, activeFolder, connected, connectedOverride, search, unreadOnly]);

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
          const token = await memberSessionToken(boundUserId);
          const params = new URLSearchParams({ action: "message", id: selectedMessageId });
          const response = await fetch(`/api/gmail?${params}`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
          });
          const result = await response.json().catch(() => null) as (GmailMessage & { error?: string }) | null;
          if (!response.ok) throw new Error(result?.error || "Could not open this message.");
          return result as GmailMessage;
        });
        if (requestId !== detailRequestId.current) return;
        setSelectedMessage(body);
      } catch (error) {
        if (requestId === detailRequestId.current) setMessageError(error instanceof Error ? error.message : "Could not open this message.");
      } finally {
        if (requestId === detailRequestId.current) setMessageLoading(false);
      }
    })();
    return () => { detailRequestId.current += 1; };
  }, [accountEmail, connected, connectedOverride, selectedMessageId]);

  async function prefetchMessage(messageId: string) {
    if (getCachedGmailMessage(accountEmail, messageId)) return;
    try {
      await loadCachedGmailMessage(accountEmail, messageId, async () => {
        const token = await memberSessionToken(boundUserId);
        const params = new URLSearchParams({ action: "message", id: messageId });
        const response = await fetch(`/api/gmail?${params}`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as (GmailMessage & { error?: string }) | null;
        if (!response.ok) throw new Error(body?.error || "Could not open this message.");
        return body as GmailMessage;
      });
    } catch {
      // Prefetch is opportunistic; selecting the message will show any real error.
    }
  }

  function selectMessage(messageId: string) {
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
      const token = await memberSessionToken(boundUserId);
      const params = new URLSearchParams({ action: "messages", folder: activeFolder, pageToken: nextPageToken });
      if (search.trim()) params.set("q", search.trim());
      if (activeFolder === "inbox" && unreadOnly) params.set("unreadOnly", "true");
      const response = await fetch(`/api/gmail?${params}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null) as { messages?: GmailMessageSummary[]; nextPageToken?: string | null; error?: string } | null;
      if (requestId !== listRequestId.current) return;
      if (!response.ok) throw new Error(body?.error || "Could not load more messages.");
      const loadedMessages = inboxMessages(Array.isArray(body?.messages) ? body.messages : [], activeFolder, unreadOnly);
      const allMessages = [...messages, ...loadedMessages];
      const queryKey = mailListCacheKey(activeFolder, search, unreadOnly);
      setCachedGmailList(accountEmail, queryKey, { messages: allMessages, nextPageToken: body?.nextPageToken ?? null });
      setMessages(allMessages);
      setNextPageToken(body?.nextPageToken ?? null);
    } catch (error) {
      if (requestId === listRequestId.current) setListError(error instanceof Error ? error.message : "Could not load more messages.");
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  }

  function startCompose(mode: ComposeMode) {
    setComposeMode(mode);
    setComposeError(null);
    setComposeSubject(mode === "new" ? "" : selectedMessage?.subject ?? "");
    setComposeCc("");
    setComposeBody(!selectedMessage ? "" : mode === "forward"
      ? `\n\n---------- Forwarded message ----------\nFrom: ${selectedMessage.from}\nDate: ${formatMessageDetailDate(selectedMessage.date)}\nSubject: ${selectedMessage.subject}\n\n${selectedMessage.body}`
      : mode === "reply" ? `\n\nOn ${formatMessageDetailDate(selectedMessage.date)}, ${selectedMessage.from} wrote:\n${selectedMessage.body.split("\n").map((line) => `> ${line}`).join("\n")}` : "");
    const emailAddress = selectedMessage?.replyTo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
    setComposeTo(mode === "reply" ? emailAddress : "");
  }

  async function sendMessage() {
    if (!composeMode) return;
    if (composeMode === "reply" && !selectedMessage) return;
    setSending(true);
    setComposeError(null);
    try {
      const token = await memberSessionToken(boundUserId);
      const response = await fetch("/api/gmail?action=messageAction", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send", mode: composeMode, to: composeTo, subject: composeSubject,
          cc: composeCc,
          body: composeBody,
          ...(composeMode === "reply" && selectedMessage ? { replyToMessageId: selectedMessage.id } : {}),
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
      setComposeError(message);
      notify("Could not send message", message, { variant: "error", href: null });
    } finally {
      setSending(false);
    }
  }

  async function performMessageAction(action: MessageAction) {
    if (!selectedMessageId) return;
    setActionPending(true);
    setActionError(null);
    try {
      const token = await memberSessionToken(boundUserId);
      const response = await fetch("/api/gmail?action=messageAction", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
      setActionError(error instanceof Error ? error.message : "Could not update this message.");
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
            onFolderChange={setActiveFolder}
            onNewMessage={() => startCompose("new")}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
            onReconnect={connectGmail}
            search={search}
            onSearchChange={setSearch}
            messages={messages}
            loading={listLoading}
            error={listError}
            selectedMessageId={selectedMessageId}
            onMessageSelect={selectMessage}
            onMessagePrefetch={(messageId) => void prefetchMessage(messageId)}
            nextPageToken={nextPageToken}
            onLoadMore={loadMoreMessages}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-live="polite" aria-busy={messageLoading}>
            {selectedMessageId ? (
              messageLoading && !selectedMessage ? (
                <MailContentSkeleton />
              ) : messageError ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-destructive" role="alert">{messageError}</div>
              ) : selectedMessage ? (
                <>
                  {(messageLoading || listLoading) && (
                    <div className="shrink-0 border-b px-5 py-2 text-xs text-muted-foreground" role="status">{messageLoading ? "Opening message…" : "Updating messages…"}</div>
                  )}
                  <div className="shrink-0 border-b px-5 py-4 md:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h1 className="min-w-0 flex-1 break-words text-xl font-semibold tracking-tight">{selectedMessage.subject}</h1>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="icon" aria-label="Reply" title="Reply" onClick={() => startCompose("reply")} disabled={messageLoading || listLoading}><IconArrowBackUp aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Forward" title="Forward" onClick={() => startCompose("forward")} disabled={messageLoading || listLoading}><IconArrowForwardUp aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Archive message" title="Archive" onClick={() => void performMessageAction("archive")} disabled={actionPending || messageLoading || listLoading}><IconArchive aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Mark as spam" title="Junk" onClick={() => setConfirmAction("junk")} disabled={actionPending || messageLoading || listLoading}><IconShieldExclamation aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Move to trash" title="Delete" onClick={() => setConfirmAction("trash")} disabled={actionPending || messageLoading || listLoading}><IconTrash aria-hidden="true" /></Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <p className="min-w-0 break-words font-medium">{selectedMessage.from}</p>
                      <time className="text-xs text-muted-foreground" dateTime={selectedMessage.date}>{formatMessageDetailDate(selectedMessage.date)}</time>
                    </div>
                    {actionError && <p className="mt-2 text-sm text-destructive" role="alert">{actionError}</p>}
                  </div>
                  <EmailHtmlFrame html={selectedMessage.htmlBody} plainText={selectedMessage.body || selectedMessage.snippet} />
                </>
              ) : null
            ) : listLoading && messages.length === 0 ? (
              <MailContentSkeleton />
            ) : listError && messages.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive" role="alert">{listError}</div>
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
              <DialogContent className="h-[min(760px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] max-w-3xl overflow-hidden p-0 sm:max-w-3xl">
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
                  error={composeError}
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
              {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}
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
