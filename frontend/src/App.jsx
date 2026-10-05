import { useState, useEffect } from "react";
import "./styles.css";

const API = "/api";
const getToken = () => localStorage.getItem("tj_token");
const setToken = (t) => localStorage.setItem("tj_token", t);
const clearToken = () => localStorage.removeItem("tj_token");

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("No autorizado");
  }
  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  return res;
}

// ── Estilos ────────────────────────────────────────────
const BG = "#07080f", CARD = "#0d0f1a", BORDER = "#1a1c2e";
const green = "#00c896", red = "#ff4d6d", gold = "#f5b400", blue = "#5b96ff", muted = "#7d8597";
const inp = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", color: "#e0e0e0", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box", outline: "none" };
const lbl = { fontSize: 10, color: muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5, display: "block" };
const mkCard = (extra = {}) => ({ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, ...extra });
const sym = (c) => c === "USD" ? "$" : "€";
const fmt = (n, d = 2) => Number(n ?? 0).toFixed(d);
const col = (n) => n >= 0 ? green : red;
const localDateISO = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const SETUPS = ["Ruptura", "Pullback", "Tendencia", "Reversión", "Rango", "S/R", "Otro"];

// ── Cálculos ───────────────────────────────────────────
function calcRR(entry, stop, target, direction) {
  const e = parseFloat(entry), s = parseFloat(stop), t = parseFloat(target);
  if (!e || !s || !t) return null;
  const risk = direction === "LONG" ? e - s : s - e;
  const reward = direction === "LONG" ? t - e : e - t;
  if (risk <= 0 || reward <= 0) return null;
  return parseFloat((reward / risk).toFixed(2));
}

function calcTrade(t, fxRate) {
  const entry = parseFloat(t.entryPrice), exit = parseFloat(t.exitPrice), shares = parseFloat(t.shares);
  if (!entry || !exit || !shares) return null;
  const gross = t.direction === "LONG" ? (exit - entry) * shares : (entry - exit) * shares;
  const pct = t.direction === "LONG" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
  const comm = (parseFloat(t.commissionEntry) || 0) + (parseFloat(t.commissionExit) || 0);
  const net = gross - comm;
  const rate = (t.currency || "EUR") === "USD" ? fxRate : 1;
  return { pnl: +net.toFixed(2), pnlEur: +(net / rate).toFixed(2), gross: +gross.toFixed(2), comm: +comm.toFixed(2), pct: +pct.toFixed(2), currency: t.currency || "EUR" };
}

function calcMetrics(trades, fxRate) {
  const closed = trades.filter((t) => t.exitPrice && t.entryPrice && t.shares);
  if (!closed.length) return null;
  const results = closed.map((t) => calcTrade(t, fxRate)).filter(Boolean);
  const winners = results.filter((r) => r.pnlEur > 0);
  const losers = results.filter((r) => r.pnlEur < 0);
  const wr = (winners.length / results.length) * 100;
  const avgWin = winners.length ? winners.reduce((a, r) => a + r.pnlEur, 0) / winners.length : 0;
  const avgLoss = losers.length ? Math.abs(losers.reduce((a, r) => a + r.pnlEur, 0) / losers.length) : 0;
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;
  const exp = (wr / 100) * avgWin - ((100 - wr) / 100) * avgLoss;
  const totalEur = results.reduce((a, r) => a + r.pnlEur, 0);
  const commEur = results.reduce((a, r) => a + (r.currency === "USD" ? r.comm / fxRate : r.comm), 0);
  let compoundedReturn = 1;
  results.forEach((r) => { compoundedReturn *= 1 + r.pct / 100; });
  const bySetup = trades.filter((t) => t.setupType && t.exitPrice).reduce((acc, t) => {
    const r = calcTrade(t, fxRate);
    if (!r) return acc;
    if (!acc[t.setupType]) acc[t.setupType] = { count: 0, wins: 0, pnlEur: 0 };
    acc[t.setupType].count++;
    if (r.pnlEur > 0) acc[t.setupType].wins++;
    acc[t.setupType].pnlEur += r.pnlEur;
    return acc;
  }, {});
  return {
    total: results.length, winners: winners.length, losers: losers.length,
    winRate: wr.toFixed(1), avgWin: avgWin.toFixed(2), avgLoss: avgLoss.toFixed(2),
    rr: rr.toFixed(2), expectancy: exp.toFixed(2),
    totalPnlEur: totalEur.toFixed(2), compoundedReturn: ((compoundedReturn - 1) * 100).toFixed(2),
    totalCommEur: commEur.toFixed(2), bySetup,
  };
}

