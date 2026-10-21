import { useState, useEffect, useId, useRef } from "react";
import "./styles.css";
import { parseRoute, routeHref } from "./lib/route.js";
import { DEFAULT_FX, calcRR, calcTrade, calcMetrics, tradesToCsv, csvToTrades } from "./lib/calc.js";
import { createT, getActiveLang } from "./lib/i18n.js";
import { useI18n, LangSelect } from "./lib/I18nContext.jsx";

const API = "/api";
const getToken = () => localStorage.getItem("tj_token");
const setToken = (t) => localStorage.setItem("tj_token", t);
const clearToken = () => localStorage.removeItem("tj_token");

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const t = createT(getActiveLang());
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", "Accept-Language": getActiveLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
    });
  } catch {
    throw new Error(t("error.network"));
  }
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error(t("error.unauthorized"));
  }
  if (!res.ok) {
    let message = t("error.http", { status: res.status });
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  return res;
}

// ── Utilidades ─────────────────────────────────────────
const tone = (n) => (Number(n) >= 0 ? "gain" : "loss");
const localDateISO = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
// Valores guardados en BD (no se traducen); la UI los muestra por clave.
const SETUPS = ["Ruptura", "Pullback", "Tendencia", "Reversión", "Rango", "S/R", "Otro"];
// Traduce un valor guardado con prefijo de clave; si es desconocido, lo muestra tal cual.
function useValueLabel() {
  const { t } = useI18n();
  return (prefix, value) => { const k = `${prefix}.${value}`; const r = t(k); return r === k ? String(value) : r; };
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="28" height="28" rx="7" />
      <path d="M8 22 L14 15 L18 19 L24 10" stroke="var(--accent)" />
    </svg>
  );
}

function Field({ label, hint, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{hint && <span className="hint">{hint}</span>}</label>
      {children(id)}
    </div>
  );
}

