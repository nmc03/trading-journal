const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { pickLang, translate } = require("./i18n");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DB_PATH = path.join(DATA_DIR, "trading.db");

const { TJ_USER, TJ_PASSWORD, JWT_SECRET } = process.env;
if (!TJ_USER || !TJ_PASSWORD || !JWT_SECRET) {
  console.error("Faltan variables: TJ_USER, TJ_PASSWORD, JWT_SECRET");
  process.exit(1);
}
if (
  TJ_PASSWORD === "cambia-esta-contrasena-segura" ||
  JWT_SECRET === "genera-una-clave-aleatoria-larga-aqui" ||
  JWT_SECRET.length < 32
) {
  console.error("Configura una contraseña real y un JWT_SECRET aleatorio de al menos 32 caracteres");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const PASSWORD_HASH = bcrypt.hashSync(TJ_PASSWORD, 12);
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "0", 10);
app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 0);

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
}));
// "upgrade-insecure-requests" would break plain-HTTP LAN deployments, so it is switched off.
app.use(helmet({ contentSecurityPolicy: { directives: { "upgrade-insecure-requests": null } } }));
app.use(express.json({ limit: "100kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: tr(req, "tooManyAttempts") }),
});

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    ticker TEXT NOT NULL,
    currency TEXT DEFAULT 'USD',
    direction TEXT DEFAULT 'LONG',
    entryPrice REAL NOT NULL,
    exitPrice REAL,
    shares REAL NOT NULL,
    stopLoss REAL,
    targetPrice REAL,
    commissionEntry REAL DEFAULT 0,
    commissionExit REAL DEFAULT 0,
    duration TEXT DEFAULT '',
    durationUnit TEXT DEFAULT 'min',
    expectedDuration TEXT DEFAULT '',
    expectedDurationUnit TEXT DEFAULT 'h',
    setupType TEXT DEFAULT '',
    motivo TEXT DEFAULT '',
    siguioPlan TEXT DEFAULT 'SI',
    notas TEXT DEFAULT '',
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('fxRate', '1.08');
`);

for (const sql of [
  "ALTER TABLE trades ADD COLUMN stopLoss REAL",
  "ALTER TABLE trades ADD COLUMN targetPrice REAL",
  "ALTER TABLE trades ADD COLUMN expectedDuration TEXT DEFAULT ''",
  "ALTER TABLE trades ADD COLUMN expectedDurationUnit TEXT DEFAULT 'h'",
  "ALTER TABLE trades ADD COLUMN setupType TEXT DEFAULT ''",
]) {
  try { db.exec(sql); } catch {}
}

class ValidationError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

const tr = (req, code, params) => translate(pickLang(req), code, params);

function requiredText(value, field, max) {
  const text = String(value ?? "").trim();
  if (!text) throw new ValidationError("required", { field });
  if (text.length > max) throw new ValidationError("tooLong", { field });
  return text;
}

function optionalText(value, field, max) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new ValidationError("tooLong", { field });
  return text;
}

function positiveNumber(value, field, required = false) {
  if (value === "" || value === null || value === undefined) {
    if (required) throw new ValidationError("required", { field });
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new ValidationError("positive", { field });
  }
  return number;
}

function nonNegativeNumber(value, field) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ValidationError("nonNegative", { field });
  }
  return number;
}

function enumValue(value, field, allowed, fallback) {
  const normalized = String(value ?? fallback);
  if (!allowed.includes(normalized)) {
    throw new ValidationError("invalid", { field });
  }
  return normalized;
}

function validDate(value) {
  const date = requiredText(value, "date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("dateInvalid", { field: "date" });
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError("dateInvalid", { field: "date" });
  }
  return date;
}

function tradeParams(input = {}) {
  const ticker = requiredText(input.ticker, "ticker", 20).toUpperCase();
  if (!/^[A-Z0-9.^=_-]+$/.test(ticker)) {
    throw new ValidationError("tickerChars", { field: "ticker" });
  }

  return {
    date: validDate(input.date),
    ticker,
    currency: enumValue(input.currency, "currency", ["USD", "EUR"], "USD"),
    direction: enumValue(input.direction, "direction", ["LONG", "SHORT"], "LONG"),
    entryPrice: positiveNumber(input.entryPrice, "entryPrice", true),
    exitPrice: positiveNumber(input.exitPrice, "exitPrice"),
    shares: positiveNumber(input.shares, "shares", true),
    stopLoss: positiveNumber(input.stopLoss, "stopLoss"),
    targetPrice: positiveNumber(input.targetPrice, "targetPrice"),
    commissionEntry: nonNegativeNumber(input.commissionEntry, "commissionEntry"),
    commissionExit: nonNegativeNumber(input.commissionExit, "commissionExit"),
    duration: optionalText(input.duration, "duration", 20),
    durationUnit: enumValue(input.durationUnit, "durationUnit", ["min", "h", "d"], "min"),
    expectedDuration: optionalText(input.expectedDuration, "expectedDuration", 20),
    expectedDurationUnit: enumValue(
      input.expectedDurationUnit,
      "expectedDurationUnit",
      ["h", "d", "sem"],
      "h"
    ),
    setupType: enumValue(
      input.setupType,
      "setupType",
      ["", "Ruptura", "Pullback", "Tendencia", "Reversión", "Rango", "S/R", "Otro"],
      ""
    ),
    motivo: optionalText(input.motivo, "motivo", 500),
    siguioPlan: enumValue(input.siguioPlan, "siguioPlan", ["SI", "NO"], "SI"),
    notas: optionalText(input.notas, "notas", 4000),
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("idInvalid");
  return id;
}

function handleRoute(res, fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: tr(res.req, error.code, error.params), code: error.code });
    }
    console.error(error);
    return res.status(500).json({ error: tr(res.req, "internal") });
  }
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: tr(req, "unauthorized") });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    return res.status(401).json({ error: tr(req, "tokenInvalid") });
  }
}

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  setTimeout(() => {
    const userOk = username === TJ_USER;
    const passOk = bcrypt.compareSync(password || "", PASSWORD_HASH);
    if (!userOk || !passOk) return res.status(401).json({ error: tr(req, "credentials") });
    const token = jwt.sign({ username }, JWT_SECRET, { algorithm: "HS256", expiresIn: "8h" });
    return res.json({ token });
  }, 300);
});

app.get("/api/auth/verify", requireAuth, (_req, res) => res.json({ ok: true }));

app.get("/api/trades", requireAuth, (_req, res) => {
  handleRoute(res, () => res.json(db.prepare("SELECT * FROM trades ORDER BY createdAt DESC").all()));
});

app.post("/api/trades", requireAuth, (req, res) => {
  handleRoute(res, () => {
    const p = tradeParams(req.body);
    const createdAt = Date.now();
    const result = db.prepare(`INSERT INTO trades
      (date,ticker,currency,direction,entryPrice,exitPrice,shares,
       stopLoss,targetPrice,commissionEntry,commissionExit,
       duration,durationUnit,expectedDuration,expectedDurationUnit,
       setupType,motivo,siguioPlan,notas,createdAt)
      VALUES
      (@date,@ticker,@currency,@direction,@entryPrice,@exitPrice,@shares,
       @stopLoss,@targetPrice,@commissionEntry,@commissionExit,
       @duration,@durationUnit,@expectedDuration,@expectedDurationUnit,
       @setupType,@motivo,@siguioPlan,@notas,@createdAt)`)
      .run({ ...p, createdAt });
    return res.status(201).json({ ok: true, id: Number(result.lastInsertRowid), createdAt });
  });
});

app.put("/api/trades/:id", requireAuth, (req, res) => {
  handleRoute(res, () => {
    const id = parseId(req.params.id);
    const p = tradeParams(req.body);
    const result = db.prepare(`UPDATE trades SET
      date=@date, ticker=@ticker, currency=@currency, direction=@direction,
      entryPrice=@entryPrice, exitPrice=@exitPrice, shares=@shares,
      stopLoss=@stopLoss, targetPrice=@targetPrice,
      commissionEntry=@commissionEntry, commissionExit=@commissionExit,
      duration=@duration, durationUnit=@durationUnit,
      expectedDuration=@expectedDuration, expectedDurationUnit=@expectedDurationUnit,
      setupType=@setupType, motivo=@motivo, siguioPlan=@siguioPlan, notas=@notas
      WHERE id=@id`)
      .run({ ...p, id });
    if (!result.changes) return res.status(404).json({ error: tr(res.req, "notFound") });
    return res.json({ ok: true });
  });
});

app.delete("/api/trades/:id", requireAuth, (req, res) => {
  handleRoute(res, () => {
    const result = db.prepare("DELETE FROM trades WHERE id=?").run(parseId(req.params.id));
    if (!result.changes) return res.status(404).json({ error: tr(res.req, "notFound") });
    return res.json({ ok: true });
  });
});

app.get("/api/settings", requireAuth, (_req, res) => {
  handleRoute(res, () => {
    const settings = {};
    db.prepare("SELECT key,value FROM settings").all().forEach((row) => {
      settings[row.key] = row.value;
    });
    return res.json(settings);
  });
});

app.put("/api/settings/:key", requireAuth, (req, res) => {
  handleRoute(res, () => {
    if (req.params.key !== "fxRate") throw new ValidationError("settingInvalid");
    const value = Number(req.body?.value);
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      throw new ValidationError("fxRange", { field: "fxRate" });
    }
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('fxRate',?)").run(String(value));
    return res.json({ ok: true });
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Optional: serve the built frontend (the Docker image ships it in ./public).
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "public"));
if (fs.existsSync(path.join(STATIC_DIR, "index.html"))) {
  app.use(express.static(STATIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
}

app.use((error, req, res, _next) => {
  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, "body")) {
    return res.status(400).json({ error: tr(req, "jsonInvalid") });
  }
  console.error(error);
  return res.status(500).json({ error: tr(req, "internal") });
});

const server = app.listen(PORT, () => console.log("Trading Journal backend en puerto " + PORT));

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
