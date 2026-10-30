// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { Navbar } from "./Navbar";
import { MemberNavProvider } from "./member-nav";

function Pathname() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderNavbar() {
  return render(
    <MemberNavProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Navbar />
        <Pathname />
      </MemoryRouter>
    </MemberNavProvider>
  );
}

beforeEach(() => {
  document.elementFromPoint = () => null;
});

/** Browsers skip these for hit-testing and sequential focus. jsdom's focus() does not. */
function isClosedToPointerAndFocus(overlay: HTMLElement) {
  const hiddenByVisibility = overlay.style.visibility === "hidden";
  return overlay.hasAttribute("inert") && hiddenByVisibility && overlay.style.pointerEvents === "none";
}

function overlayOf(container: HTMLElement) {
  const overlay = container.querySelector("[data-nav-overlay]");
  if (!(overlay instanceof HTMLElement)) {
    throw new Error("menu overlay was not rendered");
  }
  return overlay;
}

describe("closed menu overlay", () => {
  it("does not intercept header clicks or expose its contents", () => {
    const { container } = renderNavbar();
    const overlay = overlayOf(container);

    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(isClosedToPointerAndFocus(overlay)).toBe(true);
    expect(container.querySelector(".fixed.inset-0")).toBeNull();

    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "The Garage" })).toHaveLength(1);

    const closeButton = container.querySelector('button[aria-label="Close menu"]');
    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    expect(getComputedStyle(closeButton as HTMLElement).visibility).toBe("hidden");

    fireEvent.click(screen.getByRole("link", { name: "The Garage" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/garage");
  });

  it("exposes the menu only while it is open", async () => {
    const { container } = renderNavbar();
    const toggle = container.querySelector("span.cursor-pointer");
    expect(toggle).toBeInstanceOf(HTMLElement);

    fireEvent.click(toggle as HTMLElement);

    const overlay = overlayOf(container);
    expect(overlay.hasAttribute("inert")).toBe(false);
    expect(overlay.getAttribute("aria-hidden")).toBeNull();
    expect(overlay.style.visibility).toBe("visible");
    expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(overlay.hasAttribute("inert")).toBe(true);
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  });
});
