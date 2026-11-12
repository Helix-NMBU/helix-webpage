// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import MemberCvSections from "./MemberCvSections";
import { emptyCv, sharedCvData } from "./model";
import { clearMemberCvCache } from "./repository";
import type { CvEnvelope, CvMutation } from "./types";

vi.mock("./session", () => ({
  memberSessionToken: async () => "test-token",
  watchMemberSession: () => () => undefined,
}));

it("loads, saves, previews, and publishes through the authenticated CV API", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const requests: CvMutation[] = [];
  const sharing = { cv: false, email: false, phone: false };
  const envelope: CvEnvelope = {
    identity: { name: "Test Member", email: "member@example.invalid", helixRole: "Engineering lead" },
    document: {
      draft: {
        ...emptyCv("Test Member", "personal@example.invalid"),
        education: [{ id: "degree", institution: "NMBU", degree: "Engineering", startDate: "2024", endDate: "", description: "" }],
        experience: [{ id: "helix-member-role", title: "Engineering lead", organization: "Helix NMBU", startDate: "", endDate: "", description: "" }],
      },
      sharing, revision: 0, publishedRevision: null, publishedAt: null,
    },
  };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/member-cv");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
    if (init.method === "POST") {
      const mutation = JSON.parse(String(init.body)) as CvMutation;
      expect(mutation.expectedRevision).toBe(envelope.document.revision);
      requests.push(mutation);
      envelope.document.draft = mutation.draft!;
      envelope.document.sharing = mutation.sharing!;
      envelope.document.revision++;
      if (mutation.action === "publish") {
        envelope.document.publishedRevision = envelope.document.revision;
        envelope.document.published = { cv: sharedCvData(mutation.draft!, mutation.sharing!), sharing: mutation.sharing! };
      }
    }
    return Response.json(envelope);
  }));
  const click = async (name: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim().startsWith(name));
    expect(button, name).toBeDefined();
    await act(async () => button!.click());
  };
  try {
    await act(async () => root.render(<MemoryRouter><MemberCvSections /></MemoryRouter>));
    await vi.waitFor(() => expect(host.textContent).toContain("Continue draft"));
    await click("Continue draft");
    await click("Other roles and volunteering");
    const add = host.querySelector<HTMLButtonElement>('[aria-label="Add role"]')!;
    await act(async () => add.click());
    const title = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Club treasurer");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("[role=combobox]")).toBeNull();
    await click("Save section");
    expect(requests[0]).toMatchObject({ action: "save", draft: { experience: [
      { id: "helix-member-role" }, { title: "Club treasurer", section: "otherRoles" },
    ] } });
    await click("Review sponsor view");
    expect(host.textContent).toContain("Engineering lead");
    expect(host.textContent).toContain("Club treasurer");
    expect(host.querySelector("a[href^='mailto:']")).toBeNull();
    await click("Publish to Talent Directory");
    expect(requests.map(request => request.action)).toEqual(["save", "publish"]);
    expect(host.querySelector("h1")?.textContent).toBe("Published version");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    clearMemberCvCache();
    vi.unstubAllGlobals();
  }
});
