// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SponsorWorkspace from "./SponsorWorkspace";
import { loadSponsorSession, sponsorRequest, SponsorRequestError } from "./session";
import type { SponsorContext } from "./types";
import type { SponsorTransport } from "./admin-types";

vi.mock("./session", async (original) => ({ ...await original<typeof import("./session")>(), loadSponsorSession: vi.fn(), sponsorRequest: vi.fn() }));
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
});
