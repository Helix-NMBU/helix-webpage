import { describe, expect, it } from "vitest";
import { allowedUpload, normalizePurchaseInput, verifyFileSignature } from "./purchase-domain.js";

describe("purchase-domain", () => {
  it("accepts supported file metadata and signatures", () => {
    expect(allowedUpload("receipt.pdf", "application/pdf")).toBe(true);
    expect(allowedUpload("photo.JPG", "text/plain")).toBe(true);
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(verifyFileSignature(pdf, "receipt.pdf", "application/pdf")).toBe(true);
  });

  it("discards refund fields for non-outlay purchases", () => {
    const result = normalizePurchaseInput({
      buyerName: "Buyer",
      supplierName: "Supplier",
      paymentMethod: "team_account",
      purchaseDate: "2026-10-01",
      justification: "Long enough reason",
      documentKind: "receipt",
      refundAccount: "12345678901",
      refundPhone: "12345678",
      lines: [{ systemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", budgetItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", description: "Line", quantity: "3", amountNok: "900.00" }],
      uploadIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
    });
    expect(result.errors).toEqual([]);
    expect(result.purchase?.refundAccount).toBeNull();
    expect(result.purchase?.refundPhone).toBeNull();
    expect(result.purchase?.lines[0]?.amountOre).toBe(90000n);
  });
});
