// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fundingFixture,
  fundingRole,
} from "./funding-application.test-support";
import { readLocalPartnerState } from "../PartnerDeals/local-fixture";
import { pipelineRepository } from "../PartnerDeals/repository";
import { createLocalFundingApplicationRepository } from "./funding-application-local";
const gates = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
  localMemberAccount: { email: "alex@example.invalid" },
}));
beforeEach(() => {
  localStorage.clear();
  gates.local = true;
  gates.signedIn = true;
});
describe("funding applications and stable budget obligations", () => {
  it("keeps the Head of Finance queue limited and activates P0 only through an explicit award", async () => {
    const { repository, budgets, app, budget } = await fundingFixture(),
      entry = budget.approvedVersion!.entries[0],
      pipeline = readLocalPartnerState();
    let result = await repository.mutate({
      action: "linkFundingApplicationEntry",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: app.revision,
      entryId: entry.entryId,
      expectedBudgetRevision: budget.revision,
    });
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].priority,
    ).toBe("P2");
    const safe = JSON.stringify(await repository.queue());
    expect(safe).not.toContain("Private");
    expect(safe).not.toContain("organization");
    expect(safe).not.toContain("Unrelated negotiation");
    const award = {
      action: "recordFundingAward" as const,
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      awardDate: "2026-11-19",
      awardReference: "AWARD-2026-01",
    };
    result = await repository.mutate(award);
    expect(await repository.mutate(award)).toEqual(result);
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0],
    ).toMatchObject({
      priority: "P0",
      ordinaryPriority: "P2",
      plannedNok: "1000.00",
    });
    expect(readLocalPartnerState().tasks).toEqual(pipeline.tasks);
    expect(readLocalPartnerState().deals[0].stage).toBe("proposal");
    fundingRole("finance");
    await expect(repository.detail(app.id)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("keeps new money outside the budget until project lead adoption and both reviews", async () => {
    const { repository, budgets, app, budget, system } = await fundingFixture();
    let result = await repository.mutate({
      action: "proposeFundingBudgetEntry",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: app.revision,
      projectBudgetId: budget.id,
      expectedBudgetRevision: budget.revision,
      entry: {
        systemId: system.id,
        description: "Workshop drill",
        plannedNok: "250.25",
        ordinaryPriority: "P1",
        category: "tooling",
        reuseStatus: "new",
        status: "planned",
      },
      note: "Required by the award",
    });
    await repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      awardDate: "2026-11-19",
      awardReference: "AWARD-NEW",
    });
    expect((await budgets.detail(budget.id)).approvedTotalNok).toBe("1000.00");
    fundingRole("project_lead");
    const proposals = await repository.proposals(budget.id),
      proposal = proposals.proposals[0];
    await repository.mutate({
      action: "adoptFundingProposal",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: proposal.applicationRevision,
      projectBudgetId: budget.id,
      expectedBudgetRevision: budget.revision,
      proposalId: proposal.id,
    });
    let changed = await budgets.detail(budget.id);
    expect(changed.pendingTotalNok).toBe("1250.25");
    expect(changed.approvedTotalNok).toBe("1000.00");
    expect(
      changed.pendingVersion!.entries.find(
        (item) => item.entryId === proposal.entryId,
      )?.priority,
    ).toBe("P0");
    result = await budgets.mutate({
      action: "submitProjectBudget",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: changed.revision,
    });
    fundingRole("department_lead");
    result = await budgets.mutate({
      action: "approveDepartmentBudget",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: result.revision,
    });
    fundingRole("head_of_finance");
    await budgets.mutate({
      action: "approveProjectBudget",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: result.revision,
    });
    changed = await budgets.detail(budget.id);
    expect(changed.approvedTotalNok).toBe("1250.25");
    expect((await repository.detail(app.id)).proposals[0].approvalStatus).toBe(
      "approved",
    );
  });
  it("retains P0 for multiple awards until every obligation is released and protects edits", async () => {
    const { repository, budgets, app, budget, deal } = await fundingFixture(),
      entry = budget.approvedVersion!.entries[0];
    let first = await repository.mutate({
      action: "linkFundingApplicationEntry",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: app.revision,
      entryId: entry.entryId,
      expectedBudgetRevision: budget.revision,
    });
    first = await repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: first.revision,
      awardDate: "2026-11-19",
      awardReference: "FIRST",
    });
    fundingRole("marketing");
    const other = readLocalPartnerState().deals.find(
      (item) => item.id !== deal.id,
    )!;
    let second = await repository.mutate({
      action: "saveFundingApplication",
      requestId: crypto.randomUUID(),
      dealId: other.id,
      dealExpectedRevision: other.revision,
      expectedRevision: 0,
      seasonId: "s27",
      purchaseConditions: "Second awarded purchase",
    });
    fundingRole("head_of_finance");
    second = await repository.mutate({
      action: "linkFundingApplicationEntry",
      requestId: crypto.randomUUID(),
      applicationId: second.id,
      expectedRevision: second.revision,
      entryId: entry.entryId,
      expectedBudgetRevision: budget.revision,
    });
    second = await repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: second.id,
      expectedRevision: second.revision,
      awardDate: "2026-11-19",
      awardReference: "SECOND",
    });
    const firstLink = (await repository.detail(app.id)).links[0];
    await expect(
      repository.mutate({
        action: "releaseFundingObligation",
        requestId: crypto.randomUUID(),
        applicationId: app.id,
        expectedRevision: first.revision,
        obligationId: firstLink.id,
        reason: "",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await repository.mutate({
      action: "releaseFundingObligation",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: first.revision,
      obligationId: firstLink.id,
      reason: "First award changed",
    });
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].priority,
    ).toBe("P0");
    fundingRole("project_lead");
    const revision = await budgets.mutate({
      action: "requestProjectBudgetChanges",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      reason: "Check protected entry",
    });
    await expect(
      budgets.mutate({
        action: "saveProjectBudgetEntry",
        requestId: crypto.randomUUID(),
        projectBudgetId: budget.id,
        expectedRevision: revision.revision,
        entry: { ...entry, plannedNok: "1.00" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    fundingRole("head_of_finance");
    const link = (await repository.detail(second.id)).links[0];
    await repository.mutate({
      action: "releaseFundingObligation",
      requestId: crypto.randomUUID(),
      applicationId: second.id,
      expectedRevision: second.revision,
      obligationId: link.id,
      reason: "Second award released",
    });
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].priority,
    ).toBe("P2");
    expect((await repository.detail(app.id)).links[0].release?.reason).toBe(
      "First award changed",
    );
  });
  it("rechecks the dedicated local gates on every operation", async () => {
    const { repository } = await fundingFixture();
    gates.signedIn = false;
    await expect(repository.queue()).rejects.toMatchObject({ status: 401 });
    expect(createLocalFundingApplicationRepository).toThrow("Sign in");
    gates.signedIn = true;
    gates.local = false;
    await expect(repository.queue()).rejects.toMatchObject({ status: 401 });
  });
  it("retains removal history for a pending link and never activates it on a later award", async () => {
    const { repository, budgets, app, budget } = await fundingFixture(),
      entry = budget.approvedVersion!.entries[0];
    let result = await repository.mutate({
      action: "linkFundingApplicationEntry",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: app.revision,
      entryId: entry.entryId,
      expectedBudgetRevision: budget.revision,
    });
    const link = (await repository.detail(app.id)).links[0];
    result = await repository.mutate({
      action: "releaseFundingObligation",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      obligationId: link.id,
      reason: "Linked the wrong purchase",
    });
    await repository.mutate({
      action: "recordFundingAward",
      requestId: crypto.randomUUID(),
      applicationId: app.id,
      expectedRevision: result.revision,
      awardDate: "2026-11-19",
      awardReference: "Later award",
    });
    expect((await repository.detail(app.id)).links[0]).toMatchObject({
      mandatory: false,
      release: { reason: "Linked the wrong purchase" },
    });
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].priority,
    ).toBe("P2");
  });
  it("keeps a normal Won transition separate from an award and denies the Head profile pipeline access", async () => {
    const { repository, budgets, app, budget, deal } = await fundingFixture();
    await expect(pipelineRepository().load()).rejects.toMatchObject({
      status: 403,
    });
    fundingRole("marketing");
    const current = readLocalPartnerState().deals.find(
      (item) => item.id === deal.id,
    )!;
    await pipelineRepository().confirmWon(current.id, current.revision);
    fundingRole("head_of_finance");
    expect((await repository.detail(app.id)).award).toBeNull();
    expect(
      (await budgets.detail(budget.id)).approvedVersion!.entries[0].priority,
    ).toBe("P2");
  });
});
