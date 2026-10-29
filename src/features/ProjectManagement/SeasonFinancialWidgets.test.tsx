// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { SeasonFinancialWidgets } from "./SeasonFinancialWidgets";
import { OverviewProgress } from "./OverviewProgress";
import { initialLocalWorkspace } from "./local-repository";
import { SeasonFinancialRequestError } from "./season-financials-repository";
import type { SeasonFinancialSummary } from "./season-financials-types";

const summary: SeasonFinancialSummary = {
  moneyFlow: { status: "available", moneyInNok: "0.00", moneyOutNok: "0.00" },
  seasonCode: "S27", budgetStatus: "approved", plannedNok: "1000.00", actualNok: "1250.50", canOpenFinancials: true, viewVersion: 1,
  bank: { status: "available", snapshot: { amountNok: "9876.54", asOfDate: "2026-10-28", updatedAt: "2026-10-29T10:00:00Z" } },
  departments: [{ departmentKey: "mechanical", name: "Mechanical", plannedNok: "1000.00", actualNok: "1250.50", unbudgetedNok: "100.00", systems: [{ id: "1", code: "SYS", name: "Frame", active: true, plannedNok: "1000.00", actualNok: "1250.50", unbudgetedNok: "100.00" }] }],
};
function Notifications() {
  const notes = useMemberNotifications();
  return <output>{notes?.items.map(note => `${note.title} ${note.action?.label ?? ""}`).join(" ")}</output>;
}
let root: Root, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function render(load: (owner: { current: string | null }) => Promise<SeasonFinancialSummary>, season = "S27", userId = "one") {
  await act(async () => root.render(<MemoryRouter><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><SeasonFinancialWidgets season={season} userId={userId} load={load} /><Notifications /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
}

it("shows exact amounts, a dated manual balance, and accessible department spending bars", async () => {
  await render(async () => summary);
  expect(container.textContent).toContain("NOK 1 000,00");
  expect(container.textContent).toContain("NOK 1 250,50");
  expect(container.textContent).toContain("NOK 9 876,54");
  expect(container.textContent).toContain("As of 2026-10-28");
  expect(container.textContent).toContain("Includes unpaid invoices");
  expect(container.querySelector('[role="img"][aria-label*="over budget"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Spending by department");
  expect(container.textContent).toContain("NOK 1 250,50 / NOK 1 000,00");
  expect(container.querySelector('a[href="/finance"]')).not.toBeNull();
  const bar = container.querySelector('[role="progressbar"][aria-label*="Mechanical"]');
  expect(bar?.getAttribute("aria-valuetext")).toContain("NOK 1 250,50 spent of NOK 1 000,00 allocated, over budget, NOK 100,00 unbudgeted");
  expect(bar?.getAttribute("aria-valuenow")).toBe("100");
});

it("distinguishes a zero snapshot from an absent budget and hides restricted Financials links", async () => {
  await render(async () => ({ ...summary, seasonCode: null, budgetStatus: "absent", plannedNok: null, actualNok: null, departments: [], canOpenFinancials: false, bank: { status: "available", snapshot: { amountNok: "0.00", asOfDate: "2026-10-01", updatedAt: "x" } } }));
  expect(container.textContent).toContain("No season budget yet");
  expect(container.textContent).toContain("NOK 0,00");
  expect(container.querySelector('a[href="/finance"]')).toBeNull();
  expect(container.textContent).not.toContain("Spending by department");
});

it("does not combine mismatched seasons and does not hide a separate bank snapshot", async () => {
  await render(async () => summary, "S28");
  expect(container.textContent).toContain("Finance is set to S27, not S28");
  expect(container.textContent).not.toContain("NOK 1 250,50");
  expect(container.textContent).toContain("NOK 9 876,54");
});

it("reports failed refreshes through notifications and removes revoked amounts", async () => {
  const load = vi.fn().mockResolvedValueOnce(summary).mockRejectedValueOnce(new Error("Network error")).mockRejectedValueOnce(new SeasonFinancialRequestError("Access revoked", 403));
  await render(load);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Last loaded value");
  expect(container.textContent).toContain("Could not load financial overview Try again");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).not.toContain("NOK 9 876,54");
  expect(container.textContent).not.toContain("NOK 1 250,50");
});

it("ignores late responses from an earlier account", async () => {
  let resolve!: (value: SeasonFinancialSummary) => void;
  const pending = new Promise<SeasonFinancialSummary>(done => { resolve = done; });
  const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ ...summary, bank: { status: "available", snapshot: null }, actualNok: "9.00" });
  await render(load, "S27", "one");
  await render(load, "S27", "two");
  await act(async () => resolve(summary));
  expect(container.textContent).toContain("NOK 9,00");
  expect(container.textContent).not.toContain("NOK 9 876,54");
});

it("does not show a hidden draft or fabricate an unavailable bank balance", async () => {
  await render(async () => ({ ...summary, budgetStatus: "draft-hidden", plannedNok: null, actualNok: null, departments: [], moneyFlow: { status: "unavailable" }, bank: { status: "unavailable" } }));
  expect(container.textContent).toContain("Draft budget is restricted");
  expect(container.textContent).toContain("Balance unavailable");
  expect(container.textContent).toContain("Could not load bank balance Try again");
  expect(container.textContent).not.toContain("NOK 1 000,00");
  expect(container.textContent).not.toContain("NOK 0,00");
});

it("refreshes a visible tab periodically without overlapping requests and clears the timer", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let resolve!: (value: SeasonFinancialSummary) => void;
  const pending = new Promise<SeasonFinancialSummary>(done => { resolve = done; });
  const load = vi.fn().mockResolvedValueOnce(summary).mockReturnValueOnce(pending).mockResolvedValue({ ...summary, actualNok: "9.00" });
  await render(load);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(1_000); });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ ...summary, actualNok: "22.00" }); });
  expect(container.textContent).toContain("NOK 22,00");
  await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
  expect(load).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("NOK 9,00");
  await act(async () => root.unmount());
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(load).toHaveBeenCalledTimes(3);
  // The shared cleanup calls unmount as well; install a fresh root for it.
  root = createRoot(container);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("labels retained department values and a previously absent balance after refresh fails", async () => {
  const load = vi.fn().mockResolvedValueOnce({ ...summary, bank: { status: "available", snapshot: null } }).mockRejectedValueOnce(new Error("Offline"));
  await render(load);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Last checked: no balance entered.");
  expect(container.textContent).not.toContain("No balance entered yet.");
  expect(container.textContent).toContain("Last loaded values.");
  expect(container.textContent).toContain("Could not load financial overview Try again");
});

