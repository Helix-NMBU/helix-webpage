import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@libs/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@libs/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@libs/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { Separator } from "@libs/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { previewPage, previewTeams } from "./workspace-preview-data";
import { useMemberAccount } from "./MemberAccountContext";
import { GmailLogo } from "./MailWorkspace";
import { memberSessionToken } from "../MemberCV/session";

const suggestions = [
  "Summarize Helix team updates",
  "Draft a Helix sponsor update",
  "What needs approval in Helix?",
  "Show the Helix production plan",
  "Help plan Helix's next campaign",
];

export function WorkspaceHomePreview() {
  const [text, setText] = useState("");
  const [scope, setScope] = useState("all");
  const [turn, setTurn] = useState<{ question: string; scope: string } | null>(
    null,
  );
  const form = useRef<HTMLFormElement>(null);

  function send(message: string) {
    if (!message.trim()) return;
    setTurn({ question: message, scope });
    setText("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(text.trim());
  }

  return (
    <section
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-2 py-12 sm:px-6"
      aria-labelledby="workspace-home-title"
    >
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Helix assistant
        </div>
        <h1
          id="workspace-home-title"
          className="text-3xl font-medium tracking-tight sm:text-4xl"
        >
          What are we working on?
        </h1>
        <p className="text-muted-foreground">
          Ask across your Helix workspace.
        </p>
      </div>

      {turn && (
        <div className="space-y-4" aria-live="polite">
          <p className="ml-auto w-fit max-w-full whitespace-pre-wrap break-words rounded-xl bg-muted px-4 py-3 text-sm">
            {turn.question}
          </p>
          <Card className="gap-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">
                Helix assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6">
              <div className="typeset typeset-chat">
                <p>
                  {turn.scope === "business-marketing"
                    ? "The partner spotlight is planned for the newsletter. The workshop stories campaign is ready for review."
                    : turn.scope === "finance"
                      ? "Two expense claims are ready for review. The event budget also needs a decision."
                      : turn.scope === "mechanical-production"
                        ? "The frame assembly is in workshop preparation. The mounting bracket is ready for design review."
                        : "The workshop stories campaign is ready for review. Finance has two expense claims awaiting review, and the production team is preparing the frame assembly."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {previewTeams
                  .filter(
                    (team) => turn.scope === "all" || turn.scope === team.id,
                  )
                  .map((team) => (
                    <Button key={team.id} asChild variant="outline" size="sm">
                      <Link to={`/teams/${team.id}/${team.sections[0].id}`}>
                        {team.title}
                      </Link>
                    </Button>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <div
          className="no-scrollbar flex scroll-fade-x gap-2 overflow-x-auto overscroll-x-contain py-1"
          role="group"
          aria-label="Helix suggestions"
        >
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        <form ref={form} onSubmit={submit}>
          <InputGroup className="rounded-xl bg-background shadow-sm">
            <InputGroupTextarea
              aria-label="Ask Helix"
              placeholder="Ask anything about your Helix workspace..."
              value={text}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              className="min-h-28 p-4"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  form.current?.requestSubmit();
                }
              }}
            />
            <InputGroupAddon align="block-end" className="gap-2">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger
                  aria-label="Workspace context"
                  className="h-8 w-auto max-w-[calc(100%_-_48px)] gap-2 border-0 px-2 shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {previewTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="ml-auto rounded-full"
                disabled={!text.trim()}
                aria-label="Send message"
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span className="text-muted-foreground">
          ChatGPT is not connected
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings#chatgpt">
            AI settings
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function TeamWorkspacePreview() {
  const { pathname } = useLocation();
  const page = previewPage(pathname);
  if (!page) return <Navigate to="/" replace />;
  const { team, section } = page;
  return (
    <section
      className="mx-auto w-full max-w-5xl space-y-8 px-2 py-8 sm:px-6"
      aria-labelledby="team-page-title"
    >
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {team.title}
        </div>
        <h1
          id="team-page-title"
          className="text-3xl font-medium tracking-tight"
        >
          {section.title}
        </h1>
        <p className="text-muted-foreground">{section.description}</p>
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{section.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {section.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.map((row) => (
                <TableRow key={row[0]}>
                  <TableCell className="min-w-40 font-medium">
                    {row[0]}
                  </TableCell>
                  <TableCell className="min-w-40 text-muted-foreground">
                    {row[1]}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="whitespace-nowrap font-normal"
                    >
                      {row[2]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

function ChatGPTLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" role="img" aria-label="ChatGPT">
      <path
        d="M16 4.25a6.1 6.1 0 0 1 5.8 4.2 6.1 6.1 0 0 1 5.45 6.95 6.1 6.1 0 0 1-3.1 7.9 6.1 6.1 0 0 1-7.83 3.26 6.1 6.1 0 0 1-7.57-3.8 6.1 6.1 0 0 1-3.9-7.52 6.1 6.1 0 0 1 4.06-7.44A6.1 6.1 0 0 1 16 4.25Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m16 4.25.05 8.05 6.96-3.85M27.25 15.4l-6.95 3.96.02 8.05M16.3 27.15l-6.96-3.9.08-8.03M4.75 15.25l6.98 3.98 6.92-3.98V7.28M9.05 8.6l6.97 4.02 6.93-4.02M7.85 23.55l-.05-8.03 6.92-4.03"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MemberSettingsPreview() {
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const boundUserId = useRef<string | null>(null);
  const account = useMemberAccount();
  const role = account?.role ?? "Member";

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await memberSessionToken(boundUserId);
        const response = await fetch("/api/gmail-status", {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as { connected?: unknown } | null;
        if (active) setGmailStatus(response.ok && body?.connected === true ? "connected" : "disconnected");
      } catch {
        if (active) setGmailStatus("disconnected");
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <section
      className="mx-auto w-full max-w-3xl space-y-8 px-2 py-8 sm:px-6"
      aria-labelledby="member-settings-title"
    >
      <div className="space-y-3">
        <h1
          id="member-settings-title"
          className="text-3xl font-medium tracking-tight"
        >
          Settings
        </h1>
        <p className="text-muted-foreground">
          Your connected accounts and workspace access.
        </p>
      </div>
      <Card id="app-connections" className="scroll-mt-8 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">App connections</CardTitle>
          <CardDescription>
            Manage the apps connected to your Helix member account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div id="chatgpt" className="flex flex-wrap items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background" aria-hidden="true">
              <ChatGPTLogo className="size-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">ChatGPT</p>
              <p className="text-sm text-muted-foreground">Not connected</p>
            </div>
            <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Connect ChatGPT</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect your ChatGPT account</DialogTitle>
                  <DialogDescription>
                    Manage the ChatGPT account used with the Helix assistant.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <p className="text-muted-foreground">
                    ChatGPT connections are currently unavailable. Please try
                    again later.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={() => setConnectionOpen(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border" aria-hidden="true">
              <GmailLogo className="size-7" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">Gmail</p>
              <p className="text-sm text-muted-foreground">
                {gmailStatus === "checking" ? "Checking connection…" : gmailStatus === "connected" ? "Connected" : "Not connected"}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/mail">{gmailStatus === "connected" ? "Open Gmail" : "Connect Gmail"}</Link>
            </Button>
          </div>
          <Separator />
          <p className="text-sm leading-6 text-muted-foreground">
            Connected apps can be managed from their respective workspaces.
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">
            Workspace access
          </CardTitle>
          <CardDescription>
            {account?.email || "Your Helix account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {role === "Admin" &&
            previewTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{team.title}</span>
                <Check
                  className="size-4 text-muted-foreground"
                  aria-label="Access granted"
                />
              </div>
            ))}
          <Separator />
          <p className="text-sm text-muted-foreground">
            {role === "Admin"
              ? "Access to all Helix team areas."
              : "Helix member access."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
