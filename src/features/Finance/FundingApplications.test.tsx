// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingApplications } from "./FundingApplications";
import { FundingBudgetProposals } from "./FundingBudgetProposals";
import { pipelineRepository } from "../PartnerDeals/repository";
import { dealBudgetLinksRepository } from "../PartnerDeals/deal-budget-links-repository";
import { LinkedPurchases } from "../PartnerDeals/LinkedPurchases";
import {
  fundingFixture,
  fundingRole,
} from "./funding-application.test-support";
import {
  localSeasons,
  readLocalPartnerState,
} from "../PartnerDeals/local-fixture";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
  localMemberAccount: { email: "alex@example.invalid" },
}));
let root: Root,
  container: HTMLDivElement,
  fixture: Awaited<ReturnType<typeof fundingFixture>>;
function button(text: string) {
  const result = [
    ...document.body.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (item) =>
      item.textContent === text && !item.closest('[aria-hidden="true"]'),
  );
  expect(result, text).toBeTruthy();
  return result!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function field(id: string, value: string) {
  await act(async () => {
    const element = document.getElementById(id)!;
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(id: string, text: string) {
  await act(async () =>
    document
      .getElementById(id)!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
  );
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === text);
  expect(option, text).toBeTruthy();
  await act(async () => option!.click());
}
async function page() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FundingApplications repository={fixture.repository} />
      </MemoryRouter>,
    ),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  notify.mockReset();
  fixture = await fundingFixture();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("limited funding application controls", () => {
  it("selects budgeted purchases without changing the deal stage or creating tasks",async()=>{
    fundingRole("marketing");const deal=readLocalPartnerState().deals.find(item=>item.id!==fixture.deal.id)!;const repository=dealBudgetLinksRepository();const changed=vi.fn(async()=>undefined);
    await act(async()=>root.render(<LinkedPurchases deal={deal} seasons={localSeasons} onChanged={changed} repository={repository}/>));
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Manage linked budget entries"]')!.click());
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent?.includes("Frame tubes"))!.click());
    await click("Apply");expect(changed).toHaveBeenCalledOnce();expect((await repository.load(deal.id)).entries.find(item=>item.description==="Frame tubes")?.selected).toBe(true);
    expect(readLocalPartnerState().deals.find(item=>item.id===deal.id)?.stage).toBe("proposal");expect(readLocalPartnerState().tasks).toHaveLength(0);
  });
  it("makes linked purchases P0 in local testing when the card is confirmed Won",async()=>{
    fundingRole("marketing");const deal=readLocalPartnerState().deals.find(item=>item.id!==fixture.deal.id)!;const repository=dealBudgetLinksRepository();const context=await repository.load(deal.id);const entry=context.entries.find(item=>item.description==="Frame tubes")!;
    await repository.save({action:"saveDealBudgetLinks",requestId:crypto.randomUUID(),dealId:deal.id,dealExpectedRevision:context.dealRevision,applicationExpectedRevision:context.applicationRevision,entries:[{entryId:entry.entryId,budgetRevision:entry.budgetRevision}]});
    const linked=await repository.load(deal.id);expect(linked.entries.find(item=>item.entryId===entry.entryId)?.priority).toBe("P2");
    await pipelineRepository().confirmWon(deal.id,linked.dealRevision);
    expect((await repository.load(deal.id)).entries.find(item=>item.entryId===entry.entryId)).toMatchObject({priority:"P0",ordinaryPriority:"P2",selected:true});
  });
  it("links, explicitly awards and releases an obligation with the required reason", async () => {
    await page();
    expect(container.textContent).not.toContain("Private negotiation");
    expect(container.textContent).not.toContain("private@example.invalid");
    expect(container.textContent).not.toContain("Unrelated negotiation");
    await click("Link budget entry");
    await select("funding-existing-entry", "Frame tubes");
    await click("Link entry");
    expect(container.textContent).toContain("Awaiting award");
    await click("Record funding award");
    await field("funding-award-date", "2026-11-19");
    await field("funding-award-reference", "Award letter 2026-11");
    await click("Record award");
    expect(container.textContent).toContain("Mandatory P0");
    expect(
      (await fixture.budgets.detail(fixture.budget.id)).approvedTotalNok,
    ).toBe("1000.00");
    await click("Release obligation");
    await click("Release obligation");
    expect(notify).toHaveBeenLastCalledWith(
      "Check the funding application",
      expect.stringContaining("reason"),
      expect.anything(),
    );
    await field("funding-release-reason", "The provider waived this purchase.");
    await click("Release obligation");
    expect(container.textContent).toContain(
      "The provider waived this purchase.",
    );
    expect(
      (await fixture.budgets.detail(fixture.budget.id)).approvedVersion!
        .entries[0].priority,
    ).toBe("P2");
  });
  it("keeps proposed money separate and lets only the project lead adopt it into Draft", async () => {
    await page();
    await click("Propose purchase");
    await field("funding-description", "Drill press");
    await field("funding-proposed-amount", "250.25");
    await field("funding-proposal-note", "Required equipment");
    await click("Send proposal");
    expect(container.textContent).toContain("Needs project lead");
    expect(
      (await fixture.budgets.detail(fixture.budget.id)).approvedTotalNok,
    ).toBe("1000.00");
    fundingRole("project_lead");
    const budget = await fixture.budgets.detail(fixture.budget.id),
      dirty = vi.fn(),
      changed = vi.fn(async () => undefined);
    await act(async () =>
      root.render(
        <FundingBudgetProposals
          budget={budget}
          onChanged={changed}
          onDirtyChange={dirty}
          repository={fixture.repository}
        />,
      ),
    );
    await click("Review Drill press");
    expect(dirty).toHaveBeenLastCalledWith(true);
    await click("Adopt into Draft");
    expect(changed).toHaveBeenCalledOnce();
    expect((await fixture.budgets.detail(budget.id)).pendingTotalNok).toBe(
      "1250.25",
    );
    expect((await fixture.budgets.detail(budget.id)).approvedTotalNok).toBe(
      "1000.00",
    );
    expect(dirty).toHaveBeenLastCalledWith(false);
    fundingRole("finance");
    const financeBudget = await fixture.budgets.detail(budget.id);
    await act(async () =>
      root.render(
        <FundingBudgetProposals
          budget={financeBudget}
          onChanged={changed}
          repository={fixture.repository}
        />,
      ),
    );
    expect(container.textContent).not.toContain("Review Drill press");
  });
  it("preserves a dirty proposal through focus refresh and stale-write recovery", async () => {
    await page();
    await click("Propose purchase");
    await field("funding-description", "Retain my drill");
    await field("funding-proposed-amount", "300.00");
    await fixture.repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: fixture.app.id,
      expectedRevision: fixture.app.revision,
      awardDate: "2026-11-19",
      awardReference: "Changed during edit",
    });
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      (document.getElementById("funding-description") as HTMLInputElement)
        .value,
    ).toBe("Retain my drill");
    await click("Send proposal");
    expect(notify).toHaveBeenLastCalledWith(
      "Could not save funding application",
      expect.stringContaining("changed"),
      expect.anything(),
    );
    const recovery =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    await act(async () => recovery());
    expect(
      (document.getElementById("funding-description") as HTMLInputElement)
        .value,
    ).toBe("Retain my drill");
    await click("Send proposal");
    expect(
      (await fixture.repository.detail(fixture.app.id)).proposals,
    ).toHaveLength(1);
  });
  it("clears private details and ignores an award response after its session ends", async () => {
    let end: (() => void) | undefined, finish: (() => void) | undefined;
    fixture.repository.watchSession = (callback) => {
      end = callback;
      return () => undefined;
    };
    const mutate = fixture.repository.mutate;
    vi.spyOn(fixture.repository, "mutate").mockImplementation(
      async (change) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return mutate(change);
      },
    );
    await page();
    await click("Record funding award");
    await field("funding-award-date", "2026-11-19");
    await field("funding-award-reference", "Late award");
    await act(async () => button("Record award").click());
    await act(async () => end!());
    await act(async () => finish!());
    expect(container.textContent).toContain("Head of Finance access required");
    expect(container.textContent).not.toContain(fixture.app.purchaseConditions);
    expect(
      notify.mock.calls.some((call) => call[0] === "Funding application saved"),
    ).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("restores dialog focus for keyboard dismissal and a completed proposal", async () => {
    await page();
    await click("Propose purchase");
    expect(
      document
        .querySelector('[role="dialog"]')
        ?.contains(document.activeElement),
    ).toBe(true);
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await vi.waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Propose purchase"),
    );
    await click("Propose purchase");
    await field("funding-description", "Keyboard drill");
    await field("funding-proposed-amount", "50.25");
    await click("Send proposal");
    await vi.waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Propose purchase"),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps purchase selections during stale-write recovery",async()=>{
    fundingRole("marketing");const deal=readLocalPartnerState().deals.find(item=>item.id!==fixture.deal.id)!;const repository=dealBudgetLinksRepository();const save=vi.spyOn(repository,"save").mockRejectedValueOnce(Object.assign(new Error("Refresh the changed selection."),{status:409}));
    await act(async()=>root.render(<LinkedPurchases deal={deal} seasons={localSeasons} onChanged={async()=>undefined} repository={repository}/>));
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Manage linked budget entries"]')!.click());
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent?.includes("Frame tubes"))!.click());
    await click("Apply");const recovery=notify.mock.calls[notify.mock.calls.length-1][2].action.onClick;await act(async()=>recovery());
    expect(document.querySelector('[role="option"][aria-label^="Selected: Frame tubes"]')).not.toBeNull();await click("Apply");expect(save).toHaveBeenCalledTimes(2);expect((await repository.load(deal.id)).entries.find(item=>item.description==="Frame tubes")?.selected).toBe(true);
  });
  it("proposes an increase without changing the existing entry identity or optional fields", async () => {
    await page();
    await click("Propose purchase");
    await select("funding-existing-entry", "Frame tubes");
    await field("funding-proposed-amount", "1200.25");
    await click("Send proposal");
    const proposal = (await fixture.repository.detail(fixture.app.id))
      .proposals[0];
    expect(proposal.desiredEntry).toMatchObject({
      entryId: fixture.budget.approvedVersion!.entries[0].entryId,
      systemId: fixture.system.id,
      description: "Frame tubes",
      plannedNok: "1200.25",
      ordinaryPriority: "P2",
      category: "material",
      reuseStatus: "reuse",
      note: "Keep supplier reference",
    });
    expect(
      (await fixture.budgets.detail(fixture.budget.id)).approvedTotalNok,
    ).toBe("1000.00");
  });
});