it("marks a previously absent budget as a past observation after refresh fails", async () => {
  const absent = { ...summary, seasonCode: null, budgetStatus: "absent", plannedNok: null, actualNok: null, departments: [], bank: { status: "available", snapshot: null } } satisfies SeasonFinancialSummary;
  const load = vi.fn().mockResolvedValueOnce(absent).mockRejectedValueOnce(new Error("Offline"));
  await render(load);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Last checked: no season budget.");
  expect(container.textContent).not.toContain("No season budget yet.");
});

it("skips background polling while hidden and refreshes when visible again", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const load = vi.fn().mockResolvedValue(summary);
  await render(load);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(load).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(load).toHaveBeenCalledTimes(2);
});

it("times out a stuck refresh, permits recovery, and ignores its delayed result", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let resolve!: (value: SeasonFinancialSummary) => void;
  const stuck = new Promise<SeasonFinancialSummary>(done => { resolve = done; });
  const load = vi.fn().mockResolvedValueOnce(summary).mockReturnValueOnce(stuck).mockResolvedValueOnce({ ...summary, actualNok: "42.00" });
  await render(load);
  await act(async () => window.dispatchEvent(new Event("focus")));
  const signal = load.mock.calls[1][1] as AbortSignal;
  expect(signal.aborted).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(signal.aborted).toBe(true);
  expect(container.textContent).toContain("Last loaded value");
  expect(container.textContent).toContain("Could not load financial overview Try again");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("NOK 42,00");
  expect(container.textContent).not.toContain("Last loaded values.");
  await act(async () => resolve({ ...summary, actualNok: "999.00" }));
  expect(container.textContent).toContain("NOK 42,00");
  expect(container.textContent).not.toContain("NOK 999,00");
});