// ── Login ──────────────────────────────────────────────
function Login({ onLogin }) {
  const { t, lang } = useI18n();
  const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  async function submit() {
    if (!u || !p) { setErr(t("error.credentials")); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": lang }, body: JSON.stringify({ username: u, password: p }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || t("error.generic")); return; }
      setToken(data.token); onLogin();
    } catch { setErr(t("error.connect")); }
    finally { setLoading(false); }
  }
  return (
    <div className="login">
      <form className="login__card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="login__brand">
          <Logo />
          <h1 translate="no">Trading Journal</h1>
          <p>{t("login.subtitle")}</p>
        </div>
        <Field label={t("login.username")}>
          {(id) => <input id={id} className="field-input" value={u} onChange={(e) => setU(e.target.value)} placeholder={t("login.usernamePlaceholder")} name="username" autoComplete="username" spellCheck={false} autoFocus />}
        </Field>
        <Field label={t("login.password")}>
          {(id) => <input id={id} className="field-input" type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" name="password" autoComplete="current-password" />}
        </Field>
        {err && <div className="alert" role="alert">{err}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? t("login.verifying") : t("login.submit")}
        </button>
        <LangSelect className="field-input lang-select" />
      </form>
    </div>
  );
}

// ── Form operación ─────────────────────────────────────
const emptyForm = {
  date: localDateISO(),
  ticker: "", currency: "USD", direction: "LONG",
  entryPrice: "", exitPrice: "", shares: "",
  stopLoss: "", targetPrice: "",
  commissionEntry: "", commissionExit: "",
  duration: "", durationUnit: "min",
  expectedDuration: "", expectedDurationUnit: "h",
  setupType: "", motivo: "", siguioPlan: "SI", notas: "",
};

function TradeForm({ initial, onSave, onCancel, saving }) {
  const { t, fmt } = useI18n();
  const label = useValueLabel();
  const sym = fmt.symbol;
  const [f, setF] = useState(initial ? { ...emptyForm, ...initial } : emptyForm);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setV = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const rr = calcRR(f.entryPrice, f.stopLoss, f.targetPrice, f.direction);
  const entry = parseFloat(f.entryPrice), stop = parseFloat(f.stopLoss), target = parseFloat(f.targetPrice);
  const stopDist = entry && stop ? Math.abs(((entry - stop) / entry) * 100) : null;
  const targetDist = entry && target ? ((f.direction === "LONG" ? target - entry : entry - target) / entry) * 100 : null;
  const stopOnProfitSide = Boolean(entry && stop) && (f.direction === "LONG" ? stop >= entry : stop <= entry);
  const missing = [!f.ticker && t("form.missing.ticker"), !f.entryPrice && t("form.missing.entryPrice"), !f.shares && t("form.missing.shares")].filter(Boolean);
  const canSave = !saving && missing.length === 0;

  const price = (title, field, hint, extra) => (
    <div>
      <Field label={title} hint={hint}>
        {(id) => (
          <div className="suffix">
            <input id={id} className="field-input num" type="number" step="any" value={f[field]} onChange={set(field)} placeholder={t("form.pricePlaceholder")} />
            <span>{sym(f.currency)}</span>
          </div>
        )}
      </Field>
      {extra}
    </div>
  );
  const duration = (title, field, unitField, units) => (
    <Field label={title}>
      {(id) => (
        <div className="grid">
          <input id={id} className="field-input num" type="number" step="any" value={f[field]} onChange={set(field)} placeholder={t("form.sharesPlaceholder")} />
          <div className="seg" role="group" aria-label={t("unit.label", { label: title.toLowerCase() })}>
            {units.map((u) => <button type="button" key={u} aria-pressed={f[unitField] === u} onClick={() => setV(unitField, u)}>{label("unit", u)}</button>)}
          </div>
        </div>
      )}
    </Field>
  );

  return (
    <div className="form">
      <h1>{initial ? t("form.titleEdit") : t("form.titleNew")}</h1>

      <section className="grid">
        <h2 className="section">{t("form.section.trade")}</h2>
        <div className="grid grid--2">
          <Field label={t("form.date")}>{(id) => <input id={id} className="field-input num" type="date" value={f.date} onChange={set("date")} />}</Field>
          <Field label={t("form.ticker")}>
            {(id) => <input id={id} className="field-input" value={f.ticker} onChange={(e) => setF((x) => ({ ...x, ticker: e.target.value.toUpperCase() }))} placeholder={t("form.tickerPlaceholder")} autoCapitalize="characters" />}
          </Field>
        </div>
        <div className="grid grid--2">
          <div className="field">
            <span className="label">{t("dir.label")}</span>
            <div className="seg" role="group" aria-label={t("dir.label")}>
              {["LONG", "SHORT"].map((d) => (
                <button type="button" key={d} className={d === "LONG" ? "is-long" : "is-short"} aria-pressed={f.direction === d} onClick={() => setV("direction", d)}>{t(`dir.${d}`)}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">{t("form.currency")}</span>
            <div className="seg" role="group" aria-label={t("form.currency")}>
              {["USD", "EUR"].map((c) => <button type="button" key={c} aria-pressed={f.currency === c} aria-label={c} onClick={() => setV("currency", c)}>{sym(c)} {c}</button>)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid">
        <h2 className="section">{t("form.section.prices")}</h2>
        <div className="grid grid--2">
          {price(t("form.entryPrice"), "entryPrice")}
          {price(t("form.exitPrice"), "exitPrice", t("form.exitHint"))}
          {price(t("form.stopLoss"), "stopLoss", undefined, stopDist !== null && <p className="note loss num">{t("form.risk", { value: fmt.number(stopDist) })}</p>)}
          {price(t("form.targetPrice"), "targetPrice", undefined, targetDist !== null && <p className={`note num ${tone(targetDist)}`}>{t("form.potential", { value: fmt.pct(targetDist) })}</p>)}
        </div>
        {stopOnProfitSide && (
          <p className="note warn" role="status">{t("form.stopWarning")}</p>
        )}
        {rr !== null && (
          <div className="rr" aria-live="polite">
            <span className="muted">{t("form.rrLabel")}</span>
            <span className={`num ${rr >= 2 ? "gain" : rr >= 1 ? "warn" : "loss"}`}>
              <strong>1 : {fmt.number(rr)}</strong> <span className="hint">{rr >= 2 ? t("form.rr.good") : rr >= 1 ? t("form.rr.ok") : t("form.rr.bad")}</span>
            </span>
          </div>
        )}
      </section>

      <section className="grid">
        <h2 className="section">{t("form.section.size")}</h2>
        <div className="grid grid--3">
          <Field label={t("form.shares")}>{(id) => <input id={id} className="field-input num" type="number" step="any" value={f.shares} onChange={set("shares")} placeholder={t("form.sharesPlaceholder")} />}</Field>
          <Field label={t("form.commissionEntry", { symbol: sym(f.currency) })}>{(id) => <input id={id} className="field-input num" type="number" step="any" value={f.commissionEntry} onChange={set("commissionEntry")} placeholder={t("form.pricePlaceholder")} />}</Field>
          <Field label={t("form.commissionExit", { symbol: sym(f.currency) })}>{(id) => <input id={id} className="field-input num" type="number" step="any" value={f.commissionExit} onChange={set("commissionExit")} placeholder={t("form.pricePlaceholder")} />}</Field>
        </div>
        <div className="grid grid--2">
          {duration(t("form.duration"), "duration", "durationUnit", ["min", "h", "d"])}
          {duration(t("form.expectedDuration"), "expectedDuration", "expectedDurationUnit", ["h", "d", "sem"])}
        </div>
      </section>

      <section className="grid">
        <h2 className="section">{t("form.section.plan")}</h2>
        <div className="field">
          <span className="label">{t("form.setupType")}</span>
          <div className="chips">
            {SETUPS.map((s) => <button type="button" className="chip" key={s} aria-pressed={f.setupType === s} onClick={() => setV("setupType", f.setupType === s ? "" : s)}>{label("setup", s)}</button>)}
          </div>
        </div>
        <div className="field">
          <span className="label">{t("form.followedPlan")}</span>
          <div className="seg" role="group" aria-label={t("form.followedPlan")}>
            {[["SI", t("common.yes")], ["NO", t("common.no")]].map(([v, l]) => <button type="button" key={v} aria-pressed={f.siguioPlan === v} onClick={() => setV("siguioPlan", v)}>{l}</button>)}
          </div>
        </div>
        <Field label={t("form.reason")}>{(id) => <input id={id} className="field-input" type="text" value={f.motivo} onChange={set("motivo")} placeholder={t("form.reasonPlaceholder")} />}</Field>
        <Field label={t("form.notes")}>{(id) => <textarea id={id} className="field-input" value={f.notas} onChange={set("notas")} rows={3} placeholder={t("form.notesPlaceholder")} />}</Field>
      </section>

      {missing.length > 0 && <p className="note">{t("form.missingPrefix", { fields: missing.join(", ") })}</p>}
      <div className="form__actions">
        <button type="button" className="btn" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="btn btn--primary" onClick={() => onSave(f)} disabled={!canSave}>{saving ? t("form.saving") : t("form.save")}</button>
      </div>
    </div>
  );
}

// ── Fila de operación ──────────────────────────────────
function TradeRow({ trade, fxRate, onEdit, onDelete, expanded, onToggle }) {
  const { t, fmt } = useI18n();
  const label = useValueLabel();
  const r = calcTrade(trade, fxRate);
  const cur = trade.currency || "EUR";
  const isOpen = !trade.exitPrice;
  const rr = calcRR(trade.entryPrice, trade.stopLoss, trade.targetPrice, trade.direction);
  const invested = (parseFloat(trade.entryPrice) || 0) * (parseFloat(trade.shares) || 0);
  const detailId = useId();
  return (
    <div className="row">
      <button type="button" className="row__main" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
        <span>
          <span className="row__ticker">{trade.ticker}</span>
          <span className="tags">
            <span className={`tag ${trade.direction === "LONG" ? "tag--long" : "tag--short"}`}>{label("dir", trade.direction)}</span>
            {trade.setupType && <span className="tag">{label("setup", trade.setupType)}</span>}
            {trade.siguioPlan === "NO" && <span className="tag tag--warn">{t("row.noPlan")}</span>}
            {isOpen && <span className="tag tag--open">{t("row.open")}</span>}
          </span>
          <div className="row__meta num">
            {fmt.date(trade.date)} · {fmt.price(trade.entryPrice, cur)}{trade.exitPrice ? ` → ${fmt.price(trade.exitPrice, cur)}` : trade.targetPrice ? ` · ${t("row.target", { price: fmt.price(trade.targetPrice, cur) })}` : ""}
            {rr !== null && ` · ${t("row.rr", { value: fmt.number(rr) })}`}
          </div>
        </span>
        <span className="row__result num">
          {r ? (
            <>
              <div className={`row__pnl ${tone(r.pnl)}`}>{fmt.moneySigned(r.pnl, cur)}</div>
              <div className={`row__pct ${tone(r.pct)}`}>{fmt.pct(r.pct)}</div>
            </>
          ) : <span className="muted">{t("row.inProgress")}</span>}
        </span>
      </button>
      {expanded && (
        <div className="row__detail" id={detailId}>
          <dl className="detail-grid num">
            <div><dt>{t("row.invested")}</dt><dd>{fmt.money(invested, cur)}</dd></div>
            <div><dt>{t("row.stopLoss")}</dt><dd className={trade.stopLoss ? "loss" : "muted"}>{trade.stopLoss ? fmt.money(trade.stopLoss, cur) : "—"}</dd></div>
            <div><dt>{t("row.target.label")}</dt><dd className={trade.targetPrice ? "gain" : "muted"}>{trade.targetPrice ? fmt.money(trade.targetPrice, cur) : "—"}</dd></div>
            {r && cur === "USD" && <div><dt>{t("row.resultEur")}</dt><dd className={tone(r.pnlEur)}>{fmt.moneySigned(r.pnlEur, "EUR")}</dd></div>}
            {r && r.comm > 0 && <div><dt>{t("row.commissions")}</dt><dd>{fmt.money(r.comm, cur)}</dd></div>}
            {trade.duration && <div><dt>{t("row.timeInPosition")}</dt><dd>{trade.duration} {label("unit", trade.durationUnit)}{trade.expectedDuration ? ` (${t("row.expected", { value: trade.expectedDuration, unit: label("unit", trade.expectedDurationUnit) })})` : ""}</dd></div>}
          </dl>
          {trade.motivo && <p className="row__text"><strong>{t("row.reason")}</strong> {trade.motivo}</p>}
          {trade.notas && <p className="row__text"><strong>{t("row.notes")}</strong> {trade.notas}</p>}
          <div className="row__actions">
            <button type="button" className="btn btn--sm" onClick={onEdit}>{t("common.edit")}</button>
            <button type="button" className="btn btn--sm btn--danger" onClick={onDelete}>{t("common.delete")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Curva de capital ───────────────────────────────────
function EquityCurve({ points }) {
  const { t, fmt } = useI18n();
  const gradId = useId();
  if (points.length < 2) return null;
  const W = 600, H = 150, P = 10;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const coords = points.map((p, i) => [x(i), y(p.value)]);
  const line = coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const len = Math.ceil(coords.reduce((acc, [cx, cy], i) => (i ? acc + Math.hypot(cx - coords[i - 1][0], cy - coords[i - 1][1]) : 0), 0)) + 2;
  const last = values[values.length - 1];
  const [lx, ly] = coords[coords.length - 1];
  return (
    <>
      <div className={`hero__chart ${tone(last)}`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("curve.aria", { value: fmt.number(last) })}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line className="curve-zero" x1={P} x2={W - P} y1={y(0)} y2={y(0)} />
          <path d={area} fill={`url(#${gradId})`} stroke="none" />
          <path className="curve-line is-drawn" d={line} stroke="currentColor" style={{ "--len": len }} />
          <circle cx={lx} cy={ly} r="4" fill="currentColor" />
        </svg>
      </div>
      <div className="hero__axis num"><span>{fmt.date(points[0].date)}</span><span>{fmt.date(points[points.length - 1].date)}</span></div>
    </>
  );
}

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── Ruta en la URL (ver lib/route.js) ─────────────────
// Tabs create history entries (back/forward work); filter typing only replaces the current one.
function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = (patch, replace = false) => {
    const next = { ...route, ...patch };
    const href = routeHref(next);
    if (href === window.location.hash) { setRoute(next); return; }
    if (replace) { window.history.replaceState(null, "", href); setRoute(next); }
    else window.location.hash = href;
  };
  return {
    view: route.view, query: route.query, statusFilter: route.statusFilter,
    setView: (view) => go({ view }),
    setQuery: (query) => go({ query }, true),
    setStatusFilter: (statusFilter) => go({ statusFilter }, true),
  };
}

// ── Journal ────────────────────────────────────────────
function Journal({ onLogout }) {
  const { t, fmt } = useI18n();
  const [trades, setTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [fxRate, setFxRate] = useState(DEFAULT_FX);
  const [error, setError] = useState("");
  const [fxError, setFxError] = useState("");
  const { view, setView, query, setQuery, statusFilter, setStatusFilter } = useRoute();
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingFx, setEditingFx] = useState(false);
  const [fxInput, setFxInput] = useState("1.08");
  const [saving, setSaving] = useState(false);
  const fxId = useId();

  // A new section starts at the top and without the previous section's error notice.
  useEffect(() => { window.scrollTo(0, 0); setError(""); }, [view]);

  useEffect(() => {
    async function load() {
      try {
        const [tr, st] = await Promise.all([apiFetch("/trades").then((r) => r.json()), apiFetch("/settings").then((r) => r.json())]);
        setTrades(tr);
        if (st.fxRate) { setFxRate(parseFloat(st.fxRate)); setFxInput(st.fxRate); }
      } catch (e) { setError(t("error.load", { message: e.message })); }
      setLoaded(true);
    }
    load();
  }, []);

  async function saveTrade(f) {
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/trades/${editing.id}`, { method: "PUT", body: JSON.stringify(f) });
        setTrades(trades.map((t) => t.id === editing.id ? { ...f, id: editing.id } : t));
      } else {
        const response = await apiFetch("/trades", { method: "POST", body: JSON.stringify(f) });
        const created = await response.json();
        setTrades([{ ...f, id: created.id, createdAt: created.createdAt }, ...trades]);
      }
      setEditing(null); setView("dashboard");
    } catch (e) { setError(t("error.save", { message: e.message })); }
    setSaving(false);
  }

  async function deleteTrade(id) {
    const tr = trades.find((x) => x.id === id);
    if (!window.confirm(t("confirm.delete", { ticker: tr?.ticker ?? "", date: tr ? fmt.date(tr.date) : "" }))) return;
    try { await apiFetch(`/trades/${id}`, { method: "DELETE" }); setTrades(trades.filter((x) => x.id !== id)); }
    catch (e) { setError(t("error.delete", { message: e.message })); }
  }

  async function importCsv(file) {
    if (!file) return;
    try {
      const rows = csvToTrades(await file.text());
      if (!rows.length) throw new Error(t("error.csvEmpty"));
      if (!window.confirm(t("confirm.import", { count: rows.length }))) return;
      const created = []; let failed = 0;
      for (const row of rows) {
        try {
          const res = await (await apiFetch("/trades", { method: "POST", body: JSON.stringify(row) })).json();
          created.push({ ...row, id: res.id, createdAt: res.createdAt });
        } catch { failed++; }
      }
      setTrades((prev) => [...created.reverse(), ...prev]);
      setError(failed ? t("error.importPartial", { created: created.length, failed }) : "");
    } catch (e) { setError(t("error.importFailed", { message: e.code === "csvFormat" ? t("error.csvFormat") : e.message })); }
  }

  async function saveFx(val) {
    const n = Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n < 0.1 || n > 10) { setFxError(t("error.fxRange")); return; }
    try {
      await apiFetch("/settings/fxRate", { method: "PUT", body: JSON.stringify({ value: n }) });
      setFxRate(n);
      setEditingFx(false);
    } catch (error) {
      setFxError(error.message || t("error.fxSave"));
    }
  }

  const metrics = calcMetrics(trades, fxRate);
  const openTrades = trades.filter((t) => !t.exitPrice);
  const closedTrades = trades.filter((t) => t.exitPrice);

  if (!loaded) return <div className="loading">{t("app.loading")}</div>;

  const goForm = () => { setEditing(null); setView("form"); };
  const editTrade = (t) => { setEditing(t); setView("form"); };
  const toggle = (id) => setExpandedId(expandedId === id ? null : id);
  const renderRow = (t) => (
    <TradeRow key={t.id} trade={t} fxRate={fxRate} onEdit={() => editTrade(t)} onDelete={() => deleteTrade(t.id)} expanded={expandedId === t.id} onToggle={() => toggle(t.id)} />
  );
  const pnl = metrics ? parseFloat(metrics.totalPnlEur) : 0;
  const expectancy = metrics ? parseFloat(metrics.expectancy) : 0;
  const ret = metrics ? parseFloat(metrics.compoundedReturn) : 0;

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>{t("app.skip")}</a>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand"><Logo /><span translate="no">{t("app.title")}</span></div>
          <nav className="tabs" aria-label={t("nav.label")}>
            {[["dashboard", t("nav.summary")], ["form", t("nav.new")], ["history", t("nav.history")], ["stats", t("nav.stats")]].map(([v, label]) => (
              <button type="button" className="tab" key={v} aria-label={label} aria-current={view === v ? "page" : undefined} onClick={() => { setView(v); if (v !== "form") setEditing(null); }}>{label}</button>
            ))}
          </nav>
          <div className="topbar__tools">
            <button type="button" className="link-btn num" title={t("fx.edit")} onClick={() => { setEditingFx(true); setFxError(""); setFxInput(String(fxRate)); }}>{fmt.fx(fxRate)}</button>
            <LangSelect className="lang-select" />
            <button type="button" className="link-btn" onClick={() => { clearToken(); onLogout(); }}>{t("nav.logout")}</button>
          </div>
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          <div className="banner__inner">
            <span>{error}</span>
            <button type="button" className="link-btn" onClick={() => setError("")} aria-label={t("common.closeNotice")}>{t("common.close")}</button>
          </div>
        </div>
      )}

      {editingFx && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${fxId}-t`} onKeyDown={(e) => {
          if (e.key === "Escape") { setEditingFx(false); setFxError(""); return; }
          if (e.key !== "Tab") return;
          const items = [...e.currentTarget.querySelectorAll("button, input, [href], select, textarea")].filter((el) => !el.disabled);
          if (!items.length) return;
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}>
          <div className="modal__card">
            <h2 id={`${fxId}-t`}>{t("fx.title")}</h2>
            <p className="note num">{fmt.fx(fxRate)} · 1 $ = {fmt.number(1 / fxRate, 4)} €</p>
            <div className="field">
              <label htmlFor={fxId}>{t("fx.dollarsPerEuro")}</label>
              <input id={fxId} className="field-input num" type="number" step="any" value={fxInput} onChange={(e) => { setFxInput(e.target.value); setFxError(""); }} aria-invalid={fxError ? "true" : undefined} aria-describedby={fxError ? `${fxId}-e` : undefined} autoFocus />
              {fxError && <div className="alert" id={`${fxId}-e`} role="alert">{fxError}</div>}
            </div>
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => { setEditingFx(false); setFxError(""); }}>{t("common.cancel")}</button>
              <button type="button" className="btn btn--primary" onClick={() => saveFx(fxInput)}>{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      <main className="page" id="main" tabIndex={-1}>
        {view === "dashboard" && (
          <>
            {!metrics ? (
              <div className="empty">
                <h3>{t("dash.emptyTitle")}</h3>
                <p>{t("dash.emptyText")}</p>
                <button type="button" className="btn btn--primary" onClick={goForm}>{t("dash.emptyAction")}</button>
              </div>
            ) : (
              <>
                <section className="hero" aria-label={t("dash.heroAria")}>
                  <div className="hero__top">
                    <div className="hero__label">{t("dash.heroLabel", { count: closedTrades.length })}</div>
                    <div className={`hero__value num ${tone(pnl)}`}>{fmt.moneySigned(pnl)}</div>
                    <div className="hero__sub num">
                      <span>{t("dash.compound", { value: fmt.pct(ret) })}</span>
                      {parseFloat(metrics.totalCommEur) > 0 && <span>{t("dash.commissions", { value: fmt.money(metrics.totalCommEur) })}</span>}
                    </div>
                  </div>
                  <EquityCurve points={metrics.curve} />
                </section>

                <dl className="stats num">
                  <div className="stat"><dt>{t("dash.winRate")}</dt><dd className={parseFloat(metrics.winRate) >= 50 ? "gain" : "loss"}>{fmt.number(metrics.winRate)} %</dd></div>
                  <div className="stat"><dt>{t("dash.rrReal")}</dt><dd className={parseFloat(metrics.rr) >= 1 ? "gain" : "loss"}>1 : {fmt.number(metrics.rr)}</dd></div>
                  <div className="stat"><dt>{t("dash.expectancy")}</dt><dd className={tone(expectancy)}>{fmt.moneySigned(expectancy)}</dd></div>
                  <div className="stat"><dt>{t("dash.profitFactor")}</dt><dd className={metrics.profitFactor === null || parseFloat(metrics.profitFactor) >= 1 ? "gain" : "loss"}>{metrics.profitFactor === null ? "∞" : fmt.number(metrics.profitFactor)}</dd></div>
                  <div className="stat"><dt>{t("dash.maxDrawdown")}</dt><dd className={parseFloat(metrics.maxDrawdownEur) > 0 ? "loss" : "muted"}>{parseFloat(metrics.maxDrawdownEur) > 0 ? "-" : ""}{fmt.money(metrics.maxDrawdownEur)}</dd></div>
                  <div className="stat"><dt>{t("dash.winsLosses")}</dt><dd>{metrics.winners} / {metrics.losers}</dd></div>
                </dl>

                <p className="verdict">
                  {expectancy >= 0
                    ? <><strong>{t("dash.verdict.positive")}</strong>{t("dash.verdict.positiveRest", { value: fmt.moneySigned(expectancy) })}</>
                    : <><strong>{t("dash.verdict.negative")}</strong>{t("dash.verdict.negativeRest", { value: fmt.moneySigned(expectancy) })}</>}
                </p>
              </>
            )}

            {openTrades.length > 0 && (
              <section>
                <h2 className="section">{t("dash.openTrades", { count: openTrades.length })}</h2>
                <div className="rows">{openTrades.map(renderRow)}</div>
              </section>
            )}

            {metrics && <button type="button" className="btn btn--primary btn--block" onClick={goForm}>{t("dash.newTrade")}</button>}
          </>
        )}

        {view === "form" && <TradeForm initial={editing} onSave={saveTrade} onCancel={() => { setEditing(null); setView("dashboard"); }} saving={saving} />}

        {view === "history" && (() => {
          const q = query.trim().toUpperCase();
          const shown = trades.filter((t) => (!q || t.ticker.includes(q)) && (statusFilter === "all" || (statusFilter === "open" ? !t.exitPrice : !!t.exitPrice)));
          return (
            <section>
              <h2 className="section">{shown.length !== trades.length ? t("history.titleOf", { shown: shown.length, total: trades.length }) : t("history.title", { shown: shown.length })}</h2>
              <div className="toolbar">
                <input aria-label={t("history.searchLabel")} className="field-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("history.searchPlaceholder")} />
                {[["all", t("history.all")], ["open", t("history.open")], ["closed", t("history.closed")]].map(([v, l]) => (
                  <button type="button" className="chip" key={v} onClick={() => setStatusFilter(v)} aria-pressed={statusFilter === v}>{l}</button>
                ))}
                <button type="button" className="btn btn--sm" disabled={!trades.length} onClick={() => downloadFile(`trading-journal-${localDateISO()}.csv`, tradesToCsv(trades), "text/csv;charset=utf-8")}>{t("history.csv")}</button>
                <button type="button" className="btn btn--sm" disabled={!trades.length} onClick={() => downloadFile(`trading-journal-${localDateISO()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), fxRate, trades }, null, 2), "application/json")}>{t("history.json")}</button>
                <ImportButton onFile={importCsv} />
              </div>
              {shown.length === 0
                ? <div className="empty"><h3>{trades.length ? t("history.noMatchTitle") : t("history.emptyTitle")}</h3><p>{trades.length ? t("history.noMatchText") : t("history.emptyText")}</p></div>
                : <div className="rows">{shown.map(renderRow)}</div>}
            </section>
          );
        })()}

        {view === "stats" && (
          <>
            {metrics && Object.keys(metrics.byPlan).length > 0 && (
              <section>
                <h2 className="section">{t("stats.discipline")}</h2>
                <div className="rows">
                  {Object.entries(metrics.byPlan).map(([k, g]) => (
                    <StatRow key={k} title={t(`plan.${k}`)} titleClass={k === "withoutPlan" ? "warn" : ""} count={g.count} wins={g.wins} pnl={g.pnlEur} />
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="section">{t("stats.bySetup")}</h2>
              {!metrics || !Object.keys(metrics.bySetup).length
                ? <div className="empty"><h3>{t("stats.noSetupTitle")}</h3><p>{t("stats.noSetupText")}</p></div>
                : <div className="rows">
                  {Object.entries(metrics.bySetup).sort((a, b) => b[1].pnlEur - a[1].pnlEur).map(([setup, s]) => (
                    <StatRow key={setup} title={t(`setup.${setup}`) === `setup.${setup}` ? setup : t(`setup.${setup}`)} count={s.count} wins={s.wins} pnl={s.pnlEur} />
                  ))}
                </div>}
            </section>
          </>
        )}
      </main>
    </>
  );
}

// A real <button> (focusable, Enter/Space) that opens the hidden file input; a hidden input behind a <label> is skipped by Tab.
function ImportButton({ onFile }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden tabIndex={-1} aria-hidden="true" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
      <button type="button" className="btn btn--sm" onClick={() => inputRef.current?.click()}>{t("history.importCsv")}</button>
    </>
  );
}

function StatRow({ title, titleClass = "", count, wins, pnl }) {
  const { t, fmt } = useI18n();
  const wr = Math.round((wins / count) * 100);
  return (
    <div className="row">
      <div className="row__main">
        <div>
          <div className={`row__ticker ${titleClass}`}>{title}</div>
          <div className="row__meta num">{t("stats.rowMeta", { count, rate: wr, wins, losses: count - wins })}</div>
          <svg className={`bar ${wr >= 50 ? "gain" : "loss"}`} viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={t("stats.winRateAria", { rate: wr })}><rect width="100" height="4" fill="currentColor" opacity="0.15" /><rect width={wr} height="4" fill="currentColor" /></svg>
        </div>
        <div className={`row__pnl num ${tone(pnl)}`}>{fmt.moneySigned(pnl)}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  useEffect(() => { document.title = t("app.title"); }, [t]);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    async function check() {
      if (!getToken()) { setChecking(false); return; }
      try { const res = await apiFetch("/auth/verify"); if (res.ok) setAuthed(true); else clearToken(); }
      catch { clearToken(); }
      setChecking(false);
    }
    check();
  }, []);
  if (checking) return <div className="loading">{t("app.loading")}</div>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Journal onLogout={() => setAuthed(false)} />;
}
