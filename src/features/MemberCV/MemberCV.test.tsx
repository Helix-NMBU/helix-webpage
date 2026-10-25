// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberCV from "./MemberCV";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider } from "../MemberPlatform/MemberNotifications";
import { generateBrowserCvPdf } from "./browser-pdf";
import { DEMO_STORAGE_KEY, fictionalCv } from "./demo";
import { emptyCv, privateSharing } from "./model";
import { MemberNavigationProvider, useMemberNavigation } from "../MemberPlatform/MemberNavigation";
import { MemberAccountProvider } from "../MemberPlatform/MemberAccountContext";
import { isLocalMemberMode, localMemberSignedIn, setLocalMemberSignedIn } from "../MemberPlatform/local-mode";

vi.mock("./browser-pdf", () => ({ generateBrowserCvPdf: vi.fn(async () => new Blob(["%PDF-1.7"], { type: "application/pdf" })) }));

function SignOutControl() {
  const navigation = useMemberNavigation();
  return <>
    <button onClick={() => navigation?.editor?.signOut()}>Sign out through account menu</button>
    <button onClick={() => navigation?.editor?.navigate("/notifications")}>Go to notifications</button>
  </>;
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
    vi.stubEnv("MODE", "member-local");
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
      <MemberThemeProvider><MemberNotificationsProvider><MemberNavigationProvider>{controls}<MemberAccountProvider account={{ name: "Alex Example", email: "alex@example.invalid", role: "Admin", helixRole: "Mechanical team member" }}>
        <MemberCV />
      </MemberAccountProvider></MemberNavigationProvider></MemberNotificationsProvider></MemberThemeProvider>,
    }], { initialEntries: [`/profile${hash}`] });
    await act(async () => root.render(<RouterProvider router={router} />));
  }
  function button(name: string, scope: ParentNode = document) {
    return [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name || item.getAttribute("aria-label") === name)!;
  }
  async function click(name: string) { await act(async () => button(name).click()); }

  async function cvMenu(name: string) {
    await act(async () => button("CV actions").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent === name)!;
    await act(async () => item.click());
  }
  async function chooseDownloadLanguage(name: string) {
    await act(async () => button("Download language").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent === name)!;
    await act(async () => option.click());
  }
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
    const actions = [...container.querySelectorAll('[aria-labelledby="member-cv-title"] button')].map(item => item.getAttribute("aria-label"));
    expect(actions.filter(Boolean)).toEqual(["Preview CV", "CV actions"]);
    await cvMenu("Edit");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Step 1 of 4");
    expect(document.querySelectorAll(".mcv-wizard-progress-bar span")).toHaveLength(4);
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("The basics");
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Fill out each section");
    expect(document.querySelector('[aria-label="Original CV language"]')).toBeNull();
    expect(document.querySelector('[aria-label="Jump to step"]')).toBeNull();
    await click("Next step");
    await click("Remove MSc Mechanical engineering");
    await click("Next step");
    await click("Next step");
    await click("Previous step");
    await click("Previous step");
    expect(document.querySelector('[aria-label="Remove MSc Mechanical engineering"]')).toBeNull();
    await click("Close");
    await click("Save as draft");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education).toEqual([]);
  });

  it("keeps a new CV as an unfinished draft until setup is saved", async () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    stored.document.draft = { ...emptyCv("Alex Example", "alex@example.invalid"), phone: "+47 12345678", fieldOfStudy: "Engineering", graduationYear: "2028" };
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
    await open();
    expect(container.textContent).toContain("No CV yet");
    const emptyState = container.querySelector('[data-slot="empty"]')!;
    expect([...emptyState.querySelectorAll("button")].map(item => item.textContent)).toEqual(["Setup CV"]);
    expect(emptyState.textContent).not.toContain("Learn More");
    await click("Setup CV");
    await click("Close");
    await click("Discard changes");
    expect(container.textContent).toContain("No CV yet");
    await click("Setup CV");
    await click("Close");
    await click("Save as draft");
    expect(container.textContent).toContain("No CV yet");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.cvRegistered).toBe(false);
    await click("Setup CV");
    for (let index = 0; index < 3; index += 1) await click("Next step");
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Projects");
    expect(button("Next step").disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Review & sharing");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("References (optional)");
    await click("Finish");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("CV Alex Example");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.cvRegistered).toBe(true);
  });

  it("keeps sharing on the profile and renders PDF previews with language controls", async () => {
    await open("#mcv-sharing");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="switch"]')).not.toBeNull();
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
    await cvMenu("Download");
    await click("Download");
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "nb");
    const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".mcv-notice")).toBeNull();
    expect(document.querySelector('[data-sonner-toaster][data-x-position="right"][data-y-position="top"]')).not.toBeNull();
    expect(document.querySelector('[data-sonner-toast]')?.textContent).toContain("CV visible in Talent Directory");
    const published = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    expect(published.document.sharing.cv).toBe(true);
    expect(published.published.draft).toEqual(published.document.draft);
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.publishedRevision).toBeNull();
  });

  it("offers Edit, Download and Delete in the menu and asks for download language in a modal", async () => {
    await open();
    await act(async () => button("CV actions").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(options.map(item => item.textContent)).toEqual(["Edit", "Download", "Delete"]);
    await act(async () => options.find(item => item.textContent === "Download")!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Choose the language for your CV.");
    expect(document.querySelector('[aria-label="Download language"]')?.textContent).toContain("Norwegian");
    await chooseDownloadLanguage("English");
    await click("Download");
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "en");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await cvMenu("Download");
    await click("Download");
    expect(generateBrowserCvPdf).toHaveBeenLastCalledWith(expect.anything(), privateSharing, "nb");
  });

  it("requires delete confirmation, preserves profile details, and removes a published CV", async () => {
    await open();
    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    await cvMenu("Delete");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Delete CV?");
    expect(document.activeElement?.textContent).toBe("Cancel");
    const before = localStorage.getItem(DEMO_STORAGE_KEY);
    await click("Cancel");
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe(before);
    await cvMenu("Delete");
    await click("Delete CV");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("No CV yet");
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    expect(saved.document.draft).toMatchObject({ fullName: "Alex Example", fieldOfStudy: "Mechanical engineering", graduationYear: "2028", cvRegistered: false, education: [], projects: [], languages: [], skills: [], summary: "", headline: "" });
    expect(saved.document.publishedRevision).toBeNull();
    expect(saved.published).toBeNull();
    expect(saved.document.sharing).toEqual(privateSharing);
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
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Enter a four-digit graduation year.");
    expect(document.querySelector('[data-sonner-toast][data-type="error"]')?.textContent).toContain("Enter a four-digit graduation year.");
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
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

  it("reports discarded setup changes as a notification and restores the saved draft", async () => {
    await open();
    const before = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education;
    await cvMenu("Edit");
    expect(document.querySelector('[role="dialog"] [role="status"]')).toBeNull();
    await click("Next");
    await click("Remove MSc Mechanical engineering");
    await click("Close");
    await click("Discard changes");
    expect(container.querySelector('[role="alert"], .mcv-notice')).toBeNull();
    expect(document.querySelector('[data-sonner-toast][data-type="info"]')?.textContent).toContain("Changes discarded");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education).toEqual(before);
    await cvMenu("Edit");
    await click("Next");
    expect(button("Remove MSc Mechanical engineering")).toBeDefined();
  });
  it("does not report an expired session when navigating away from the profile", async () => {
    await open("", <SignOutControl />);
    await click("Go to notifications");
    expect(router.state.location.pathname).toBe("/notifications");
    expect(document.querySelector('[data-sonner-toast]')?.textContent ?? "").not.toContain("Session ended");
  });
  it("shows only the education essentials and updates its title while typing", async () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    stored.document.draft.education[0].fieldOfStudy = "Mechanical engineering";
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
    await open();
    await cvMenu("Edit");
    await click("Next");
    await click("Mechanical engineering");
    const section = document.querySelector("#mcv-education")!;
    expect([...section.querySelectorAll("label")].map((label) => label.textContent)).toEqual([
      "Institution", "Degree or programme", "Field of study", "Start date", "Expected end date",
    ]);
    expect(section.querySelector("textarea")).toBeNull();
    expect(section.textContent).not.toContain("Education 1");
    const label = [...section.querySelectorAll("label")].find((item) => item.textContent === "Field of study")!;
    const input = document.getElementById(label.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Robotics");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("Robotics").getAttribute("aria-expanded")).toBe("true");
    expect(button("Remove Robotics")).toBeDefined();
    await click("Close");
    await click("Save as draft");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education[0]).toMatchObject({ fieldOfStudy: "Robotics", description: stored.document.draft.education[0].description });
  });
  it("keeps a new education entry as a plain form until Add places it in the section", async () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    stored.document.draft.education = [];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
    await open();
    await cvMenu("Edit");
    await click("Next");
    await click("+ Add education");
    const section = document.querySelector("#mcv-education")!;
    expect(section.querySelector('.mcv-entry-form[data-section="education"]')).not.toBeNull();
    expect(section.querySelector(".mcv-entry, .mcv-remove")).toBeNull();
    expect(section.textContent).not.toContain("New education");
    expect(button("Add").disabled).toBe(true);
    for (const [label, value] of [["Institution", "NMBU"], ["Degree or programme", "MSc"], ["Field of study", "Robotics"]]) {
      const controlLabel = [...section.querySelectorAll("label")].find((item) => item.textContent === label)!;
      const input = document.getElementById(controlLabel.htmlFor) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(section.querySelector(".mcv-entry")).toBeNull();
    await click("Add");
    expect(section.querySelector('.mcv-entry-form[data-section="education"]')).toBeNull();
    expect(button("Robotics").getAttribute("aria-expanded")).toBe("false");
    expect(button("+ Add education")).toBeDefined();
    await click("Close");
    await click("Save as draft");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education).toEqual([
      expect.objectContaining({ institution: "NMBU", degree: "MSc", fieldOfStudy: "Robotics", startDate: "", endDate: "", description: "" }),
    ]);
  });
  it("does not save an empty education form as an entry when leaving setup", async () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
    stored.document.draft.education = [];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
    await open();
    await cvMenu("Edit");
    await click("Next");
    await click("+ Add education");
    await click("Close");
    await click("Save as draft");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft.education).toEqual([]);
  });
  it("edits languages and social links in The basics without adding wizard steps", async () => {
    await open();
    await cvMenu("Edit");
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("The basics");
    await click("Languages");
    expect(document.querySelector("#mcv-introduction")?.getAttribute("data-state")).toBe("closed");
    expect(document.querySelector("#mcv-languages")?.getAttribute("data-state")).toBe("open");
    await click("+ Add language");
    async function fill(section: string, label: string, value: string) {
      const entry = document.querySelector(`#mcv-${section} .mcv-entry-form`)!;
      const controlLabel = [...entry.querySelectorAll("label")].find((item) => item.textContent === label)!;
      const input = document.getElementById(controlLabel.htmlFor) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const languageForm = document.querySelector('#mcv-languages .mcv-entry-form')!;
    expect(languageForm.querySelector(".mcv-entry-trigger, .mcv-remove")).toBeNull();
    expect(button("Add", languageForm).disabled).toBe(true);
    await fill("languages", "Language", "Spanish");
    await act(async () => button("Add", languageForm).click());
    expect(document.querySelector('#mcv-languages .mcv-entry-form')).toBeNull();
    expect(button("Spanish").getAttribute("aria-expanded")).toBe("false");
    await click("Social links");
    expect(document.querySelector("#mcv-languages")?.getAttribute("data-state")).toBe("closed");
    await click("+ Add link");
    const linkForm = document.querySelector('#mcv-links .mcv-entry-form')!;
    expect(linkForm.querySelector(".mcv-entry-trigger, .mcv-remove")).toBeNull();
    expect(button("Add", linkForm).disabled).toBe(true);
    await fill("links", "Label", "LinkedIn");
    await fill("links", "URL", "https://example.invalid/alex");
    await act(async () => button("Add", linkForm).click());
    expect(document.querySelector('#mcv-links .mcv-entry-form')).toBeNull();
    expect(button("LinkedIn").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Step 1 of 4");
    await click("Close");
    await click("Save as draft");
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft;
    expect(saved.languages).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spanish" })]));
    expect(saved.links).toEqual([expect.objectContaining({ label: "LinkedIn", url: "https://example.invalid/alex" })]);
  });
  it.each(["languages", "links"])("opens %s deep links inside The basics", async (section) => {
    await open(`#mcv-${section}`);
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("The basics");
    expect(document.querySelector(`#mcv-${section}`)?.getAttribute("data-state")).toBe("open");
  });
  it.each([
    { section: "languages", title: "Languages", add: "+ Add language" },
    { section: "links", title: "Social links", add: "+ Add link" },
  ] as const)("does not save an empty $section creation form", async ({ section, title, add }) => {
    const before = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft[section];
    await open();
    await cvMenu("Edit");
    await click(title);
    await click(add);
    const form = document.querySelector(`#mcv-${section} .mcv-entry-form`)!;
    expect(form.querySelector(".mcv-entry-trigger, .mcv-remove")).toBeNull();
    expect(button("Add", form).disabled).toBe(true);
    await click("Close");
    await click("Save as draft");
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).document.draft[section]).toEqual(before);
  });
  it("keeps an invalid social link in its form and reports the problem as a notification", async () => {
    await open();
    await cvMenu("Edit");
    await click("Social links");
    await click("+ Add link");
    const form = document.querySelector("#mcv-links .mcv-entry-form")!;
    const label = [...form.querySelectorAll("label")].find((item) => item.textContent === "URL")!;
    const input = document.getElementById(label.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "not-a-url");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      button("Add", form).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector("#mcv-links .mcv-entry-form")).not.toBeNull();
    expect(document.querySelector("#mcv-links .mcv-entry")).toBeNull();
    expect(input.value).toBe("not-a-url");
    expect(document.querySelector('[data-sonner-toast][data-type="error"]')?.textContent).toContain("Check social link");
  });
});
