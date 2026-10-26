// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SponsorWorkspace from "./SponsorWorkspace";
import { loadSponsorSession, sponsorRequest, sponsorSignOut, SponsorRequestError } from "./session";
import type { SponsorContext } from "./types";
import type { SponsorTransport } from "./admin-types";

vi.mock("./session", async (original) => ({ ...await original<typeof import("./session")>(), loadSponsorSession: vi.fn(), sponsorRequest: vi.fn(), sponsorSignOut: vi.fn() }));
vi.mock("./local", () => ({ isLocalSponsorMode: () => false }));
vi.mock("./RequestsPanel", () => ({ default: function Reply({ request }: { request: SponsorTransport }) {
  const [text, setText] = useState(""); const [error, setError] = useState("");
  return <form onSubmit={(event) => { event.preventDefault(); void request("request", { method: "POST", body: text }).catch((failure: Error) => setError(failure.message)); }}><textarea aria-label="Unsent reply" value={text} onChange={(event) => setText(event.target.value)} /><button type="submit">Send reply</button><p role="alert">{error}</p></form>;
} }));
const context: SponsorContext = { authUserId: "admin", email: "admin@example.invalid", role: "admin", contactId: null, organizationId: null, organizationName: null, portal: false, directory: false };
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  localStorage.setItem("helix-member-theme", "light");
  vi.mocked(loadSponsorSession).mockResolvedValue(context);
  vi.mocked(sponsorSignOut).mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function render(path = "/sponsor/requests") { await act(async () => root.render(<MemoryRouter initialEntries={[path]}><SponsorWorkspace /></MemoryRouter>)); }
async function reply() {
  const input = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Keep this unsent reply"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
describe("composed sponsor workspace", () => {
  it.each([
    { role: "sponsor", portal: true, directory: true, links: ["Talent Directory", "Collaboration requests"] },
    { role: "sponsor", portal: true, directory: false, links: ["Collaboration requests"] },
    { role: "admin", portal: false, directory: false, links: ["Collaboration requests", "Administration"] },
    { role: "developer", portal: false, directory: false, links: [] },
  ] as const)("shows permitted sidebar destinations for $role with directory=$directory", async ({ role, portal, directory, links }) => {
    vi.mocked(loadSponsorSession).mockResolvedValue({ ...context, role, portal, directory });
    await render(directory ? "/sponsor/requests" : "/sponsor");
    const navigation = host.querySelector('nav[aria-label="Sponsor navigation"]')!;
    expect(Array.from(navigation.querySelectorAll("a"), (link) => link.textContent)).toEqual(links);
    if (portal || role === "admin") expect(navigation.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(!directory && !portal && role === "admin" ? "/sponsor/admin" : "/sponsor/requests");
    else expect(host.textContent).toContain("Your developer sign-in is active.");
  });
  it("keeps the workspace open and sign-out retryable after a provider failure", async () => {
    vi.mocked(sponsorSignOut).mockRejectedValueOnce(new Error("Sign-out service is unavailable."));
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Sponsor account menu"]')!.click());
    const signOut = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Sign out")!;
    await act(async () => signOut.click());
    expect(host.textContent).toContain("Sign-out service is unavailable.");
    expect(host.querySelector("textarea")).not.toBeNull();
    expect(signOut.disabled).toBe(false);
    await act(async () => signOut.click());
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Email me a sign-in link");
    expect(sponsorSignOut).toHaveBeenCalledTimes(2);
  });
  it("preserves an unsent reply after reassignment rejects the operation but session remains valid", async () => {
    vi.mocked(sponsorRequest).mockImplementation(async (action) => {
      if (action === "session") return context;
      throw new SponsorRequestError("Assign this request to yourself first.", 403);
    });
    await render(); await reply();
    expect(host.querySelector("textarea")?.value).toBe("Keep this unsent reply");
    expect(host.textContent).toContain("Assign this request to yourself first.");
    expect(host.textContent).not.toContain("Email me a sign-in link");
  });
  it("ends workspace access when a fresh session check confirms revocation", async () => {
    vi.mocked(sponsorRequest).mockRejectedValue(new SponsorRequestError("Your invitation was revoked.", 403));
    await render(); await reply();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Email me a sign-in link");
  });
  it("scopes signed-in and login surfaces so body portals inherit the stored theme", async () => {
    await render();
    expect(host.querySelector(".member-platform.portal-root")).not.toBeNull();
    expect(document.documentElement.dataset.memberTheme).toBe("light");
    await act(async () => root.render(<MemoryRouter key="login" initialEntries={["/sponsor/login"]}><SponsorWorkspace /></MemoryRouter>));
    expect(host.querySelector(".member-platform.portal-root form")).not.toBeNull();
  });
  it("renders the dedicated partner login with a return link and without site chrome", async () => {
    await render("/login");
    const returnLink = host.querySelector<HTMLAnchorElement>('a[href="https://www.helixnmbu.no"]');
    expect(returnLink?.textContent).toBe("Go back to the webpage");
    expect(host.querySelector("[data-navbar-ref]")).toBeNull();
    expect(host.querySelector("footer")).toBeNull();
    expect(host.textContent).toContain("Email me a sign-in link");
  });
});
