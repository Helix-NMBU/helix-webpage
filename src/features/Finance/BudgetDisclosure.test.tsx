// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BudgetDisclosure } from "./BudgetDisclosure";

let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(locked = false) {
  await act(async () => root.render(<BudgetDisclosure compact label="Purchase details" locked={locked}><input aria-label="Unfinished reason" defaultValue="" /></BudgetDisclosure>));
}
it("hides secondary details initially and preserves unfinished input through closing and reopening", async () => {
  await render();
  const trigger = container.querySelector("button")!;
  const input = container.querySelector("input")!;
  expect(input.closest("[hidden]")).not.toBeNull();
  await act(async () => trigger.click());
  expect(input.closest("[hidden]")).toBeNull();
  input.value = "Keep this reason while checking the budget";
  await act(async () => trigger.click());
  expect(input.closest("[hidden]")).not.toBeNull();
  await act(async () => trigger.click());
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Keep this reason while checking the budget");
});
it("keeps an active form visible while its action is locked", async () => {
  await render();
  const trigger = container.querySelector("button")!;
  await act(async () => trigger.click());
  await render(true);
  expect(trigger.disabled).toBe(true);
  await act(async () => trigger.click());
  expect(container.querySelector("input")!.closest("[hidden]")).toBeNull();
});
