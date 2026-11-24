// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DealComposer } from "./DealComposer";
import type { DealStage, OpportunityKind, PipelineData } from "./types";

const data: PipelineData = {
  canManage: true,
  deals: [],
  organizations: [{ id: "company", name: "Existing Partner", revision: 0 }],
  seasons: [
    {
      id: "s27",
      code: "S27",
      name: "Season 2027",
      status: "active",
      startDate: "2026-08-01",
      endDate: "2027-07-31",
    },
  ],
};
const save = vi.fn(async () => true),
  create = vi.fn(async (): Promise<string | null> => "new-company"),
  invalid = vi.fn(),
  close = vi.fn(),
  returnFocus = vi.fn();
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockReset().mockResolvedValue(true);
  create.mockReset().mockResolvedValue("new-company");
  invalid.mockClear();
  close.mockClear();
  returnFocus.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  stage: DealStage = "contacted",
  kind: OpportunityKind = "deal",
) {
  await act(async () =>
    root.render(
      <DealComposer
        kind={kind}
        defaultStage={stage}
        data={data}
        members={[{ id: "member", name: "Morgan" }]}
        busy={false}
        onSave={save}
        onCreatePartner={create}
        onInvalid={invalid}
        onClose={close}
        onReturnFocus={returnFocus}
      />,
    ),
  );
}
async function click(label: string) {
  const control = [
    ...document.querySelectorAll<HTMLElement>("button,[role=option]"),
  ].find(
    (element) =>
      element.getAttribute("aria-label") === label ||
      element.textContent === label,
  )!;
  await act(async () => control.click());
}
async function text(selector: string, value: string) {
  await vi.waitFor(() =>
    expect(document.querySelector(selector)).not.toBeNull(),
  );
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  )!;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function chooseCompany() {
  await click("Company");
  await click("Existing Partner");
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Company"]'),
    ),
  );
}

it("opens directly in the title with only title, notes and compact property controls", async () => {
  await render();
  expect(document.activeElement).toBe(
    document.getElementById("new-opportunity-title"),
  );
  expect(document.querySelectorAll("textarea")).toHaveLength(2);
  expect(document.querySelector('[aria-label="Stage"]')?.textContent).toBe(
    "Contacted",
  );
  expect(
    document.querySelector('[aria-label="Deal season"]')?.textContent,
  ).toBe("S27");
  for (const label of [
    "Partner contributions",
    "Helix deliverables",
    "Agreement link",
    "Contact email",
    "Start date",
  ])
    expect(
      document.querySelector('[role="dialog"]')?.textContent,
    ).not.toContain(label);
  await text("#new-opportunity-title", "Season support");
  await chooseCompany();
  await text("#new-opportunity-notes", "Follow up after the demo.");
  await click("Create deal");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Season support",
      organizationId: "company",
      negotiationNotes: "Follow up after the demo.",
      stage: "contacted",
      seasonId: "s27",
      contributions: [],
    }),
    "contacted",
    false,
    expect.any(String),
  );
});

it("queues a new company until creation and reuses it when saving the card fails", async () => {
  await render();
  await text("#new-opportunity-title", "New opportunity");
  await click("Company");
  await text('[aria-label="Search or add a company"]', "Acme Workshop");
  await click('Create company "Acme Workshop"');
  expect(create).not.toHaveBeenCalled();
  save.mockResolvedValueOnce(false);
  await click("Create deal");
  expect(create).toHaveBeenCalledWith("Acme Workshop");
  expect(
    document.querySelector<HTMLTextAreaElement>("#new-opportunity-title")
      ?.value,
  ).toBe("New opportunity");
  expect(document.querySelector('[aria-label="Company"]')?.textContent).toBe(
    "Acme Workshop",
  );
  await click("Create deal");
  expect(create).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ organizationId: "new-company" }),
    "contacted",
    false,
    expect.any(String),
  );
});