it("reports zero-budget cases without dividing by zero or hiding an overrun", async () => {
  await render(async () => ({ ...summary, plannedNok: "0.00", actualNok: "0.00" }));
  expect(container.querySelector('[role="img"][aria-label*="percentage unavailable for a zero budget"]')).not.toBeNull();
  const loadOver = async () => ({ ...summary, plannedNok: "0.00", actualNok: "10.00" });
  await render(loadOver);
  expect(container.querySelector('[role="img"][aria-label*="over budget"]')).not.toBeNull();
  expect(container.textContent).toContain("Over budget");
  expect(container.textContent).toContain("NOK 10,00");
});

it("places the finance slot between Progress and Projects", async () => {
  await act(async () => root.render(<MemoryRouter><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><OverviewProgress workspace={initialLocalWorkspace()} busy={false} projectColumns={[]} onToggleProjectColumn={() => {}} onSelectProject={() => {}} onEditDepartment={() => {}}><div id="finance-slot">Season finances</div></OverviewProgress></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
  const headings = container.querySelector("[data-project-progress]")!;
  const children = Array.from(headings.children);
  expect(children.map(element => element.id || element.getAttribute("aria-labelledby"))).toEqual(["progress-title", "finance-slot", "overview-projects-title"]);
});

function flowCard() { return container.querySelector<HTMLElement>('[role="group"][aria-label="Money in and out"]')!; }

it("compares recorded sponsor cash received with money paid out", async () => {
  await render(async () => ({ ...summary, moneyFlow: { status: "available", moneyInNok: "152000.01", moneyOutNok: "68500.75" } }));
  expect(flowCard().textContent).toContain("NOK 152 000,01");
  expect(flowCard().textContent).toContain("NOK 68 500,75");
  expect(flowCard().textContent).toContain("sponsor cash marked received");
  expect(flowCard().textContent).toContain("paid invoices, reimbursed outlays and team-account receipts treated as paid from purchase records");
  expect(flowCard().textContent).toContain("not bank-reconciled");
});

it("shows actual zero flow, and does not fabricate it when there is no season", async () => {
  await render(async () => summary);
  expect(flowCard().textContent?.match(/NOK 0,00/g)).toHaveLength(2);
  await render(async () => ({ ...summary, seasonCode: null, moneyFlow: { status: "no-season" } }));
  expect(flowCard().textContent).toContain("No finance season configured");
  expect(flowCard().textContent).not.toContain("NOK 0,00");
});

it("suppresses mismatched seasons and reports unavailable flows with retry", async () => {
  await render(async () => ({ ...summary, moneyFlow: { status: "available", moneyInNok: "12345.00", moneyOutNok: "678.00" } }), "S28");
  expect(flowCard().textContent).toContain("Finance is set to S27, not S28");
  expect(flowCard().textContent).not.toContain("NOK 12 345,00");
  await render(async () => ({ ...summary, moneyFlow: { status: "unavailable" } }));
  expect(flowCard().textContent).toContain("Money in and out unavailable");
  expect(flowCard().textContent).not.toContain("NOK 0,00");
  expect(container.textContent).toContain("Could not load money in and out Try again");
});

it("marks retained money flow and previously absent finance season as stale", async () => {
  const load = vi.fn().mockResolvedValueOnce({ ...summary, moneyFlow: { status: "available", moneyInNok: "20.00", moneyOutNok: "15.00" } }).mockRejectedValueOnce(new Error("Offline"));
  await render(load);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(flowCard().textContent).toContain("Last loaded values.");
  expect(flowCard().textContent).toContain("NOK 20,00");
  const missing = { ...summary, seasonCode: null, moneyFlow: { status: "no-season" } } satisfies SeasonFinancialSummary;
  const missingLoad = vi.fn().mockResolvedValueOnce(missing).mockRejectedValueOnce(new Error("Offline"));
  await render(missingLoad);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(flowCard().textContent).toContain("Last checked: no finance season configured.");
});
