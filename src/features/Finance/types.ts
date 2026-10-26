export const FINANCE_PROFILES = ["business", "finance", "head_of_finance"] as const;
export type FinanceProfile = (typeof FINANCE_PROFILES)[number];

export type FinanceCapabilitySet = {
  publicBudgets: boolean;
  publicEarmarks: boolean;
  registerActual: boolean;
  ownRequests: boolean;
  financing: boolean;
  manageFunding: boolean;
  purchaseRegister: boolean;
  filesAndRefunds: boolean;
  paymentsVoidReview: boolean;
  draftBudgetItems: boolean;
  permittedImports: boolean;
  createBudget: boolean;
  approveBudget: boolean;
  protectedBudgetEdits: boolean;
  decideRequests: boolean;
};

export type FinanceFieldError = {
  field: string;
  message: string;
  line?: number;
};

export type FinanceWarning = { message: string };

export type BudgetItemPriority = "P1" | "P2" | "P3" | "P4" | "EM";
export type BudgetItemReuse = "new" | "reuse" | "inspect" | "consumable";
export type BudgetItemStatus = "planned" | "active" | "done" | "cancelled";
export type BudgetStatus = "draft" | "approved";
export type SeasonStatus = "planning" | "active" | "closed";
export type FundingType = "sponsor_cash" | "grant" | "membership" | "other";
export type FundingStatus = "prospect" | "applied" | "secured" | "received" | "rejected" | "deleted";
export type FundingConfidence = "high" | "medium" | "low";
export type PaymentMethod = "team_account" | "outlay" | "invoice";
export type PurchaseStatus = "registered" | "voided";
export type DocumentKind = "receipt" | "invoice";
export type RequestStatus = "draft" | "submitted" | "rejected" | "approved" | "closed" | "cancelled";
export type RequestDecisionKind = "approved" | "rejected";
export type ExceptionKind = "missing_approval" | "overrun" | "line_mismatch" | "dated_before_approval";
export type OutboxStatus = "pending" | "sent" | "failed" | "uncertain";

export type FinanceCapabilitiesResponse = {
  memberId: string;
  viewVersion: number;
  profiles: FinanceProfile[];
  capabilities: FinanceCapabilitySet;
  seasonCode: string | null;
  approvalThresholdNok: string | null;
  today: string;
};

export type FinanceVersionResponse = {
  viewVersion: number;
  unchanged?: boolean;
};

export type PublicEarmarkSummary = {
  id: string;
  publicRef: string;
  purpose: string;
  amountNok: string;
  usedNok: string;
  leftNok: string;
  mustReturnNok: string;
  spendBy: string | null;
  systemName: string | null;
};

export type PublicDepartmentSummary = {
  departmentKey: string;
  name: string;
  plannedNok: string;
  actualNok: string;
  differenceNok: string;
  usedFraction: string | null;
  unbudgetedNok: string;
};

export type PublicOverview = {
  viewVersion: number;
  seasonCode: string | null;
  budgetStatus: "absent" | BudgetStatus;
  approvedOn: string | null;
  departments: PublicDepartmentSummary[];
  publicEarmarks: PublicEarmarkSummary[];
};

export type PublicBudgetItem = {
  id: string;
  publicRef: string;
  systemId: string;
  systemCode: string;
  description: string;
  category: string;
  plannedNok: string;
  priority: BudgetItemPriority;
  reuseStatus: BudgetItemReuse;
  expectedPurchaseDate: string | null;
  status: BudgetItemStatus;
};

export type PublicSystemBudget = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  items: PublicBudgetItem[];
};

export type PublicDepartmentBudget = {
  departmentKey: string;
  name: string;
  systems: PublicSystemBudget[];
};

export type PublicBudgets = {
  viewVersion: number;
  seasonCode: string | null;
  budgetStatus: "absent" | BudgetStatus;
  departments: PublicDepartmentBudget[];
};

