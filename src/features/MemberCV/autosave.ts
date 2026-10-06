import { CvRequestError, validateMutation } from "./repository";
import type { CvData, CvEnvelope, CvMutation, CvSharing } from "./types";

export type CvAutosaveSnapshot = { draft: CvData; sharing: CvSharing };
export type CvAutosaveFailure = "validation" | "conflict" | "session" | "uncertain";
export type CvAutosaveState = {
  saving: boolean;
  pending: boolean;
  paused: CvAutosaveFailure | null;
};

type AutosaveOptions = {
  initialEnvelope: CvEnvelope;
  mutate: (mutation: CvMutation) => Promise<CvEnvelope>;
  onSaved: (envelope: CvEnvelope, submitted: CvAutosaveSnapshot) => void;
  onFailure: (failure: unknown, kind: CvAutosaveFailure) => void;
  onState?: (state: CvAutosaveState) => void;
  validate?: (mutation: CvMutation) => CvMutation;
  delay?: number;
};

function snapshot(envelope: CvEnvelope): CvAutosaveSnapshot {
  return { draft: envelope.document.draft, sharing: envelope.document.sharing };
}

export function cvSnapshotKey(value: CvAutosaveSnapshot): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]));
  });
}

/** Saves only private drafts. The caller retains its live input after acknowledgment. */
export function createPrivateAutosave(options: AutosaveOptions) {
  let envelope = structuredClone(options.initialEnvelope);
  let live = structuredClone(snapshot(envelope));
  let savedKeys = new Set([cvSnapshotKey(live)]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let blocked = false;
  let locked = false;
  let disposed = false;
  let generation = 0;
  let paused: CvAutosaveFailure | null = null;

  const key = () => cvSnapshotKey(live);
  const getState = (): CvAutosaveState => ({
    saving: inFlight !== null,
    pending: !savedKeys.has(key()),
    paused,
  });
  const emit = () => { if (!disposed) options.onState?.(getState()); };

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    cancelTimer();
    if (disposed || blocked || locked || paused || inFlight || !getState().pending) return;
    timer = setTimeout(() => {
      timer = null;
      start();
    }, options.delay ?? 800);
  }

  function start() {
    if (disposed || blocked || locked || paused || inFlight || !getState().pending) return;
    const current = generation;
    const submitted = structuredClone(live);
    const submittedKey = cvSnapshotKey(submitted);
    let mutation: CvMutation;
    try {
      mutation = (options.validate ?? validateMutation)({
        action: "save",
        ...submitted,
        expectedRevision: envelope.document.revision,
      });
      // Validation must not turn a private autosave into a publication action.
      mutation = { ...mutation, action: "save", expectedRevision: envelope.document.revision };
    } catch (failure) {
      paused = "validation";
      options.onFailure(failure, paused);
      emit();
      return;
    }

    // Start on the next microtask so synchronous transports still observe the lock.
    inFlight = Promise.resolve()
      .then(() => disposed || current !== generation ? null : options.mutate(mutation))
      .then((result) => {
        if (!result || disposed || current !== generation) return;
        envelope = structuredClone(result);
        savedKeys = new Set([submittedKey, cvSnapshotKey(snapshot(result))]);
        options.onSaved(result, submitted);
      })
      .catch((failure: unknown) => {
        if (disposed || current !== generation) return;
        paused = failure instanceof CvRequestError
          ? failure.status === 400 ? "validation"
            : failure.status === 409 ? "conflict"
              : failure.status === 401 || failure.status === 403 ? "session" : "uncertain"
          : "uncertain";
        options.onFailure(failure, paused);
      })
      .finally(() => {
        // An old request cannot clear a newer request or update a replaced session.
        if (disposed || current !== generation) return;
        inFlight = null;
        emit();
        schedule();
      });
    emit();
  }

  return {
    getState,
    update(draft: CvData, sharing: CvSharing) {
      if (disposed) return;
      const next = structuredClone({ draft, sharing });
      if (cvSnapshotKey(next) === key()) return;
      live = next;
      if (paused === "validation") paused = null;
      emit();
      schedule();
    },
    setBlocked(value: boolean) {
      if (disposed || blocked === value) return;
      blocked = value;
      schedule();
    },
    /** Call before capturing input for any manual action; unlock in its finally. */
    async lock(): Promise<CvEnvelope> {
      locked = true;
      cancelTimer();
      await inFlight;
      return structuredClone(envelope);
    },
    unlock() {
      if (disposed) return;
      locked = false;
      schedule();
    },
    /** Record a successful explicit mutation without replacing the editor's input. */
    acknowledge(result: CvEnvelope, submitted?: CvAutosaveSnapshot) {
      if (disposed) return;
      envelope = structuredClone(result);
      savedKeys = new Set([cvSnapshotKey(snapshot(result)), ...(submitted ? [cvSnapshotKey(submitted)] : [])]);
      paused = null;
      emit();
      schedule();
    },
    /** An explicit reload creates a fresh generation and adopts its saved input. */
    reset(result: CvEnvelope) {
      if (disposed) return;
      cancelTimer();
      generation++;
      inFlight = null;
      envelope = structuredClone(result);
      live = structuredClone(snapshot(result));
      savedKeys = new Set([key()]);
      paused = null;
      emit();
    },
    dispose() {
      disposed = true;
      generation++;
      cancelTimer();
    },
  };
}
