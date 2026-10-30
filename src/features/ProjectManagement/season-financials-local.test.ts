import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ local: true, signedIn: true, allowed: true, snapshot: null as null | { amountNok: string; asOfDate: string; updatedAt: string; revision: number } }));
vi.mock("../Finance/repository", () => ({ localBankSnapshotForDevelopment: () => mocks.snapshot }));
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => mocks.local, localMemberSignedIn: () => mocks.signedIn }));
vi.mock("../MemberPlatform/member-access-api", () => ({ localMemberHasSeasonOverview: () => mocks.allowed }));
import { loadLocalSeasonBankView } from "./season-financials-local";

it("only exposes the local bank snapshot to a signed-in Season Overview reader", () => {
  expect(loadLocalSeasonBankView()).toEqual({ status: "available", snapshot: null });
  mocks.snapshot = { amountNok: "0.00", asOfDate: "2026-10-29", updatedAt: "now", revision: 1 };
  expect(loadLocalSeasonBankView()).toEqual({ status: "available", snapshot: { amountNok: "0.00", asOfDate: "2026-10-29", updatedAt: "now" } });
  mocks.allowed = false;
  expect(() => loadLocalSeasonBankView()).toThrow();
  mocks.allowed = true; mocks.local = false;
  expect(() => loadLocalSeasonBankView()).toThrow();
  mocks.local = true; mocks.signedIn = false;
  expect(() => loadLocalSeasonBankView()).toThrow();
});