export type OwnRequestSummary = {
  id: string;
  publicRef: string;
  status: RequestStatus;
  plannedDate: string | null;
  approvedNok: string | null;
  fulfilledNok: string;
  remainingNok: string;
  releasedNok: string;
};

export type FinancePurchaseSummary = {
  id: string;
  publicRef: string;
  status: PurchaseStatus;
  buyerName: string;
  supplierName: string;
  paymentMethod: PaymentMethod;
  purchaseDate: string;
  totalNok: string;
  refundAccount: string | null;
  refundPhone: string | null;
};

export type PurchasesView = {
  viewVersion: number;
  ownRequests: OwnRequestSummary[];
  register?: FinancePurchaseSummary[];
};

export type FundingRecord = {
  id: string;
  publicRef: string;
  sourceName: string;
  ownerName: string;
  fundingType: FundingType;
  amountNok: string;
  status: FundingStatus;
  confidence: FundingConfidence | null;
  expectedDate: string | null;
  receivedDate: string | null;
  ownerEmail: string | null;
  reportingRequired: boolean;
  agreementLink: string | null;
  note: string | null;
  revision: number;
  earmarkedNok: string;
  unrestrictedNok: string;
  linkedItemCount: number;
};

export type FundingLinkedItem = {
  id: string;
  publicRef: string;
  description: string;
  systemId: string;
  systemCode: string;
  systemName: string;
  status: BudgetItemStatus;
};

export type FundingPartRecord = {
  id: string;
  publicRef: string;
  fundingId: string;
  purpose: string;
  amountNok: string;
  spendBy: string | null;
  conditions: string | null;
  revision: number;
  usedNok: string;
  leftNok: string;
  mustReturnNok: string;
  overdue: boolean;
  systemName: string | null;
  linkedItems: FundingLinkedItem[];
};

export type FundingScenario = {
  key: "downside" | "current" | "full";
  label: string;
  eligibleFundingNok: string;
  needNok: string;
  shortfallNok: string;
};

export type FinancingView = {
  viewVersion: number;
  seasonCode: string | null;
  funding: FundingRecord[];
  parts: FundingPartRecord[];
  scenarios: FundingScenario[];
};

export type FinanceUnchanged = { unchanged: true; viewVersion: number };

export type FinanceReadResponse =
  | FinanceCapabilitiesResponse
  | FinanceVersionResponse
  | PublicOverview
  | PublicBudgets
  | PurchasesView
  | FinancingView
  | FinanceUnchanged;

export type BudgetItemInput = {
  systemId: string;
  description: string;
  category: string;
  plannedNok: string;
  priority: BudgetItemPriority;
  reuseStatus: BudgetItemReuse;
  expectedPurchaseDate?: string | null;
  note?: string | null;
  earmarkId?: string | null;
  reason?: string | null;
};

export type FundingInput = {
  sourceName: string;
  ownerName: string;
  fundingType: FundingType;
  amountNok: string;
  status: FundingStatus;
  confidence?: FundingConfidence | null;
  expectedDate?: string | null;
  receivedDate?: string | null;
  ownerEmail?: string | null;
  reportingRequired?: boolean;
  agreementLink?: string | null;
  note?: string | null;
};

export type FundingPartInput = {
  fundingId: string;
  purpose: string;
  amountNok: string;
  spendBy?: string | null;
  conditions?: string | null;
};

export type PurchaseLineInput = {
  systemId: string;
  budgetItemId?: string | null;
  unbudgeted?: boolean;
  requestLineId?: string | null;
  description: string;
  quantity: string;
  amountNok: string;
};

export type PurchaseInput = {
  buyerName: string;
  supplierName: string;
  paymentMethod: PaymentMethod;
  purchaseDate: string;
  justification: string;
  documentKind: DocumentKind;
  documentNumber?: string | null;
  invoiceDueDate?: string | null;
  refundAccount?: string | null;
  refundPhone?: string | null;
  lines: PurchaseLineInput[];
  uploadIds: string[];
};

