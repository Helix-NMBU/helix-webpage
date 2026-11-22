import { expect, it } from "vitest";
import { canReadProjectBudgetDraft } from "./project-budget-visibility.js";
it.each([
  [false, false, false],
  [true, false, true],
  [false, true, true],
  [true, true, true],
])("limits Draft contents to project authors or department reviewers (%s, %s)", (canDraft, canReviewDepartment, expected) => {
  expect(canReadProjectBudgetDraft({ canDraft, canReviewDepartment })).toBe(expected);
});
