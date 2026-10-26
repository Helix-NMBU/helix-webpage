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

function mailServer(options: { failRead?: boolean; emptyFirstPage?: boolean } = {}) {
  let unread = true;
  const requests: URL[] = [];
  const actions: { action: string; id: string }[] = [];
  const settings = { ...defaultSignatureSettings, enabled: true };
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "https://internal.helixnmbu.no");
    requests.push(url);
    if (url.pathname === "/api/gmail-status") return Response.json({ connected: true });
    switch (url.searchParams.get("action")) {
      case "signature": return Response.json({ settings, revision: 1, member: { ...member, role: member.helixRole, phone: "" }, signature: renderSignature(settings, { ...member, role: member.helixRole, phone: "" }) });
      case "messages": {
        if (options.emptyFirstPage && url.searchParams.get("unreadOnly") && !url.searchParams.has("pageToken")) return Response.json({ messages: [], nextPageToken: "next-unread" });
        const messages = [{ ...original, unread }, { ...original, id: "read-1", subject: "Already read", unread: false }];
        return Response.json({ messages: url.searchParams.has("unreadOnly") ? messages.filter((m) => m.unread) : messages, nextPageToken: null });
      }
      case "message": return Response.json({ ...original, unread });
      case "messageAction": {
        const body = JSON.parse(String(init?.body));
        actions.push(body);
        if (options.failRead && body.action === "markRead") return Response.json({ error: "Google denied access. Reconnect Gmail." }, { status: 401 });
        if (body.action === "markRead") unread = false;
        if (body.action === "markUnread") unread = true;
        return Response.json({ id: "unread-1" });
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
    await act(async () => { row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    await until(() => server.requests.some((url) => url.searchParams.get("action") === "message"));
    expect(server.actions).toEqual([]);
    await act(async () => row.click());
    await until(() => server.actions.some((action) => action.action === "markRead"));
    await until(() => !container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]'));
    expect(getCachedGmailMessage(member.email, "unread-1")?.unread).toBe(false);
    expect(container.querySelector('iframe[title="Email content"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mark as unread"]')).not.toBeNull();
    await until(() => !container.querySelector<HTMLButtonElement>('[aria-label="Mark as unread"]')!.disabled);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mark as unread"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Jordan <jordan@example.test>, Team update"]')));
    expect(server.actions.map((action) => action.action)).toEqual(["markRead", "markUnread"]);
    expect(getCachedGmailMessage(member.email, "unread-1")?.unread).toBe(true);
  });

  it("renders HTML in reply and forward with an empty writing area and one header close button", async () => {
    await openLive();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Jordan <jordan@example.test>, Team update"]')!.click());
    await until(() => Boolean(container.querySelector('[aria-label="Reply"]')) && !container.querySelector<HTMLButtonElement>('[aria-label="Reply"]')!.disabled);
    for (const mode of ["Reply", "Forward"]) {
      await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${mode}"]`)!.click());
      await until(() => Boolean(document.querySelector('[aria-label="Your email signature"]')));
      const dialog = document.querySelector('[role="dialog"]')!;
      const quote = dialog.querySelector('section[aria-label="Original message"] iframe') as HTMLIFrameElement;
      expect(quote.srcdoc).toContain("<b>formatted email</b>");
      expect(quote.srcdoc).toContain("color:#123456");
      expect(quote.srcdoc).not.toContain("<script>");
      expect(dialog.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')!.value).toBe("");
      expect(dialog.querySelectorAll('[aria-label="Close"]')).toHaveLength(1);
      expect(dialog.querySelector('[data-slot="dialog-header"] [aria-label="Close"]')).not.toBeNull();
      expect(dialog.querySelectorAll('[aria-label="Your email signature"]')).toHaveLength(1);
      await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
    }
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