// ── Login ──────────────────────────────────────────────
function Login({ onLogin }) {
  const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  async function submit() {
    if (!u || !p) return;
    setLoading(true); setErr("");
    try {
      const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Error"); return; }
      setToken(data.token); onLogin();
    } catch { setErr("No se pudo conectar"); }
    finally { setLoading(false); }
  }
  return (
    <div className="login-shell" style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <div className="login-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "36px 32px", width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: green, letterSpacing: 4, marginBottom: 6 }}>TRADING JOURNAL</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: "#fff" }}>Acceso</div>
        </div>
        <div style={{ marginBottom: 14 }}><span style={lbl}>Usuario</span><input value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="usuario" style={inp} autoFocus /></div>
        <div style={{ marginBottom: 20 }}><span style={lbl}>Contraseña</span><input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" style={inp} /></div>
        {err && <div style={{ background: "#ff4d6d15", border: "1px solid #ff4d6d30", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: red, marginBottom: 14, textAlign: "center" }}>{err}</div>}
        <button onClick={submit} disabled={loading || !u || !p} style={{ width: "100%", border: "none", borderRadius: 8, padding: "13px", fontSize: 13, fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", background: u && p && !loading ? green : "#1a1a30", color: u && p && !loading ? BG : "#444" }}>
          {loading ? "Verificando..." : "ENTRAR"}
        </button>
      </div>
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
  const [f, setF] = useState(initial ? { ...emptyForm, ...initial } : emptyForm);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setV = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const rr = calcRR(f.entryPrice, f.stopLoss, f.targetPrice, f.direction);
  const entry = parseFloat(f.entryPrice), stop = parseFloat(f.stopLoss), target = parseFloat(f.targetPrice);
  const stopDist = entry && stop ? Math.abs(((entry - stop) / entry) * 100).toFixed(2) : null;
  const targetDist = entry && target ? ((f.direction === "LONG" ? target - entry : entry - target) / entry * 100).toFixed(2) : null;

  const btnS = (active, accent = gold) => ({ background: active ? `${accent}22` : "transparent", border: `1px solid ${active ? accent : BORDER}`, color: active ? accent : "#444", borderRadius: 7, padding: "7px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: 11 });
  const priceF = (label, field, hint) => (
    <div>
      <span style={lbl}>{label}{hint && <span style={{ color: "#596174", fontSize: 9, letterSpacing: 0 }}> {hint}</span>}</span>
      <div style={{ position: "relative" }}>
        <input type="number" value={f[field]} onChange={set(field)} placeholder="0.00" style={{ ...inp, paddingRight: 36 }} />
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: f.currency === "USD" ? "#00c89655" : "#4488ff55", fontSize: 16, fontWeight: "bold" }}>{sym(f.currency)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: green, marginBottom: 18, letterSpacing: 3 }}>{initial ? "EDITAR OPERACIÓN" : "NUEVA OPERACIÓN"}</div>

      <div className="form-row form-row--two" style={{ display: "flex", gap: 8, marginBottom: 13 }}>
        <div style={{ flex: 1 }}><span style={lbl}>Fecha</span><input type="date" value={f.date} onChange={set("date")} style={inp} /></div>
        <div style={{ flex: 1 }}>
          <span style={lbl}>Ticker</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={f.ticker} onChange={(e) => setF((x) => ({ ...x, ticker: e.target.value.toUpperCase() }))} placeholder="TSLA" style={{ ...inp, flex: 1 }} />
            {["USD", "EUR"].map((c) => <button key={c} onClick={() => setV("currency", c)} style={{ ...btnS(f.currency === c, c === "USD" ? green : blue), fontSize: 15, fontWeight: "bold", minWidth: 36, padding: "0 8px" }}>{c === "USD" ? "$" : "€"}</button>)}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 13 }}>
        <span style={lbl}>Dirección</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["LONG", "SHORT"].map((d) => <button key={d} onClick={() => setV("direction", d)} style={{ ...btnS(f.direction === d, d === "LONG" ? green : red), flex: 1, fontSize: 13, fontWeight: "bold" }}>{d === "LONG" ? "↑ LONG" : "↓ SHORT"}</button>)}
        </div>
      </div>

      <div className="form-grid form-grid--two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 13 }}>
        {priceF("Precio entrada", "entryPrice")}
        {priceF("Precio salida", "exitPrice", "(vacío si abierta)")}
      </div>

      <div style={{ marginBottom: 13 }}>
        <div className="form-grid form-grid--two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>{priceF("Stop loss", "stopLoss")}{stopDist && <div style={{ fontSize: 10, color: red, marginTop: 4 }}>Riesgo: -{stopDist}%</div>}</div>
          <div>{priceF("Precio objetivo", "targetPrice")}{targetDist && <div style={{ fontSize: 10, color: parseFloat(targetDist) >= 0 ? green : red, marginTop: 4 }}>Potencial: +{targetDist}%</div>}</div>
        </div>
        {rr !== null && (
          <div style={{ marginTop: 8, background: rr >= 2 ? "#00c89615" : rr >= 1 ? "#f5b40015" : "#ff4d6d15", border: `1px solid ${rr >= 2 ? "#00c89630" : rr >= 1 ? "#f5b40030" : "#ff4d6d30"}`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: muted }}>Ratio Riesgo/Beneficio</span>
            <span style={{ fontSize: 18, fontWeight: "bold", color: rr >= 2 ? green : rr >= 1 ? gold : red }}>1 : {rr} <span style={{ fontSize: 11, color: muted }}>{rr >= 2 ? "✓ Bueno" : rr >= 1 ? "~ Aceptable" : "✗ Malo"}</span></span>
          </div>
        )}
      </div>

      <div className="form-grid form-grid--three" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 13 }}>
        <div><span style={lbl}>Nº acciones</span><input type="number" value={f.shares} onChange={set("shares")} placeholder="0" style={inp} /></div>
        <div><span style={lbl}>Comis. entrada ({sym(f.currency)})</span><input type="number" value={f.commissionEntry} onChange={set("commissionEntry")} placeholder="0.00" style={inp} /></div>
        <div><span style={lbl}>Comis. salida ({sym(f.currency)})</span><input type="number" value={f.commissionExit} onChange={set("commissionExit")} placeholder="0.00" style={inp} /></div>
      </div>

      <div className="form-grid form-grid--two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 13 }}>
        <div>
          <span style={lbl}>Tiempo en posición</span>
          <div style={{ display: "flex", gap: 5 }}>
            <input type="number" value={f.duration} onChange={set("duration")} placeholder="0" style={{ ...inp, flex: 1 }} />
            <div style={{ display: "flex", gap: 3 }}>
              {["min", "h", "d"].map((u) => <button key={u} onClick={() => setV("durationUnit", u)} style={{ ...btnS(f.durationUnit === u, "#aaa"), padding: "0 8px" }}>{u}</button>)}
            </div>
          </div>
        </div>
        <div>
          <span style={lbl}>Duración esperada</span>
          <div style={{ display: "flex", gap: 5 }}>
            <input type="number" value={f.expectedDuration} onChange={set("expectedDuration")} placeholder="0" style={{ ...inp, flex: 1 }} />
            <div style={{ display: "flex", gap: 3 }}>
              {["h", "d", "sem"].map((u) => <button key={u} onClick={() => setV("expectedDurationUnit", u)} style={{ ...btnS(f.expectedDurationUnit === u, "#aaa"), padding: "0 8px" }}>{u}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 13 }}>
        <span style={lbl}>Tipo de setup</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SETUPS.map((s) => <button key={s} onClick={() => setV("setupType", f.setupType === s ? "" : s)} style={btnS(f.setupType === s, blue)}>{s}</button>)}
        </div>
      </div>

      <div style={{ marginBottom: 13 }}>
        <span style={lbl}>¿Seguiste el plan?</span>
        <div style={{ display: "flex", gap: 8 }}>
          {["SI", "NO"].map((s) => <button key={s} onClick={() => setV("siguioPlan", s)} style={{ ...btnS(f.siguioPlan === s, s === "SI" ? green : red), flex: 1, fontWeight: "bold" }}>{s}</button>)}
        </div>
      </div>

      <div style={{ marginBottom: 13 }}><span style={lbl}>Motivo de entrada</span><input type="text" value={f.motivo} onChange={set("motivo")} placeholder="ej: ruptura de resistencia con volumen" style={inp} /></div>
      <div style={{ marginBottom: 18 }}><span style={lbl}>Notas / Lecciones</span><textarea value={f.notas} onChange={set("notas")} rows={3} placeholder="¿Qué aprendiste?" style={{ ...inp, resize: "vertical" }} /></div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${BORDER}`, color: "#7d8597", borderRadius: 8, padding: 13, cursor: "pointer", fontFamily: "monospace" }}>Cancelar</button>
        <button onClick={() => onSave(f)} disabled={saving || !f.ticker || !f.entryPrice || !f.shares}
          style={{ flex: 2, border: "none", borderRadius: 8, padding: 13, fontFamily: "monospace", fontWeight: "bold", letterSpacing: 1, fontSize: 13, cursor: !saving && f.ticker && f.entryPrice && f.shares ? "pointer" : "default", background: !saving && f.ticker && f.entryPrice && f.shares ? green : "#1a1a30", color: !saving && f.ticker && f.entryPrice && f.shares ? BG : "#444" }}>
          {saving ? "Guardando..." : "GUARDAR"}
        </button>
      </div>
    </div>
  );
}

// ── Trade Card ─────────────────────────────────────────
function TradeCard({ trade, fxRate, onEdit, onDelete, expanded, onToggle }) {
  const r = calcTrade(trade, fxRate);
  const cur = trade.currency || "EUR";
  const isOpen = !trade.exitPrice;
  const rr = calcRR(trade.entryPrice, trade.stopLoss, trade.targetPrice, trade.direction);
  return (
    <div className="trade-card" style={{ ...mkCard(), cursor: "pointer" }} onClick={onToggle}>
      <div className="trade-card__main" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: "bold", color: "#fff" }}>{trade.ticker}</span>
            <span style={{ fontSize: 10, color: cur === "USD" ? green : blue, border: `1px solid ${cur === "USD" ? green + "30" : blue + "30"}`, borderRadius: 4, padding: "1px 5px" }}>{sym(cur)}</span>
            <span style={{ fontSize: 10, color: trade.direction === "LONG" ? green : red, border: `1px solid ${trade.direction === "LONG" ? green + "30" : red + "30"}`, borderRadius: 4, padding: "1px 5px" }}>{trade.direction}</span>
            {trade.setupType && <span style={{ fontSize: 10, color: blue, border: `1px solid ${blue}30`, borderRadius: 4, padding: "1px 5px" }}>{trade.setupType}</span>}
            {trade.siguioPlan === "NO" && <span style={{ fontSize: 10, color: gold, border: `1px solid ${gold}30`, borderRadius: 4, padding: "1px 5px" }}>⚠ Sin plan</span>}
            {isOpen && <span style={{ fontSize: 10, color: green, border: `1px solid ${green}30`, borderRadius: 4, padding: "1px 5px" }}>● Abierta</span>}
          </div>
          <div style={{ fontSize: 11, color: "#6b7285" }}>
            {trade.date} · {sym(cur)}{trade.entryPrice}{trade.exitPrice ? ` → ${sym(cur)}${trade.exitPrice}` : trade.targetPrice ? ` · Obj: ${sym(cur)}${trade.targetPrice}` : ""}
          </div>
          {trade.stopLoss && <div style={{ fontSize: 11, color: "#6b7285", marginTop: 2 }}>Stop: {sym(cur)}{trade.stopLoss}{rr !== null && <span style={{ color: rr >= 2 ? green : rr >= 1 ? gold : red, marginLeft: 8 }}>R/R 1:{rr}</span>}</div>}
          {trade.duration && <div style={{ fontSize: 11, color: "#6b7285", marginTop: 2 }}>⏱ {trade.duration}{trade.durationUnit}{trade.expectedDuration ? ` (esp: ${trade.expectedDuration}${trade.expectedDurationUnit})` : ""}</div>}
        </div>
        <div className="trade-card__aside" style={{ textAlign: "right", marginLeft: 12, minWidth: 90 }} onClick={(e) => e.stopPropagation()}>
          {r ? (
            <>
              <div style={{ fontSize: 18, fontWeight: "bold", color: col(r.pnl), lineHeight: 1.1 }}>{r.pnl >= 0 ? "+" : ""}{r.pnl}{sym(cur)}</div>
              <div style={{ fontSize: 15, fontWeight: "bold", color: r.pct >= 0 ? "#00c89888" : "#ff4d6d88" }}>({r.pct >= 0 ? "+" : ""}{r.pct}%)</div>
              {cur === "USD" && <div style={{ fontSize: 11, color: "#7d8597" }}>{r.pnlEur >= 0 ? "+" : ""}{r.pnlEur}€</div>}
              {r.comm > 0 && <div style={{ fontSize: 10, color: "#ff4d6d44", marginTop: 2 }}>-{r.comm}{sym(cur)} com</div>}
            </>
          ) : <div style={{ fontSize: 12, color: "#00c89855", fontWeight: "bold" }}>Abierta</div>}
          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="icon-button" title="Editar operación" aria-label="Editar operación" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: "#7d8597", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>✏️</button>
            <button className="icon-button icon-button--danger" title="Eliminar operación" aria-label="Eliminar operación" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: "#7d8597", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 13 }}>🗑</button>
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }} onClick={(e) => e.stopPropagation()}>
          <div className="trade-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { label: "Invertido", value: `${sym(cur)}${fmt((parseFloat(trade.entryPrice) || 0) * (parseFloat(trade.shares) || 0))}` },
              { label: "Stop loss", value: trade.stopLoss ? `${sym(cur)}${trade.stopLoss}` : "—", color: trade.stopLoss ? red : muted },
              { label: "Objetivo", value: trade.targetPrice ? `${sym(cur)}${trade.targetPrice}` : "—", color: trade.targetPrice ? green : muted },
            ].map((m) => (
              <div key={m.label} style={{ background: "#ffffff04", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: muted, letterSpacing: 1, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, fontWeight: "bold", color: m.color || "#ccc" }}>{m.value}</div>
              </div>
            ))}
          </div>
          {trade.motivo && <div style={{ fontSize: 12, color: "#7d8597", marginBottom: 6 }}>💡 {trade.motivo}</div>}
          {trade.notas && <div style={{ fontSize: 12, color: "#7d8597" }}>📝 {trade.notas}</div>}
        </div>
      )}
    </div>
  );
}

// ── Journal ────────────────────────────────────────────
function Journal({ onLogout }) {
  const [trades, setTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [fxRate, setFxRate] = useState(1.08);
  const [view, setView] = useState("dashboard");
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingFx, setEditingFx] = useState(false);
  const [fxInput, setFxInput] = useState("1.08");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [tr, st] = await Promise.all([apiFetch("/trades").then((r) => r.json()), apiFetch("/settings").then((r) => r.json())]);
        setTrades(tr);
        if (st.fxRate) { setFxRate(parseFloat(st.fxRate)); setFxInput(st.fxRate); }
      } catch {}
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
    } catch { alert("Error guardando"); }
    setSaving(false);
  }

  async function deleteTrade(id) {
    try { await apiFetch(`/trades/${id}`, { method: "DELETE" }); setTrades(trades.filter((t) => t.id !== id)); }
    catch { alert("Error eliminando"); }
  }

  async function saveFx(val) {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      try {
        await apiFetch("/settings/fxRate", { method: "PUT", body: JSON.stringify({ value: n }) });
        setFxRate(n);
      } catch (error) {
        alert(error.message || "Error guardando el tipo de cambio");
      }
    }
    setEditingFx(false);
  }

  const metrics = calcMetrics(trades, fxRate);
  const openTrades = trades.filter((t) => !t.exitPrice);
  const closedTrades = trades.filter((t) => t.exitPrice);

  if (!loaded) return <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: green, fontFamily: "monospace" }}>Cargando...</div></div>;

  return (
    <div className="app-shell" style={{ background: BG, minHeight: "100vh", fontFamily: "monospace", color: "#e0e0e0" }}>
      <div className="journal-header" style={{ borderBottom: `1px solid ${BORDER}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="journal-brand"><div style={{ fontSize: 10, color: green, letterSpacing: 4 }}>TRADING JOURNAL</div><div style={{ fontSize: 18, fontWeight: "bold", color: "#fff" }}>Mi Registro</div></div>
        <div className="journal-nav" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="fx-button" title="Editar tipo de cambio" onClick={() => { setEditingFx(true); setFxInput(String(fxRate)); }} style={{ cursor: "pointer", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 9px", fontSize: 10, color: muted }}>💱 1$={(1 / fxRate).toFixed(3)}€</button>
          {[
            ["dashboard", "📊", "Resumen"],
            ["form", "＋", "Nueva"],
            ["history", "📋", "Historial"],
            ["stats", "📈", "Stats"],
          ].map(([v, icon, label]) => (
            <button className="nav-button" aria-label={label} title={label} key={v} onClick={() => { setView(v); if (v !== "form") setEditing(null); }} style={{ background: view === v ? green : "transparent", color: view === v ? BG : muted, border: `1px solid ${view === v ? green : BORDER}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}><span>{icon}</span><span className="nav-label">{label}</span></button>
          ))}
          <button className="nav-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => { clearToken(); onLogout(); }} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: muted, borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>↩</button>
        </div>
      </div>

      {editingFx && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="modal-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, width: 320 }}>
            <div style={{ fontSize: 11, color: green, letterSpacing: 2, marginBottom: 8 }}>TIPO DE CAMBIO</div>
            <div style={{ fontSize: 11, color: "#6b7285", marginBottom: 12 }}>1€ = {fxRate.toFixed(3)}$ · 1$ = {(1 / fxRate).toFixed(4)}€</div>
            <input type="number" value={fxInput} onChange={(e) => setFxInput(e.target.value)} style={{ ...inp, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditingFx(false)} style={{ flex: 1, background: "transparent", border: `1px solid ${BORDER}`, color: "#666", borderRadius: 8, padding: 10, cursor: "pointer", fontFamily: "monospace" }}>Cancelar</button>
              <button onClick={() => saveFx(fxInput)} style={{ flex: 1, background: green, color: BG, border: "none", borderRadius: 8, padding: 10, cursor: "pointer", fontFamily: "monospace", fontWeight: "bold" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <main className="journal-content" style={{ padding: "20px 16px 40px", maxWidth: 640, margin: "0 auto" }}>

        {view === "dashboard" && (
          <div>
            {openTrades.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: green, letterSpacing: 3, marginBottom: 10 }}>ABIERTAS ({openTrades.length})</div>
                {openTrades.map((t) => <TradeCard key={t.id} trade={t} fxRate={fxRate} onEdit={() => { setEditing(t); setView("form"); }} onDelete={() => deleteTrade(t.id)} expanded={expandedId === t.id} onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)} />)}
              </div>
            )}
            {!metrics ? (
              <div style={{ textAlign: "center", padding: "50px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
                <div style={{ color: "#6b7285", fontSize: 14, marginBottom: 20 }}>Sin operaciones cerradas</div>
                <button onClick={() => setView("form")} style={{ background: green, color: BG, border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 13, cursor: "pointer", fontFamily: "monospace", fontWeight: "bold" }}>+ Primera operación</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: muted, letterSpacing: 3, marginBottom: 10 }}>RESUMEN ({closedTrades.length} cerradas)</div>
                <div style={{ ...mkCard(), textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: 10, color: muted, letterSpacing: 3, marginBottom: 8 }}>P&L NETO TOTAL</div>
                  <div style={{ fontSize: 38, fontWeight: "bold", color: col(parseFloat(metrics.totalPnlEur)), lineHeight: 1 }}>{parseFloat(metrics.totalPnlEur) >= 0 ? "+" : ""}{metrics.totalPnlEur}€</div>
                  <div style={{ fontSize: 16, color: parseFloat(metrics.compoundedReturn) >= 0 ? "#00c89888" : "#ff4d6d88", marginTop: 6 }}>Retorno comp.: {parseFloat(metrics.compoundedReturn) >= 0 ? "+" : ""}{metrics.compoundedReturn}%</div>
                  {parseFloat(metrics.totalCommEur) > 0 && <div style={{ fontSize: 11, color: "#ff4d6d44", marginTop: 6 }}>💸 Comisiones: -{metrics.totalCommEur}€</div>}
                </div>
                <div className="metrics-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "Win Rate", value: `${metrics.winRate}%`, color: parseFloat(metrics.winRate) >= 50 ? green : "#ff8844" },
                    { label: "R/R Real", value: `1:${metrics.rr}`, color: parseFloat(metrics.rr) >= 1.5 ? green : parseFloat(metrics.rr) >= 1 ? gold : red },
                    { label: "Esperanza", value: `${parseFloat(metrics.expectancy) >= 0 ? "+" : ""}${metrics.expectancy}€`, color: parseFloat(metrics.expectancy) >= 0 ? green : red },
                    { label: "Ops", value: `${metrics.winners}W / ${metrics.losers}L`, color: "#aaa" },
                  ].map((m) => <div key={m.label} style={mkCard()}><div style={{ fontSize: 10, color: muted, letterSpacing: 2, marginBottom: 5 }}>{m.label}</div><div style={{ fontSize: 20, fontWeight: "bold", color: m.color }}>{m.value}</div></div>)}
                </div>
                <div style={{ ...mkCard(), border: `1px solid ${parseFloat(metrics.expectancy) >= 0 ? green + "33" : red + "33"}` }}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>📌 Sistema</div>
                  <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>{parseFloat(metrics.expectancy) >= 0 ? `Esperanza positiva (${metrics.expectancy}€/op). Sistema viable.` : `Esperanza negativa (${metrics.expectancy}€/op). Necesitas mejorar R/R o win rate.`}</div>
                </div>
              </div>
            )}
            <button onClick={() => { setEditing(null); setView("form"); }} style={{ width: "100%", marginTop: 10, background: green, color: BG, border: "none", borderRadius: 8, padding: "13px", fontSize: 13, cursor: "pointer", fontFamily: "monospace", fontWeight: "bold" }}>+ NUEVA OPERACIÓN</button>
          </div>
        )}

        {view === "form" && <TradeForm initial={editing} onSave={saveTrade} onCancel={() => { setEditing(null); setView("dashboard"); }} saving={saving} />}

        {view === "history" && (
          <div>
            <div style={{ fontSize: 12, color: green, marginBottom: 16, letterSpacing: 3 }}>HISTORIAL ({trades.length})</div>
            {trades.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: "#596174" }}>Sin operaciones</div>
              : trades.map((t) => <TradeCard key={t.id} trade={t} fxRate={fxRate} onEdit={() => { setEditing(t); setView("form"); }} onDelete={() => deleteTrade(t.id)} expanded={expandedId === t.id} onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)} />)}
          </div>
        )}

        {view === "stats" && (
          <div>
            <div style={{ fontSize: 12, color: green, marginBottom: 16, letterSpacing: 3 }}>ANÁLISIS POR SETUP</div>
            {!metrics || !Object.keys(metrics.bySetup).length
              ? <div style={{ textAlign: "center", padding: "40px 0", color: "#596174" }}>Cierra operaciones con setup asignado para ver el análisis</div>
              : <div>
                {Object.entries(metrics.bySetup).sort((a, b) => b[1].pnlEur - a[1].pnlEur).map(([setup, s]) => {
                  const wr = ((s.wins / s.count) * 100).toFixed(0);
                  return (
                    <div key={setup} style={mkCard()}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><div style={{ fontSize: 14, fontWeight: "bold", color: blue, marginBottom: 4 }}>{setup}</div><div style={{ fontSize: 11, color: muted }}>{s.count} ops · {wr}% WR</div></div>
                        <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: "bold", color: col(s.pnlEur) }}>{s.pnlEur >= 0 ? "+" : ""}{s.pnlEur.toFixed(2)}€</div><div style={{ fontSize: 11, color: muted }}>{s.wins}W / {s.count - s.wins}L</div></div>
                      </div>
                      <div style={{ background: "#ffffff08", borderRadius: 3, height: 4, marginTop: 10 }}><div style={{ background: parseInt(wr) >= 50 ? green : red, height: "100%", width: `${wr}%`, borderRadius: 3 }} /></div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
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
  if (checking) return <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: green, fontFamily: "monospace" }}>...</div></div>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Journal onLogout={() => setAuthed(false)} />;
}

