import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseBudgetCsv, parseImportAmount } from "./budget-import";

describe("department budget CSV", () => {
  it("accepts source-format amounts, BOM, CRLF, quoted multiline cells and escaped quotes", () => {
    const input = '\uFEFFsystem_id;description;planned_nok;note\r\n\r\nSYS-FR;Frame;10 961,54 kr;"quoted ""part""; on\r\ntwo lines"\r\nSYS-FR;Bracket;3000;';
    const result = parseBudgetCsv(input);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.line)).toEqual([3, 5]);
    expect(result.rows[0].values.note).toBe('quoted "part"; on\ntwo lines');
    expect(parseImportAmount(result.rows[0].values.planned_nok!)).toBe(1096154n);
  });
  it("accepts comma files and case insensitive priority names", () => {
    const result = parseBudgetCsv('system_id,description,planned_nok,priority\nSYS-FR,Frame,"1,200.50",p3');
    expect(result.errors).toEqual([]);
    expect(parseImportAmount(result.rows[0].values.planned_nok!)).toBe(120050n);
    expect(result.rows[0].values.priority).toBe("P3");
  });
  it("rejects duplicate keys, unknown columns, malformed quotes and invalid rows", () => {
    expect(parseBudgetCsv('system_id;description;planned_nok;bad\nSYS-FR;Frame;1;x').errors.some((e) => e.field === "bad")).toBe(true);
    expect(parseBudgetCsv('system_id;description;planned_nok\nSYS-FR;Frame;1\nSYS-FR; FRAME ;2').errors.some((e) => e.field === "description" && e.line === 3)).toBe(true);
    expect(parseBudgetCsv('system_id;description;planned_nok\nSYS-FR;"unclosed;1').errors.some((e) => e.message.includes("not closed"))).toBe(true);
    expect(parseBudgetCsv('system_id;description;planned_nok\nSYS-FR;Frame;1.1111').errors.some((e) => e.field.includes("planned_nok"))).toBe(true);
  });
  it("accepts only currency at an edge of the amount", () => {
    for (const value of ["kr 1 234,50", "kr. 1 234,50", "1 234,50 kr", "1 234,50 kr.", "1 234,50 NOK"]) {
      expect(parseImportAmount(value), value).toBe(123450n);
    }
    for (const value of ["1kr2", "1kr.2", "12 NOK 34", "1.2.3,45", "1,2,3.45"]) {
      expect(() => parseImportAmount(value), value).toThrow();
    }
    expect(parseBudgetCsv("system_id;description;planned_nok\nSYS-FR;Frame;1kr2").errors).toEqual([
      expect.objectContaining({ field: "planned_nok", line: 2 }),
    ]);
  });

  it("bounds UTF-8 input, nonblank data rows, and errors", () => {
    const header = "system_id;description;planned_nok\n";
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => `SYS-FR;Item ${index};1`).join("\n");
    expect(parseBudgetCsv(header + rows).errors).toEqual([]);
    expect(parseBudgetCsv(`${header}${rows}\nSYS-FR;Extra;1`).limitError).toMatch(/500 data rows/);
    expect(parseBudgetCsv(`${header}SYS-FR;${"ø".repeat(MAX_IMPORT_BYTES / 2)};1`).limitError).toMatch(/256 KiB/);
    expect(parseBudgetCsv(`${header}SYS-FR;${'x"'.repeat(101)};1`).limitError).toMatch(/too many errors/);
  });
});
