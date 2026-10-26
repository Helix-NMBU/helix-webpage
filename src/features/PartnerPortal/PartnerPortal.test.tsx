// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PartnerPortal from "./PartnerPortal";
import { partnerRepository } from "./repository";
import { hasPartnerAuthSession, PartnerRequestError, sendPartnerOtp, signOutPartner, verifyPartnerOtp, watchPartnerAuthSession } from "./session";
import type { PartnerCv, PartnerDirectory, PartnerSession } from "./types";

vi.mock("./session", async (original) => ({ ...await original<typeof import("./session")>(),
  hasPartnerAuthSession: vi.fn(), sendPartnerOtp: vi.fn(), signOutPartner: vi.fn(), verifyPartnerOtp: vi.fn(), watchPartnerAuthSession: vi.fn(),
}));
vi.mock("./repository", () => ({ partnerRepository: { session: vi.fn(), directory: vi.fn(), download: vi.fn() } }));
const session: PartnerSession = { user: { email: "first@example.test", name: "First partner" }, organizations: [{ id: "organization", name: "Partner company" }] };
const member: PartnerCv = { memberId: "member", fullName: "Published member", fieldOfStudy: "Robotics", graduationYear: 2027, contactEmail: null, phone: null, hasPdf: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("partner portal recovery and identity isolation", () => {
  let root: Root;
  let container: HTMLDivElement;
  let invalidate: () => void;
  let reload: () => void;
  const stop = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(watchPartnerAuthSession).mockImplementation((clear, load) => { invalidate = clear; reload = load; clear(); load(); return stop; });
    vi.mocked(hasPartnerAuthSession).mockResolvedValue(true);
    vi.mocked(partnerRepository.session).mockResolvedValue(session);
    vi.mocked(partnerRepository.directory).mockResolvedValue({ members: [member] });
    vi.spyOn(toast, "error");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); toast.dismiss(); });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function open() { await act(async () => root.render(<PartnerPortal />)); }
  function button(text: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!; }
  async function click(text: string) { await act(async () => { expect(button(text)).toBeDefined(); button(text).click(); }); }
  async function fill(id: string, value: string) {
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
  function lastErrorOptions() {
    const calls = vi.mocked(toast.error).mock.calls;
    return calls[calls.length - 1][1]!;
  }

  it("uses the shared theme and directory UI without inline status banners", async () => {
    await open();
    expect(container.textContent).toContain("Published member");
    expect(container.textContent).toContain("Partner company");
    expect(container.querySelector(".member-platform")).not.toBeNull();
    expect(container.querySelector('[role="alert"], [role="dialog"]')).toBeNull();
    expect(container.textContent).not.toMatch(/demo|mockup|local preview/i);
  });

  it("shows a return-to-webpage link on the invitation sign-in page", async () => {
    vi.mocked(hasPartnerAuthSession).mockResolvedValue(false);
    await open();
    const back = container.querySelector<HTMLAnchorElement>('a[href="https://www.helixnmbu.no"]');
    expect(back?.textContent).toBe("Go back to the webpage");
    expect(container.textContent).not.toContain("Sign out");
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
  });

  it("uses the settled SDK session without initiating a second session refresh", async () => {
    vi.mocked(watchPartnerAuthSession).mockImplementation((clear, load) => { clear(); load(true); return stop; });
    await open();
    expect(container.textContent).toContain("Published member");
    expect(hasPartnerAuthSession).not.toHaveBeenCalled();
    expect(partnerRepository.session).toHaveBeenCalledOnce();
  });

  it("hides the old directory immediately on account revalidation, then loads the new account in the same organization", async () => {
    await open();
    expect(container.textContent).toContain(member.fullName);
    await act(async () => invalidate());
    expect(container.textContent).not.toContain(member.fullName);
    vi.mocked(partnerRepository.session).mockResolvedValue({ ...session, user: { name: "Second partner", email: "second@example.test" } });
    vi.mocked(partnerRepository.directory).mockResolvedValue({ members: [{ ...member, fullName: "Second account result" }] });
    await act(async () => reload());
    expect(container.textContent).toContain("Second account result");
    expect(container.textContent).not.toContain(member.fullName);
  });

  it("discards a late directory response after sign-out", async () => {
    const late = deferred<PartnerDirectory>();
    vi.mocked(partnerRepository.directory).mockReturnValue(late.promise);
    await open();
    await click("Sign out");
    await act(async () => late.resolve({ members: [member] }));
    expect(container.textContent).not.toContain(member.fullName);
    expect(container.textContent).toContain("Sign in with email");
  });

  it("discards a late download after identity invalidation", async () => {
    const late = deferred<{ url: string; expiresIn: number }>();
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(partnerRepository.download).mockReturnValue(late.promise);
    await open();
    await click("Download CV");
    await act(async () => invalidate());
    await act(async () => late.resolve({ url: "https://storage.example.test/signed", expiresIn: 120 }));
    expect(download).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(member.fullName);
  });

  it("removes the directory and recovers through the shared notification after an expired token", async () => {
    await open();
    vi.mocked(partnerRepository.directory).mockRejectedValueOnce(new PartnerRequestError("Sign in again.", 401));
    await click("Refresh members");
    expect(container.textContent).not.toContain(member.fullName);
    expect(container.textContent).toContain("Sign in with email");
    expect(toast.error).toHaveBeenCalledWith("Partner access unavailable", expect.objectContaining({
      description: "Sign in again.", action: expect.objectContaining({ label: "Try again" }),
    }));
    const options = lastErrorOptions();
    await act(async () => { (options.action as unknown as { onClick: () => void }).onClick(); });
    expect(container.textContent).toContain(member.fullName);
  });

  it("recovers from a transient directory error through its notification action", async () => {
    vi.mocked(partnerRepository.directory).mockRejectedValueOnce(new Error("Try again."));
    await open();
    expect(container.textContent).not.toContain("No published profiles yet");
    expect(toast.error).toHaveBeenCalledWith("Could not load members", expect.anything());
    const options = lastErrorOptions();
    await act(async () => { (options.action as unknown as { onClick: () => void }).onClick(); });
    expect(container.textContent).toContain(member.fullName);
  });

  it("keeps a valid OTP separate from partner authorization and allows a denied account to sign out", async () => {
    vi.mocked(hasPartnerAuthSession).mockResolvedValue(false);
    await open();
    await fill("partner-email", "uninvited@example.test");
    await submit();
    expect(sendPartnerOtp).toHaveBeenCalledWith("uninvited@example.test");
    expect(partnerRepository.session).not.toHaveBeenCalled();
    await fill("partner-code", "123456");
    vi.mocked(hasPartnerAuthSession).mockResolvedValue(true);
    vi.mocked(partnerRepository.session).mockRejectedValueOnce(new PartnerRequestError("Contact Helix for partner access.", 403));
    await submit();
    expect(verifyPartnerOtp).toHaveBeenCalledWith("uninvited@example.test", "123456");
    expect(partnerRepository.directory).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(member.fullName);
    expect(container.querySelector("#partner-code")).toBeNull();
    await click("Sign out");
    expect(signOutPartner).toHaveBeenCalled();
    expect(button("Sign out")).toBeUndefined();
  });

  it("lets a user recover from an invalid code without leaving the code form", async () => {
    vi.mocked(hasPartnerAuthSession).mockResolvedValue(false);
    await open();
    await fill("partner-email", "partner@example.test");
    await submit();
    await fill("partner-code", "000000");
    vi.mocked(verifyPartnerOtp).mockRejectedValueOnce(new PartnerRequestError("Request a new code.", 400));
    await submit();
    expect(container.querySelector<HTMLInputElement>("#partner-code")?.value).toBe("");
    expect(container.textContent).toContain("Enter your sign-in code");
    expect(toast.error).toHaveBeenCalledWith("Code not verified", expect.objectContaining({ description: "Request a new code." }));
    await click("Change email");
    expect(container.querySelector("#partner-email")).not.toBeNull();
  });

  it("retains sign-out recovery after a provider failure", async () => {
    await open();
    vi.mocked(signOutPartner).mockRejectedValueOnce(new Error("Try again."));
    await click("Sign out");
    expect(container.textContent).not.toContain(member.fullName);
    const options = lastErrorOptions();
    await act(async () => { (options.action as unknown as { onClick: () => void }).onClick(); });
    expect(signOutPartner).toHaveBeenCalledTimes(2);
    expect(button("Sign out")).toBeUndefined();
  });
});
