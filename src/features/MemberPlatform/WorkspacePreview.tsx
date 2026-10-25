import { useRef, useState, type FormEvent } from "react";
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
import { useNotify } from "./MemberNotifications";

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

export function MemberSettingsPreview() {
  const notify = useNotify();
  const account = useMemberAccount();
  const role = account?.role ?? "Member";
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
      <Card id="chatgpt" className="scroll-mt-8 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">
            AI connection
          </CardTitle>
          <CardDescription>
            Connect your own ChatGPT account to power the Helix assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">ChatGPT</p>
              <p className="text-sm text-muted-foreground">Not connected</p>
            </div>
            <Button variant="outline" onClick={() => notify("Connection unavailable", "ChatGPT connections are currently unavailable. Please try again later.", { id: "chatgpt-connection", variant: "info", href: "/settings#chatgpt" })}>
              Connect ChatGPT
            </Button>
          </div>
          <Separator />
          <p className="text-sm leading-6 text-muted-foreground">
            Manage your connection to the Helix assistant.
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
