// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinanceAccessProvider, useFinanceAccess } from "./FinanceAccess";
import { FinanceRequestError } from "../Finance/repository";
import type { FinanceCapabilitiesResponse, FinancingView, PurchasesView } from "../Finance/types";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  overview: vi.fn(),
  budgets: vi.fn(),
  purchases: vi.fn(),
  financing: vi.fn(),
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
  api.capabilities.mockResolvedValue(business);
  api.purchases.mockResolvedValue(purchases);
  await mount("business-member");
  await act(async () => session.loadPage("financing"));
  await act(async () => session.loadPage("purchases"));
  expect(container.textContent).toContain("financing:cached:12345678901");
  api.capabilities.mockResolvedValue({ ...member, viewVersion: 2, capabilities: { ...member.capabilities, purchaseRegister: false } });
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
