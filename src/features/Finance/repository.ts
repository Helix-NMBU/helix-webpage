import { capabilitiesForProfiles } from "./access";
import { formatOre, osloToday, parseIsoDate, parseNokToOre } from "./money";
import type {
  BankSnapshot,
  FinanceCapabilitiesResponse,
  FinanceFieldError,
  FinanceMutationResult,
  FinanceRecoveryView,
  FinanceVersionResponse,
  FinancingView,
  PublicBudgets,
  PublicOverview,
  PurchasesView,
} from "./types";
import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import { localMemberHasFinancials } from "../MemberPlatform/member-access-api";

let localBankSnapshot: BankSnapshot | null = null;
let localBankVersion = 0;

/** Read only from the dedicated loopback development mode. */
export function localBankSnapshotForDevelopment(): BankSnapshot | null {
  return isLocalMemberMode() && localMemberSignedIn() ? localBankSnapshot : null;
}

export class FinanceRequestError extends Error {
  constructor(message: string, readonly status: number, readonly errors: FinanceFieldError[] = []) { super(message); }
}

function localCapabilities(): FinanceCapabilitiesResponse {
  return {
    memberId: "local-member",
    viewVersion: 0,
    profiles: ["finance"],
    capabilities: capabilitiesForProfiles(["finance"]),
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
    if (local()) {
      if (action.action !== "setBankSnapshot" || !localMemberHasFinancials()) throw new FinanceRequestError("Budget changes are unavailable in this session.", 403);
      if (action.expectedRevision !== (localBankSnapshot?.revision ?? 0)) throw new FinanceRequestError("The balance changed. Reload it before saving.", 409);
      let amount: bigint | null;
      let asOfDate: string;
      try {
        amount = parseNokToOre(typeof action.amountNok === "string" ? action.amountNok : "");
        asOfDate = parseIsoDate(typeof action.asOfDate === "string" ? action.asOfDate : "");
        if (amount === null || amount > 9223372036854775807n || amount < -9223372036854775808n) throw new Error();
      } catch { throw new FinanceRequestError("Enter a valid balance and as-of date.", 400); }
      localBankSnapshot = { amountNok: formatOre(amount), asOfDate, updatedAt: new Date().toISOString(), revision: (localBankSnapshot?.revision ?? 0) + 1 };
      localBankVersion += 1;
      return { ok: true, viewVersion: localBankVersion, revision: localBankSnapshot.revision, warnings: [], errors: [] };
    }
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
    bankSnapshot: () => local() ? Promise.resolve(localBankSnapshot) : request<BankSnapshot | null>("bankSnapshot"),
    capabilities: () => local() ? localMemberHasFinancials() ? Promise.resolve(localCapabilities()) : Promise.reject(new FinanceRequestError("Financials access is required.", 403)) : request<FinanceCapabilitiesResponse>("capabilities"),
    version: () => local() ? Promise.resolve({ viewVersion: 0 } satisfies FinanceVersionResponse) : request<FinanceVersionResponse>("version"),
    recovery: (deliveryAfter?: string, uploadAfter?: string) => {
      if (local()) return Promise.reject(new FinanceRequestError("Finance access is required.", 403));
      const params = new URLSearchParams();
      if (deliveryAfter) params.set("deliveryAfter", deliveryAfter);
      if (uploadAfter) params.set("uploadAfter", uploadAfter);
      const suffix = params.toString();
      return request<FinanceRecoveryView>(suffix ? `recovery&${suffix}` : "recovery");
    },
    overview: () => local() ? Promise.resolve(localOverview()) : request<PublicOverview>("overview"),
    budgets: () => local() ? Promise.resolve(localBudgets()) : request<PublicBudgets>("budgets"),
    purchases: (requestRecordId?: string, unpaidOnly?: boolean) => {
      if (local()) return Promise.resolve(localPurchases());
      const params = new URLSearchParams();
      if (requestRecordId) params.set("requestRecordId", requestRecordId);
      if (unpaidOnly) params.set("unpaid", "1");
      const extra = params.toString();
      return request<PurchasesView>(extra ? `purchases&${extra}` : "purchases");
    },
    financing: () => local()
      ? localMemberHasFinancials() ? Promise.resolve({ viewVersion: 0, seasonCode: null, funding: [], parts: [], scenarios: [] } satisfies FinancingView) : Promise.reject(new FinanceRequestError("Financials access is required.", 403))
      : request<FinancingView>("financing"),
    mutate,
  };
}
