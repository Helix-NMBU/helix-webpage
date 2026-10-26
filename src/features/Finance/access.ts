import type { FinanceAction, FinanceCapabilitySet, FinanceProfile, FinancePurchaseSummary, PurchasesView } from "./types.js";
import { FINANCE_PROFILES } from "./types.js";

export const EMPTY_CAPABILITIES: FinanceCapabilitySet = {
  publicBudgets: false,
  publicEarmarks: false,
  registerActual: false,
  ownRequests: false,
  financing: false,
  manageFunding: false,
  purchaseRegister: false,
  filesAndRefunds: false,
  paymentsVoidReview: false,
  draftBudgetItems: false,
  permittedImports: false,
  createBudget: false,
  approveBudget: false,
  protectedBudgetEdits: false,
  decideRequests: false,
};

export function capabilitiesForProfiles(profiles: readonly FinanceProfile[]): FinanceCapabilitySet {
  const present = new Set(profiles);
  const head = present.has("head_of_finance");
  const finance = head || present.has("finance");
  const business = finance || present.has("business");
  return {
    publicBudgets: true,
    publicEarmarks: true,
    registerActual: true,
    ownRequests: true,
    financing: business,
    manageFunding: business,
    purchaseRegister: finance,
    filesAndRefunds: finance,
    paymentsVoidReview: finance,
    draftBudgetItems: finance,
    permittedImports: finance,
    createBudget: head,
    approveBudget: head,
    protectedBudgetEdits: head,
    decideRequests: head,
  };
}

export function presentPurchases(view: PurchasesView, capabilities: FinanceCapabilitySet): PurchasesView {
  if (!capabilities.purchaseRegister) {
    const next = { ...view };
    delete next.register;
    return next;
  }
  if (!view.register || capabilities.filesAndRefunds) return view;
  return {
    ...view,
    register: view.register.map((row: FinancePurchaseSummary) => ({ ...row, refundAccount: null, refundPhone: null })),
  };
}

export function isFinanceProfile(value: string): value is FinanceProfile {
  return (FINANCE_PROFILES as readonly string[]).includes(value);
}

export function sortProfiles(profiles: readonly FinanceProfile[]): FinanceProfile[] {
  return [...profiles].sort();
}

const REVISION_ACTIONS = new Set<FinanceAction>([
  "approveBudget",
  "addItem",
  "editItem",
  "cancelItem",
  "restoreItem",
  "importItems",
  "voidPurchase",
  "markRefundPaid",
  "unmarkRefundPaid",
  "markInvoicePaid",
  "unmarkInvoicePaid",
  "reviewException",
  "editFunding",
  "deleteFunding",
  "restoreFunding",
  "addEarmark",
  "editEarmark",
  "saveRequest",
  "submitRequest",
  "withdrawRequest",
  "cancelRequest",
  "reviseRequest",
  "decideRequest",
  "closeRequest",
]);

const ACTION_CAPABILITY: Record<FinanceAction, keyof FinanceCapabilitySet> = {
  createBudget: "createBudget",
  approveBudget: "approveBudget",
  addItem: "draftBudgetItems",
  editItem: "draftBudgetItems",
  cancelItem: "draftBudgetItems",
  restoreItem: "draftBudgetItems",
  previewImport: "permittedImports",
  importItems: "permittedImports",
  checkPurchase: "registerActual",
  authorizeUpload: "registerActual",
  finalizeUpload: "registerActual",
  registerPurchase: "registerActual",
  voidPurchase: "paymentsVoidReview",
  markRefundPaid: "paymentsVoidReview",
  unmarkRefundPaid: "paymentsVoidReview",
  markInvoicePaid: "paymentsVoidReview",
  unmarkInvoicePaid: "paymentsVoidReview",
  reviewException: "paymentsVoidReview",
  addFunding: "manageFunding",
  editFunding: "manageFunding",
  deleteFunding: "manageFunding",
  restoreFunding: "manageFunding",
  addEarmark: "manageFunding",
  editEarmark: "manageFunding",
  saveRequest: "ownRequests",
  submitRequest: "ownRequests",
  withdrawRequest: "ownRequests",
  cancelRequest: "ownRequests",
  reviseRequest: "ownRequests",
  decideRequest: "decideRequests",
  closeRequest: "ownRequests",
  downloadDocument: "filesAndRefunds",
  exportPurchases: "purchaseRegister",
  retryOutbox: "purchaseRegister",
};

export function mutationCapability(action: FinanceAction): keyof FinanceCapabilitySet {
  return ACTION_CAPABILITY[action];
}

export function mutationRequiresRevision(action: FinanceAction): boolean {
  return REVISION_ACTIONS.has(action);
}

export function isFinanceAction(value: string): value is FinanceAction {
  return Object.prototype.hasOwnProperty.call(ACTION_CAPABILITY, value);
}
