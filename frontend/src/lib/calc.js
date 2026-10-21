// Pure trade maths. No React, no DOM: unit-tested with `npm test`.

export const DEFAULT_FX = 1.08;

export function calcRR(entry, stop, target, direction) {
  const e = parseFloat(entry), s = parseFloat(stop), t = parseFloat(target);
  if (!e || !s || !t) return null;
  const risk = direction === "LONG" ? e - s : s - e;
  const reward = direction === "LONG" ? t - e : e - t;
  if (risk <= 0 || reward <= 0) return null;
  return parseFloat((reward / risk).toFixed(2));
}

export function calcTrade(t, fxRate) {
  const entry = parseFloat(t.entryPrice), exit = parseFloat(t.exitPrice), shares = parseFloat(t.shares);
  if (!entry || !exit || !shares) return null;
  const gross = t.direction === "LONG" ? (exit - entry) * shares : (entry - exit) * shares;
  const pct = t.direction === "LONG" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
  const comm = (parseFloat(t.commissionEntry) || 0) + (parseFloat(t.commissionExit) || 0);
  const net = gross - comm;
  const currency = t.currency || "EUR";
  const rate = currency === "USD" ? fxRate : 1;
  return {
    pnl: +net.toFixed(2),
    pnlEur: +(net / rate).toFixed(2),
    gross: +gross.toFixed(2),
    comm: +comm.toFixed(2),
    pct: +pct.toFixed(2),
    currency,
  };
}

const sum = (list, pick) => list.reduce((a, x) => a + pick(x), 0);

export function calcMetrics(trades, fxRate) {
  const closed = trades
    .filter((t) => t.exitPrice && t.entryPrice && t.shares)
    .sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));
  const rows = closed.map((t) => ({ trade: t, r: calcTrade(t, fxRate) })).filter((x) => x.r);
  if (!rows.length) return null;

  const results = rows.map((x) => x.r);
  const winners = results.filter((r) => r.pnlEur > 0);
  const losers = results.filter((r) => r.pnlEur < 0);
  const wr = (winners.length / results.length) * 100;
  const grossWin = sum(winners, (r) => r.pnlEur);
  const grossLoss = Math.abs(sum(losers, (r) => r.pnlEur));
  const avgWin = winners.length ? grossWin / winners.length : 0;
  const avgLoss = losers.length ? grossLoss / losers.length : 0;
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;
  // Expectancy is the plain average result per trade (breakevens count as zero).
  const expectancy = sum(results, (r) => r.pnlEur) / results.length;
  const totalEur = sum(results, (r) => r.pnlEur);
  const commEur = sum(results, (r) => (r.currency === "USD" ? r.comm / fxRate : r.comm));
  const compounded = results.reduce((acc, r) => acc * (1 + r.pct / 100), 1);

  // Cumulative P&L curve (EUR) and max drawdown from its running peak.
  let running = 0, peak = 0, maxDrawdown = 0;
  const curve = rows.map(({ trade, r }) => {
    running += r.pnlEur;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
    return { date: trade.date, value: +running.toFixed(2) };
  });

  const group = (keyOf) => rows.reduce((acc, { trade, r }) => {
    const key = keyOf(trade);
    if (!key) return acc;
    const g = (acc[key] ||= { count: 0, wins: 0, pnlEur: 0 });
    g.count++;
    if (r.pnlEur > 0) g.wins++;
    g.pnlEur += r.pnlEur;
    return acc;
  }, {});

  return {
    total: results.length,
    winners: winners.length,
    losers: losers.length,
    winRate: wr.toFixed(1),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    rr: rr.toFixed(2),
    profitFactor: grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : null,
    expectancy: expectancy.toFixed(2),
    totalPnlEur: totalEur.toFixed(2),
    compoundedReturn: ((compounded - 1) * 100).toFixed(2),
    totalCommEur: commEur.toFixed(2),
    maxDrawdownEur: maxDrawdown.toFixed(2),
    curve,
    bySetup: group((t) => t.setupType),
    byPlan: group((t) => (t.siguioPlan === "NO" ? "withoutPlan" : "withPlan")),
  };
}

const CSV_COLUMNS = [
  "date", "ticker", "currency", "direction", "entryPrice", "exitPrice", "shares",
  "stopLoss", "targetPrice", "commissionEntry", "commissionExit", "duration", "durationUnit",
  "expectedDuration", "expectedDurationUnit", "setupType", "motivo", "siguioPlan", "notas",
];

function csvCell(value) {
  let text = String(value ?? "");
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a text cell).
  if (/^[=+@]/.test(text) || (/^-/.test(text) && Number.isNaN(Number(text)))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tradesToCsv(trades) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const t of trades) lines.push(CSV_COLUMNS.map((c) => csvCell(t[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

// Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF/LF).
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// Turns a CSV produced by tradesToCsv back into trade objects (server re-validates each one).
export function csvToTrades(text) {
  const [header, ...body] = parseCsv(text);
  if (!header || !header.includes("ticker") || !header.includes("entryPrice")) {
    throw Object.assign(new Error("El CSV no tiene el formato esperado (faltan columnas ticker/entryPrice)"), { code: "csvFormat" });
  }
  return body.map((cells) => Object.fromEntries(header.map((h, i) => {
    let v = cells[i] ?? "";
    if (v.startsWith("'") && /^'[=+@-]/.test(v)) v = v.slice(1); // undo formula neutralisation
    return [h, v];
  })));
}
