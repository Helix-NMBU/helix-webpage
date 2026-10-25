import { useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  Link2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { previewPage, previewTeams } from "./workspace-preview-data";

const suggestions = [
  "Give me a workspace summary",
  "Draft a sponsor update",
  "What needs approval?",
];

export function WorkspaceHomePreview() {
  const [text, setText] = useState("");
  const [scope, setScope] = useState("all");
  const [turn, setTurn] = useState<{ question: string; scope: string } | null>(
    null,
  );
  const form = useRef<HTMLFormElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setTurn({ question: text.trim(), scope });
    setText("");
  }

  return (
    <section
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-2 py-12 sm:px-6"
      aria-labelledby="workspace-home-title"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4" />
          Helix assistant
          <Badge variant="secondary" className="font-normal">
            Preview
          </Badge>
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
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4" />
                Example response
              </CardTitle>
              <CardDescription>
                This illustrates a future reply using fictional workspace
                content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6">
              <p>
                {turn.scope === "business-marketing"
                  ? "The partner spotlight is planned for the newsletter. The workshop stories campaign is ready for review."
                  : turn.scope === "finance"
                    ? "Two example expense claims are ready for review. The event budget also needs a decision."
                    : turn.scope === "mechanical-production"
                      ? "The frame assembly is in workshop preparation. The mounting bracket is ready for design review."
                      : "The workshop stories campaign is ready for review. Finance has two example expense claims awaiting review, and the production team is preparing the frame assembly."}
              </p>
              <div className="flex flex-wrap gap-2">
                {previewTeams
                  .filter(
                    (team) => turn.scope === "all" || turn.scope === team.id,
                  )
                  .map((team) => (
                    <Button key={team.id} asChild variant="outline" size="sm">
                      <Link to={`/teams/${team.id}/${team.sections[0].id}`}>
                        <team.icon />
                        {team.title}
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
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
                aria-label="Preview response"
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal py-2 font-normal"
              onClick={() => {
                setText(suggestion);
                form.current?.querySelector("textarea")?.focus();
              }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Example mode. Prompts stay on this page and are not sent to an AI
          service.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Link2 className="size-4" />
          ChatGPT is not connected
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings#chatgpt">
            AI settings
            <ArrowUpRight />
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <team.icon className="size-4" />
          {team.title}
          <Badge variant="secondary" className="font-normal">
            Preview
          </Badge>
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
          <CardDescription>
            Sample content to explore how this team area could work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>
              Fictional data. Changes and approvals are not enabled.
            </TableCaption>
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
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertDescription className="text-muted-foreground">
          You can explore every team in this preview. Team-based access will be
          added later.
        </AlertDescription>
      </Alert>
    </section>
  );
}

export function MemberSettingsPreview() {
  const [connectionPreview, setConnectionPreview] = useState(false);
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
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            AI connection
            <Badge variant="secondary" className="font-normal">
              Preview
            </Badge>
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
            <Dialog
              open={connectionPreview}
              onOpenChange={setConnectionPreview}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Link2 />
                  Connect ChatGPT
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect your ChatGPT account</DialogTitle>
                  <DialogDescription>
                    This is a preview of the connection setup. No account will
                    be connected.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <p>
                    When enabled, you will sign in with ChatGPT and review the
                    permissions before connecting.
                  </p>
                  <p className="text-muted-foreground">
                    Using your ChatGPT plan depends on account eligibility and
                    integration approval. The Helix connection has not been set
                    up yet.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={() => setConnectionPreview(false)}>
                    Close preview
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Separator />
          <p className="text-sm leading-6 text-muted-foreground">
            The assistant is intended to work with the Helix information you
            have access to. Account linking and live AI responses are not
            enabled in this preview.
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Workspace access
            <Badge variant="secondary" className="font-normal">
              All access · Preview
            </Badge>
          </CardTitle>
          <CardDescription>
            All team areas are visible for this mockup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewTeams.map((team) => (
            <div key={team.id} className="flex items-center gap-3 text-sm">
              <team.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{team.title}</span>
              <Check
                className="size-4 text-muted-foreground"
                aria-label="Visible in preview"
              />
            </div>
          ))}
          <Separator />
          <p className="text-sm text-muted-foreground">
            Team memberships and permission management will be added later.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
