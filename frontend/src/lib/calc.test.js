import test from "node:test";
import assert from "node:assert/strict";
import { calcRR, calcTrade, calcMetrics, tradesToCsv } from "./calc.js";

const base = { currency: "EUR", direction: "LONG", entryPrice: 100, exitPrice: 110, shares: 10, commissionEntry: 0, commissionExit: 0, date: "2026-01-01", createdAt: 1 };

test("calcRR handles long, short and invalid setups", () => {
  assert.equal(calcRR(100, 95, 110, "LONG"), 2);
  assert.equal(calcRR(100, 105, 90, "SHORT"), 2);
  assert.equal(calcRR(100, 105, 110, "LONG"), null);
  assert.equal(calcRR("", 95, 110, "LONG"), null);
});

test("calcTrade computes net P&L, commissions and FX", () => {
  const long = calcTrade({ ...base, commissionEntry: 1, commissionExit: 1 }, 1.08);
  assert.equal(long.gross, 100);
  assert.equal(long.pnl, 98);
  assert.equal(long.pct, 10);
  const short = calcTrade({ ...base, direction: "SHORT", exitPrice: 90 }, 1.08);
  assert.equal(short.pnl, 100);
  const usd = calcTrade({ ...base, currency: "USD", exitPrice: 108 }, 2);
  assert.equal(usd.pnl, 80);
  assert.equal(usd.pnlEur, 40);
  assert.equal(calcTrade({ ...base, exitPrice: null }, 1.08), null);
});

test("calcMetrics returns null without closed trades", () => {
  assert.equal(calcMetrics([], 1.08), null);
  assert.equal(calcMetrics([{ ...base, exitPrice: null }], 1.08), null);
});

test("calcMetrics aggregates win rate, profit factor, expectancy and drawdown", () => {
  const trades = [
    { ...base, date: "2026-01-01", exitPrice: 120, setupType: "Ruptura" },            // +200
    { ...base, date: "2026-01-02", exitPrice: 95, setupType: "Ruptura", siguioPlan: "NO" }, // -50
    { ...base, date: "2026-01-03", exitPrice: 90, setupType: "Pullback" },            // -100
    { ...base, date: "2026-01-04", exitPrice: 100 },                                  // 0
  ];
  const m = calcMetrics(trades, 1.08);
  assert.equal(m.total, 4);
  assert.equal(m.winRate, "25.0");
  assert.equal(m.profitFactor, "1.33");
  assert.equal(m.expectancy, "12.50");
  assert.equal(m.totalPnlEur, "50.00");
  assert.equal(m.maxDrawdownEur, "150.00");
  assert.deepEqual(m.curve.map((p) => p.value), [200, 150, 50, 50]);
  assert.equal(m.bySetup.Ruptura.count, 2);
  assert.equal(m.byPlan.withoutPlan.count, 1);
  assert.equal(m.byPlan.withPlan.count, 3);
});

test("calcMetrics orders the curve by date, not input order", () => {
  const m = calcMetrics([
    { ...base, date: "2026-02-01", exitPrice: 90 },
    { ...base, date: "2026-01-01", exitPrice: 120 },
  ], 1.08);
  assert.deepEqual(m.curve.map((p) => p.date), ["2026-01-01", "2026-02-01"]);
});

test("profit factor is null when there are no losses", () => {
  assert.equal(calcMetrics([{ ...base }], 1.08).profitFactor, null);
});

test("tradesToCsv escapes quotes, commas and formula injection", () => {
  const csv = tradesToCsv([{ ...base, ticker: "AAPL", motivo: 'say "hi", ok', notas: "=HYPERLINK(1)" }]);
  const [header, row] = csv.trim().split("\r\n");
  assert.ok(header.startsWith("date,ticker"));
  assert.ok(row.includes('"say ""hi"", ok"'));
  assert.ok(row.includes("'=HYPERLINK(1)"));
});

test("CSV export/import round-trips tricky values", async () => {
  const { csvToTrades } = await import("./calc.js");
  const original = [{ ...base, ticker: "AAPL", motivo: 'multi\nline, "quoted"', notas: "=1+1" }];
  const back = csvToTrades(tradesToCsv(original));
  assert.equal(back.length, 1);
  assert.equal(back[0].ticker, "AAPL");
  assert.equal(back[0].motivo, 'multi\nline, "quoted"');
  assert.equal(back[0].notas, "=1+1");
  assert.equal(back[0].entryPrice, "100");
});

test("csvToTrades rejects unrelated CSV files", async () => {
  const { csvToTrades } = await import("./calc.js");
  assert.throws(() => csvToTrades("a,b\n1,2\n"), /formato/);
});
