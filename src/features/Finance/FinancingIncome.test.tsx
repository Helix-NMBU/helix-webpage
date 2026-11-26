// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { FinancingIncome } from "./FinancingIncome";
import { funding } from "./budget-dashboard.test-support";
import type { FinancingView } from "./types";

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each([false, true])("shows financing and preserves funding management only for an authorized editor, manage %s", async canManage => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container); root = createRoot(container);
  const financing: FinancingView = { viewVersion: 1, seasonCode: "S27", parts: [], scenarios: [], funding: [funding("Grant", "2000.00", "2026-11-22")],
    wonIncome: [false, true].map((sent, index) => ({ contributionId: String(index), dealId: String(index), sourceName: sent ? "Invoiced partner" : "New partner", title: "Vehicle partnership", amountNok: "1000.00", fundingId: null, invoiceSent: sent, invoiceSentOn: sent ? "2026-11-21" : null, plannedInvoiceDate: null })) };
  financing.wonIncome!.push({ ...financing.wonIncome![0], contributionId: "grant", opportunityKind: "grant", sourceName: "Grant award" });
  await act(async () => root.render(<MemoryRouter><FinancingIncome financing={financing} canManage={canManage} /></MemoryRouter>));
  expect(Boolean(container.querySelector('a[href="/finance/funding"]'))).toBe(canManage);
  expect(container.textContent).toContain("Ready to invoice"); expect(container.textContent).toContain("Awaiting payment"); expect(container.textContent).toContain("Invoice sent");
  expect(container.querySelectorAll('[role="article"][data-slot="card"]')).toHaveLength(4);
  const source = container.querySelector('a[href="/partner-deals?deal=0"]');
  expect(source?.textContent).toBe("Vehicle partnership");
  expect(source?.closest('[data-slot="card-header"]')?.textContent).toBe("Vehicle partnershipNew partner");
  expect(container.querySelector('time[datetime="2026-11-22"]')?.textContent).toBe("22 Nov 2026");
});
