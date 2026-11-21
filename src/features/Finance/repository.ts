import { loadLocalFinanceViews, localFinanceVersion, mutateLocalPurchase } from "./local-finance-read";
import { localFinanceProfileSelection } from "../MemberPlatform/local-finance-profile";
import { createLocalInvoiceEvidenceApi, localInvoiceRecovery } from "./invoice-local";
import { createInvoiceContinuation } from "./invoice-continuation";
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
  const profiles = [localFinanceProfileSelection() ?? "finance"];
  return {
    memberId: "local-member",
    viewVersion: localFinanceVersion(localBankVersion),
    profiles,
    capabilities: capabilitiesForProfiles(profiles),
    seasonCode: "S27",
    approvalThresholdNok: null,
    today: osloToday(),
  };
}

export function localFinanceRevisionForDevelopment():number {
  return isLocalMemberMode()&&localMemberSignedIn()?localBankVersion:0;
}
function localRead<T>(read:()=>T):Promise<T> {
  return Promise.resolve().then(read).catch((error:unknown)=>{if(error instanceof FinanceRequestError)throw error;const status=error&&typeof error==="object"&&"status" in error?Number(error.status):503;throw new FinanceRequestError(error instanceof Error?error.message:"Could not load finance.",status);});
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
  const continuation = createInvoiceContinuation(owner, (action, signal) => mutate(action, signal));
  async function performMutation(action: Record<string, unknown>, signal?: AbortSignal): Promise<FinanceMutationResult> {
    if (local()) {
      if (action.action === "retryInvoiceTransfer") {
        const result = await createLocalInvoiceEvidenceApi().retry(String(action.documentId), Number(action.expectedRevision), String(action.requestId));
        return {...result, viewVersion:localFinanceVersion(localBankVersion)};
      }
      if (action.action === "downloadDocument") return {ok:true,viewVersion:localFinanceVersion(localBankVersion),warnings:[],errors:[],...await createLocalInvoiceEvidenceApi().open(String(action.documentId))};
      if (!localMemberHasFinancials()) throw new FinanceRequestError("Finance access is required.",403);
      if (action.action !== "setBankSnapshot") return localRead(()=>mutateLocalPurchase(action,localBankVersion));
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
      return { ok: true, viewVersion: localFinanceVersion(localBankVersion), revision: localBankSnapshot.revision, warnings: [], errors: [] };
    }
    const token = await memberSessionToken(owner);
    const response = await fetch("/api/finance", {
      method: "POST",
      signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; errors?: FinanceFieldError[] };
    if (!response.ok) throw new FinanceRequestError(body.error || "Could not save the budget change.", response.status, body.errors ?? []);
    const result = body as FinanceMutationResult;
    if (action.action === "registerPurchase") continuation.start(result);
    else if (action.action === "retryInvoiceTransfer" && result.purchaseId) continuation.start({...result,id:result.purchaseId});
    return result;
  }
  async function mutate(action: Record<string, unknown>, signal?: AbortSignal): Promise<FinanceMutationResult> {
    const result = await performMutation(action, signal);
    if (result.ok && !/^(check|download|authorize.*Upload|finalize.*Upload|continueInvoice|retryInvoice)/.test(String(action.action)))
      window.dispatchEvent(new Event("helix-workspace-updated"));
    return result;
  }
  return {
    watchInvoices: continuation.watch,
    bankSnapshot: () => local() ? localRead(()=>{localFinanceVersion(localBankVersion);return localBankSnapshot;}) : request<BankSnapshot | null>("bankSnapshot"),
    capabilities: () => local() ? localMemberHasFinancials() ? localRead(localCapabilities) : Promise.reject(new FinanceRequestError("Financials access is required.", 403)) : request<FinanceCapabilitiesResponse>("capabilities"),
    version: () => local() ? localRead(()=>({ viewVersion: localFinanceVersion(localBankVersion) } satisfies FinanceVersionResponse)) : request<FinanceVersionResponse>("version"),
    recovery: (deliveryAfter?: string, uploadAfter?: string, invoiceAfter?: string) => {
      if (local()) return localMemberHasFinancials() ? localRead(()=>({ deliveries: [], uploads: [], deliveryNextCursor: null, uploadNextCursor: null, ...localInvoiceRecovery(invoiceAfter) } satisfies FinanceRecoveryView)) : Promise.reject(new FinanceRequestError("Finance access is required.", 403));
      const params = new URLSearchParams();
      if (deliveryAfter) params.set("deliveryAfter", deliveryAfter);
      if (uploadAfter) params.set("uploadAfter", uploadAfter);
      if (invoiceAfter) params.set("invoiceAfter", invoiceAfter);
      const suffix = params.toString();
      return request<FinanceRecoveryView>(suffix ? `recovery&${suffix}` : "recovery");
    },
    overview: () => local() ? localRead(()=>loadLocalFinanceViews(localBankVersion).overview) : request<PublicOverview>("overview"),
    budgets: () => local() ? localRead(()=>loadLocalFinanceViews(localBankVersion).budgets) : request<PublicBudgets>("budgets"),
    purchases: (requestRecordId?: string, unpaidOnly?: boolean) => {
      if (local()) return localRead(()=>{const view=loadLocalFinanceViews(localBankVersion).purchases;return unpaidOnly?{...view,register:view.register.filter(p=>p.status==="registered"&&p.unpaid)}:view;});
      const params = new URLSearchParams();
      if (requestRecordId) params.set("requestRecordId", requestRecordId);
      if (unpaidOnly) params.set("unpaid", "1");
      const extra = params.toString();
      return request<PurchasesView>(extra ? `purchases&${extra}` : "purchases");
    },
    financing: () => local()
      ? localMemberHasFinancials() ? localRead(()=>loadLocalFinanceViews(localBankVersion).financing) : Promise.reject(new FinanceRequestError("Financials access is required.", 403))
      : request<FinancingView>("financing"),
    mutate,
  };
}
