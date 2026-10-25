// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailWorkspace } from "./MailWorkspace";

describe("mail workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.querySelectorAll('[data-radix-portal]').forEach((portal) => portal.remove());
  });

  it("shows only the disconnected Gmail state", async () => {
    await act(async () => root.render(<MailWorkspace />));

    expect(container.querySelector("#connect-gmail-title")?.textContent).toBe(
      "Connect your Gmail account",
    );
    expect(container.querySelector('[aria-label="Search mail"]')).toBeNull();
    expect(container.querySelector('[aria-label="Inbox"]')).toBeNull();
    expect(container.querySelector('svg[aria-label="Gmail"]')).not.toBeNull();
  });

  it("shows one inbox column with folder controls in its header when connected", async () => {
    await act(async () => root.render(<MailWorkspace connected />));

    expect(container.querySelector('[aria-label="Search mail"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Inbox"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sent"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Archive"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="More mail folders"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mail settings"]')).toBeNull();
    expect(container.textContent).toContain("No messages in your inbox.");
    expect(container.textContent).toContain("Helix NMBU");
  });

  it("keeps the connect action on the disconnected page", async () => {
    await act(async () => root.render(<MailWorkspace />));

    expect(container.querySelector('[data-state="open"]')).toBeNull();
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.textContent?.includes("Connect Gmail account"),
    )).toBe(true);
  });
});
