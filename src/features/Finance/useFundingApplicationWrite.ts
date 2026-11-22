import { useEffect, useRef, useState } from "react";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { FundingApplicationMutation } from "./funding-application-types";
import type { FundingApplicationRepository } from "./funding-application-repository";
export function useFundingApplicationWrite(
  repository: FundingApplicationRepository,
  onChanged: () => Promise<void>,
  onDenied: () => void,
) {
  const notify = useNotify(),
    [busy, setBusy] = useState(false);
  const active = useRef(false),
    generation = useRef(0),
    working = useRef(false),
    pending = useRef<{ key: string; id: string } | null>(null);
  const callbacks = useRef({ onChanged, onDenied });
  callbacks.current = { onChanged, onDenied };
  useEffect(() => {
    active.current = true;
    generation.current++;
    working.current = false;
    setBusy(false);
    const stop = repository.watchSession?.(() => {
      generation.current++;
      working.current = false;
      setBusy(false);
      callbacks.current.onDenied();
      notify("Session ended", "Sign in again to continue.", {
        variant: "error",
        href: null,
      });
    });
    return () => {
      active.current = false;
      generation.current++;
      stop?.();
    };
  }, [repository, notify]);
  async function save(change: FundingApplicationMutation): Promise<boolean> {
    if (working.current || !active.current) return false;
    const key = JSON.stringify({ ...change, requestId: "" });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    const operation = ++generation.current;
    working.current = true;
    setBusy(true);
    try {
      await repository.mutate({ ...change, requestId: pending.current.id });
      if (!active.current || operation !== generation.current) return false;
      pending.current = null;
      notify(
        "Funding application saved",
        "The funding application and affected budget views were updated.",
        { variant: "success", href: null },
      );
      return true;
    } catch (error) {
      if (!active.current || operation !== generation.current) return false;
      const code =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      if (code === 401 || code === 403) {
        generation.current++;
        working.current = false;
        setBusy(false);
        callbacks.current.onDenied();
      }
      notify(
        "Could not save funding application",
        error instanceof Error ? error.message : "Please try again.",
        {
          variant: "error",
          href: null,
          ...(code === 409
            ? {
                action: {
                  label: "Refresh",
                  onClick: () => {
                    if (active.current && operation === generation.current)
                      void callbacks.current.onChanged();
                  },
                },
              }
            : {}),
        },
      );
      return false;
    } finally {
      if (
        active.current &&
        (operation === generation.current || !working.current)
      ) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, save };
}
