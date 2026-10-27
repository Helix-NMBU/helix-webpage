import { capabilitiesForProfiles } from "./access";
import { osloToday } from "./money";
import type {
  FinanceCapabilitiesResponse,
  FinanceFieldError,
  FinanceMutationResult,
  FinancingView,
  PublicBudgets,
  PublicOverview,
  PurchasesView,
} from "./types";
import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";

export class FinanceRequestError extends Error {
  constructor(message: string, readonly status: number, readonly errors: FinanceFieldError[] = []) { super(message); }
}

function localCapabilities(): FinanceCapabilitiesResponse {
  return {
    memberId: "local-member",
    viewVersion: 0,
    profiles: [],
    capabilities: capabilitiesForProfiles([]),
    seasonCode: null,
    approvalThresholdNok: null,
    today: osloToday(),
  };
}

function localOverview(): PublicOverview {
  return { viewVersion: 0, seasonCode: null, budgetStatus: "absent", approvedOn: null, departments: [], publicEarmarks: [] };
}

function localBudgets(): PublicBudgets {
  return { viewVersion: 0, seasonCode: null, budgetStatus: "absent", approvedOn: null, revision: 0, departments: [], choices: { systems: [], items: [] } };
}

function localPurchases(): PurchasesView {
  return { viewVersion: 0, ownRequests: [] };
}

export function createFinanceApi(owner: { current: string | null }) {
  const local = () => isLocalMemberMode() && localMemberSignedIn();
  async function request<T>(action: string, init?: RequestInit): Promise<T> {
    const token = await memberSessionToken(owner);
    const response = await fetch(action.startsWith("/") ? action : `/api/finance?action=${action}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json().catch(() => ({})) as { error?: string; errors?: FinanceFieldError[] };
    if (!response.ok) throw new FinanceRequestError(body.error || "Could not load finance.", response.status, body.errors ?? []);
    return body as T;
  }
  async function mutate(action: Record<string, unknown>): Promise<FinanceMutationResult> {
    if (local()) throw new FinanceRequestError("Budget changes are unavailable in this session.", 403);
    const token = await memberSessionToken(owner);
    const response = await fetch("/api/finance", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; errors?: FinanceFieldError[] };
    if (!response.ok) throw new FinanceRequestError(body.error || "Could not save the budget change.", response.status, body.errors ?? []);
    return body as FinanceMutationResult;
  }
  return {
    capabilities: () => local() ? Promise.resolve(localCapabilities()) : request<FinanceCapabilitiesResponse>("capabilities"),
    overview: () => local() ? Promise.resolve(localOverview()) : request<PublicOverview>("overview"),
    budgets: () => local() ? Promise.resolve(localBudgets()) : request<PublicBudgets>("budgets"),
    purchases: () => local() ? Promise.resolve(localPurchases()) : request<PurchasesView>("purchases"),
    financing: () => local()
      ? Promise.reject(new FinanceRequestError("Financing access is required.", 403))
      : request<FinancingView>("financing"),
    mutate,
  };
}
