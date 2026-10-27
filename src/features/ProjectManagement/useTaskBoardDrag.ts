import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { SaveTaskStatus } from "./TaskStatus";
import { canChangeTaskStatus } from "./task-status-permissions";
import {
  TASK_WORKFLOW_STATUSES,
  type ProjectWorkspace,
  type Task,
  type TaskStatus,
} from "./types";

export function useTaskBoardDrag(
  tasks: Task[],
  workspace: ProjectWorkspace,
  busy: boolean,
  onSave: SaveTaskStatus,
) {
  const currentTasks = new Map(tasks.map((task) => [task.id, task]));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [blockedTask, setBlockedTask] = useState<Task | null>(null);
  const [pending, setPending] = useState(false);
  const dragging = useRef<Task | null>(null);
  const saving = useRef(false);
  const suppressClickUntil = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const scrollSpeed = useRef(0);
  const notify = useNotify();
  const locked = busy || pending || !!blockedTask;
  const stopScroll = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    scrollSpeed.current = 0;
  }, []);
  function allowed(task: Task) {
    const current = currentTasks.get(task.id);
    return !!current && canChangeTaskStatus(current, workspace);
  }
  function canDrag(task: Task) {
    return !locked && !saving.current && allowed(task);
  }
  function canDrop(status: TaskStatus) {
    const task = dragging.current;
    return (
      !!task &&
      canDrag(task) &&
      task.status !== status &&
      TASK_WORKFLOW_STATUSES.includes(
        status as (typeof TASK_WORKFLOW_STATUSES)[number],
      )
    );
  }
  const end = useCallback(() => {
    if (dragging.current) suppressClickUntil.current = Date.now() + 250;
    dragging.current = null;
    setDraggingId(null);
    setOver(null);
    stopScroll();
  }, [stopScroll]);
  useEffect(() => {
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragend", end);
      stopScroll();
    };
  }, [end, stopScroll]);
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
  function start(event: DragEvent<HTMLElement>, task: Task) {
    if (!canDrag(task)) {
      event.preventDefault();
      return;
    }
    dragging.current = task;
    suppressClickUntil.current = Number.POSITIVE_INFINITY;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-helix-task", task.id);
    event.dataTransfer.setData("text/plain", task.id);
    setDraggingId(task.id);
  }
  function enter(event: DragEvent<HTMLElement>, status: TaskStatus) {
    if (!canDrop(status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(status);
  }
  function leave(event: DragEvent<HTMLElement>, status: TaskStatus) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    setOver((current) => (current === status ? null : current));
  }
  function drop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    if (!canDrop(status)) return;
    event.preventDefault();
    event.stopPropagation();
    const task = dragging.current!;
    end();
    if (status === "blocked") setBlockedTask(task);
    else void save(task, status);
  }
  function boardOver(event: DragEvent<HTMLDivElement>) {
    if (!dragging.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    if (!rect.width) return;
    scrollSpeed.current =
      event.clientX < rect.left + 48
        ? -12
        : event.clientX > rect.right - 48
          ? 12
          : 0;
    if (frame.current !== null || !scrollSpeed.current) return;
    const tick = () => {
      if (!dragging.current || !boardRef.current || !scrollSpeed.current) {
        frame.current = null;
        return;
      }
      boardRef.current.scrollLeft += scrollSpeed.current;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  function boardLeave(event: DragEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    stopScroll();
  }
  function preventDragClick(event: MouseEvent<HTMLElement>) {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  return {
    boardRef,
    boardOver,
    boardLeave,
    draggingId,
    over,
    locked,
    pending,
    blockedTask,
    canDrag,
    start,
    end,
    enter,
    leave,
    drop,
    preventDragClick,
    closeBlocked: () => {
      if (!saving.current) setBlockedTask(null);
    },
    saveBlocked: (reason: string) => {
      if (blockedTask) void save(blockedTask, "blocked", reason);
    },
  };
}
