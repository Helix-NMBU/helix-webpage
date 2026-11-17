import { useRef, useState } from "react";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { SaveTaskStatus } from "./TaskStatus";
import { canChangeTaskStatus } from "./task-status-permissions";
import type { ProjectWorkspace, Task, TaskStatus } from "./types";

export function useTaskBoardMove(
  currentTasks: ReadonlyMap<string, Task>,
  workspace: ProjectWorkspace,
  busy: boolean,
  onSave: SaveTaskStatus,
) {
  const [blockedTask, setBlockedTask] = useState<Task | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const notify = useNotify();
  const locked = busy || pending || !!blockedTask;
  function allowed(task: Task) {
    const current = currentTasks.get(task.id);
    return !!current && canChangeTaskStatus(current, workspace);
  }
  function canMove(task: Task) {
    return !locked && !saving.current && allowed(task);
  }
  async function save(task: Task, status: TaskStatus, reason = "") {
    if (busy || saving.current) return;
    if (!allowed(task)) {
      notify(
        "Task unavailable",
        "Your access or the visible task list changed. Reload the board before trying again.",
        { variant: "warning", href: null },
      );
      return;
    }
    saving.current = true;
    setPending(true);
    try {
      if (await onSave(task, status, reason)) setBlockedTask(null);
    } catch (error) {
      notify(
        "Could not change status",
        error instanceof Error ? error.message : "Try moving the task again.",
        { variant: "error", href: null },
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  function move(task: Task, status: TaskStatus) {
    if (!canMove(task) || task.status === status) return;
    if (status === "blocked") setBlockedTask(task);
    else void save(task, status);
  }
  return {
    locked,
    pending,
    blockedTask,
    canMove,
    move,
    closeBlocked: () => {
      if (!saving.current) setBlockedTask(null);
    },
    saveBlocked: (reason: string) => {
      if (blockedTask) void save(blockedTask, "blocked", reason);
    },
  };
}
