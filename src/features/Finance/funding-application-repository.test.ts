// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFundingApplicationRepository } from "./funding-application-repository";
const token = vi.hoisted(() =>
  vi.fn(async (_owner: { current: string | null }) => "member-token"),
);
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: token,
  watchMemberSession: () => () => undefined,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => false,
  localMemberSignedIn: () => true,
}));
afterEach(() => vi.unstubAllGlobals());
describe("scoped funding application requests", () => {
  it("loads only limited application and project endpoints with a bound member session", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          applications: [],
          links: [],
          proposals: [],
          budgets: [],
          entries: [],
          systems: [],
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const repo = createFundingApplicationRepository();
    await repo.queue();
    await repo.detail("application");
    await repo.context("application");
    await repo.proposals("budget");
    await repo.card("deal");
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/finance?action=fundingApplications",
      "/api/finance?action=fundingApplication&applicationId=application",
      "/api/finance?action=fundingApplicationBudgetContext&applicationId=application",
      "/api/finance?action=projectFundingProposals&projectBudgetId=budget",
      "/api/partner-deals?view=fundingApplicationCard&dealId=deal",
    ]);
    expect(
      fetcher.mock.calls.every(
        (call) =>
          call[1]?.cache === "no-store" &&
          call[1]?.headers &&
          "Authorization" in call[1].headers,
      ),
    ).toBe(true);
    expect(
      token.mock.calls.every((call) => call[0] === token.mock.calls[0][0]),
    ).toBe(true);
  });
  it("routes card classification to partner permissions and awards to Finance without a pipeline fetch", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          ok: true,
          id: "application",
          revision: 1,
          viewVersion: 1,
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const repo = createFundingApplicationRepository();
    const classification = {
      action: "saveFundingApplication" as const,
      requestId: crypto.randomUUID(),
      dealId: "deal",
      dealExpectedRevision: 2,
      expectedRevision: 0,
      seasonId: "season",
      purchaseConditions: "Purchase conditions",
    };
    await repo.mutate(classification);
    await repo.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: "application",
      expectedRevision: 1,
      awardDate: "2026-11-19",
      awardReference: "Award",
    });
    expect(fetcher.mock.calls[0][0]).toBe("/api/partner-deals");
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(classification));
    expect(fetcher.mock.calls[1][0]).toBe("/api/finance");
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "POST")).toBe(
      true,
    );
  });
  it("retains denial status for clearing private views", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Head of Finance access is required" },
          { status: 403 },
        ),
      ),
    );
    await expect(
      createFundingApplicationRepository().queue(),
    ).rejects.toMatchObject({ status: 403 });
  });
});
