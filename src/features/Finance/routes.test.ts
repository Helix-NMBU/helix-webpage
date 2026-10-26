import { describe, expect, it } from "vitest";
import { financeReturnPath } from "./routes";

describe("finance return paths", () => {
  it("sends legacy team finance links to the public pages and keeps the query", () => {
    expect(financeReturnPath("/teams/finance")).toBe("/finance");
    expect(financeReturnPath("/teams/finance/budget?season=S27#items")).toBe("/finance/budgets?season=S27#items");
    expect(financeReturnPath("/teams/finance/expenses?view=open#claims")).toBe("/finance/purchases?view=open#claims");
    expect(financeReturnPath("/teams/finance/private")).toBe("/finance");
    expect(financeReturnPath("/finance/financing")).toBe("/finance/financing");
  });

  it("rejects paths that leave the member finance area", () => {
    expect(financeReturnPath("/teams/business-marketing")).toBeNull();
    expect(financeReturnPath("//finance")).toBeNull();
    expect(financeReturnPath("/finance/../admin")).toBeNull();
    expect(financeReturnPath("/\\finance")).toBeNull();
  });
});
