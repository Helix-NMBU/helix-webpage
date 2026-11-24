// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LinkedPurchases } from "./LinkedPurchases";
import type { Deal } from "./types";
import type {
  DealBudgetLinks,
  SaveDealBudgetLinks,
} from "./deal-budget-links-types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
const deal: Deal = {
  id: "deal",
  title: "Season partnership",
  organizationId: "partner",
  organizationName: "Partner",
  stage: "proposal",
  ownerMemberId: null,
  contactName: "",
  contactEmail: "",
  startsOn: null,
  endsOn: null,
  agreementLink: "",
  negotiationNotes: "",
  revision: 5,
  contributions: [],
  deliverables: [],
};
let root: Root, host: HTMLDivElement, state: DealBudgetLinks;
const load = vi.fn(),
  save = vi.fn(),
  changed = vi.fn(async () => undefined);
const repository = { load, save };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  notify.mockReset();
  changed.mockClear();
  state = {
    dealId: "deal",
    dealRevision: 5,
    applicationRevision: 2,
    seasonCode: "S27",
    locked: false,
    entries: [
      {
        entryId: "frame",
        projectBudgetId: "frame-project",
        budgetRevision: 3,
        projectName: "Frame",
        departmentName: "Mechanical & Production",
        description: "Frame tubes",
        plannedNok: "1000.00",
        ordinaryPriority: "P2",
        priority: "P2",
        approved: true,
        selected: false,
      },
      {
        entryId: "cnc",
        projectBudgetId: "frame-project",
        budgetRevision: 3,
        projectName: "Frame",
        departmentName: "Mechanical & Production",
        description: "CNC machining",
        plannedNok: "3000.00",
        ordinaryPriority: "P3",
        priority: "P3",
        approved: true,
        selected: false,
      },
      {
        entryId: "battery",
        projectBudgetId: "power-project",
        budgetRevision: 4,
        projectName: "Power",
        departmentName: "Electronics",
        description: "Battery packs",
        plannedNok: "2000.00",
        ordinaryPriority: "P1",
        priority: "P1",
        approved: true,
        selected: false,
      },
    ],
  };
  load.mockReset().mockImplementation(async () => structuredClone(state));
  save.mockReset().mockImplementation(async (input: SaveDealBudgetLinks) => {
    state = {
      ...state,
      entries: state.entries.map((entry) => ({
        ...entry,
        selected: input.entries.some((item) => item.entryId === entry.entryId),
      })),
    };
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <LinkedPurchases
        deal={deal}
        seasons={[]}
        onChanged={changed}
        repository={repository}
      />,
    ),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Manage linked budget entries"]',
      )!
      .click(),
  );
}
async function click(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  )!;
  await act(async () => button.click());
}
function rows() {
  return [...document.querySelectorAll<HTMLElement>("[cmdk-item]")];
}
async function choose(text: string) {
  await act(async () =>
    rows()
      .find((row) => row.textContent?.includes(text))!
      .click(),
  );
}
async function department(name: string) {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Filter by department"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
  );
  await act(async () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="select-content"] [role="option"]',
      ),
    ]
      .find((option) => option.textContent === name)!
      .click(),
  );
  await vi.waitFor(() => expect(document.activeElement).toBe(
    document.querySelector('[aria-label="Filter by department"]'),
  ));
}
async function search(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Find budget entries"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("opens a named modal with search, departments and project groups", async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Link budget entries",
  );
  expect(document.body.textContent).toContain("Linked budget entries");
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  expect(document.activeElement).toBe(
    document.querySelector('[aria-label="Find budget entries"]'),
  );
  expect(rows()).toHaveLength(3);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Frame",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Power",
  );
});
it("retains selections across department and search filters and applies the complete selection", async () => {
  await render();
  await choose("Frame tubes");
  await department("Electronics");
  expect(rows()).toHaveLength(1);
  await choose("Battery packs");
  await department("Mechanical & Production");
  expect(rows()).toHaveLength(2);
  expect(
    rows()
      .find((row) => row.textContent?.includes("Frame tubes"))
      ?.getAttribute("aria-label"),
  ).toMatch(/^Selected:/);
  await department("All departments");
  await search("Power");
  expect(rows()).toHaveLength(1);
  await search("");
  await click("Selected only");
  expect(rows()).toHaveLength(2);
  await click("Apply");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      dealExpectedRevision: 5,
      applicationExpectedRevision: 2,
      entries: [
        { entryId: "frame", budgetRevision: 3 },
        { entryId: "battery", budgetRevision: 4 },
      ],
    }),
  );
  expect(changed).toHaveBeenCalledOnce();
  expect(notify).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Manage linked budget entries"]'),
    ),
  );
});
it("dismisses with Escape without saving and restores trigger focus", async () => {
  await render();
  await choose("Battery packs");
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(
        '[aria-label="Find budget entries"]',
      )!
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
  );
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')).toBeNull(),
  );
  expect(save).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.activeElement).toBe(
    document.querySelector('[aria-label="Manage linked budget entries"]'),
  ));
});

it("unlinks a selected entry before Won", async () => {
  state.entries[0]!.selected = true;
  await render();
  await click("Selected only");
  expect(rows()).toHaveLength(1);
  await choose("Frame tubes");
  await click("Apply");
  expect(save).toHaveBeenCalledWith(expect.objectContaining({entries: []}));
  expect(host.textContent).toContain("0 linked");
});
it("keeps linked entries read-only after Won", async () => {
  state.locked = true;
  state.entries[0] = {...state.entries[0]!, selected: true, priority: "P0"};
  await render();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Linked budget entries");
  expect([...document.querySelectorAll("button")].some(button => button.textContent === "Apply")).toBe(false);
  const entry=rows().find(row => row.textContent?.includes("Frame tubes"))!;
  expect(entry.getAttribute("aria-disabled")).toBe("true");
  await act(async()=>entry.click());
  expect(entry.getAttribute("aria-label")).toMatch(/^Selected:/);
  expect(save).not.toHaveBeenCalled();
});