it("does not save a card when company creation fails and preserves the input", async () => {
  create.mockResolvedValueOnce(null);
  await render();
  await text("#new-opportunity-title", "Keep this draft");
  await click("Company");
  await text('[aria-label="Search or add a company"]', "Retry Company");
  await click('Create company "Retry Company"');
  await click("Create deal");
  expect(save).not.toHaveBeenCalled();
  expect(
    document.querySelector<HTMLTextAreaElement>("#new-opportunity-title")
      ?.value,
  ).toBe("Keep this draft");
  await click("Create deal");
  expect(create).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledOnce();
});

it("keeps the company and stage for Create more, clears card-specific values and restores title focus", async () => {
  await render();
  await text("#new-opportunity-title", "First card");
  await chooseCompany();
  await text("#new-opportunity-notes", "Only for the first card.");
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="switch"]')!.click(),
  );
  await click("Create deal");
  expect(save).toHaveBeenCalledWith(
    expect.any(Object),
    "contacted",
    true,
    "Existing Partner",
  );
  expect(
    document.querySelector<HTMLTextAreaElement>("#new-opportunity-title")
      ?.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLTextAreaElement>("#new-opportunity-notes")
      ?.value,
  ).toBe("");
  expect(document.querySelector('[aria-label="Company"]')?.textContent).toBe(
    "Existing Partner",
  );
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      document.getElementById("new-opportunity-title"),
    ),
  );
  await text("#new-opportunity-title", "Second card");
  await click("Create deal");
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: "Second card",
      stage: "contacted",
      organizationId: "company",
    }),
    "contacted",
    true,
    "Existing Partner",
  );
});

it("validates optional cash value and associates it with the selected season", async () => {
  await render();
  await text("#new-opportunity-title", "Cash support");
  await chooseCompany();
  await click("Deal value");
  await text('input[id$="-amount"]', "-5");
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await click("Create deal");
  expect(save).not.toHaveBeenCalled();
  expect(invalid).toHaveBeenCalled();
  await click("Deal value");
  await text('input[id$="-amount"]', "1250.50");
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await click("Create deal");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      contributions: [
        {
          seasonId: "s27",
          kind: "cash",
          description: "",
          amountOre: "125050",
          invoiceDate: null,
        },
      ],
    }),
    "contacted",
    false,
    expect.any(String),
  );
});

it("changes the target column without bypassing Won confirmation", async () => {
  await render();
  await text("#new-opportunity-title", "Signed support");
  await chooseCompany();
  const stage = document.querySelector<HTMLButtonElement>(
    '[aria-label="Stage"]',
  )!;
  await act(async () =>
    stage.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent === "Won")!
      .click(),
  );
  expect(document.querySelector('[role="switch"]')).toBeNull();
  await click("Review as won");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ stage: "proposal" }),
    "won",
    false,
    "Existing Partner",
  );
});

it("exposes confidence and sponsor level directly, saving the selected categories",async()=>{
  await render();
  expect(document.querySelector('[aria-label="More properties"]')).toBeNull();
  async function select(label:string,option:string) {
    await act(async()=>document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})));
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element=>element.textContent===option)!.click());
  }
  await select("Confidence","High");
  expect(document.querySelector('[aria-label="Confidence"]')?.textContent).toBe("High");
  await select("Sponsor level","Gold");
  await text("#new-opportunity-title","Gold support");
  await chooseCompany();
  await click("Create deal");
  expect(save).toHaveBeenCalledWith(expect.objectContaining({probability:100,sponsorLevel:"gold",stage:"contacted",deliverables:expect.arrayContaining([expect.objectContaining({title:"Helix Day stand"}),expect.objectContaining({title:"Logo on car and website"})])}),"contacted",false,"Existing Partner");
});

it("omits negotiation notes and sponsor level when creating a grant", async () => {
  await render("lead", "grant");
  expect(document.querySelector("#new-opportunity-notes")).toBeNull();
  expect(document.querySelector('[aria-label="Sponsor level"]')).toBeNull();
  expect(document.querySelector('[aria-label="Deal value"]')).toBeNull();
  await click("Grant value");
  expect(document.body.textContent).toContain("Grant value (NOK)");
});
