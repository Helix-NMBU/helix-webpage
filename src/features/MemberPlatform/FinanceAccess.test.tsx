// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinanceAccessProvider, useFinanceAccess } from "./FinanceAccess";
import { FinanceRequestError } from "../Finance/repository";
import type { FinanceCapabilitiesResponse, FinancingView, PublicBudgets, PurchasesView } from "../Finance/types";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  overview: vi.fn(),
  budgets: vi.fn(),
  purchases: vi.fn(),
  financing: vi.fn(),
  mutate: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("../Finance/repository", async (original) => ({
  ...await original<typeof import("../Finance/repository")>(),
  createFinanceApi: () => api,
}));
vi.mock("./MemberNotifications", () => ({ useNotify: () => notify }));

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
const financing: FinancingView = { viewVersion: 1, seasonCode: "S27", funding: [], parts: [], scenarios: [] };
const purchases: PurchasesView = {
  viewVersion: 1,
  ownRequests: [],
  register: [{
    id: "purchase", publicRef: "2026-0042", status: "registered", buyerName: "Buyer Example", supplierName: "Hidden Supplier",
    paymentMethod: "outlay", purchaseDate: "2026-10-01", totalNok: "10.00", refundAccount: "12345678901", refundPhone: null,
  }],
};

let container: HTMLDivElement;
let root: Root;
let session: ReturnType<typeof useFinanceAccess>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Probe() {
  session = useFinanceAccess();
  const refund = session.purchases?.register?.[0]?.refundAccount ?? "";
  const cached = session.financing ? "cached" : "clear";
  return <p>{session.access}:{session.capabilities?.financing ? "financing" : "public"}:{cached}:{refund}</p>;
}

function mount(userId: string) {
  const router = createMemoryRouter([{ path: "/", element: <FinanceAccessProvider userId={userId}><Probe /></FinanceAccessProvider> }]);
  return act(async () => root.render(<RouterProvider router={router} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.capabilities.mockReset().mockResolvedValue(member);
  api.overview.mockReset();
  api.budgets.mockReset();
  api.purchases.mockReset().mockResolvedValue({ viewVersion: 1, ownRequests: [] });
  api.financing.mockReset().mockResolvedValue(financing);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("clears financing and refund details when a focused recheck loses the grant", async () => {
  api.capabilities.mockResolvedValue(financeCaps);
  api.purchases.mockResolvedValue(purchases);
  await mount("finance-member");
  await act(async () => session.loadPage("financing"));
  await act(async () => session.loadPage("purchases"));
  expect(container.textContent).toContain("financing:cached:12345678901");
  api.capabilities.mockResolvedValue({ ...member, viewVersion: 2 });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("allowed:public:clear:");
  expect(container.textContent).not.toContain("12345678901");
  expect(container.textContent).not.toContain("Hidden Supplier");
});

it("drops private state when focus reports that the account can no longer use finance", async () => {
  api.capabilities.mockResolvedValueOnce(business);
  await mount("business-member");
  expect(container.textContent).toContain("allowed:financing");
  api.capabilities.mockRejectedValue(new FinanceRequestError("Your Google identity no longer matches this profile.", 403));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(session.access).toBe("denied");
  expect(session.financing).toBeNull();
  expect(session.purchases).toBeNull();
  expect(session.capabilities).toBeNull();
});

const financeCaps: FinanceCapabilitiesResponse = {
  ...member,
  memberId: "finance-member",
  profiles: ["finance"],
  capabilities: {
    ...member.capabilities,
    financing: true,
    manageFunding: true,
    purchaseRegister: true,
    filesAndRefunds: true,
    paymentsVoidReview: true,
    draftBudgetItems: true,
    permittedImports: true,
  },
};

const privatePurchases: PurchasesView = {
  viewVersion: 2,
  ownRequests: [],
  register: [{
    id: "purchase",
    publicRef: "2026-0042",
    status: "registered",
    buyerName: "Buyer Example",
    supplierName: "Hidden Supplier",
    paymentMethod: "outlay",
    purchaseDate: "2026-10-01",
    totalNok: "10.00",
    refundAccount: "private-account",
    refundPhone: "private-phone",
  }],
};

it("discards a purchase response that arrives after the register grant is gone", async () => {
  api.capabilities.mockResolvedValue(financeCaps);
  const pending = deferred<PurchasesView>();
  api.purchases.mockReturnValue(pending.promise);
  await mount("finance-member");
  let loading: Promise<void> = Promise.resolve();
  await act(async () => { loading = session.loadPage("purchases"); });
  api.capabilities.mockResolvedValue(member);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => {
    pending.resolve(privatePurchases);
    await loading;
  });
  expect(session.purchases?.register).toBeUndefined();
  expect(container.textContent).not.toContain("private-account");
  expect(container.textContent).not.toContain("private-phone");
  expect(container.textContent).not.toContain("Hidden Supplier");
});

it("discards a financing response that arrives after financing access is removed", async () => {
  api.capabilities.mockResolvedValue(business);
  const pending = deferred<FinancingView>();
  api.financing.mockReturnValue(pending.promise);
  await mount("business-member");
  let loading: Promise<void> = Promise.resolve();
  await act(async () => { loading = session.loadPage("financing"); });
  api.capabilities.mockResolvedValue(member);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => {
    pending.resolve({
      ...financing,
      viewVersion: 2,
      funding: [{
        id: "funding",
        publicRef: "F-S27-001",
        sourceName: "Private source",
        ownerName: "Example owner",
        fundingType: "other",
        amountNok: "10.00",
        status: "secured",
        confidence: null,
        expectedDate: null,
        receivedDate: null,
        ownerEmail: null,
        reportingRequired: false,
        agreementLink: null,
        note: null,
        revision: 0,
        earmarkedNok: "0.00",
        unrestrictedNok: "10.00",
        linkedItemCount: 0,
      }],
    });
    await loading;
  });
  expect(session.financing).toBeNull();
  expect(JSON.stringify(session)).not.toContain("Private source");
  expect(container.textContent).toContain("allowed:public:clear:");
});

it("redacts refund fields when a late purchase response outlives the files grant", async () => {
  api.capabilities.mockResolvedValue(financeCaps);
  const pending = deferred<PurchasesView>();
  api.purchases.mockReturnValue(pending.promise);
  await mount("finance-member");
  let loading: Promise<void> = Promise.resolve();
  await act(async () => { loading = session.loadPage("purchases"); });
  api.capabilities.mockResolvedValue({
    ...financeCaps,
    capabilities: { ...financeCaps.capabilities, filesAndRefunds: false },
  });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => {
    pending.resolve(privatePurchases);
    await loading;
  });
  expect(session.purchases?.register?.[0]?.refundAccount).toBeNull();
  expect(session.purchases?.register?.[0]?.refundPhone).toBeNull();
  expect(session.purchases?.register?.[0]?.supplierName).toBe("Hidden Supplier");
  expect(container.textContent).not.toContain("private-account");
  expect(container.textContent).not.toContain("private-phone");
});

