import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { loadIncomeReceipts } from "../../../api/_lib/finance-income-receipts.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { seasonIncomeTotals } from "../../../src/features/Finance/financing-income-model.js";

it("registers and voids sourced payments, without exposing details to aggregate readers or counting a retry twice", async () => {
  const finance = { userId: "21000000-0000-4000-8000-000000000001", googleSub: "finance", email: "finance@example.test", name: "Finance" };
  const member = { userId: "21000000-0000-4000-8000-000000000002", googleSub: "member", email: "member@example.test", name: "Member" };
  const pg = new PGlite();
  const db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  try {
    await pg.exec(`create schema identity;
      create table identity.members (id uuid primary key, google_sub text not null, email text not null, full_name text not null);
      create table identity.departments (department_key text primary key, name text not null, sort_order smallint);
      create table identity.platform_roles (role_key text primary key, label text not null, sort_order smallint not null unique);
      create table identity.member_roles (member_id uuid not null, role_key text not null, primary key (member_id, role_key));
      create table identity.member_departments (member_id uuid primary key, department_key text not null);
      create role authenticated;
    `);
    for (const actor of [finance, member]) {
      await pg.query("insert into identity.members values ($1, $2, $3, $4)", [actor.userId, actor.googleSub, actor.email, actor.name]);
    }
    for (const migration of ["011_finance_core", "014_finance_register_purchases", "024_financials_member_role", "085_finance_income_receipts"]) {
      await pg.exec(readFileSync(new URL(`../../../db/migrations/${migration}.sql`, import.meta.url), "utf8"));
    }
    expect((await pg.query(`select has_table_privilege('authenticated', 'finance.income_receipts', 'SELECT,INSERT,UPDATE,DELETE') as receipts,
      has_function_privilege('authenticated', 'finance.apply_income_change(uuid,uuid,text,jsonb)', 'EXECUTE') as mutation`)).rows)
      .toEqual([{ receipts: false, mutation: false }]);
    await pg.query("insert into identity.member_roles values ($1, 'financials')", [finance.userId]);
    await pg.query(`insert into finance.seasons(code, name, start_date, end_date, status, created_by_member_id, updated_by_member_id)
      values ('S27', 'Season 27', '2026-08-01', '2027-07-31', 'active', $1, $1)`, [finance.userId]);
    await pg.query(`insert into finance.settings(setting_key, setting_value, description, updated_by_member_id)
      values ('current_season', '"S27"', 'Current season', $1)`, [finance.userId]);
    const service = createFinanceServices({ db, authenticate: async token => token === "finance" ? finance : member });
    const command = {
      action: "registerIncome", requestId: crypto.randomUUID(), seasonCode: "S27", category: "sales",
      source: "Welcome event hoodies", amountNok: "1 234,56", receivedOn: "2026-11-20", method: "vipps", reference: "SETTLEMENT-1",
    };
    await expect(service.mutate("member", command)).rejects.toMatchObject({ status: 403 });
    await expect(service.mutate("finance", { ...command, source: "  " })).rejects.toMatchObject({
      status: 400, errors: [expect.objectContaining({ field: "source" })],
    });
    await expect(service.mutate("finance", { ...command, seasonCode: "S26" })).rejects.toMatchObject({ status: 409 });

    const saved = await service.mutate("finance", command);
    expect(await service.mutate("finance", command)).toEqual(saved);
    await expect(service.mutate("finance", { ...command, amountNok: "999" })).rejects.toMatchObject({ status: 409 });
    await expect(service.mutate("finance", { ...command, requestId: crypto.randomUUID(), reference: " settlement-1 " })).rejects.toMatchObject({
      status: 409, errors: [expect.objectContaining({ field: "reference" })],
    });
    const amountByDate = { receivedDate: "2026-11-20", amountNok: "1234.56" };
    const income = await loadIncomeReceipts(db, "S27", true);
    expect(income).toEqual({ receivedNok: "1234.56", receivedByDate: [amountByDate], records: [{
      id: saved.id, category: "sales", source: "Welcome event hoodies", amountNok: "1234.56",
      receivedOn: "2026-11-20", method: "vipps", reference: "SETTLEMENT-1", voidReason: null,
    }] });
    expect(await loadIncomeReceipts(db, "S27", false)).toEqual({ receivedNok: "1234.56", receivedByDate: [amountByDate] });
    expect(seasonIncomeTotals({ viewVersion: saved.viewVersion, seasonCode: "S27", funding: [], parts: [], scenarios: [], incomeReceipts: income }))
      .toEqual({ receivedNok: "1234.56", outstandingNok: "0.00", totalNok: "1234.56" });

    const voidCommand = { action: "voidIncome", requestId: crypto.randomUUID(), seasonCode: "S27", receiptId: saved.id, reason: "Correcting the amount" };
    const voided = await service.mutate("finance", voidCommand);
    expect(await service.mutate("finance", voidCommand)).toEqual(voided);
    expect(await loadIncomeReceipts(db, "S27", true)).toMatchObject({
      receivedNok: "0.00", receivedByDate: [], records: [{ id: saved.id, voidReason: "Correcting the amount" }],
    });
    expect((await pg.query("select new_value from finance.audit_log where entity_id=$1 order by occurred_at", [saved.id])).rows)
      .toEqual([{ new_value: "recorded" }, { new_value: "voided" }]);
    await expect(service.mutate("finance", { ...command, requestId: crypto.randomUUID(), amountNok: "100.00" })).resolves.toMatchObject({ ok: true });
    expect(await loadIncomeReceipts(db, "S27", false)).toEqual({ receivedNok: "100.00", receivedByDate: [{ ...amountByDate, amountNok: "100.00" }] });

    await expect(service.mutate("finance", {
      ...command, requestId: crypto.randomUUID(), category: "donations",
      source: "Alumni supporter", amountNok: "50", reference: null,
    })).resolves.toMatchObject({ ok: true });
    expect(await loadIncomeReceipts(db, "S27", true)).toMatchObject({
      receivedNok: "150.00",
      records: expect.arrayContaining([expect.objectContaining({ category: "donations", source: "Alumni supporter" })]),
    });
    await pg.query(`insert into finance.funding (season_id, public_ref, source_name, owner_name, funding_type, amount_ore,
      status, received_date, created_by_member_id, updated_by_member_id)
      select id, 'F-S27-001', 'Member A', 'Finance', 'membership', 12500, 'received', '2026-11-20', $1, $1
      from finance.seasons where code = 'S27'`, [finance.userId]);
    const legacyMatch = { ...command, requestId: crypto.randomUUID(), category: "membership_dues",
      source: "member a", amountNok: "125", reference: "BANK-123" };
    await expect(service.mutate("finance", legacyMatch)).rejects.toMatchObject({
      status: 409, errors: [expect.objectContaining({ field: "acceptSimilarIncome" })],
    });
    const separatePayment = { ...legacyMatch, source: "Another member" };
    await expect(service.mutate("finance", separatePayment)).resolves.toMatchObject({ ok: true });
    const matchingReceipt = { ...separatePayment, requestId: crypto.randomUUID(), reference: null };
    await expect(service.mutate("finance", matchingReceipt)).rejects.toMatchObject({
      status: 409, errors: [expect.objectContaining({ field: "acceptSimilarIncome" })],
    });
    const acknowledged = await service.mutate("finance", { ...matchingReceipt, acceptSimilarIncome: true });
    expect(await service.mutate("finance", matchingReceipt)).toEqual(acknowledged);
    expect((await pg.query("select reason, actor_member_id from finance.audit_log where entity_id=$1", [acknowledged.id])).rows)
      .toEqual([{ reason: "Similar payment confirmed", actor_member_id: finance.userId }]);
    await expect(service.mutate("finance", { ...legacyMatch, requestId: crypto.randomUUID(), acceptSimilarIncome: true })).rejects.toMatchObject({
      status: 409, errors: [expect.objectContaining({ field: "reference" })],
    });
    await pg.query("delete from identity.member_roles where member_id = $1", [finance.userId]);
    await expect(service.mutate("finance", matchingReceipt)).rejects.toMatchObject({ status: 403 });
    await expect(service.financing("finance")).rejects.toMatchObject({ status: 403 });
  } finally {
    await pg.close();
  }
}, 15000);
