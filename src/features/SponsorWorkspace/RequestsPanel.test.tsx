// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RequestsPanel, { type RequestsPanelProps } from "./RequestsPanel";
import type { RequestDetail, RequestList } from "./request-types";
import type { SponsorContext } from "./types";

const sponsor: SponsorContext = { authUserId: "user-a", email: "contact@example.com", organizationId: "organization-a", organizationName: "Example Racing", contactId: "contact-a", role: "sponsor", portal: true, directory: false };
const initial: RequestDetail = { id: "request-a", organizationId: "organization-a", organizationName: "Example Racing", type: "recruitment", title: "Recruitment discussion", body: "Can we discuss cooperation?", authorEmail: "contact@example.com", status: "input_needed", revision: 2, assignedAdminId: "admin-a", assignedAdminName: "admin@helixnmbu.no", createdAt: "2026-10-25T12:00:00Z", updatedAt: "2026-10-25T12:00:00Z", replies: [], history: [] };

describe("sponsor request conversations", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.spyOn(toast, "success"); vi.spyOn(toast, "error"); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function transport(options: { failMutation?: boolean; detail?: RequestDetail; deferredMutation?: Promise<{ request: RequestDetail }> } = {}) {
    let detail = structuredClone(options.detail ?? initial);
    const calls = vi.fn(async (action: string, init?: RequestInit & { query?: Record<string, string> }): Promise<unknown> => {
      if (init?.method === "POST") {
        if (options.failMutation) throw new Error("This request changed. Reload it before trying again.");
        if (options.deferredMutation) return options.deferredMutation;
        const payload = JSON.parse(String(init.body));
        if (action === "requests") {
          detail = { ...detail, id: "request-new", title: payload.title, body: payload.body, status: "submitted", revision: 0, replies: [] };
          return { request: detail };
        }
        detail = { ...detail, status: "under_review", revision: detail.revision + 1, replies: [{ id: "reply-a", actor: "sponsor", authorEmail: sponsor.email, body: payload.body, createdAt: initial.updatedAt }] };
        return { request: detail };
      }
      if (action === "request") return { request: detail };
      return { requests: [detail], administrators: [{ id: "admin-a", email: "admin@helixnmbu.no" }] } satisfies RequestList;
    });
    const request: RequestsPanelProps["request"] = async <T,>(action: string, init?: RequestInit & { query?: Record<string, string> }) => await calls(action, init) as T;
    return { calls, request };
  }
  async function mount(request: RequestsPanelProps["request"], context = sponsor) { await act(async () => root.render(<RequestsPanel context={context} request={request} />)); }
  async function open() { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Recruitment discussion"))!.click()); }
  async function enterReply(value: string) {
    const textarea = container.querySelector<HTMLTextAreaElement>("#request-reply")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  async function submitReply() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

  it("loads organization requests and sends a revision-checked shared reply", async () => {
    const { calls, request } = transport(); await mount(request); await open();
    expect(calls).toHaveBeenCalledWith("request", { query: { id: "request-a" } });
    expect(container.textContent).toContain("Everyone with access to this request can read your reply.");
    await enterReply("Here are the details."); await submitReply();
    const mutation = calls.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(mutation[1]?.body))).toEqual({ id: "request-a", expectedRevision: 2, operation: "reply", body: "Here are the details." });
    expect(toast.success).toHaveBeenCalledWith("Reply added", expect.any(Object)); expect(container.textContent).toContain("Under review"); expect(container.textContent).toContain("Here are the details.");
  });
  it("preserves an unsent reply when a stale revision is rejected", async () => {
    const { request } = transport({ failMutation: true }); await mount(request); await open(); await enterReply("Keep this draft."); await submitReply();
    expect(container.querySelector<HTMLTextAreaElement>("#request-reply")?.value).toBe("Keep this draft.");
    expect(toast.error).toHaveBeenCalledWith("Could not update request", expect.objectContaining({ description: "This request changed. Reload it before trying again." }));
  });
  it("submits the sponsor form and clears the previous conversation's reply draft", async () => {
    const { calls, request } = transport(); await mount(request); await open(); await enterReply("Old conversation draft");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "New request")!.click());
    for (const [selector, value] of [["#new-request-title", "New request title"], ["#new-request-message", "New request message"]]) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const prototype = input.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    await act(async () => document.querySelector("#new-request-title")!.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const mutation = calls.mock.calls.find(([action, init]) => action === "requests" && init?.method === "POST")!;
    expect(JSON.parse(String(mutation[1]?.body))).toEqual({ type: "general_collaboration", title: "New request title", body: "New request message" });
    expect(toast.success).toHaveBeenCalledWith("Request submitted", expect.any(Object)); expect(container.querySelector<HTMLTextAreaElement>("#request-reply")?.value).toBe("");
  });
  it("does not offer reply or cancellation on a terminal conversation", async () => {
    const { request } = transport({ detail: { ...initial, status: "completed" } }); await mount(request); await open();
    expect(container.querySelector("#request-reply")).toBeNull(); expect(container.textContent).not.toContain("Cancel request"); expect(container.textContent).toContain("This request is closed.");
  });
  it("requires administrator ownership before exposing reply/status actions", async () => {
    const { request } = transport({ detail: { ...initial, assignedAdminId: null, assignedAdminName: null } });
    await mount(request, { ...sponsor, authUserId: "admin", email: "admin@helixnmbu.no", role: "admin" }); await open();
    expect(container.querySelector("#request-reply")).toBeNull(); expect(container.textContent).toContain("Assign to me"); expect(container.textContent).not.toContain("New request");
  });
  it("discards a previous account's pending mutation response", async () => {
    let resolve!: (value: { request: RequestDetail }) => void;
    const deferredMutation = new Promise<{ request: RequestDetail }>(done => { resolve = done; });
    const old = transport({ deferredMutation }); await mount(old.request); await open(); await enterReply("Account A reply");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const next: RequestsPanelProps["request"] = async <T,>() => ({ requests: [], administrators: [] }) as T;
    await mount(next, { ...sponsor, authUserId: "user-b", organizationId: "organization-b" });
    await act(async () => resolve({ request: { ...initial, body: "Account A private request" } }));
    expect(container.textContent).not.toContain("Account A private request"); expect(container.textContent).not.toContain("Recruitment discussion"); expect(container.textContent).toContain("You have no requests yet.");
  });
});
