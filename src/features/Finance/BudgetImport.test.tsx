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
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value ?? ""} onChange={(event) => onValueChange(event.target.value)}><option value="">Choose a department</option>{children}</select>,
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
