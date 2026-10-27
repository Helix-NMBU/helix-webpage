// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceAccessProvider, useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { FinanceEntry } from "./FinancePages";
import { FinanceRequestError } from "./repository";
import type { FinanceCapabilitiesResponse, FinancingView, PublicOverview } from "./types";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  version: vi.fn(),
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

const member: FinanceCapabilitiesResponse = {
  memberId: "member",
  viewVersion: 1,
  profiles: [],
  capabilities: {
    publicBudgets: true, publicEarmarks: true, registerActual: true, ownRequests: true,
    financing: false, manageFunding: false, purchaseRegister: false, filesAndRefunds: false, paymentsVoidReview: false,
    draftBudgetItems: false, permittedImports: false, createBudget: false, approveBudget: false, protectedBudgetEdits: false, decideRequests: false,
  },
  seasonCode: "S27",
  approvalThresholdNok: null,
  today: "2026-10-26",
};

const business: FinanceCapabilitiesResponse = {
  ...member,
  memberId: "business-member",
  profiles: ["business"],
  capabilities: { ...member.capabilities, financing: true, manageFunding: true },
};

function overview(actualNok = "19.00", viewVersion = 1): PublicOverview {
  return {
    viewVersion,
    seasonCode: "S27",
    budgetStatus: "approved",
    approvedOn: "2026-10-01",
    departments: [{
      departmentKey: "mechanical-production",
      name: "Zebra workshop",
      plannedNok: "20.00",
      actualNok,
      differenceNok: "1.00",
      usedFraction: "0.9500",
      commitmentNok: "2.00",
      unbudgetedNok: "6.00",
      systems: [{
        id: "system-beta",
        code: "SYS-ZB",
        name: "Beta",
        active: false,
        plannedNok: "20.00",
        actualNok,
        differenceNok: "1.00",
        usedFraction: "0.9500",
        commitmentNok: "2.00",
        unbudgetedNok: "6.00",
      }],
    }],
    publicEarmarks: [{
      id: "part-loose",
      publicRef: "FE-021",
      purpose: "Loose bracket",
      amountNok: "30.00",
      usedNok: "0.00",
      leftNok: "30.00",
      mustReturnNok: "0.00",
      spendBy: null,
      systemName: null,
    }],
  };
}

const financingView: FinancingView = {
  viewVersion: 1,
  seasonCode: "S27",
  funding: [],
  parts: [],
  scenarios: [],
};

let container: HTMLDivElement;
let root: Root;
let session: ReturnType<typeof useFinanceAccess>;

function Probe() {
  session = useFinanceAccess();
  return null;
}

