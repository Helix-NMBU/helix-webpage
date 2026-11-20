// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { preparedPurchaseInvoiceFiles } from "./prepared-invoice-fixture";
import { allowedUpload, MAX_PURCHASE_FILE_BYTES } from "./purchase-domain";
import { setLocalMemberSignedIn } from "../MemberPlatform/local-mode";
const select = (query = "") => window.history.replaceState({}, "", `/departments/management/purchases${query}`);
beforeEach(() => {
  vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local"); localStorage.clear(); select("?invoiceFixture=prepared");
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); select(); vi.unstubAllEnvs(); });
it("provides one ordinary valid PDF File without writing roles, grants or expenses", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const files = preparedPurchaseInvoiceFiles();
  expect(files).toHaveLength(1);
  const file = files[0].file;
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe("purchase-order-3.pdf");
  expect(file.type).toBe("application/pdf");
  expect(file.size).toBe(620);
  expect(file.size).toBeLessThan(MAX_PURCHASE_FILE_BYTES);
  expect(allowedUpload(file.name, file.type)).toBe(true);
  const bytes = await file.arrayBuffer();
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(await file.text()).toContain("NOK 3500.00");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(files[0]).not.toHaveProperty("uploadId");
  expect(writes).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  writes.mockRestore();
});
it.each(["", "?invoiceFixture=", "?invoiceFixture=other", "?invoiceFixture=PREPARED"])("keeps ordinary forms empty without the exact explicit query: %s", query => {
  select(query); expect(preparedPurchaseInvoiceFiles()).toEqual([]);
});
it("does not prepare an invoice for signed-out local members", () => {
  setLocalMemberSignedIn(false); expect(preparedPurchaseInvoiceFiles()).toEqual([]);
});
it.each([{ dev: false, mode: "member-local" }, { dev: true, mode: "development" }, { dev: true, mode: "production" }])("refuses outside dedicated development mode: $dev/$mode", ({ dev, mode }) => {
  vi.stubEnv("DEV", dev); vi.stubEnv("MODE", mode); expect(preparedPurchaseInvoiceFiles()).toEqual([]);
});
it("refuses a remote host even when its query and development mode match", () => {
  vi.stubGlobal("window", { location: { origin: "https://internal.helixnmbu.no", search: "?invoiceFixture=prepared" } });
  expect(preparedPurchaseInvoiceFiles()).toEqual([]);
});
