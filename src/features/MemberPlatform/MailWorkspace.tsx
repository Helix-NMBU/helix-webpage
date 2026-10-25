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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@libs/components/ui/breadcrumb";
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

const mailFolders: MailFolder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "archive", label: "Archive", icon: ArchiveX },
  { id: "trash", label: "Trash", icon: Trash2 },
];

function GmailLogo({ className }: { className?: string }) {
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
}: {
  activeFolder: string;
  onFolderChange: (folder: string) => void;
}) {
  const [search, setSearch] = useState("");
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
                  <DropdownMenuItem disabled>Mail settings</DropdownMenuItem>
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
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              <div className="p-4 text-sm leading-6 text-muted-foreground">Choose a folder to view its messages.</div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

function MailBreadcrumbRail() {
  return (
    <nav aria-label="Mail breadcrumbs" className="hidden w-44 shrink-0 border-r bg-background px-4 pt-5 md:block">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap gap-1">
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Helix NMBU</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Mail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </nav>
  );
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
  const [connectionState, setConnectionState] = useState(connectedOverride ? "connected" : "disconnected");
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const boundUserId = useRef<string | null>(null);

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
        if (active && response.ok && body?.connected === true) setConnectionState("connected");
      } catch {
        // The disconnected state remains the safe default when status is unavailable.
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {connected ? (
        <>
          <MailBreadcrumbRail />
          <ConnectedMailSidebar activeFolder={activeFolder} onFolderChange={setActiveFolder} />
          <main className="flex min-w-0 flex-1 items-center justify-center p-6" aria-live="polite">
            <div className="max-w-sm text-center">
              <folder.icon className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
              <h1 className="mt-4 text-lg font-medium tracking-tight">{emptyFolderMessage[folder.id]}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Messages from this folder will appear here after Gmail mirroring is enabled.
              </p>
            </div>
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
                Connect your Helix mailbox to mirror your inbox and search messages without leaving the member platform.
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
