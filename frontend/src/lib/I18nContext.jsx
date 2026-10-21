import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGS, STORAGE_KEY, createFormatters, createT, detectLang, setActiveLang } from "./i18n.js";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => { const l = detectLang(); setActiveLang(l); return l; });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((next) => {
    if (!LANGS[next]) return;
    setActiveLang(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
    setLangState(next);
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: createT(lang), fmt: createFormatters(lang) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function LangSelect({ className = "lang-select" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select className={className} aria-label={t("lang.label")} value={lang} onChange={(e) => setLang(e.target.value)}>
      {Object.entries(LANGS).map(([code, { label }]) => <option key={code} value={code} lang={code}>{label}</option>)}
    </select>
  );
}
