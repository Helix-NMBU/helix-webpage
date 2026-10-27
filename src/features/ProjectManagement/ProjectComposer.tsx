import { useRef, useState, type FormEvent } from "react";
import {
  IconChevronRight,
  IconDiamonds,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { formatDate, validateProject, validateProjectMilestones } from "./model";
import { ProjectComposerProperties } from "./ProjectComposerProperties";
import { ProjectDatePicker } from "./ProjectDatePicker";
import {
  MAX_PROJECT_MILESTONES,
  type ProjectInput,
  type ProjectMilestoneInput,
  type ProjectMutation,
  type ProjectWorkspace,
  type TaskCategory,
} from "./types";

const newMilestone = (): ProjectMilestoneInput => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  deadline: null,
  partnerName: "",
});

export function ProjectComposer({
  category,
  members,
  taskLeadCategories,
  busy,
  onSave,
  onClose,
}: {
  category: TaskCategory;
  members: ProjectWorkspace["members"];
  taskLeadCategories: TaskCategory[];
  busy: boolean;
  onSave: (mutation: ProjectMutation) => Promise<unknown>;
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<ProjectInput>({
    name: "",
    description: "",
    category,
    departments: [],
    priority: "normal",
    leadIds: [],
    startDate: null,
    deadline: null,
  });
  const [milestones, setMilestones] = useState<ProjectMilestoneInput[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [milestone, setMilestone] = useState<ProjectMilestoneInput | null>(null);
  const submitting = useRef(false);
  const notify = useNotify();
  const canAddMilestones = taskLeadCategories.includes(draft.category);
  function report(error: unknown) {
    notify(
      "Could not save project",
      error instanceof Error ? error.message : "Check the project details and try again.",
      { variant: "error", href: null },
    );
  }
  function addMilestone() {
    if (busy || !milestone || !canAddMilestones) return;
    try {
      const next = [...milestones.filter((item) => item.id !== milestone.id), milestone];
      const valid = validateProjectMilestones(next, id, draft.category);
      // Editing retains the milestone's position in the list.
      setMilestones(
        milestones.some((item) => item.id === milestone.id)
          ? milestones.map((item) =>
              item.id === milestone.id ? valid.find((item) => item.id === milestone.id)! : item,
            )
          : valid,
      );
      setMilestone(null);
    } catch (error) {
      report(error);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitting.current) return;
    try {
      if (milestone)
        throw new Error("Add or cancel the milestone you are editing before creating the project.");
      if (milestones.length && !canAddMilestones)
        throw new Error(
          "Select an area you lead or remove its draft milestones before creating the project.",
        );
      const project = validateProject(draft);
      const initial = validateProjectMilestones(milestones, id, project.category);
      submitting.current = true;
      await onSave({
        action: "save_project",
        id,
        expectedRevision: 0,
        project,
        ...(initial.length ? { milestones: initial } : {}),
      });
    } catch (error) {
      report(error);
    } finally {
      submitting.current = false;
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !submitting.current) onClose();
      }}
    >
      <DialogContent
        className="flex h-[min(52rem,92svh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={!busy}
      >
        <div className="flex items-center gap-2 px-6 py-5 pr-16">
          <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs">Helix NMBU</span>
          <IconChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <DialogTitle className="text-sm font-normal">New project</DialogTitle>
          <DialogDescription className="sr-only">
            Create an S27 project, set its properties and optionally add milestones.
          </DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
          <fieldset
            disabled={busy}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6"
          >
            <Label htmlFor="project-name" className="sr-only">
              Project name
            </Label>
            <Input
              id="project-name"
              autoFocus
              required
              maxLength={200}
              placeholder="Project name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="h-auto shrink-0 rounded-none border-0 bg-transparent! px-0 py-3 text-2xl! font-medium shadow-none focus-visible:ring-0"
            />
            <ProjectComposerProperties
              draft={draft}
              setDraft={setDraft}
              members={members}
              busy={busy}
            />
            <div className="flex min-h-20 flex-1 flex-col border-t pt-5">
              <Label htmlFor="project-description" className="sr-only">
                Description
              </Label>
              <Textarea
                id="project-description"
                maxLength={2000}
                placeholder="Write a description, a project brief, or collect ideas…"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                className="min-h-20 flex-1 resize-none rounded-none border-0 bg-transparent! px-0 py-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
            <Collapsible
              open={expanded}
              onOpenChange={setExpanded}
              className="my-4 shrink-0 rounded-xl border"
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  className="h-11 w-full justify-between rounded-xl px-4 font-normal"
                >
                  <span>
                    Milestones
                    {milestones.length > 0 ? ` · ${milestones.length}` : ""}
                  </span>
                  <IconPlus
                    aria-hidden="true"
                    className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-45" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t p-3">
                {milestones.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-md px-1 py-1">
                    <IconDiamonds
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(item.deadline)}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit milestone ${item.title}`}
                      disabled={busy || milestone !== null || !canAddMilestones}
                      onClick={() => setMilestone({ ...item })}
                    >
                      <IconPencil aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove milestone ${item.title}`}
                      disabled={busy || milestone !== null}
                      onClick={() =>
                        setMilestones(milestones.filter((draft) => draft.id !== item.id))
                      }
                    >
                      <IconTrash aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {milestone ? (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                      {milestones.some((item) => item.id === milestone.id)
                        ? "Edit milestone"
                        : "Create milestone"}
                    </p>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex min-w-48 flex-1 items-center gap-2">
                        <IconDiamonds
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Label htmlFor="project-milestone-title" className="sr-only">
                          Milestone name
                        </Label>
                        <Input
                          id="project-milestone-title"
                          autoFocus
                          maxLength={200}
                          placeholder="Milestone name"
                          value={milestone.title}
                          onChange={(event) =>
                            setMilestone({
                              ...milestone,
                              title: event.target.value,
                            })
                          }
                          className="border-0 bg-transparent! px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <ProjectDatePicker
                        id="project-milestone-deadline"
                        label="Milestone target date"
                        value={milestone.deadline}
                        required
                        disabled={busy || !canAddMilestones}
                        onChange={(deadline) => setMilestone({ ...milestone, deadline })}
                      />
                    </div>
                    <Label htmlFor="project-milestone-description" className="sr-only">
                      Milestone description
                    </Label>
                    <Textarea
                      id="project-milestone-description"
                      maxLength={2000}
                      placeholder="Add a description…"
                      value={milestone.description}
                      onChange={(event) =>
                        setMilestone({
                          ...milestone,
                          description: event.target.value,
                        })
                      }
                      className="min-h-16 resize-none border-0 bg-transparent! p-0 shadow-none focus-visible:ring-0"
                    />
                    {draft.category === "partnership-deliverables" && (
                      <>
                        <Label htmlFor="project-milestone-partner">Sponsor or partner</Label>
                        <Input
                          id="project-milestone-partner"
                          maxLength={200}
                          value={milestone.partnerName}
                          onChange={(event) =>
                            setMilestone({
                              ...milestone,
                              partnerName: event.target.value,
                            })
                          }
                        />
                      </>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMilestone(null)}
                      >
                        Cancel milestone
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !canAddMilestones}
                        onClick={addMilestone}
                      >
                        {milestones.some((item) => item.id === milestone.id)
                          ? "Save milestone"
                          : "Add milestone"}
                      </Button>
                    </div>
                  </div>
                ) : canAddMilestones ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || milestones.length >= MAX_PROJECT_MILESTONES}
                    onClick={() => setMilestone(newMilestone())}
                  >
                    Add milestone
                  </Button>
                ) : (
                  <p className="px-1 text-xs text-muted-foreground">
                    Milestones can be added by a Department Lead for the selected area.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          </fieldset>
          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || milestone !== null}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
