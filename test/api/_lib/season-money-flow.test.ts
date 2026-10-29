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
    create table finance.seasons (id integer primary key, code text unique);
    create table finance.funding (season_id integer, funding_type text, status text, amount_ore bigint);
    create table finance.purchases (id integer primary key, season_id integer, status text, payment_method text, document_kind text);
    create table finance.purchase_lines (purchase_id integer, amount_ore bigint);
    create table finance.invoice_obligations (purchase_id integer, paid boolean);
    create table finance.outlay_reimbursements (purchase_id integer, paid boolean);
    insert into finance.seasons values (1,'S27'), (2,'S28');
    insert into finance.funding values
      (1,'sponsor_cash','received',100001), (1,'sponsor_cash','received',1),
      (1,'sponsor_cash','secured',500), (1,'grant','received',900),
      (1,'sponsor_cash','deleted',800), (2,'sponsor_cash','received',10000);
    insert into finance.purchases values
      (1,1,'registered','team_account','receipt'),
      (2,1,'registered','team_account','invoice'),
      (3,1,'registered','team_account','invoice'),
      (4,1,'registered','outlay','invoice'),
      (5,1,'registered','outlay','invoice'),
      (6,1,'registered','invoice','invoice'),
      (7,1,'voided','invoice','invoice'),
      (8,2,'registered','team_account','receipt'),
      (9,1,'registered','outlay','receipt');
    insert into finance.purchase_lines values
      (1,1000),(1,234),(2,200),(3,300),(4,400),(5,500),(6,600),(7,700),(8,800),(9,900);
    insert into finance.invoice_obligations values (2,true),(3,false),(4,true),(5,true),(6,true),(7,true);
    insert into finance.outlay_reimbursements values (4,true),(5,false),(9,true);
  `);
  db = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pg.query<T>(text, params)).rows }) };
});
afterAll(async () => { await pg.close(); });

it("sums received sponsor cash and only applicable recorded payments once per purchase", async () => {
  expect(await loadSeasonMoneyFlow(db, "S27")).toEqual({ status: "available", moneyInNok: "1000.02", moneyOutNok: "33.34" });
  expect(await loadSeasonMoneyFlow(db, "S28")).toEqual({ status: "available", moneyInNok: "100.00", moneyOutNok: "8.00" });
  expect(await loadSeasonMoneyFlow(db, null)).toEqual({ status: "no-season" });
  expect(await loadSeasonMoneyFlow(db, "S99")).toEqual({ status: "unavailable" });
  expect(await loadSeasonMoneyFlow({ query: async () => { throw new Error("offline"); } }, "S27")).toEqual({ status: "unavailable" });
});
