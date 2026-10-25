// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryPanel } from "./DirectoryPanel";
import type { SponsorContext } from "./types";
import type { SponsorDirectoryRequest, SponsorDirectoryResponse, SponsorProfileResponse } from "./directory-types";

const context: SponsorContext = { authUserId: "contact", email: "contact@example.invalid", contactId: "contact-id", organizationId: "organization", organizationName: "Sponsor", role: "sponsor", portal: true, directory: true };
const member = { id: "member", fullName: "Åse Example", headline: "Controls engineer", programme: "Robotics", graduationYear: "2027", departments: ["Electronics"], skills: ["Python"], canViewCv: false };
const listing: SponsorDirectoryResponse = { members: [member], total: 1, filters: { programmes: ["Robotics"], years: ["2027"], departments: ["Electronics"], skills: ["Python"] } };
const profile: SponsorProfileResponse = { member, profile: { fullName: member.fullName, headline: member.headline, summary: "Published work", city: "Ås", fieldOfStudy: "Robotics", graduationYear: "2027", education: [], experience: [], projects: [], skills: ["Python"], languages: [], links: [] } };

describe("sponsor directory browsing", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function mount(request: SponsorDirectoryRequest, value = context) {
    await act(async () => root.render(<DirectoryPanel context={value} request={request} />));
  }
  async function button(label: string) {
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label)?.click());
  }

  it("makes no directory request when the agreement excludes it", async () => {
    const request = vi.fn();
    await mount(request, { ...context, directory: false });
    expect(container.textContent).toContain("does not include Talent Directory");
    expect(request).not.toHaveBeenCalled();
  });

  it("renders only shared contact actions and hides CV actions when no CV is shared", async () => {
    const request = vi.fn(async (action: string) => action === "profile" ? profile : listing) as SponsorDirectoryRequest;
    await mount(request);
    expect(container.textContent).toContain("Åse Example");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    await button("View profile");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Published work");
    expect(dialog?.textContent).not.toContain("Download CV");
    expect(dialog?.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("distinguishes an empty directory from a filtered-empty response", async () => {
    const request = vi.fn().mockResolvedValue({ ...listing, members: [], total: 0 }) as SponsorDirectoryRequest;
    await mount(request);
    expect(container.textContent).toContain("No shared profiles yet");
    await mount(vi.fn().mockResolvedValue({ ...listing, members: [] }) as SponsorDirectoryRequest);
    expect(container.textContent).toContain("No members match these filters");
  });

  it("uses shared contacts and reports a failed inline grant without retaining a file preview", async () => {
    const sharedMember = { ...member, canViewCv: true, contactEmail: "shared@example.invalid", phone: "+4712345678" };
    const request = vi.fn(async (action: string) => {
      if (action === "profile") return { ...profile, member: sharedMember, profile: { ...profile.profile, contactEmail: sharedMember.contactEmail, phone: sharedMember.phone } };
      if (action === "cv") throw new Error("The shared CV has been withdrawn.");
      return { ...listing, members: [sharedMember] };
    });
    await mount(request as SponsorDirectoryRequest);
    expect(container.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe("mailto:shared%40example.invalid");
    expect(request.mock.calls.map(([action]) => action)).not.toContain("cv");
    await button("View profile");
    await button("View CV");
    expect((request.mock.calls as unknown[][]).some(([action, options]) => action === "cv" && (options as { query?: unknown }).query && JSON.stringify((options as { query: unknown }).query) === JSON.stringify({ id: member.id, disposition: "inline" }))).toBe(true);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("The shared CV has been withdrawn.");
  });

  it("shows errors and retries without retaining previous result cards", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("Temporarily unavailable")).mockResolvedValueOnce(listing);
    await mount(request as SponsorDirectoryRequest);
    expect(container.textContent).toContain("Temporarily unavailable");
    expect(container.textContent).not.toContain(member.fullName);
    await button("Try again");
    expect(container.textContent).toContain(member.fullName);
  });

  it("aborts requests on access loss and ignores stale responses", async () => {
    let resolve: (value: SponsorDirectoryResponse) => void = () => undefined;
    let signal: AbortSignal | null | undefined;
    const request = vi.fn((_action: string, options?: RequestInit) => { signal = options?.signal; return new Promise<SponsorDirectoryResponse>((done) => { resolve = done; }); }) as SponsorDirectoryRequest;
    await mount(request);
    expect(container.textContent).toContain("Loading members");
    await mount(request, { ...context, directory: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(listing));
    expect(container.textContent).not.toContain(member.fullName);
    expect(container.textContent).toContain("does not include Talent Directory");
  });
});
