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

describe("verified invoice signatures",()=>{
 it("rejects unknown/truncated bytes despite allowed names and MIME declarations",()=>{
  for(const bytes of [new Uint8Array(),new TextEncoder().encode("arbitrary payload"),new Uint8Array([0x89,0x50,0x4e,0x47])])
   expect(verifyFileSignature(bytes,"invoice.pdf","application/pdf")).toBe(false);
 });
 it("accepts supported JPEG, full PNG, PDF and ISO-BMFF HEIC/HEIF signatures",()=>{
  expect(verifyFileSignature(new Uint8Array([0xff,0xd8,0xff]),"photo.jpg","image/jpeg")).toBe(true);
  expect(verifyFileSignature(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),"photo.png","image/png")).toBe(true);
  for(const brand of ["heic","heif","mif1","heix"]) expect(verifyFileSignature(new Uint8Array([0,0,0,24,...new TextEncoder().encode(`ftyp${brand}`)]),"photo.heic","image/heic")).toBe(true);
  expect(verifyFileSignature(new TextEncoder().encode("ftypheicfake"),"photo.heic","image/heic")).toBe(false);
 });
});
