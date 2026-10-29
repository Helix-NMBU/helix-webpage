import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { loadSeasonMoneyFlow } from "../../../api/_lib/season-money-flow.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";

let pg: PGlite;
let db: CvDatabase;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema finance;
    create table finance.seasons (id integer primary key, code text unique, end_date date);
    create table finance.funding (season_id integer, funding_type text, status text, amount_ore bigint, received_date date);
    create table finance.purchases (id integer primary key, season_id integer, status text, payment_method text, document_kind text, purchase_date date);
    create table finance.purchase_lines (purchase_id integer, amount_ore bigint);
    create table finance.invoice_obligations (purchase_id integer, paid boolean, paid_on date);
    create table finance.outlay_reimbursements (purchase_id integer, paid boolean, paid_on date);
    insert into finance.seasons values (1,'S27','2027-07-31'), (2,'S28','2028-07-31');
    insert into finance.funding values
      (1,'sponsor_cash','received',100001,'2026-09-15'), (1,'sponsor_cash','received',1,'2026-09-15'),
      (1,'sponsor_cash','secured',500,'2026-09-15'), (1,'grant','received',900,'2026-09-15'),
      (1,'sponsor_cash','deleted',800,'2026-09-15'), (2,'sponsor_cash','received',10000,'2026-09-15');
    insert into finance.purchases values
      (1,1,'registered','team_account','receipt','2026-10-05'),
      (2,1,'registered','team_account','invoice','2026-10-05'),
      (3,1,'registered','team_account','invoice','2026-10-05'),
      (4,1,'registered','outlay','invoice','2026-10-05'),
      (5,1,'registered','outlay','invoice','2026-10-05'),
      (6,1,'registered','invoice','invoice','2026-10-05'),
      (7,1,'voided','invoice','invoice','2026-10-05'),
      (8,2,'registered','team_account','receipt','2026-10-05'),
      (9,1,'registered','outlay','receipt','2026-10-05');
    insert into finance.purchase_lines values
      (1,1000),(1,234),(2,200),(3,300),(4,400),(5,500),(6,600),(7,700),(8,800),(9,900);
    insert into finance.invoice_obligations values (2,true,'2026-11-01'),(3,false,null),(4,true,'2026-11-01'),(5,true,'2026-11-01'),(6,true,'2027-01-02'),(7,true,'2027-01-02');
    insert into finance.outlay_reimbursements values (4,true,'2026-12-10'),(5,false,null),(9,true,'2027-07-01');
  `);
  db = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query<T>(text, params)).rows }) };
});
afterAll(async () => { await pg.close(); });

it("sums received sponsor cash and only applicable recorded payments once per purchase", async () => {
  const view = await loadSeasonMoneyFlow(db, "S27");
  expect(view).toMatchObject({ status: "available", moneyInNok: "1000.02", moneyOutNok: "33.34", otherInNok: "0.00", otherOutNok: "0.00" });
  if (view.status !== "available") throw new Error("Missing flow");
  expect(view.months).toHaveLength(11);
  expect(view.months[0]).toEqual({ month: "2026-09", moneyInNok: "1000.02", moneyOutNok: "0.00" });
  expect(view.months[1]).toEqual({ month: "2026-10", moneyInNok: "0.00", moneyOutNok: "12.34" });
  expect(view.months[2].moneyOutNok).toBe("2.00");
  expect(view.months[3].moneyOutNok).toBe("4.00");
  expect(view.months[10].moneyOutNok).toBe("9.00");
  expect(await loadSeasonMoneyFlow(db, "S28")).toMatchObject({ status: "available", moneyInNok: "100.00", moneyOutNok: "8.00", otherInNok: "100.00", otherOutNok: "8.00" });
  expect(await loadSeasonMoneyFlow(db, null)).toEqual({ status: "no-season" });
  expect(await loadSeasonMoneyFlow(db, "S99")).toEqual({ status: "unavailable" });
  expect(await loadSeasonMoneyFlow({ query: async () => { throw new Error("offline"); } }, "S27")).toEqual({ status: "unavailable" });
});

it("keeps undated and outside-chart funding in the total without assigning a month", async () => {
  await pg.exec("insert into finance.funding values (1,'sponsor_cash','received',5000,null), (1,'sponsor_cash','received',1200,'2026-08-15')");
  const view = await loadSeasonMoneyFlow(db, "S27");
  expect(view).toMatchObject({ status: "available", moneyInNok: "1062.02", otherInNok: "62.00" });
  if (view.status === "available") expect(view.months[0].moneyInNok).toBe("1000.02");
});
