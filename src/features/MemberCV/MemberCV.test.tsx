// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberCV from "./MemberCV";
import { generateBrowserCvPdf } from "./browser-pdf";
import { DEMO_STORAGE_KEY, fictionalCv } from "./demo";
import { emptyCv, privateSharing } from "./model";
import { MemberNavigationProvider, useMemberNavigation } from "../MemberPlatform/MemberNavigation";
import { MemberAccountProvider } from "../MemberPlatform/MemberAccountContext";
import { isLocalMemberMode, localMemberSignedIn, setLocalMemberSignedIn } from "../MemberPlatform/local-mode";

vi.mock("./browser-pdf", () => ({ generateBrowserCvPdf: vi.fn(async () => new Blob(["%PDF-1.7"], { type: "application/pdf" })) }));

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
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:cv-test"), revokeObjectURL: vi.fn() }));
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
    vi.restoreAllMocks();
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
  function button(name: string, scope: ParentNode = document) {
    return [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name || item.getAttribute("aria-label") === name)!;
  }
  async function click(name: string) { await act(async () => button(name).click()); }

  it("keeps the platform in English and places the CV entry below the profile", async () => {
    await open();
    expect(container.querySelector("h1")?.textContent).toBe("Profile");
    expect(container.querySelector('[lang="en"]')).not.toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.textContent).toContain("CV Alex Example");
    expect(container.querySelector(".mcv-profile-identity")!.compareDocumentPosition(container.querySelector("#member-cv-title")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const card = container.querySelector(".mcv-profile-identity")!;
    expect(card.textContent).toContain("Mechanical team member");
    expect(card.textContent).not.toContain("Mechanical engineering student");
    expect(card.textContent).not.toContain("Admin");
    expect(container.textContent).not.toMatch(/fictional|local preview|demo preview|local demo/i);
    expect(container.querySelector('[aria-label="Language"]')).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    await click("Edit CV");
    expect([...document.querySelectorAll('[aria-label="CV setup steps"] button')].map(item => item.textContent)).toEqual(["1. Introduction", "2. Education", "3. Experience", "4. Projects", "5. Languages", "6. Links", "7. Review & sharing"]);
    await click("2. Education");
    await click("Remove education 1");
    await click("4. Projects");
    await click("2. Education");
    expect(document.querySelector('[aria-label="Remove education 1"]')).toBeNull();
    await click("Save and close");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education).toEqual([]);
  });

  it("keeps a new CV as an unfinished draft until setup is saved", async () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    stored.document.draft = { ...emptyCv("Alex Example", "alex@example.invalid"), phone: "+47 12345678", fieldOfStudy: "Engineering", graduationYear: "2028" };
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
    await open();
    expect(container.textContent).toContain("No CV registered. Set up your CV now.");
    await click("Set up CV");
    await click("Close");
    expect(container.textContent).toContain("No CV registered.");
    await click("Set up CV");
    await click("7. Review & sharing");
    await click("Finish");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("CV Alex Example");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.cvRegistered).toBe(true);
  });

  it("opens sharing deep links in the setup modal and renders PDF previews with language controls", async () => {
    await open("#mcv-sharing");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Share generated CV");
    await click("Preview CV");
    const dialog = document.querySelector('[role="dialog"].mcv-preview-panel');
    expect(dialog?.getAttribute("lang")).toBe("en");
    expect(dialog?.textContent).toContain("Generated CV preview");
    expect(dialog?.textContent).not.toMatch(/fictional|local preview|demo preview|local demo|html preview/i);
    expect(dialog?.querySelector('[aria-label="Preview language"]')).not.toBeNull();
    expect(dialog?.querySelector('article[lang="en"]')?.textContent).toContain("Mechanical engineering student");
    expect(dialog?.querySelector('a[download]')?.getAttribute("download")).toBe("Helix-CV-en.pdf");
  });

  it("downloads Norwegian by default and publishes or withdraws through the directory switch", async () => {
    await open();
    await click("Download Norwegian CV");
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "nb");
    const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    const published = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    expect(published.document.sharing.cv).toBe(true);
    expect(published.published.draft).toEqual(published.document.draft);
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.publishedRevision).toBeNull();
  });

  it("offers English and Norwegian in the download dropdown without changing the default icon action", async () => {
    await open();
    await act(async () => button("Download language").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(options.map(item => item.textContent)).toEqual(["Norwegian", "English"]);
    await act(async () => options.find(item => item.textContent === "English")!.click());
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "en");
    await click("Download Norwegian CV");
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "nb");
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
