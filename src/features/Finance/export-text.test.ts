import { describe, expect, it } from "vitest";
import {
  FINANCE_PURCHASES_PATH,
  FINANCE_SIGN_IN_LINE,
  approvalSubjectPrefix,
  budgetStatusLabel,
  csvCell,
  deliveryTextHasPrivateMaterial,
  financeLogLine,
  invoiceSubjectPrefix,
  protectCsvCell,
  renderFinanceCsv,
  emptyExportRow,
} from "./export-text";

describe("finance export text", () => {
  it("prefixes formula-like cells and keeps the stored meaning for later quoting", () => {
    expect(protectCsvCell("=1+1")).toBe("'=1+1");
    expect(protectCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(protectCsvCell("-2")).toBe("'-2");
    expect(protectCsvCell("@who")).toBe("'@who");
    expect(protectCsvCell("\tcmd")).toBe("'\tcmd");
    expect(protectCsvCell("  =hidden")).toBe("'  =hidden");
    expect(protectCsvCell("ordinary, text")).toBe("ordinary, text");
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell('=HYPERLINK("http://evil.test")')).toBe(`"'=HYPERLINK(""http://evil.test"")"`);
    expect(csvCell('say "hello"')).toBe('"say ""hello"""');
  });

  it("renders a stable header and does not treat ordinary amounts as formulas", () => {
    const row = emptyExportRow();
    row.row_kind = "line";
    row.line_amount_nok = "10.00";
    row.line_description = "=cmd";
    const csv = renderFinanceCsv([row]);
    expect(csv.startsWith("row_kind,purchase_ref,")).toBe(true);
    expect(csv).toContain("10.00");
    expect(csv).toContain("'=cmd");
    expect(csv).not.toContain("refund");
  });

  it("labels current budget status with unbudgeted ahead of over budget", () => {
    expect(budgetStatusLabel({ unbudgeted: true, actualOre: 1n, effectivePlanOre: 100n })).toBe("unbudgeted");
    expect(budgetStatusLabel({ unbudgeted: false, actualOre: 11n, effectivePlanOre: 10n })).toBe("over_budget");
    expect(budgetStatusLabel({ unbudgeted: false, actualOre: 0n, effectivePlanOre: 0n })).toBe("within");
  });

  it("builds sign-in subjects from the configured threshold", () => {
    expect(invoiceSubjectPrefix(true)).toBe("[Unpaid invoice]");
    expect(invoiceSubjectPrefix(false)).toBe("");
    expect(approvalSubjectPrefix(true, "5000.00")).toBe("[Above approval limit NOK 5000.00]");
    expect(approvalSubjectPrefix(false, "5000.00")).toBe("");
    expect(FINANCE_SIGN_IN_LINE).toContain(FINANCE_PURCHASES_PATH);
    expect(FINANCE_SIGN_IN_LINE).toContain("Sign in");
  });

  it("redacts refund numbers and signed links from log lines", () => {
    expect(deliveryTextHasPrivateMaterial("account 10987654321")).toBe(true);
    expect(deliveryTextHasPrivateMaterial("https://files.example/get?X-Amz-Signature=abc")).toBe(true);
    expect(financeLogLine({ event: "finance_delivery", note: "10987654321" })).toBe("event=redacted");
    expect(financeLogLine({ event: "finance_delivery", outcome: "sent" })).toContain("outcome=sent");
  });
});
