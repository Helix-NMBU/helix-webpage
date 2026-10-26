// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberAccountProvider } from "./MemberAccountContext";
import { EmailSignatureSettings } from "./EmailSignatureSettings";
import { defaultSignatureSettings, renderSignature } from "./email-signature";

const mocks = vi.hoisted(() => ({ admin: true, notify: vi.fn(), request: vi.fn() }));
vi.mock("./MemberFeatureAccess", () => ({ useMemberFeatureAccess: () => ({ authUserId: "member", member: { roles: mocks.admin ? [{ key: "platform_administrator" }] : [{ key: "project_manager" }] } }) }));
vi.mock("./MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("./email-signature-api", () => ({ emailSignatureRequest: mocks.request }));

describe("email signature settings", () => {
  let container: HTMLDivElement;
  let root: Root;
  const member = { name: "Åse Example", email: "ase@helixnmbu.no", role: "Member" as const, helixRole: "Mechanical lead" };
  beforeEach(() => {
    mocks.admin = true;
    mocks.notify.mockClear();
    mocks.request.mockReset();
    mocks.request.mockImplementation(async (_owner, change) => {
      const settings = change?.settings ?? { ...defaultSignatureSettings, enabled: true };
      const profile = { ...member, role: member.helixRole, phone: "+47 900 88 573" };
      return { settings, revision: change ? 2 : 1, signature: renderSignature(settings, profile), member: profile };
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function open() { await act(async () => root.render(<MemberAccountProvider account={member}><EmailSignatureSettings /></MemberAccountProvider>)); }
  async function fill(label: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it("lets administrators save a dynamic template and previews current member values", async () => {
    await open();
    await fill("Signature line 1", "Best regards, {member.name}");
    expect(container.querySelector<HTMLIFrameElement>("iframe")!.srcdoc).toContain("Best regards, Åse Example");
    expect(container.querySelector<HTMLIFrameElement>("iframe")!.srcdoc).toContain("Mechanical lead");
    expect(container.querySelector<HTMLIFrameElement>("iframe")!.srcdoc).toContain("Tlf: +47 900 88 573");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.request.mock.calls[1][1]).toMatchObject({ revision: 1, settings: { lines: [expect.objectContaining({ text: "Best regards, {member.name}" }), ...defaultSignatureSettings.lines.slice(1)] } });
    expect(mocks.notify).toHaveBeenCalledWith("Email signature saved", expect.any(String), expect.any(Object));
  });
  it("shows members a preview without administrative inputs or save actions", async () => {
    mocks.admin = false;
    await open();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).not.toContain("Use Helix design");
    expect(container.querySelector<HTMLIFrameElement>("iframe")!.srcdoc).toContain("Åse Example");
  });

  it("lets administrators restore the shared Helix design with organization social links", async () => {
    await open();
    await fill("Signature line 1", "Different text");
    const reset = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Use Helix design")!;
    await act(async () => reset.click());
    expect(container.querySelector<HTMLInputElement>('[aria-label="Signature line 1"]')!.value).toBe("{member.name}");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Font size for line 1"]')!.value).toBe("32");
    const preview = container.querySelector<HTMLIFrameElement>("iframe")!.srcdoc;
    expect(preview).toContain('href="https://www.facebook.com/profile.php?id=100091245669131"');
    expect(preview).toContain("Instagram");
    expect(preview).toContain("Nettside");
    expect(preview).not.toContain("Different text");
  });
  it("rejects invalid placeholders before saving and keeps the draft available", async () => {
    await open();
    await fill("Signature line 1", "{member.password}");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith("Could not save signature", expect.stringContaining("{member.name}"), expect.any(Object));
    expect(container.querySelector<HTMLInputElement>('[aria-label="Signature line 1"]')!.value).toBe("{member.password}");
  });
});
