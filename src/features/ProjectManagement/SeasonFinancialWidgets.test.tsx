// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { SeasonFinancialWidgets } from "./SeasonFinancialWidgets";
import { SeasonFinancialRequestError } from "./season-financials-repository";
import type { SeasonFinancialSummary } from "./season-financials-types";

const summary: SeasonFinancialSummary = {
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
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(load: (owner: { current: string | null }) => Promise<SeasonFinancialSummary>, season = "S27", userId = "one") {
  await act(async () => root.render(<MemoryRouter><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><SeasonFinancialWidgets season={season} userId={userId} load={load} /><Notifications /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
}

it("shows exact amounts, a dated manual balance, and keyboard-accessible department drilldown", async () => {
  await render(async () => summary);
  expect(container.textContent).toContain("NOK 1 000,00");
  expect(container.textContent).toContain("NOK 1 250,50");
  expect(container.textContent).toContain("NOK 9 876,54");
  expect(container.textContent).toContain("as of 2026-10-28");
  expect(container.textContent).toContain("Includes unpaid invoices");
  expect(container.textContent).toContain("Over budget · Unbudgeted NOK 100,00");
  expect(container.querySelector('a[href="/finance"]')).not.toBeNull();
  const button = [...container.querySelectorAll("button")].find(item => item.textContent?.includes("Show systems"))!;
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain("Frame");
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
  await render(async () => ({ ...summary, budgetStatus: "draft-hidden", plannedNok: null, actualNok: null, departments: [], bank: { status: "unavailable" } }));
  expect(container.textContent).toContain("Draft budget is restricted");
  expect(container.textContent).toContain("Balance unavailable");
  expect(container.textContent).toContain("Could not load bank balance Try again");
  expect(container.textContent).not.toContain("NOK 1 000,00");
  expect(container.textContent).not.toContain("NOK 0,00");
});
