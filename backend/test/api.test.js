const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("authenticated trade CRUD and settings", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "trading-journal-"));
  const port = 32000 + (process.pid % 1000);
  let stderr = "";

  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      TRUST_PROXY_HOPS: "0",
      TJ_USER: "test-user",
      TJ_PASSWORD: "test-password-not-for-production",
      JWT_SECRET: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) break;
    } catch {}
    if (attempt === 49) assert.fail(`backend did not start: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  let res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "wrong" }),
  });
  assert.equal(res.status, 401);

  res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "test-password-not-for-production" }),
  });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  assert.ok(token);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const trade = {
    date: "2026-10-04",
    ticker: "MSFT",
    currency: "USD",
    direction: "LONG",
    entryPrice: 100,
    exitPrice: 110,
    shares: 2,
    stopLoss: 95,
    targetPrice: 115,
    commissionEntry: 1,
    commissionExit: 1,
    duration: "3",
    durationUnit: "h",
    expectedDuration: "1",
    expectedDurationUnit: "d",
    setupType: "Ruptura",
    motivo: "Test",
    siguioPlan: "SI",
    notas: "Integration test",
  };

  res = await fetch(`${base}/trades`, {
    method: "POST",
    headers,
    body: JSON.stringify(trade),
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(Number.isInteger(created.id));

  res = await fetch(`${base}/trades`, { headers });
  assert.equal(res.status, 200);
  let trades = await res.json();
  assert.equal(trades.length, 1);
  assert.equal(trades[0].ticker, "MSFT");

  res = await fetch(`${base}/trades/${created.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...trade, exitPrice: 112 }),
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/trades`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...trade, entryPrice: -1 }),
  });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/settings/fxRate`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: 1.15 }),
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/settings`, { headers });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).fxRate, "1.15");

  res = await fetch(`${base}/trades/${created.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(res.status, 200);

  res = await fetch(`${base}/trades`, { headers });
  trades = await res.json();
  assert.equal(trades.length, 0);
});
