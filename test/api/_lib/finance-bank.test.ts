import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { loadBankSnapshot } from "../../../api/_lib/finance-bank.js";
import type { CvDatabase, WorkspaceIdentity } from "../../../api/_lib/member-cv-service.js";

const finance = "20000000-0000-4000-8000-000000000001";
const member = "20000000-0000-4000-8000-000000000002";
const outsider = "20000000-0000-4000-8000-000000000003";
const ids: Record<string, WorkspaceIdentity> = Object.fromEntries([finance, member, outsider].map((id, i) => [id, { userId: id, googleSub: `sub${i}`, email: `m${i}@example.test`, name: `Member ${i}` }]));
let pg: PGlite;
let db: CvDatabase;
let service: ReturnType<typeof createFinanceServices>;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create schema identity;
    create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
    create table identity.departments (department_key text primary key, name text not null, sort_order smallint);
    create table identity.platform_roles (role_key text primary key, label text not null, sort_order smallint not null unique);
    create table identity.member_roles (member_id uuid not null, role_key text not null, primary key (member_id, role_key));
    create table identity.member_departments (member_id uuid primary key, department_key text not null);
    insert into identity.members values ('${finance}', 'sub0', 'm0@example.test', 'Finance'), ('${member}', 'sub1', 'm1@example.test', 'Member'), ('${outsider}', 'sub2', 'm2@example.test', 'Outsider');
    insert into identity.member_roles values ('${finance}', 'financials'), ('${member}', 'financials');`);
  for (const file of ["011_finance_core.sql", "024_financials_member_role.sql", "034_finance_bank_snapshot.sql"]) await pg.exec(readFileSync(new URL(`../../../db/migrations/${file}`, import.meta.url), "utf8"));
  db = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
  service = createFinanceServices({ db, authenticate: async token => ids[token] });
});
afterAll(async () => { await pg.close(); });

it("protects writes, preserves exact zero and idempotently rejects conflicting changes", async () => {
  const cmd = { action: "setBankSnapshot", amountNok: "0", asOfDate: "2026-10-29", expectedRevision: 0, requestId: "10000000-0000-4000-8000-000000000001" };
  expect(await loadBankSnapshot(db)).toBeNull();
  await expect(service.mutate(outsider, cmd)).rejects.toMatchObject({ status: 403 });
  await expect(service.bankSnapshot(outsider)).rejects.toMatchObject({ status: 403 });
  const first = await service.mutate(finance, cmd);
  expect(first).toMatchObject({ ok: true, revision: 1 });
  expect(await service.bankSnapshot(member)).toMatchObject({ amountNok: "0.00", asOfDate: "2026-10-29", revision: 1 });
  expect(await service.mutate(finance, cmd)).toEqual(first);
  await expect(service.mutate(finance, { ...cmd, amountNok: "99" })).rejects.toMatchObject({ status: 409 });
  await expect(service.mutate(finance, { ...cmd, requestId: "10000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ status: 409 });
  await expect(service.mutate(finance, { ...cmd, expectedRevision: 1, requestId: "10000000-0000-4000-8000-000000000003", asOfDate: "2026-02-30" })).rejects.toMatchObject({ status: 400 });
  const updated = await service.mutate(finance, { ...cmd, expectedRevision: 1, requestId: "10000000-0000-4000-8000-000000000004", amountNok: "1 234,56" });
  expect(updated.revision).toBe(2);
  expect(await loadBankSnapshot(db)).toMatchObject({ amountNok: "1234.56", revision: 2 });
  expect((await pg.query("select * from finance.audit_log where entity = 'bank_snapshot'")).rows).toHaveLength(4);
});
