import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberGmailRequest } from "./gmail-api";
const session = vi.hoisted(() => ({ token: vi.fn(async () => "verified-token") }));
vi.mock("../MemberCV/session", () => ({ memberSessionToken: session.token }));

describe("member Gmail transport", () => {
  beforeEach(() => {
    session.token.mockClear();
    vi.stubEnv("DEV", true);
    vi.stubEnv("MODE", "member-local");
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5196" } });
    vi.stubGlobal("localStorage", { getItem: () => "signed-in" });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("keeps local mail on loopback without authentication or network access", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const inbox = await memberGmailRequest("/api/gmail?action=messages&folder=inbox&unreadOnly=true", { current: null });
    const body = await inbox.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].unread).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(session.token).not.toHaveBeenCalled();
  });
  it.each(["production", "external-host", "ordinary-development"])("requires a verified session for %s", async (condition) => {
    if (condition === "production") vi.stubEnv("DEV", false);
    if (condition === "external-host") vi.stubGlobal("window", { location: { origin: "https://internal.helixnmbu.no" } });
    if (condition === "ordinary-development") vi.stubEnv("MODE", "development");
    const network = vi.fn(async () => Response.json({ connected: false }));
    vi.stubGlobal("fetch", network);
    await memberGmailRequest("/api/gmail-status", { current: null });
    expect(session.token).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledWith("/api/gmail-status", expect.objectContaining({ cache: "no-store", credentials: "include", headers: { Authorization: "Bearer verified-token" } }));
  });
});