it("hides draft budget items when that capability is gone before the response lands", async () => {
  api.capabilities.mockResolvedValue(financeCaps);
  const pending = deferred<PublicBudgets>();
  api.budgets.mockReturnValue(pending.promise);
  await mount("finance-member");
  let loading: Promise<void> = Promise.resolve();
  await act(async () => { loading = session.loadPage("budgets"); });
  api.capabilities.mockResolvedValue(member);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => {
    pending.resolve({
      viewVersion: 2,
      seasonCode: "S27",
      budgetStatus: "draft",
      approvedOn: null,
      revision: 0,
      choices: { systems: [], items: [{ id: "item", publicRef: "BI-S27-001", description: "Draft line", systemId: "system", status: "planned" }] },
      departments: [{
        departmentKey: "mechanical-production",
        name: "Mechanical",
        plannedNok: "10.00",
        actualNok: "0.00",
        differenceNok: "10.00",
        unbudgetedNok: "0.00",
        systems: [{
          id: "system",
          code: "SYS-FR",
          name: "Frame",
          active: true,
          plannedNok: "10.00",
          actualNok: "0.00",
          differenceNok: "10.00",
          unbudgetedNok: "0.00",
          unbudgetedItemId: null,
          unbudgetedPublicRef: null,
          items: [{
            id: "item",
            publicRef: "BI-S27-001",
            systemId: "system",
            systemCode: "SYS-FR",
            description: "Draft line",
            category: "material",
            plannedNok: "10.00",
            effectivePlanNok: "10.00",
            actualNok: "0.00",
            differenceNok: "10.00",
            priority: "P2",
            reuseStatus: "new",
            expectedPurchaseDate: null,
            status: "planned",
            revision: 0,
            earmarked: false,
            earmarkPurpose: null,
            earmarkAmountNok: null,
          }],
        }],
      }],
    });
    await loading;
  });
  expect(session.budgets?.budgetStatus).toBe("draft");
  expect(session.budgets?.departments).toEqual([]);
  expect(JSON.stringify(session.budgets)).not.toContain("Draft line");
});

it("ignores a late response from the previous account", async () => {
  const stale = deferred<FinanceCapabilitiesResponse>();
  api.capabilities.mockReturnValueOnce(stale.promise);
  await mount("first-member");
  api.capabilities.mockResolvedValue({ ...member, memberId: "second-member", viewVersion: 4 });
  await mount("second-member");
  await act(async () => stale.resolve({ ...business, viewVersion: 9 }));
  expect(session.viewVersion).toBe(4);
  expect(session.capabilities?.financing).toBe(false);
  expect(container.textContent).toContain("allowed:public:clear:");
});
