// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceEntry } from "./FinancePages";
import { FinanceRequestError } from "./repository";
import type { FinanceCapabilitiesResponse, FinancingView, FundingPartRecord, FundingRecord } from "./types";
import { FinanceAccessProvider } from "../MemberPlatform/FinanceAccess";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  overview: vi.fn(),
  budgets: vi.fn(),
  purchases: vi.fn(),
  financing: vi.fn(),
  mutate: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("./repository", async (original) => ({
  ...await original<typeof import("./repository")>(),
  createFinanceApi: () => api,
}));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));

const business: FinanceCapabilitiesResponse = {
  memberId: "business-member",
  viewVersion: 1,
  profiles: ["business"],
  capabilities: {
    publicBudgets: true, publicEarmarks: true, registerActual: true, ownRequests: true,
    financing: true, manageFunding: true, purchaseRegister: false, filesAndRefunds: false, paymentsVoidReview: false,
    draftBudgetItems: false, permittedImports: false, createBudget: false, approveBudget: false, protectedBudgetEdits: false, decideRequests: false,
  },
  seasonCode: "S27",
  approvalThresholdNok: null,
  today: "2026-10-26",
};

const funding: FundingRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  publicRef: "F-S27-001",
  sourceName: "Example source",
  ownerName: "Example owner",
  fundingType: "grant",
  amountNok: "1000.00",
  status: "secured",
  confidence: "high",
  expectedDate: "2027-03-01",
  receivedDate: null,
  ownerEmail: "owner@example.test",
  reportingRequired: true,
  agreementLink: "https://example.test/agreement",
  note: "Synthetic note",
  revision: 3,
  earmarkedNok: "1500.00",
  unrestrictedNok: "-500.00",
  linkedItemCount: 1,
};

const part: FundingPartRecord = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  publicRef: "FE-001",
  fundingId: funding.id,
  purpose: "Frame work",
  amountNok: "1500.00",
  spendBy: "2026-01-01",
  conditions: "Private condition text",
  revision: 1,
  usedNok: "400.00",
  leftNok: "1100.00",
  mustReturnNok: "1100.00",
  overdue: true,
  systemName: "Frame",
  linkedItems: [{
    id: "item-1",
    publicRef: "BI-S27-001",
    description: "Frame tube",
    systemId: "system-1",
    systemCode: "SYS-FR",
    systemName: "Frame",
    status: "active",
  }],
};

const deleted: FundingRecord = {
  ...funding,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  publicRef: "F-S27-002",
  sourceName: "Retired source",
  status: "deleted",
  revision: 4,
  earmarkedNok: "0.00",
  unrestrictedNok: "1000.00",
  linkedItemCount: 0,
};

function view(records: FundingRecord[], parts: FundingPartRecord[] = [part], viewVersion = 1): FinancingView {
  return { viewVersion, seasonCode: "S27", funding: records, parts, scenarios: [] };
}

const saved = { ok: true as const, viewVersion: 2, id: "new-funding", revision: 1, warnings: [] as { message: string }[], errors: [] };

let container: HTMLDivElement;
let root: Root;

function button(text: string) {
  return [...document.querySelectorAll("button")].find((item) => item.textContent === text);
}

async function click(text: string) {
  const target = button(text);
  expect(target, text).toBeTruthy();
  await act(async () => target!.click());
}