function button(text: string) {
  return [...document.querySelectorAll("button")].find((item) => item.textContent === text);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  api.capabilities.mockReset().mockResolvedValue(member);
  api.version.mockReset().mockResolvedValue({ viewVersion: 1 });
  api.overview.mockReset().mockResolvedValue(overview());
  api.budgets.mockReset();
  api.purchases.mockReset();
  api.financing.mockReset().mockResolvedValue(financingView);
  api.mutate.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderOverview(userId = "member") {
  const router = createMemoryRouter([
    {
      path: "/finance",
      element: (
        <FinanceAccessProvider userId={userId}>
          <Probe />
          <FinanceEntry page="overview" />
        </FinanceAccessProvider>
      ),
    },
    { path: "/", element: <p>Home</p> },
  ], { initialEntries: ["/finance"] });
  await act(async () => root.render(<RouterProvider router={router} />));
  return router;
}

describe("FIN-09-A04 overview", () => {
  it("shows budget state, drill-down, use, commitments, unbudgeted totals, and unassigned parts", async () => {
    await renderOverview();
    expect(container.textContent).toContain("Approved budget · 2026-10-01");
    expect(container.textContent).toContain("Zebra workshop");
    expect(container.textContent).toContain("Planned 20.00");
    expect(container.textContent).toContain("Actual 19.00");
    expect(container.textContent).toContain("Difference 1.00");
    expect(container.textContent).toContain("Budget use 0.9500");
    expect(container.textContent).toContain("Open commitments 2.00");
    expect(container.textContent).toContain("Unbudgeted 6.00");
    expect(container.textContent).toContain("Unassigned");
    expect(container.textContent).toContain("Loose bracket");
    expect(container.textContent).not.toMatch(/\bbank\b/i);
    expect(container.textContent).not.toMatch(/\bcash\b/i);
    expect(container.textContent).not.toContain("Beta");
    await act(async () => button("Show systems")!.click());
    expect(button("Hide systems")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Beta · Inactive");
    expect(container.textContent).toContain("SYS-ZB");
  });
});

describe("FIN-09-A05 public overview", () => {
  it("hides scenarios and source conditions until the profile may see financing", async () => {
    await renderOverview();
    expect(container.textContent).not.toContain("Now");
    expect(container.textContent).not.toContain("Earmark sources");
    expect(container.textContent).not.toContain("Synthetic source");
    api.capabilities.mockResolvedValue(business);
    api.version.mockResolvedValue({ viewVersion: 2 });
    api.overview.mockResolvedValue({
      ...overview("19.00", 2),
      scenarios: [{
        key: "downside",
        label: "Now",
        eligibleFundingNok: "100.00",
        earmarkedNok: "250.00",
        unrestrictedNok: "-150.00",
        needNok: "1750.00",
        restrictedCoverNok: "0.00",
        generalNeedNok: "1750.00",
        shortfallNok: "1900.00",
      }, {
        key: "current",
        label: "Realistic",
        eligibleFundingNok: "100.00",
        earmarkedNok: "250.00",
        unrestrictedNok: "-150.00",
        needNok: "1750.00",
        restrictedCoverNok: "0.00",
        generalNeedNok: "1750.00",
        shortfallNok: "1900.00",
      }, {
        key: "full",
        label: "Optimistic",
        eligibleFundingNok: "100.00",
        earmarkedNok: "250.00",
        unrestrictedNok: "-150.00",
        needNok: "1750.00",
        restrictedCoverNok: "0.00",
        generalNeedNok: "1750.00",
        shortfallNok: "1900.00",
      }],
      earmarkSources: [{ id: "part", sourceName: "Synthetic source", conditions: "Internal condition" }],
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toContain("Now");
    expect(container.textContent).toContain("Realistic");
    expect(container.textContent).toContain("Optimistic");
    expect(container.textContent).toContain("Synthetic source");
    expect(container.textContent).toContain("Internal condition");
    expect(container.textContent).toContain("Unrestricted remainder -150.00");
    expect(container.textContent).not.toMatch(/\bbank\b/i);
  });
});

describe("FIN-09-A06 freshness", () => {
  it("refreshes a read-only overview after a version check without losing expanded state or location", async () => {
    const router = await renderOverview();
    await act(async () => button("Show systems")!.click());
    const scroller = document.querySelector<HTMLDivElement>("[data-finance-overview]");
    expect(scroller).toBeTruthy();
    scroller!.scrollTop = 48;
    scroller!.dispatchEvent(new Event("scroll"));
    api.capabilities.mockResolvedValue({ ...member, viewVersion: 4 });
    api.version.mockResolvedValue({ viewVersion: 4 });
    api.overview.mockResolvedValue(overview("21.00", 4));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(router.state.location.pathname).toBe("/finance");
    expect(button("Hide systems")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Actual 21.00");
    expect(container.textContent).toContain("Beta · Inactive");
    expect(document.querySelector<HTMLDivElement>("[data-finance-overview]")?.scrollTop).toBe(48);
    expect(session.expanded["mechanical-production"]).toBe(true);
  });

  it("keeps dirty financing input and sends the shared update notification", async () => {
    api.capabilities.mockResolvedValue(business);
    api.financing.mockResolvedValue({
      ...financingView,
      funding: [{
        id: "funding",
        publicRef: "F-S27-001",
        sourceName: "Synthetic source",
        ownerName: "Example owner",
        fundingType: "grant",
        amountNok: "100.00",
        status: "secured",
        confidence: null,
        expectedDate: null,
        receivedDate: null,
        ownerEmail: null,
        reportingRequired: false,
        agreementLink: null,
        note: null,
        revision: 1,
        linkedItemCount: 0,
        earmarkedNok: "0.00",
        unrestrictedNok: "100.00",
      }],
    });
    const router = createMemoryRouter([
      {
        path: "/finance/financing",
        element: (
          <FinanceAccessProvider userId="business">
            <Probe />
            <FinanceEntry page="financing" />
          </FinanceAccessProvider>
        ),
      },
      { path: "/finance", element: <p>Public finance</p> },
    ], { initialEntries: ["/finance/financing"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    await act(async () => button("Edit funding")!.click());
    const input = document.getElementById("funding-source") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Updated source");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    api.capabilities.mockResolvedValue({ ...business, viewVersion: 6 });
    api.version.mockResolvedValue({ viewVersion: 6 });
    api.financing.mockResolvedValue({
      ...financingView,
      viewVersion: 6,
      funding: [{
        id: "funding",
        publicRef: "F-S27-001",
        sourceName: "Server source",
        ownerName: "Example owner",
        fundingType: "grant",
        amountNok: "100.00",
        status: "secured",
        confidence: null,
        expectedDate: null,
        receivedDate: null,
        ownerEmail: null,
        reportingRequired: false,
        agreementLink: null,
        note: null,
        revision: 2,
        linkedItemCount: 0,
        earmarkedNok: "0.00",
        unrestrictedNok: "100.00",
      }],
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect((document.getElementById("funding-source") as HTMLInputElement).value).toBe("Updated source");
    expect(notify).toHaveBeenCalledWith(
      "Finance was updated",
      "Your unsaved changes are still in the form.",
      expect.objectContaining({ id: "finance-unsaved-update", variant: "info" }),
    );
    expect(router.state.location.pathname).toBe("/finance/financing");
  });

  it("clears cached finance state on 401 and keeps overview when financing returns 403", async () => {
    await renderOverview();
    await act(async () => button("Show systems")!.click());
    api.financing.mockRejectedValue(new FinanceRequestError("Financing access is required.", 403));
    await act(async () => { await session.loadPage("financing"); });
    expect(session.access).toBe("allowed");
    expect(session.overview?.departments[0]?.name).toBe("Zebra workshop");
    expect(session.expanded["mechanical-production"]).toBe(true);
    expect(session.financing).toBeNull();
    expect(container.textContent).toContain("Zebra workshop");

    api.version.mockRejectedValue(new FinanceRequestError("Log in to continue.", 401));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(session.access).toBe("denied");
    expect(session.overview).toBeNull();
    expect(session.expanded).toEqual({});
    expect(session.capabilities).toBeNull();
  });

  it("clears cached state when the account switches and ignores the previous account response", async () => {
    let resolveLate: (value: PublicOverview) => void = () => undefined;
    let resolveNext: (value: PublicOverview) => void = () => undefined;
    const late = new Promise<PublicOverview>((resolve) => { resolveLate = resolve; });
    const next = new Promise<PublicOverview>((resolve) => { resolveNext = resolve; });
    api.overview.mockReset();
    api.overview.mockReturnValueOnce(late);
    api.overview.mockReturnValueOnce(next);
    function Harness() {
      const [userId, setUserId] = useState("first-member");
      return (
        <>
          <button type="button" onClick={() => setUserId("second-member")}>Switch account</button>
          <FinanceAccessProvider userId={userId}>
            <Probe />
            <FinanceEntry page="overview" />
          </FinanceAccessProvider>
        </>
      );
    }
    const router = createMemoryRouter([{ path: "/finance", element: <Harness /> }], { initialEntries: ["/finance"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    api.capabilities.mockResolvedValue({ ...member, memberId: "second-member", viewVersion: 8 });
    api.version.mockResolvedValue({ viewVersion: 8 });
    await act(async () => button("Switch account")!.click());
    expect(session.expanded).toEqual({});
    expect(session.overview).toBeNull();
    await act(async () => resolveLate(overview("99.00", 3)));
    expect(container.textContent).not.toContain("Actual 99.00");
    expect(session.overview).toBeNull();
    await act(async () => resolveNext(overview("19.00", 8)));
    expect(container.textContent).toContain("Actual 19.00");
    expect(container.textContent).not.toContain("Actual 99.00");
    expect(session.viewVersion).toBe(8);
    expect(session.expanded).toEqual({});
  });

  it("refreshes cached overview and budgets after payment, void, and review updates", async () => {
    const actions = [
      "markInvoicePaid",
      "unmarkInvoicePaid",
      "markRefundPaid",
      "unmarkRefundPaid",
      "voidPurchase",
      "reviewException",
    ] as const;
    api.budgets.mockResolvedValue({
      viewVersion: 1,
      seasonCode: "S27",
      budgetStatus: "approved",
      approvedOn: "2026-10-01",
      revision: 1,
      departments: [],
      choices: { systems: [], items: [] },
    });
    function Harness() {
      const [page, setPage] = useState<"overview" | "budgets">("overview");
      return (
        <FinanceAccessProvider userId="member">
          <Probe />
          <button type="button" onClick={() => setPage("budgets")}>Open budgets</button>
          <FinanceEntry page={page} />
        </FinanceAccessProvider>
      );
    }
    const router = createMemoryRouter([{ path: "/finance", element: <Harness /> }], { initialEntries: ["/finance"] });
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(container.textContent).toContain("Actual 19.00");
    await act(async () => { await session.loadPage("budgets"); });
    expect(session.budgets?.viewVersion).toBe(1);
    expect(session.budgets?.approvedOn).toBe("2026-10-01");
    const overviewCalls = api.overview.mock.calls.length;
    let version = 1;
    for (const action of actions) {
      version += 1;
      api.overview.mockResolvedValue(overview(`${version}.00`, version));
      api.mutate.mockResolvedValueOnce({ ok: true, viewVersion: version, warnings: [], errors: [] });
      await act(async () => { await session.mutate({ action, requestId: `request-${action}` }); });
      expect(session.viewVersion).toBe(version);
      expect(api.mutate.mock.calls.at(-1)?.[0]).toMatchObject({ action });
    }
    expect(api.overview.mock.calls.length).toBe(overviewCalls + actions.length);
    expect(container.textContent).toContain("Actual 7.00");
    expect(session.budgets?.viewVersion).toBe(1);
    expect(router.state.location.pathname).toBe("/finance");
    api.budgets.mockResolvedValue({
      viewVersion: version,
      seasonCode: "S27",
      budgetStatus: "approved",
      approvedOn: "2026-10-27",
      revision: version,
      departments: [],
      choices: { systems: [], items: [] },
    });
    await act(async () => button("Open budgets")!.click());
    expect(container.textContent).toContain("Approved 2026-10-27");
    expect(container.textContent).not.toContain("Approved 2026-10-01");
    expect(session.budgets?.viewVersion).toBe(version);
    expect(session.overview?.viewVersion).toBe(version);
  });
});
