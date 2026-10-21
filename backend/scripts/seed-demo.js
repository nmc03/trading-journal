// Seeds a running Trading Journal with synthetic demo trades (used for README screenshots).
// Usage: TJ_URL=http://localhost:3001 TJ_USER=... TJ_PASSWORD=... node scripts/seed-demo.js
const base = (process.env.TJ_URL || "http://localhost:3001") + "/api";

const demo = [
  ["2026-09-02", "NVDA", "USD", "LONG", 118.4, 126.9, 20, 114, 128, "Ruptura", "SI"],
  ["2026-09-04", "AAPL", "USD", "LONG", 221.5, 218.2, 10, 217, 232, "Pullback", "SI"],
  ["2026-09-08", "SAN.MC", "EUR", "LONG", 4.62, 4.81, 500, 4.5, 4.9, "Tendencia", "SI"],
  ["2026-09-11", "TSLA", "USD", "SHORT", 248.0, 236.5, 8, 255, 230, "Reversión", "SI"],
  ["2026-09-15", "MSFT", "USD", "LONG", 431.2, 424.0, 5, 424, 450, "Ruptura", "NO"],
  ["2026-09-18", "ITX.MC", "EUR", "LONG", 52.3, 54.9, 40, 50.5, 55, "Pullback", "SI"],
  ["2026-09-22", "AMD", "USD", "LONG", 152.8, 160.4, 15, 148, 162, "Tendencia", "SI"],
  ["2026-09-25", "META", "USD", "SHORT", 575.0, 588.0, 4, 590, 545, "Rango", "NO"],
  ["2026-09-29", "BBVA.MC", "EUR", "LONG", 10.15, 10.62, 200, 9.9, 10.8, "S/R", "SI"],
  ["2026-10-02", "AMZN", "USD", "LONG", 186.0, 195.1, 12, 180, 197, "Ruptura", "SI"],
  ["2026-10-06", "NFLX", "USD", "LONG", 710.0, 698.5, 3, 695, 750, "Pullback", "SI"],
  ["2026-10-09", "REP.MC", "EUR", "LONG", 14.2, 14.95, 150, 13.8, 15.2, "Tendencia", "SI"],
  ["2026-10-14", "GOOGL", "USD", "LONG", 171.4, null, 14, 166, 185, "Ruptura", "SI"],
  ["2026-10-16", "IBE.MC", "EUR", "LONG", 15.1, null, 120, 14.7, 16.2, "S/R", "SI"],
];

async function main() {
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.TJ_USER, password: process.env.TJ_PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const { token } = await login.json();
  for (const [date, ticker, currency, direction, entryPrice, exitPrice, shares, stopLoss, targetPrice, setupType, siguioPlan] of demo) {
    const res = await fetch(`${base}/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        date, ticker, currency, direction, entryPrice, exitPrice: exitPrice ?? "", shares, stopLoss, targetPrice,
        commissionEntry: 1, commissionExit: exitPrice ? 1 : 0, setupType, siguioPlan,
        motivo: "Demo trade", notas: "Synthetic data for screenshots",
      }),
    });
    if (!res.ok) throw new Error(`${ticker}: ${res.status} ${await res.text()}`);
  }
  console.log(`Seeded ${demo.length} demo trades`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
