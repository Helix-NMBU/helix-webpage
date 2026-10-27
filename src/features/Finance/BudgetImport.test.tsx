// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BudgetImport } from "./BudgetImport";
import type { PublicDepartmentBudget } from "./types";

const notify = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ setFormDirty: vi.fn(), mutate: vi.fn(), loadPage: vi.fn() }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useFinanceAccess: () => session }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("@libs/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: { value?: string; onValueChange: (value: string) => void; children: ReactNode; disabled?: boolean }) => <select disabled={disabled} value={value ?? ""} onChange={(event) => onValueChange(event.target.value)}><option value="">Choose a department</option>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

let container: HTMLDivElement; let root: Root;
const departments = [{ departmentKey: "mechanical", name: "Mechanical", systems: [], plannedNok: "0.00", actualNok: "0.00", differenceNok: "0.00", unbudgetedNok: "0.00" }] satisfies PublicDepartmentBudget[];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); session.mutate.mockReset(); notify.mockReset(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps CSV input and shows row errors after preview", async () => {
  session.mutate.mockResolvedValue({ ok: true, viewVersion: 4, warnings: [], errors: [], importPreview: { previewToken: "token", viewVersion: 4, departmentKey: "mechanical", rows: [], counts: { added: 0, changed: 0, unchanged: 0, removed: 0 }, subtotals: [], totalNok: "0.00", warnings: [], errors: [{ field: "planned_nok", line: 2, message: "Line 2, planned_nok: Enter a valid amount." }] } });
  await act(async () => root.render(<BudgetImport departments={departments} />));
  const select = container.querySelector("select")!; const textarea = container.querySelector("textarea")!;
  const csv = "system_id;description;planned_nok\nSYS-FR;Frame;wrong";
  await act(async () => {
    select.value = "mechanical"; select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, csv);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const preview = [...container.querySelectorAll("button")].find((button) => button.textContent === "Preview import")!;
  await act(async () => preview.click());
  expect(textarea.value).toBe(csv);
  expect(container.textContent).toContain("Line 2, planned_nok");
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Import budget")?.disabled).toBe(true);
  expect(notify).toHaveBeenCalled();
});

it("shows overspending and cancellation warnings without blocking the import", async () => {
  const warnings = [
    "Line 2: Frame (SYS-FR) has 1500.00 NOK of spending, exceeding the imported plan of 900.00 NOK by 600.00 NOK.",
    "Bracket (SYS-FR) will be cancelled but retains 20.00 NOK of spending.",
  ];
  session.mutate.mockResolvedValue({ ok: true, viewVersion: 4, warnings: [], errors: [], importPreview: {
    previewToken: "token", viewVersion: 4, departmentKey: "mechanical", rows: [],
    counts: { added: 0, changed: 1, unchanged: 0, removed: 1 }, subtotals: [], totalNok: "900.00", warnings, errors: [],
  } });
  await act(async () => root.render(<BudgetImport departments={departments} />));
  const select = container.querySelector("select")!; const textarea = container.querySelector("textarea")!;
  await act(async () => {
    select.value = "mechanical"; select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "system_id;description;planned_nok\nSYS-FR;Frame;900");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const preview = [...container.querySelectorAll("button")].find((button) => button.textContent === "Preview import")!;
  await act(async () => preview.click());
  for (const warning of warnings) expect(container.textContent).toContain(warning);
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Import budget")?.disabled).toBe(false);
});

it("keeps the reviewed CSV and department stable while a preview is pending", async () => {
  let resolve!: (value: unknown) => void;
  session.mutate.mockReturnValue(new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<BudgetImport departments={departments} />));
  const select = container.querySelector("select")!; const textarea = container.querySelector("textarea")!;
  await act(async () => {
    select.value = "mechanical"; select.dispatchEvent(new Event("change", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "system_id;description;planned_nok\nSYS-FR;Frame;900");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Preview import")!.click(); });
  expect(select.disabled).toBe(true);
  expect(textarea.disabled).toBe(true);
  expect((container.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
  await act(async () => resolve({ ok: true, viewVersion: 4, warnings: [], errors: [], importPreview: {
    previewToken: "token", viewVersion: 4, departmentKey: "mechanical", rows: [],
    counts: { added: 0, changed: 0, unchanged: 0, removed: 0 }, subtotals: [], totalNok: "0.00", warnings: [], errors: [],
  } }));
  expect(select.disabled).toBe(false);
  expect(textarea.disabled).toBe(false);
  expect(textarea.value).toContain("Frame;900");
});
