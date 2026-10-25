import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMemberLanding, watchMemberSession } from "./session";

afterEach(() => {
  clearMemberLanding();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("installed Neon SDK session watcher", () => {
  it.each([401, 403])("ends access when the installed SDK throws HTTP %s", async (status) => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      location: { href: "https://member-test.invalid/profile", search: "" },
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Session expired" }, { status })));
    const onEnd = vi.fn();
    const stop = watchMemberSession(onEnd, createAuthClient("https://member-test.invalid/api/auth", { adapter: BetterAuthVanillaAdapter() }), { current: "member-a" });
    try {
      listeners.get("focus")?.(new Event("focus"));
      await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    } finally { stop(); }
  });

  it("keeps transient failure separate from expiry and checks the account on recovery", async () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      location: { href: "https://member-test.invalid/profile", search: "" },
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let unavailable = true;
    const request = vi.fn(async () => unavailable
      ? Response.json({ message: "Temporarily unavailable" }, { status: 503 })
      : Response.json({ user: { id: "member-b" }, session: { userId: "member-b" } }));
    vi.stubGlobal("fetch", request);
    const onEnd = vi.fn();
    const stop = watchMemberSession(onEnd, createAuthClient("https://member-test.invalid/api/auth", { adapter: BetterAuthVanillaAdapter() }), { current: "member-a" });
    try {
      listeners.get("focus")?.(new Event("focus"));
      await vi.waitFor(() => expect(logged).toHaveBeenCalled());
      expect(onEnd).not.toHaveBeenCalled();
      unavailable = false;
      listeners.get("focus")?.(new Event("focus"));
      await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
      expect(request).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it("calls the SDK endpoint directly, forces fresh reads and ends access after an account switch", async () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      location: { href: "https://member-test.invalid/profile", origin: "https://member-test.invalid", search: "" },
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    let userId = "member-a";
    const request = vi.fn<typeof fetch>(async (input, init) => {
      expect(new URL(String(input)).pathname).toBe("/api/auth/get-session");
      expect(init?.method).toBe("GET");
      return Response.json({ user: { id: userId }, session: { userId } });
    });
    vi.stubGlobal("fetch", request);
    const client = createAuthClient("https://member-test.invalid/api/auth", { adapter: BetterAuthVanillaAdapter() });
    const onEnd = vi.fn();
    const stop = watchMemberSession(onEnd, client, { current: "member-a" });
    try {
      expect(request).not.toHaveBeenCalled();
      listeners.get("focus")?.(new Event("focus"));
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      expect(onEnd).not.toHaveBeenCalled();
      userId = "member-b";
      listeners.get("focus")?.(new Event("focus"));
      await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
