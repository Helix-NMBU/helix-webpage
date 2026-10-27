import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Switch } from "@libs/components/ui/switch";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronRight,
} from "@tabler/icons-react";
import { TaskComposerAttributes } from "./TaskComposerAttributes";
import { Choice, Field } from "./TaskEditor";
import {
  CATEGORY_LABELS,
  type ProjectMutation,
  type ProjectWorkspace,
  type TaskCategory,
  type TaskInput,
} from "./types";
import { compatibleMilestones, updateTaskDraft } from "./progress";
import { validateTask } from "./model";
import { useNotify } from "../MemberPlatform/MemberNotifications";

export function TaskComposer({
  workspace,
  category,
  projectId,
  busy,
  onSave,
  onClose,
  initialKind = "task",
  initialMilestoneId = null,
}: {
  workspace: ProjectWorkspace;
  category: TaskCategory;
  projectId: string | null;
  busy: boolean;
  initialKind?: TaskInput["kind"];
  initialMilestoneId?: string | null;
  onSave: (mutation: ProjectMutation) => Promise<boolean>;
  onClose: () => void;
}) {
  const areaProjects = workspace.projects.filter(
    (project) => project.category === category,
  );
  const initialProjectId =
    projectId ?? (areaProjects.length === 1 ? areaProjects[0].id : null);
  const initialMilestones = workspace.tasks.filter(
    (task) =>
      task.kind === "milestone" &&
      task.projectId &&
      task.projectId === initialProjectId &&
      task.category === category &&
      task.status !== "cancelled",
  );
  const [id, setId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<TaskInput>(() => ({
    title: "",
    description: "",
    category,
    projectId: initialProjectId,
    milestoneId:
      initialKind === "task"
        ? (initialMilestones.find((item) => item.id === initialMilestoneId)
            ?.id ??
          (initialMilestones.length === 1 ? initialMilestones[0].id : null))
        : null,
    assigneeIds: [],
    deadline: null,
    startDate: null,
    status: "todo",
    priority: "normal",
    kind: initialKind,
    partnerName: "",
    blockedReason: "",
  }));
  const [details, setDetails] = useState(initialKind === "milestone");
  const [expanded, setExpanded] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  const notify = useNotify();
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    titleInput.current?.focus();
  }, [id]);
  const change = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setDraft((previous) =>
      updateTaskDraft(previous, key, value, workspace.tasks),
    );
  const milestones = compatibleMilestones(workspace.tasks, draft);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspace.taskLeadCategories.includes(category)) return;
    try {
      const saved = await onSave({
        action: "save_task",
        id,
        expectedRevision: 0,
        task: validateTask(draft),
      });
      if (!saved) return;
      if (createMore) {
        setId(crypto.randomUUID());
        setDraft((previous) => ({ ...previous, title: "", description: "" }));
      } else onClose();
    } catch (error) {
      notify(
        "Could not create task",
        error instanceof Error ? error.message : "Please try again.",
        { variant: "error", href: null },
      );
    }
  }
  const kindLabel = draft.kind === "milestone" ? "milestone" : "task";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className={`flex max-h-[90svh] flex-col gap-0 overflow-y-auto rounded-2xl border bg-card p-0 ${expanded ? "h-[90svh] sm:max-w-[calc(100%-2rem)]" : "sm:max-w-4xl"}`}
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 px-6 pb-3 pt-5 pr-24">
          <div className="flex items-center gap-2">
            <span className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
              HELIX
            </span>
            <IconChevronRight
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <DialogTitle className="text-base font-medium">
              New {kindLabel}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Create a {kindLabel} in {CATEGORY_LABELS[category]}. Set its
            description, status, priority, assignees, project, milestone and due
            date.
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            expanded ? "Restore task dialog size" : "Expand task dialog"
          }
          title={expanded ? "Restore size" : "Expand"}
          className="absolute right-14 top-4"
          disabled={busy}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <IconArrowsMinimize aria-hidden="true" className="size-4" />
          ) : (
            <IconArrowsMaximize aria-hidden="true" className="size-4" />
          )}
        </Button>
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <fieldset disabled={busy} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 px-6 pb-3 pt-4">
              <Label htmlFor="new-task-title" className="sr-only">
                Task title
              </Label>
              <Textarea
                ref={titleInput}
                id="new-task-title"
                autoFocus
                required
                maxLength={200}
                rows={1}
                placeholder={
                  draft.kind === "milestone" ? "Milestone title" : "Task title"
                }
                className="min-h-10 resize-none border-0 bg-transparent p-0 text-xl font-medium shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
                value={draft.title}
                onChange={(event) => change("title", event.target.value)}
              />
              <Label htmlFor="new-task-description" className="sr-only">
                Description
              </Label>
              <Textarea
                id="new-task-description"
                maxLength={2000}
                rows={5}
                placeholder="Add description…"
                className="min-h-36 resize-y border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                value={draft.description}
                onChange={(event) => change("description", event.target.value)}
              />
              {category === "partnership-deliverables" && (
                <Field id="new-task-partner" label="Sponsor or partner">
                  <Input
                    id="new-task-partner"
                    required
                    maxLength={200}
                    value={draft.partnerName}
                    onChange={(event) =>
                      change("partnerName", event.target.value)
                    }
                    placeholder="Which partner is this deliverable for?"
                  />
                </Field>
              )}
              {draft.status === "blocked" && (
                <Field id="new-task-blocked" label="Blocked reason">
                  <Textarea
                    id="new-task-blocked"
                    required
                    maxLength={500}
                    rows={2}
                    value={draft.blockedReason}
                    onChange={(event) =>
                      change("blockedReason", event.target.value)
                    }
                    placeholder="What is blocking this task?"
                  />
                </Field>
              )}
              {!areaProjects.length && (
                <p className="text-sm text-muted-foreground">
                  A project manager needs to add a project in this area before
                  work can be created.
                </p>
              )}
              {draft.kind === "task" && !milestones.length && (
                <p className="text-sm text-muted-foreground">
                  Choose a project with an available milestone, or create a
                  milestone in the project first.
                </p>
              )}
              {details && (
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <Field id="new-task-kind" label="Type">
                    <Choice
                      id="new-task-kind"
                      disabled={busy}
                      value={draft.kind}
                      onChange={(value) =>
                        change("kind", value as TaskInput["kind"])
                      }
                      options={[
                        { value: "task", label: "Task" },
                        { value: "milestone", label: "Milestone" },
                      ]}
                    />
                  </Field>
                  <Field id="new-task-start" label="Start date">
                    <Input
                      id="new-task-start"
                      type="date"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={draft.startDate ?? ""}
                      onChange={(event) =>
                        change("startDate", event.target.value || null)
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
            <TaskComposerAttributes
              draft={draft}
              workspace={workspace}
              busy={busy}
              details={details}
              onDetails={() => setDetails((value) => !value)}
              onChange={change}
            />
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 pb-5 pt-4">
              <div className="mr-1 flex items-center gap-2 whitespace-nowrap">
                <Switch
                  id="create-another-task"
                  checked={createMore}
                  disabled={busy}
                  onCheckedChange={setCreateMore}
                  className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/40 [&>span]:translate-x-0 data-[state=checked]:[&>span]:translate-x-[calc(100%-2px)]"
                />
                <Label
                  htmlFor="create-another-task"
                  className="text-sm font-normal text-muted-foreground"
                >
                  Create more
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="rounded-full px-5"
              >
                {busy ? "Creating…" : `Create ${kindLabel}`}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
