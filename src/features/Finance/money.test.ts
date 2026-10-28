import { describe, expect, it } from "vitest";
import { capabilitiesForProfiles, isFinanceAction, isFinanceProfile, mutationCapability, mutationRequiresRevision, presentPurchases } from "./access";
import {
  addCalendarDays,
  allocationReference,
  budgetItemReference,
  budgetReference,
  documentReference,
  earmarkReference,
  exceedsApprovalThreshold,
  formatOre,
  formatOreNb,
  fundingReference,
  lineReference,
  nextAnnualReferenceStart,
  oreFromNumber,
  osloToday,
  parseIsoDate,
  parseNokToOre,
  purchaseReference,
  requestReference,
  unallocatedItemReference,
} from "./money";

describe("finance money and dates", () => {
  it("keeps NOK as integer ore and canonical decimal strings", () => {
    expect(parseNokToOre("")).toBeNull();
    expect(parseNokToOre("   ")).toBeNull();
    expect(parseNokToOre("1 234,50")).toBe(123450n);
    expect(parseNokToOre("1.234,50")).toBe(123450n);
    expect(parseNokToOre("1,234.50")).toBe(123450n);
    expect(parseNokToOre("1.234.567,89")).toBe(123456789n);
    expect(parseNokToOre("1,234,567.89")).toBe(123456789n);
    expect(parseNokToOre("1\u202f234\u202f567,89")).toBe(123456789n);
    expect(parseNokToOre("20.000")).toBe(2000000n);
    expect(parseNokToOre("1234.50")).toBe(123450n);
    expect(parseNokToOre("kr 20 000")).toBe(2000000n);
    expect(parseNokToOre("NOK 20\u00a0000")).toBe(2000000n);
    expect(formatOre(123450n)).toBe("1234.50");
    expect(formatOre(-50n)).toBe("-0.50");
    expect(formatOreNb(123450n)).toBe("1\u00a0234,50");
    expect(formatOreNb(-123450n)).toBe("-1\u00a0234,50");
  });

  it("rejects amounts that would silently change and rounds half away from zero", () => {
    expect(() => parseNokToOre("1234.567")).toThrow("Enter a valid amount.");
    expect(() => parseNokToOre("12,345")).toThrow("Enter a valid amount.");
    expect(() => parseNokToOre("not money")).toThrow("Enter a valid amount.");
    for (const invalid of ["1.2.3,45", "1,2,3.45", "12.34,56", "12,34.56", "1234.567,89", "1234,567.89", "1 2 3,45", "12 34,50"]) {
      expect(() => parseNokToOre(invalid), invalid).toThrow("Enter a valid amount.");
    }
    expect(parseNokToOre("1.005")).toBe(100500n);
    expect(oreFromNumber(1.005)).toBe(101n);
    expect(oreFromNumber(2.675)).toBe(268n);
    expect(oreFromNumber(-1.005)).toBe(-101n);
  });

  it("compares the approval threshold strictly", () => {
    expect(exceedsApprovalThreshold(500000n, 500000n)).toBe(false);
    expect(exceedsApprovalThreshold(500001n, 500000n)).toBe(true);
    expect(exceedsApprovalThreshold(499999n, 500000n)).toBe(false);
  });

  it("uses the Oslo calendar and rejects date-times", () => {
    expect(osloToday(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    expect(osloToday(new Date("2026-10-26T21:30:00Z"))).toBe("2026-10-26");
    expect(parseIsoDate("2026-10-26")).toBe("2026-10-26");
    expect(() => parseIsoDate("2026-10-26T00:00:00Z")).toThrow("Enter a valid date.");
    expect(() => parseIsoDate("2026-02-31")).toThrow("Enter a valid date.");
    expect(addCalendarDays("2026-10-26", 1)).toBe("2026-10-27");
    expect(addCalendarDays("2026-03-29", -1)).toBe("2026-03-28");
  });

  it("builds references without truncating or reusing a sequence", () => {
    expect(budgetReference("S27")).toBe("B-S27");
    expect(budgetItemReference("S27", 1)).toBe("BI-S27-001");
    expect(budgetItemReference("S27", 1000)).toBe("BI-S27-1000");
    expect(unallocatedItemReference("S27", "SYS-FR")).toBe("BI-S27-FR-UNALLOC");
    expect(fundingReference("S27", 1)).toBe("F-S27-001");
    expect(earmarkReference(1)).toBe("FE-001");
    expect(purchaseReference(2026, 42)).toBe("2026-0042");
    expect(purchaseReference(2026, 10000)).toBe("2026-10000");
    expect(lineReference("2026-0042", 1)).toBe("2026-0042-L1");
    expect(allocationReference("2026-0042-L1", 1)).toBe("2026-0042-L1-A1");
    expect(documentReference("2026-0042", 1)).toBe("2026-0042-D1");
    expect(requestReference("S27", 1)).toBe("RQ-S27-001");
    expect(nextAnnualReferenceStart(null, null, 42n)).toBe(42n);
    expect(nextAnnualReferenceStart(42n, null, 42n)).toBe(42n);
    expect(() => nextAnnualReferenceStart(42n, null, 41n)).toThrow("backward");
    expect(() => nextAnnualReferenceStart(42n, 40n, 40n)).toThrow("reuse");
  });
});

describe("finance capability matrix", () => {
  const profiles = ["business", "finance", "head_of_finance"] as const;

  it("unions active profiles and never treats an empty profile list as elevated", () => {
    const member = capabilitiesForProfiles([]);
    expect(member.publicBudgets).toBe(true);
    expect(member.publicEarmarks).toBe(true);
    expect(member.registerActual).toBe(true);
    expect(member.ownRequests).toBe(true);
    expect(member.financing).toBe(false);
    expect(member.purchaseRegister).toBe(false);
    expect(member.createBudget).toBe(false);

    const business = capabilitiesForProfiles(["business"]);
    expect(business.financing).toBe(true);
    expect(business.manageFunding).toBe(true);
    expect(business.purchaseRegister).toBe(false);
    expect(business.filesAndRefunds).toBe(false);
    expect(business.decideRequests).toBe(false);

    const finance = capabilitiesForProfiles(["finance"]);
    expect(finance.financing).toBe(true);
    expect(finance.purchaseRegister).toBe(true);
    expect(finance.paymentsVoidReview).toBe(true);
    expect(finance.draftBudgetItems).toBe(true);
    expect(finance.permittedImports).toBe(true);
    expect(finance.createBudget).toBe(false);
    expect(finance.approveBudget).toBe(false);

    const head = capabilitiesForProfiles(["head_of_finance"]);
    expect(head).toEqual(capabilitiesForProfiles(["head_of_finance", "finance", "business"]));
    expect(finance).toEqual(capabilitiesForProfiles(["finance", "business"]));
    expect(head.protectedBudgetEdits).toBe(true);
    expect(head.decideRequests).toBe(true);

    for (const profile of profiles) {
      expect(capabilitiesForProfiles([profile]).publicBudgets).toBe(true);
    }
  });

  it("ignores a department title, team.finance, and an admin wildcard", () => {
    expect(isFinanceProfile("Head of Finance")).toBe(false);
    expect(isFinanceProfile("team.finance")).toBe(false);
    expect(isFinanceProfile("*")).toBe(false);
    expect(isFinanceProfile("finance")).toBe(true);
    const member = capabilitiesForProfiles([]);
    for (const key of ["financing", "manageFunding", "purchaseRegister", "filesAndRefunds", "paymentsVoidReview", "draftBudgetItems", "permittedImports", "createBudget", "approveBudget", "protectedBudgetEdits", "decideRequests"] as const) {
      expect(member[key]).toBe(false);
    }
  });

  it("keeps refund fields behind the files capability", () => {
    const view = {
      viewVersion: 1,
      ownRequests: [],
      register: [{
        id: "purchase",
        publicRef: "2026-0042",
        status: "registered" as const,
        buyerName: "Buyer Example",
        supplierName: "Hidden Supplier",
        paymentMethod: "outlay" as const,
        purchaseDate: "2026-10-01",
        totalNok: "10.00",
        refundAccount: "private-account",
        refundPhone: "private-phone",
        requesterMemberId: "member",
        requesterName: "Member Example",
        justification: "Workshop material",
        documentKind: "receipt" as const,
        documentNumber: null,
        revision: 0,
        voidReason: null,
        unpaid: true,
        invoice: null,
        reimbursement: { paid: false, paidOn: null },
        lines: [],
        documents: [{ id: "doc", publicRef: "2026-0042-D1", kind: "receipt" as const, documentNumber: null, originalName: "receipt.pdf" }],
        exceptions: [],
      }],
    };
    const registerOnly = { ...capabilitiesForProfiles(["finance"]), filesAndRefunds: false };
    const redacted = presentPurchases(view, registerOnly);
    expect(redacted.register?.[0]?.refundAccount).toBeNull();
    expect(redacted.register?.[0]?.refundPhone).toBeNull();
    expect(redacted.register?.[0]?.documents).toEqual([]);
    expect(redacted.register?.[0]?.supplierName).toBe("Hidden Supplier");
    expect(presentPurchases(view, capabilitiesForProfiles([])).register).toBeUndefined();
    expect(presentPurchases(view, capabilitiesForProfiles(["finance"])).register?.[0]?.refundAccount).toBe("private-account");
  });

  it("maps private actions to capabilities and rejects unknown actions", () => {
    expect(mutationCapability("voidPurchase")).toBe("paymentsVoidReview");
    expect(mutationCapability("createBudget")).toBe("createBudget");
    expect(mutationCapability("registerPurchase")).toBe("registerActual");
    expect(mutationCapability("addFunding")).toBe("manageFunding");
    expect(mutationRequiresRevision("voidPurchase")).toBe(true);
    expect(mutationRequiresRevision("checkPurchase")).toBe(false);
    expect(isFinanceAction("setMemberGrant")).toBe(false);
    expect(isFinanceAction("registerPurchase")).toBe(true);
  });
});
