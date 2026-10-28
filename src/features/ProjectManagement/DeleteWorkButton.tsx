import { useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";

export function DeleteWorkButton({ kind, title, busy, onDelete }: { kind: "task" | "milestone" | "project"; title: string; busy: boolean; onDelete: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="destructive" size="sm" disabled={busy} onClick={() => setOpen(true)}>Delete {kind}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader>
      <DialogTitle>Delete {kind}?</DialogTitle>
      <DialogDescription>This will permanently delete “{title}”{kind === "project" ? " and all its milestones and tasks" : kind === "milestone" ? " and its tasks" : ""}.</DialogDescription>
    </DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void onDelete().then(saved => { if (saved) setOpen(false); })}>Confirm deletion</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