async function fill(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  expect(input, id).toBeTruthy();
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

async function render(path = "/finance/financing") {
  const router = createMemoryRouter([
    { path: "/finance/financing", element: <FinanceAccessProvider userId="business"><FinanceEntry page="financing" /></FinanceAccessProvider> },
    { path: "/finance", element: <p>Public finance</p> },
    { path: "/", element: <p>Home</p> },
  ], { initialEntries: [path] });
  await act(async () => root.render(<RouterProvider router={router} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  api.capabilities.mockReset().mockResolvedValue(business);
  api.overview.mockReset();
  api.budgets.mockReset();
  api.purchases.mockReset();
  api.financing.mockReset().mockResolvedValue(view([funding, deleted]));
  api.mutate.mockReset().mockResolvedValue(saved);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("financing page", () => {
  it("shows funding totals, linked parts, and a negative remainder", async () => {
    await render();
    expect(container.textContent).toContain("Example source");
    expect(container.textContent).toContain("1000.00 NOK");
    expect(container.textContent).toContain("-500.00 NOK. Unrestricted remainder is negative.");
    expect(container.textContent).toContain("Frame work");
    expect(container.textContent).toContain("Private condition text");
    expect(container.textContent).toContain("System Frame");
    expect(container.textContent).toContain("Must return 1100.00 NOK");
    expect(container.textContent).toContain("Frame tube (BI-S27-001)");
    expect(container.textContent).not.toContain("Retired source");
    expect(button("Delete part")).toBeUndefined();
    expect(container.textContent).not.toContain("Delete part");
  });

  it("reveals and restores deleted funding without a part delete control", async () => {
    await render();
    const toggle = document.querySelector<HTMLButtonElement>("[role='switch']");
    expect(toggle).toBeTruthy();
    await act(async () => toggle!.click());
    expect(container.textContent).toContain("Retired source");
    await click("Restore funding");
    expect(api.mutate).toHaveBeenCalledWith(expect.objectContaining({
      action: "restoreFunding",
      fundingId: deleted.id,
      expectedRevision: deleted.revision,
    }));
    expect(notify).toHaveBeenCalledWith("Funding restored", expect.any(String), expect.objectContaining({ variant: "success" }));
  });

  it("keeps an invalid funding form in place and recovers from a failed save", async () => {
    api.financing.mockResolvedValue(view([]));
    await render();
    expect(container.textContent).toContain("No funding records yet");
    await click("Add funding");
    await submit();
    expect(api.mutate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Enter a source name.");
    expect(document.getElementById("funding-source")?.getAttribute("aria-invalid")).toBe("true");
    expect(notify).toHaveBeenCalledWith("Could not save financing", expect.any(String), expect.objectContaining({ variant: "error" }));

    await fill("funding-source", "Example source");
    await fill("funding-owner", "Example owner");
    await fill("funding-amount", "1000.00");
    api.mutate.mockRejectedValueOnce(new FinanceRequestError("The funding record is not valid.", 400, [
      { field: "amountNok", message: "Enter an amount greater than zero." },
    ]));
    await submit();
    expect((document.getElementById("funding-amount") as HTMLInputElement).value).toBe("1000.00");
    expect(document.getElementById("funding-amount")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Enter an amount greater than zero.");
    const retry = notify.mock.calls.find((call) => call[0] === "Could not save financing" && call[2]?.action?.label === "Try again")?.[2].action.onClick as () => void;
    api.mutate.mockResolvedValueOnce(saved);
    api.financing.mockResolvedValue(view([funding], [part], saved.viewVersion));
    await act(async () => retry());
    expect(api.mutate).toHaveBeenCalledTimes(2);
    expect(api.mutate.mock.calls[1][0]).toMatchObject({ action: "addFunding", funding: { sourceName: "Example source", amountNok: "1000.00" } });
    expect(document.querySelector("form")).toBeNull();
  });

  it("edits a part, warns when the part exceeds the funding, and soft-deletes the source", async () => {
    await render();
    await click("Edit part");
    expect(container.textContent).toContain("Parts are not deleted from here.");
    await fill("part-purpose", "Frame repair");
    await fill("part-amount", "1500.00");
    api.mutate.mockResolvedValueOnce({
      ...saved,
      warnings: [{ message: "Earmarked parts exceed this funding by 500.00 NOK." }],
    });
    await submit();
    expect(api.mutate.mock.calls[0][0]).toMatchObject({
      action: "editEarmark",
      partId: part.id,
      expectedRevision: part.revision,
      patch: { purpose: "Frame repair", amountNok: "1500.00" },
    });
    expect(notify).toHaveBeenCalledWith(
      "Earmarked part saved",
      "Earmarked parts exceed this funding by 500.00 NOK.",
      expect.objectContaining({ variant: "warning" }),
    );

    await click("Delete funding");
    expect(api.mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "deleteFunding",
      fundingId: funding.id,
      expectedRevision: funding.revision,
    }));
  });

  it("keeps the form and asks to delete on its own when another field changed", async () => {
    await render();
    await click("Edit funding");
    await fill("funding-note", "Changed note");
    await act(async () => document.getElementById("funding-status")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const option = [...document.querySelectorAll<HTMLElement>("[role='option']")].find((element) => element.textContent === "Deleted");
    expect(option).toBeTruthy();
    await act(async () => option!.click());
    await submit();
    expect(api.mutate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "Could not save financing",
      "Delete on its own, or save your other changes first.",
      expect.objectContaining({ variant: "error" }),
    );
    expect(container.textContent).toContain("Delete on its own, or save your other changes first.");
    expect((document.getElementById("funding-note") as HTMLTextAreaElement).value).toBe("Changed note");
    expect(document.getElementById("funding-status")?.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector("form")).not.toBeNull();
  });

  it("reloads the current financing when a duplicate request conflicts and shows no error", async () => {
    await render();
    await click("Edit funding");
    await fill("funding-source", "Updated source");
    api.mutate.mockRejectedValueOnce(new FinanceRequestError("This request was already used with different details.", 409));
    api.financing.mockResolvedValueOnce(view([{ ...funding, sourceName: "Current source", revision: 4 }], [part], 8));
    await submit();
    expect(notify.mock.calls.some((call) => call[2]?.variant === "error")).toBe(false);
    expect(document.querySelector("form")).toBeNull();
    expect(api.financing).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Current source");
  });

  it("keeps unsaved edits when a newer financing view arrives", async () => {
    await render();
    await click("Edit funding");
    await fill("funding-source", "Updated source");
    api.capabilities.mockResolvedValue({ ...business, viewVersion: 5 });
    api.financing.mockResolvedValue(view([funding, deleted], [part], 5));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(notify).toHaveBeenCalledWith(
      "Financing was updated",
      "Your unsaved changes are still in the form.",
      expect.objectContaining({ variant: "info" }),
    );
    expect((document.getElementById("funding-source") as HTMLInputElement).value).toBe("Updated source");
    const discard = notify.mock.calls.find((call) => call[0] === "Financing was updated")?.[2].action.onClick as () => void;
    await act(async () => discard());
    expect(document.querySelector("form")).toBeNull();
  });

  it("hides funding controls from a profile that cannot manage funding", async () => {
    api.capabilities.mockResolvedValue({
      ...business,
      capabilities: { ...business.capabilities, manageFunding: false },
    });
    await render();
    expect(container.textContent).toContain("Example source");
    expect(button("Add funding")).toBeUndefined();
    expect(button("Edit funding")).toBeUndefined();
    expect(button("Delete funding")).toBeUndefined();
  });

  it("sends a profile without financing access back to the public finance page", async () => {
    api.capabilities.mockResolvedValue({
      ...business,
      profiles: [],
      capabilities: { ...business.capabilities, financing: false, manageFunding: false },
    });
    await render();
    expect(container.textContent).toContain("Public finance");
    expect(notify).toHaveBeenCalledWith("Financing access required", expect.any(String), expect.objectContaining({ variant: "error" }));
  });
});