export type RequestLineInput = {
  budgetItemId: string;
  description: string;
  estimatedNok: string;
};

export type RequestInput = {
  supplierName: string;
  justification: string;
  plannedDate: string;
  lateReason?: string | null;
  lines: RequestLineInput[];
};

type MutationBase = { requestId: string; expectedRevision?: number };

export type FinanceMutation =
  | (MutationBase & { action: "createBudget" })
  | (MutationBase & { action: "approveBudget"; reason?: string })
  | (MutationBase & { action: "addItem"; item: BudgetItemInput })
  | (MutationBase & { action: "editItem"; itemId: string; patch: Partial<BudgetItemInput>; reason?: string })
  | (MutationBase & { action: "cancelItem"; itemId: string; reason?: string })
  | (MutationBase & { action: "restoreItem"; itemId: string; reason?: string })
  | (MutationBase & { action: "previewImport"; departmentKey: string; csv: string })
  | (MutationBase & { action: "importItems"; departmentKey: string; csv: string; reason?: string })
  | (MutationBase & { action: "checkPurchase"; purchase: PurchaseInput })
  | (MutationBase & { action: "authorizeUpload"; fileName: string; contentType: string; byteSize: number })
  | (MutationBase & { action: "finalizeUpload"; uploadId: string })
  | (MutationBase & { action: "registerPurchase"; purchase: PurchaseInput })
  | (MutationBase & { action: "voidPurchase"; purchaseId: string; reason: string })
  | (MutationBase & { action: "markRefundPaid"; purchaseId: string; paidOn: string })
  | (MutationBase & { action: "unmarkRefundPaid"; purchaseId: string })
  | (MutationBase & { action: "markInvoicePaid"; purchaseId: string; paidOn: string })
  | (MutationBase & { action: "unmarkInvoicePaid"; purchaseId: string })
  | (MutationBase & { action: "reviewException"; reviewId: string; reason: string })
  | (MutationBase & { action: "addFunding"; funding: FundingInput })
  | (MutationBase & { action: "editFunding"; fundingId: string; patch: Partial<FundingInput> })
  | (MutationBase & { action: "deleteFunding"; fundingId: string })
  | (MutationBase & { action: "restoreFunding"; fundingId: string })
  | (MutationBase & { action: "addEarmark"; part: FundingPartInput })
  | (MutationBase & { action: "editEarmark"; partId: string; patch: Partial<FundingPartInput> })
  | (MutationBase & { action: "saveRequest"; requestIdToSave?: string; request: RequestInput })
  | (MutationBase & { action: "submitRequest"; requestRecordId: string; request: RequestInput })
  | (MutationBase & { action: "withdrawRequest"; requestRecordId: string })
  | (MutationBase & { action: "cancelRequest"; requestRecordId: string })
  | (MutationBase & { action: "reviseRequest"; requestRecordId: string; request: RequestInput })
  | (MutationBase & { action: "decideRequest"; requestRecordId: string; revisionId: string; decision: RequestDecisionKind; reason: string; approvedOreByLine?: Record<string, string> })
  | (MutationBase & { action: "closeRequest"; requestRecordId: string; reason: string })
  | (MutationBase & { action: "downloadDocument"; documentId: string })
  | (MutationBase & { action: "exportPurchases" })
  | (MutationBase & { action: "retryOutbox"; outboxId?: string });

export type FinanceAction = FinanceMutation["action"];

export type FinanceMutationResult = {
  ok: true;
  viewVersion: number;
  id?: string;
  revision?: number;
  warnings: FinanceWarning[];
  errors: FinanceFieldError[];
};

export const FINANCE_READ_ACTIONS = ["capabilities", "version", "overview", "budgets", "purchases", "financing"] as const;
export type FinanceReadAction = (typeof FINANCE_READ_ACTIONS)[number];
