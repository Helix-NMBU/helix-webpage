// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import type { DepartmentHomeBudget } from "../Finance/department-budget-types";
const local = vi.hoisted(() => ({ enabled: false }));
const session = vi.hoisted(() => ({ token: vi.fn(), failure: vi.fn(), watch: vi.fn(() => () => undefined) }));
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => local.enabled }));
vi.mock("../MemberCV/session", () => ({ memberSessionToken: session.token, memberLoadFailure: session.failure, watchMemberSession: session.watch }));
import { createDepartmentBudgetHomeRepository, readDepartmentHomeBudget } from "./department-budget-home-repository";
import { CvRequestError } from "../MemberCV/repository";

const data: DepartmentHomeBudget = { departmentId: "department", departmentName: "Mechanical & Production", seasonId: "season", seasonCode: "S27", viewVersion: 2, approvedTotalNok: "8900.75", legacyTotalNok: "0.00", projects: [{ projectId: "project", projectName: "Frame", approvedTotalNok: "8900.75" }] };
beforeEach(() => { local.enabled = false; session.token.mockReset().mockResolvedValue("member-token"); session.failure.mockReset(); session.watch.mockClear(); });

it("uses a scoped authenticated no-store Finance read without requiring a Finance capability request", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
  const signal = new AbortController().signal;
  const repository = createDepartmentBudgetHomeRepository(undefined, request);
  expect(await repository.load("department", signal)).toEqual(data);
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith("/api/finance?action=departmentHomeBudget&departmentId=department", { signal, cache: "no-store", headers: { Authorization: "Bearer member-token" } });
});

it("never caches a private allocation across later scope checks", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(data))).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Department access was revoked." }), { status: 403 }));
  const repository = createDepartmentBudgetHomeRepository(undefined, request);
  expect(await repository.load("department")).toEqual(data);
  await expect(repository.load("department")).rejects.toMatchObject({ status: 403 });
  expect(request).toHaveBeenCalledTimes(2);
  expect(session.failure).not.toHaveBeenCalled();
});

it("ends an expired session and maps account-switch token failures to sign-in recovery", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session ended." }), { status: 401 }));
  const repository = createDepartmentBudgetHomeRepository(undefined, request);
  await expect(repository.load("department")).rejects.toMatchObject({ status: 401 });
  expect(session.failure).toHaveBeenCalledOnce();
  const changed = createDepartmentBudgetHomeRepository(async () => { throw new CvRequestError("Account changed", 403); }, request);
  await expect(changed.load("department")).rejects.toMatchObject({ status: 401 });
  expect(request).toHaveBeenCalledTimes(1);
});

it("ignores unrequested private fields and rejects mismatched or malformed projections", async () => {
  const privateResponse = { ...data, invoices: [{ token: "private" }], projects: [{ ...data.projects[0], pipeline: "private", proposedTotalNok: "50000.00" }] };
  expect(readDepartmentHomeBudget(privateResponse, "department")).toEqual(data);
  for (const value of [{ ...data, departmentId: "another" }, { ...data, approvedTotalNok: "8,900.75" }, { ...data, viewVersion: -1 }, { ...data, projects: [data.projects[0], data.projects[0]] }, null]) {
    expect(() => readDepartmentHomeBudget(value, "department")).toThrow("incomplete");
  }
});

it("allows an absent finance season and aborts without sending a request", async () => {
  expect(readDepartmentHomeBudget({ ...data, seasonId: null, approvedTotalNok: "0.00", projects: [] }, "department").seasonId).toBeNull();
  const controller = new AbortController(); controller.abort();
  const request = vi.fn();
  await expect(createDepartmentBudgetHomeRepository(undefined, request).load("department", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(request).not.toHaveBeenCalled();
  expect(session.token).not.toHaveBeenCalled();
});

it("binds its session watcher to the same account owner as its reads", () => {
  const repository = createDepartmentBudgetHomeRepository();
  const end = vi.fn(); repository.watchSession?.(end);
  expect(session.watch).toHaveBeenCalledWith(end, undefined, { current: null });
});
