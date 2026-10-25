// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberCV from "./MemberCV";
import { DEMO_STORAGE_KEY, fictionalCv } from "./demo";
import { privateSharing } from "./model";
import { MemberNavigationProvider, useMemberNavigation } from "../MemberPlatform/MemberNavigation";
import { MemberAccountProvider } from "../MemberPlatform/MemberAccountContext";
import { isLocalMemberMode, localMemberSignedIn, setLocalMemberSignedIn } from "../MemberPlatform/local-mode";

function SignOutControl() {
  const navigation = useMemberNavigation();
  return <button onClick={() => navigation?.editor?.signOut()}>Sign out through account menu</button>;
}

describe("member profile", () => {
  let root: Root;
  let container: HTMLDivElement;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    window.localStorage.setItem("helix-member-ui-language-v1", "nb");
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
      identity: { name: "Alex Example", email: "alex@example.invalid" },
      document: { draft: fictionalCv(), sharing: privateSharing, revision: 0, publishedRevision: null, publishedAt: null },
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
    window.localStorage.removeItem("helix-member-ui-language-v1");
    window.localStorage.removeItem("helix-member-local-session-v1");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  async function open(hash = "", controls?: ReactNode) {
    router = createMemoryRouter([{ path: "/login", element: <p>Log in to your account</p> }, { path: "*", element:
      <MemberNavigationProvider>{controls}<MemberAccountProvider account={{ name: "Alex Example", email: "alex@example.invalid", role: "Admin", helixRole: "Mechanical team member" }}>
        <MemberCV />
      </MemberAccountProvider></MemberNavigationProvider>,
    }], { initialEntries: [`/profile?demo=1${hash}`] });
    await act(async () => root.render(<RouterProvider router={router} />));
  }
  async function tab(name: string) {
    const trigger = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(item => item.textContent === name)!;
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  }

  it("opens in English despite a saved Norwegian preference and keeps CV entries when tabs change", async () => {
    await open();
    expect(container.querySelector("h1")?.textContent).toBe("Profile");
    expect(container.querySelector('[lang="en"]')).not.toBeNull();
    expect(container.textContent).toContain("Alex Example");
    expect([...container.querySelectorAll('[role="tab"]')].map(item => item.textContent)).toEqual(["Profile", "CV"]);
    expect(container.querySelector("#mcv-contact-title")?.textContent).toBe("Alex Example");
    expect(container.querySelector('[role="tablist"]')!.compareDocumentPosition(container.querySelector(".mcv-profile-identity")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".mcv-profile-identity")?.textContent).toContain("Mechanical team member");
    expect(container.querySelector(".mcv-profile-identity")?.textContent).not.toContain("Mechanical engineering student");
    expect(container.querySelector(".mcv-profile-identity")?.textContent).not.toContain("Admin");
    expect(container.textContent).not.toMatch(/fictional|local preview|demo preview|local demo/i);
    expect(container.querySelector('[aria-label="Language"]')).toBeNull();
    expect(container.querySelector('[aria-label="Språk"]')).toBeNull();
    expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toContain("Field of study");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    await tab("CV");
    const expand = container.querySelector<HTMLButtonElement>('[aria-label="Expand Education"]')!;
    await act(async () => expand.click());
    const remove = container.querySelector<HTMLButtonElement>('[aria-label="Remove education 1"]')!;
    await act(async () => remove.click());
    expect(container.querySelector('[aria-label="Remove education 1"]')).toBeNull();
    await tab("Profile");
    await tab("CV");
    expect(container.querySelector('[aria-label="Remove education 1"]')).toBeNull();
    expect(router.state.location.pathname).toBe("/profile");
  });

  it("opens sponsor sharing from an existing deep link and keeps preview dialogs in English", async () => {
    await open("#mcv-sharing");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("CV");
    expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toContain("Share generated CV");
    const preview = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Preview CV")!;
    await act(async () => preview.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("lang")).toBe("en");
    expect(dialog?.textContent).toContain("Generated CV preview");
    expect(dialog?.textContent).not.toMatch(/fictional|local preview|demo preview|local demo|html preview/i);
    expect(dialog?.querySelector('[role="combobox"]')).toBeNull();
  });

  it("ends the local account session when signing out from the profile editor", async () => {
    vi.stubEnv("MODE", "member-local");
    expect(isLocalMemberMode()).toBe(true);
    setLocalMemberSignedIn(true);
    await open("", <SignOutControl />);
    const signOut = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Sign out through account menu")!;
    await act(async () => signOut.click());
    expect(localMemberSignedIn()).toBe(false);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("stages profile details in the modal and saves them without changing the Helix role or CV", async () => {
    await open();
    const edit = () => container.querySelector<HTMLButtonElement>(".mcv-profile-identity button")!;
    const dialogButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === text)!;
    async function fill(label: string, value: string) {
      const element = [...document.querySelectorAll<HTMLLabelElement>('[role="dialog"] label')].find(item => item.textContent === label)!;
      const input = document.getElementById(element.htmlFor) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => edit().click());
    expect([...document.querySelectorAll('[role="dialog"] label')].map(item => item.textContent)).toEqual(["Name", "Phone number", "Field of study", "Graduation year"]);
    await fill("Name", "Cancelled name");
    await act(async () => dialogButton("Cancel").click());
    expect(container.querySelector(".mcv-profile-identity")?.textContent).toContain("Alex Example");
    await act(async () => edit().click());
    await fill("Name", "Alex Updated");
    await fill("Phone number", "+47 12345678");
    await fill("Field of study", "Robotics");
    await fill("Graduation year", "20");
    await act(async () => dialogButton("Save changes").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Enter a four-digit graduation year.");
    await fill("Graduation year", "2029");
    await act(async () => dialogButton("Save changes").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const card = container.querySelector(".mcv-profile-identity");
    for (const value of ["Alex Updated", "+47 12345678", "Robotics", "2029", "Mechanical team member"]) expect(card?.textContent).toContain(value);
    const saved = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY)!);
    expect(saved.document.draft.headline).toBe("Mechanical engineering student");
    expect(saved.document.draft.education).toEqual(fictionalCv().education);
    expect(saved.document.draft.helixRole).toBeUndefined();
  });
});
