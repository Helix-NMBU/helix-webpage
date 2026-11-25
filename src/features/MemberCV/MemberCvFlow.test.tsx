// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { MemberProfileRoute } from "../MemberPlatform/MemberPlatform";
import { MemberAccountProvider } from "../MemberPlatform/MemberAccountContext";
import { MemberNavigationProvider } from "../MemberPlatform/MemberNavigation";
import { MemberNotificationsProvider } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { emptyCv, privateSharing } from "./model";
import { clearMemberCvCache } from "./repository";
import type { CvEnvelope, CvMutation } from "./types";

vi.mock("./session", async original => ({
  ...await original<typeof import("./session")>(),
  memberSessionToken: async () => "flow-test-token",
  watchMemberSession: () => () => undefined,
}));

it.each([
  { registered: false, search: "" }, { registered: true, search: "" },
  { registered: false, search: "?cv-editor=classic" }, { registered: true, search: "?cv-editor=classic" },
])("uses the new section editor from the full profile ($registered, $search)", async ({ registered, search }) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
  vi.stubEnv("MODE", "test");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const mutations: CvMutation[] = [];
  const envelope: CvEnvelope = {
    identity: { name: "Test Member", email: "member@example.invalid", helixRole: "Engineering lead" },
    document: {
      draft: { ...emptyCv("Test Member", "member@example.invalid"), cvRegistered: registered },
      sharing: { ...privateSharing }, revision: 0, publishedRevision: null, publishedAt: null,
    },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/member-cv");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer flow-test-token");
    if (init.method === "POST") {
      const mutation = JSON.parse(String(init.body)) as CvMutation;
      expect(mutation.expectedRevision).toBe(envelope.document.revision);
      mutations.push(mutation);
      envelope.document.draft = mutation.draft!;
      envelope.document.sharing = mutation.sharing!;
      envelope.document.revision++;
    }
    return Response.json(envelope);
  }));
  const router = createMemoryRouter([{ path: "/profile", element:
    <MemberThemeProvider><MemberNotificationsProvider><MemberNavigationProvider>
      <MemberAccountProvider account={{ name: "Test Member", email: "member@example.invalid", role: "Member", helixRole: "Engineering lead" }}>
        <MemberProfileRoute />
      </MemberAccountProvider>
    </MemberNavigationProvider></MemberNotificationsProvider></MemberThemeProvider>,
  }], { initialEntries: [`/profile${search}`] });
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
  const click = async (name: string) => { expect(button(name), name).toBeDefined(); await act(async () => button(name).click()); };
  const heading = async (name: string) => vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe(name));
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await vi.waitFor(() => expect(host.querySelector(".mcv-profile-identity")?.textContent).toContain("Test Member"));
    expect(host.textContent).toContain("Field of study");
    if (registered) {
      await act(async () => button("CV actions").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
      const edit = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === "Edit")!;
      await act(async () => edit.click());
    } else await click("Setup CV");
    await heading("Your CV");
    expect(router.state.location.search).toBe("?cv-editor=sections");
    expect(host.textContent).toContain("CV sections");
    expect(document.querySelector(".mcv-wizard-progress")).toBeNull();
    expect(mutations).toEqual([]);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes("About you"))!.click());
    await heading("About you");
    const introduction = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(introduction, "Saved through the new CV editor.");
      introduction.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Cancel").focus(); button("Cancel").click(); });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Discard unsaved changes?");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(button("Cancel")));
    expect(introduction.value).toBe("Saved through the new CV editor.");
    await click("Save section");
    await heading("Your CV");
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ action: "save", draft: { summary: "Saved through the new CV editor.", cvRegistered: true } });
    expect(envelope.document.publishedRevision).toBeNull();
    await click("Save and exit");
    await heading("Profile");
    expect(router.state.location.search).toBe("");
    expect(host.querySelector(".mcv-profile-identity")).not.toBeNull();
    expect(host.textContent).toContain("CV Test Member");
    await act(async () => router.navigate("/profile?cv-editor=sections"));
    await heading("Your CV");
    expect(host.textContent).toContain("Saved through the new CV editor.");
    await click("Profile");
    await heading("Profile");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    clearMemberCvCache();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
