// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@libs/components/ui/tooltip";
import { MailWorkspace } from "./MailWorkspace";
import { MemberAccountProvider } from "./MemberAccountContext";
import { clearGmailSessionCache, getCachedGmailMessage } from "./gmail-session-cache";
import { defaultSignatureSettings, renderSignature } from "./email-signature";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("./MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("../MemberCV/session", () => ({ memberSessionToken: async () => "member-token" }));

const member = { name: "Åse Example", email: "ase@helixnmbu.no", role: "Member" as const, helixRole: "Mechanical lead" };
const original = { id: "unread-1", threadId: "thread-1", from: "Jordan <jordan@example.test>", replyTo: "jordan@example.test", subject: "Team update", date: "2026-10-26T10:00:00Z", snippet: "Meeting agenda", unread: true, starred: false, body: "Original plain text", htmlBody: '<table><tr><td style="color:#123456">Original <b>formatted email</b></td></tr></table><script>evil()</script>' };

function mailServer(options: { failRead?: boolean; emptyFirstPage?: boolean; multipleUnread?: boolean; readBeforeOpening?: boolean; signatureEnabled?: boolean } = {}) {
  const unreadIds = new Set([original.id, ...(options.multipleUnread ? ["unread-2"] : [])]);
  const source = [original, ...(options.multipleUnread ? [{ ...original, id: "unread-2", subject: "Design review" }] : []), { ...original, id: "read-1", subject: "Already read" }];
  const requests: URL[] = [];
  const actions: { action: string; id: string }[] = [];
  const settings = { ...defaultSignatureSettings, enabled: options.signatureEnabled ?? true };
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "https://internal.helixnmbu.no");
    requests.push(url);
    if (url.pathname === "/api/gmail-status") return Response.json({ connected: true });
    switch (url.searchParams.get("action")) {
      case "signature": return Response.json({ settings, revision: 1, member: { ...member, role: member.helixRole, phone: "" }, signature: renderSignature(settings, { ...member, role: member.helixRole, phone: "" }) });
      case "messages": {
        if (options.emptyFirstPage && url.searchParams.get("unreadOnly") && !url.searchParams.has("pageToken")) return Response.json({ messages: [], nextPageToken: "next-unread" });
        const messages = source.map((message) => ({ ...message, unread: unreadIds.has(message.id) }));
        return Response.json({ messages: url.searchParams.has("unreadOnly") ? messages.filter((m) => m.unread) : messages, nextPageToken: null });
      }
      case "message": {
        const message = source.find((message) => message.id === url.searchParams.get("id"))!;
        if (options.readBeforeOpening) unreadIds.delete(message.id);
        return Response.json({ ...message, unread: unreadIds.has(message.id) });
      }
      case "messageAction": {
        const body = JSON.parse(String(init?.body));
        actions.push(body);
        if (options.failRead && body.action === "markRead") return Response.json({ error: "Google denied access. Reconnect Gmail." }, { status: 401 });
        if (body.action === "markRead") unreadIds.delete(body.id);
        if (body.action === "markUnread") unreadIds.add(body.id);
        return Response.json({ id: body.id });
      }
      default: return Response.json({}, { status: 404 });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, actions };
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(predicate()).toBe(true);
}

