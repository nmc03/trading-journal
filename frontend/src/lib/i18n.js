// Pure i18n core (no React). To add a language: create locales/xx.js and add one line to LANGS.
import es from "./locales/es.js";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import de from "./locales/de.js";
import pt from "./locales/pt.js";

export const LANGS = {
  es: { label: "Español", locale: "es-ES", dict: es },
  en: { label: "English", locale: "en-GB", dict: en },
  fr: { label: "Français", locale: "fr-FR", dict: fr },
  de: { label: "Deutsch", locale: "de-DE", dict: de },
  pt: { label: "Português", locale: "pt-PT", dict: pt },
};
export const DEFAULT_LANG = "es";
export const STORAGE_KEY = "tj_lang";

export function detectLang() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = globalThis.navigator;
  const prefs = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  for (const tag of prefs) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (LANGS[code]) return code;
  }
  return DEFAULT_LANG;
}

// Language used by non-React code (API headers, error messages).
let active = DEFAULT_LANG;
export const getActiveLang = () => active;
export const setActiveLang = (lang) => { if (LANGS[lang]) active = lang; };

export function createT(lang) {
  const entry = LANGS[lang] ?? LANGS[DEFAULT_LANG];
  const base = LANGS[DEFAULT_LANG].dict;
  const plural = new Intl.PluralRules(entry.locale);
  const has = (k) => k in entry.dict || k in base;
  return function t(key, vars = {}) {
    let k = key;
    if (typeof vars.count === "number") {
      const pk = `${key}_${plural.select(vars.count)}`;
      if (has(pk)) k = pk;
      else if (has(`${key}_other`)) k = `${key}_other`;
    }
    const text = entry.dict[k] ?? base[k] ?? key;
    return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
}

const NBSP = " ";

export function createFormatters(lang) {
  const { locale } = LANGS[lang] ?? LANGS[DEFAULT_LANG];
  const num = (n) => Number(n) || 0;
  const cache = new Map();
  const nf = (opts) => {
    const key = JSON.stringify(opts);
    if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(locale, opts));
    return cache.get(key);
  };
  const cur = (c) => ({ style: "currency", currency: c === "USD" ? "USD" : "EUR", currencyDisplay: "narrowSymbol" });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const number = (n, digits = 2) => nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(num(n));
  const signed = (n) => nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(num(n));
  return {
    number,
    signed,
    money: (n, c = "EUR") => nf({ ...cur(c), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(n)),
    moneySigned: (n, c = "EUR") => nf({ ...cur(c), minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(num(n)),
    price: (n, c = "EUR") => nf({ ...cur(c), minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(n)),
    pct: (n) => `${signed(n)} %`,
    date: (iso) => {
      const [y, m, d] = String(iso).split("-").map(Number);
      return y ? dateFmt.format(new Date(y, m - 1, d)) : iso;
    },
    fx: (rate) => `1${NBSP}€ = ${number(rate, 3)}${NBSP}$`,
    symbol: (c) => (c === "USD" ? "$" : "€"),
  };
}
