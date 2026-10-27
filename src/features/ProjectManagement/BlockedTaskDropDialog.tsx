import { useId, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { Task } from "./types";

export function BlockedTaskDropDialog({
  task,
  busy,
  onSave,
  onClose,
}: {
  task: Task;
  busy: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const id = useId();
  const notify = useNotify();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || reason.trim().length > 500) {
      notify(
        "Add a blocking reason",
        `Describe what is blocking this ${task.kind} in up to 500 characters.`,
        { variant: "warning", href: null },
      );
      return;
    }
    onSave(reason.trim());
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        aria-busy={busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Move {task.kind} to Blocked</DialogTitle>
            <DialogDescription>{task.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={id}>Blocked reason</Label>
            <Textarea
              id={id}
              aria-label="Blocked reason"
              autoFocus
              required
              maxLength={500}
              disabled={busy}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What needs to be resolved?"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