describe("mail workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearGmailSessionCache();
    notify.mockClear();
    mailServer();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.querySelectorAll('[data-radix-portal]').forEach((portal) => portal.remove());
    vi.unstubAllGlobals();
  });

  async function openLive() {
    await act(async () => root.render(<TooltipProvider><MemberAccountProvider account={member}><MailWorkspace /></MemberAccountProvider></TooltipProvider>));
    await until(() => Boolean(container.querySelector('button[aria-label="Jordan <jordan@example.test>, Team update"]')));
  }

  it("filters unread messages, keeps prefetch read-only, and marks an opened message read in Gmail and cache", async () => {
    const server = mailServer();
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show unread only"]')!.click());
    await until(() => server.requests.some((url) => url.searchParams.get("unreadOnly") === "true"));
    await until(() => !container.querySelector('[aria-label="Jordan <jordan@example.test>, Already read"]'));
    const row = container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]')!;
    expect(row.querySelector('[aria-label="Unread"]')?.nextElementSibling?.tagName).toBe("TIME");
    await act(async () => { row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    await until(() => server.requests.some((url) => url.searchParams.get("action") === "message"));
    expect(server.actions).toEqual([]);
    await act(async () => row.click());
    await until(() => server.actions.some((action) => action.action === "markRead"));
    await until(() => !container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"] [aria-label="Unread"]'));
    expect(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]')).not.toBeNull();
    expect(getCachedGmailMessage(member.email, "unread-1")?.unread).toBe(false);
    expect(container.querySelector('iframe[title="Email content"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mark as unread"]')).not.toBeNull();
    await until(() => !container.querySelector<HTMLButtonElement>('[aria-label="Mark as unread"]')!.disabled);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mark as unread"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"] [aria-label="Unread"]')));
    expect(server.actions.map((action) => action.action)).toEqual(["markRead", "markUnread"]);
    expect(getCachedGmailMessage(member.email, "unread-1")?.unread).toBe(true);
  });

  it("clears a stale unread indicator when Gmail reports that an opened message is already read", async () => {
    const server = mailServer({ readBeforeOpening: true });
    await openLive();
    const row = () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]');
    expect(row()!.querySelector('[aria-label="Unread"]')).not.toBeNull();
    await act(async () => row()!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Mark as unread"]')) && Boolean(row()) && !row()!.querySelector('[aria-label="Unread"]'));
    expect(server.actions).toEqual([]);
    expect(getCachedGmailMessage(member.email, original.id)?.unread).toBe(false);
  });

  it("keeps a read row until the next selection under the unread filter, including after revalidation", async () => {
    const server = mailServer({ multipleUnread: true });
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show unread only"]')!.click());
    await until(() => !container.querySelector('[aria-label="Jordan <jordan@example.test>, Already read"]'));
    const first = () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]');
    const second = () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Design review"]');
    await until(() => Boolean(first()) && !first()!.disabled);
    await act(async () => first()!.click());
    await until(() => first()?.getAttribute("aria-current") === "true" && !first()?.querySelector('[aria-label="Unread"]') && Boolean(second()) && !second()!.disabled);
    expect(second()!.querySelector('[aria-label="Unread"]')).not.toBeNull();
    const requestsBeforeFocus = server.requests.length;
    await act(async () => window.dispatchEvent(new Event("focus")));
    await until(() => server.requests.length > requestsBeforeFocus && Boolean(second()) && !second()!.disabled);
    expect(first()).not.toBeNull();
    expect(first()!.querySelector('[aria-label="Unread"]')).toBeNull();
    await act(async () => second()!.click());
    await until(() => !first() && second()?.getAttribute("aria-current") === "true" && !second()?.querySelector('[aria-label="Unread"]'));
    await until(() => Boolean(container.querySelector('[aria-label="Show all inbox messages"]')) && !second()!.disabled);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show all inbox messages"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Jordan <jordan@example.test>, Already read"]')));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show unread only"]')!.click());
    await until(() => !first() && !second());
    expect(getCachedGmailMessage(member.email, original.id)?.unread).toBe(false);
    expect(getCachedGmailMessage(member.email, "unread-2")?.unread).toBe(false);
  });

  it("integrates the original plain text in reply and forward with an empty writing area and one header close button", async () => {
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Reply"]')) && !container.querySelector<HTMLButtonElement>('[aria-label="Reply"]')!.disabled);
    for (const mode of ["Reply", "Forward"]) {
      await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${mode}"]`)!.click());
      await until(() => Boolean(document.querySelector('[aria-label="Your email signature"]')));
      const dialog = document.querySelector('[role="dialog"]')!;
      const quote = dialog.querySelector('section[aria-label="Original message"]')!;
      expect(quote.querySelector("blockquote")?.textContent).toBe(original.body);
      expect(quote.querySelector("iframe")).toBeNull();
      expect(quote.textContent).not.toContain("formatted email");
      expect(dialog.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')!.value).toBe("");
      expect(dialog.querySelectorAll('[aria-label="Close"]')).toHaveLength(1);
      expect(dialog.querySelector('[data-slot="dialog-header"] [aria-label="Close"]')).not.toBeNull();
      expect(dialog.querySelectorAll('[aria-label="Your email signature"]')).toHaveLength(1);
      await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
    }
  });

  it("preloads the signature and keeps it immediately visible in new drafts, replies, and forwards during refresh", async () => {
    const server = mailServer();
    await openLive();
    await until(() => server.requests.some((url) => url.searchParams.get("action") === "signature"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Reply"]')) && !container.querySelector<HTMLButtonElement>('[aria-label="Reply"]')!.disabled);
    const originalFetch = fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let refreshes = 0;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      if (new URL(String(input), window.location.origin).searchParams.get("action") === "signature") {
        refreshes += 1;
        await gate;
      }
      return originalFetch(input, init);
    }));
    try {
      for (const mode of ["New message", "Reply", "Forward"]) {
        await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${mode}"]`)!.click());
        const dialog = document.querySelector('[role="dialog"]')!;
        expect(dialog.querySelectorAll('[aria-label="Your email signature"]')).toHaveLength(1);
        const signature = dialog.querySelector('[aria-label="Your email signature"]')!;
        expect(signature.textContent).toContain("Åse Example");
        expect(signature.querySelector("iframe")).toBeNull();
        expect(signature.querySelector('a[href="https://www.linkedin.com/company/helix-nmbu"]')?.textContent).toBe("LinkedIn");
        expect(dialog.querySelector('[aria-label="Loading signature"]')).toBeNull();
        expect(dialog.querySelector<HTMLTextAreaElement>('[aria-label="Message"]')!.value).toBe("");
        if (mode !== "Forward") await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
      }
      expect(refreshes).toBe(1);
    } finally { await act(async () => release()); }
    expect(document.querySelectorAll('[aria-label="Your email signature"]')).toHaveLength(1);
  });

  it("respects an administrator-disabled signature in a new draft", async () => {
    const server = mailServer({ signatureEnabled: false });
    await openLive();
    await until(() => server.requests.some((url) => url.searchParams.get("action") === "signature"));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="New message"]')!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Your email signature"]')).toBeNull();
  });

  it("offers the next unread page when the current page has no remaining unread messages", async () => {
    const server = mailServer({ emptyFirstPage: true });
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show unread only"]')!.click());
    await until(() => [...container.querySelectorAll("button")].some((button) => button.textContent === "Load more"));
    const loadMore = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Load more")!;
    await act(async () => loadMore.click());
    await until(() => server.requests.some((url) => url.searchParams.get("pageToken") === "next-unread" && url.searchParams.get("unreadOnly") === "true"));
    await until(() => Boolean(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]')));
  });

  it("keeps unread state unchanged when Gmail rejects marking a message read", async () => {
    mailServer({ failRead: true });
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]')!.click());
    await until(() => notify.mock.calls.some(([title]) => title === "Could not update read state"));
    expect(getCachedGmailMessage(member.email, "unread-1")?.unread).toBe(true);
    expect(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"] [aria-label="Unread"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mark as read"]')).not.toBeNull();
    expect(notify.mock.calls.find(([title]) => title === "Could not update read state")?.[2].action.label).toBe("Try again");
  });

  it("ignores a delayed all-mail response after switching to unread-only", async () => {
    let release: (response: Response) => void = () => undefined;
    let firstRequested = false;
    const stale = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), "https://internal.helixnmbu.no");
      if (url.pathname === "/api/gmail-status") return Response.json({ connected: true });
      if (url.searchParams.get("unreadOnly") === "true") return Response.json({ messages: [original], nextPageToken: null });
      firstRequested = true;
      return stale;
    }));
    await act(async () => root.render(<TooltipProvider><MemberAccountProvider account={member}><MailWorkspace /></MemberAccountProvider></TooltipProvider>));
    await until(() => firstRequested);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show unread only"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]')));
    await act(async () => { release(Response.json({ messages: [{ ...original, id: "old-read", subject: "Stale read mail", unread: false }], nextPageToken: "stale" })); await stale; });
    expect(container.querySelector('[aria-label="Jordan <jordan@example.test>, Stale read mail"]')).toBeNull();
    expect(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]')).not.toBeNull();
  });

  it("shows only the disconnected Gmail state", async () => {
    await act(async () => root.render(<TooltipProvider><MailWorkspace connected={false} /></TooltipProvider>));

    expect(container.querySelector("#connect-gmail-title")?.textContent).toBe(
      "Connect your Gmail account",
    );
    expect(container.querySelector('[aria-label="Search mail"]')).toBeNull();
    expect(container.querySelector('[aria-label="Inbox"]')).toBeNull();
    expect(container.querySelector('svg[aria-label="Gmail"]')).not.toBeNull();
  });

  it("shows one inbox column with folder controls in its header when connected", async () => {
    await act(async () => root.render(<TooltipProvider><MailWorkspace connected /></TooltipProvider>));

    expect(container.querySelector('[aria-label="Search mail"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Inbox"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="More mail folders"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sent"]')).toBeNull();
    expect(container.querySelector('[aria-label="Archive"]')).toBeNull();
    expect(container.querySelector('[aria-label="Mail settings"]')).toBeNull();
    expect(container.querySelector('[aria-label="Mail breadcrumbs"]')).toBeNull();
    expect(container.textContent).toContain("No messages in your inbox.");
  });

  it("keeps the connect action on the disconnected page", async () => {
    await act(async () => root.render(<TooltipProvider><MailWorkspace connected={false} /></TooltipProvider>));

    expect(container.querySelector('[data-state="open"]')).toBeNull();
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.textContent?.includes("Connect Gmail account"),
    )).toBe(true);
  });

  it("opens a full compose form with sender, recipient, cc, subject, and message fields", async () => {
    await act(async () => root.render(<TooltipProvider><MailWorkspace connected /></TooltipProvider>));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="New message"]')?.click();
    });

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="From"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="To"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="Cc"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="Subject"]')).not.toBeNull();
    expect(document.body.querySelector('textarea[aria-label="Message"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="Send"]')).not.toBeNull();
    expect([...document.body.querySelectorAll("button")].some((button) => button.textContent?.includes("Cancel"))).toBe(false);
  });
});
