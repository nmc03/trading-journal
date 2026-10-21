import test from "node:test";
import assert from "node:assert/strict";
import { LANGS, createT, createFormatters, detectLang } from "./i18n.js";

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every registered locale has exactly the keys and {variables} of es.js", () => {
  const ref = LANGS.es.dict;
  for (const [code, { dict, label, locale }] of Object.entries(LANGS)) {
    assert.ok(label && locale, `${code}: label and locale are required`);
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(ref).sort(), `${code}: keys differ from es.js`);
    for (const key of Object.keys(ref)) {
      assert.equal(typeof dict[key], "string", `${code}.${key} must be a string`);
      assert.ok(dict[key].length > 0, `${code}.${key} is empty`);
      assert.equal(vars(dict[key]), vars(ref[key]), `${code}.${key}: variables differ from es.js`);
    }
  }
});

function withNavigator(languages, storage, fn) {
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const ls = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "navigator", { value: { languages }, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k) => storage[k] ?? null }, configurable: true });
  try { return fn(); } finally {
    nav ? Object.defineProperty(globalThis, "navigator", nav) : delete globalThis.navigator;
    ls ? Object.defineProperty(globalThis, "localStorage", ls) : delete globalThis.localStorage;
  }
}

test("detectLang: stored choice, then navigator.languages by prefix, then es", () => {
  assert.equal(withNavigator(["en-US"], { tj_lang: "es" }, detectLang), "es");
  assert.equal(withNavigator(["en-US"], {}, detectLang), "en");
  assert.equal(withNavigator(["zz-ZZ", "en-GB", "es"], {}, detectLang), "en");
  assert.equal(withNavigator(["zz"], {}, detectLang), "es");
  assert.equal(withNavigator([], { tj_lang: "xx" }, detectLang), "es");
});

test("t interpolates variables, picks plural forms and falls back", () => {
  const es = createT("es"), en = createT("en");
  assert.equal(es("nav.summary"), "Resumen");
  assert.equal(en("nav.summary"), "Summary");
  assert.equal(es("dash.heroLabel", { count: 1 }), "P&L neto · 1 operación cerrada");
  assert.equal(es("dash.heroLabel", { count: 3 }), "P&L neto · 3 operaciones cerradas");
  assert.equal(en("dash.heroLabel", { count: 1 }), "Net P&L · 1 closed trade");
  assert.equal(en("dash.heroLabel", { count: 2 }), "Net P&L · 2 closed trades");
  assert.equal(en("confirm.delete", { ticker: "TSLA", date: "5 Jan 2026" }), "Delete the TSLA trade from 5 Jan 2026? This cannot be undone.");
  assert.equal(en("error.http", {}), "HTTP error {status}"); // missing variable is left visible
  assert.equal(es("no.such.key"), "no.such.key");
  assert.equal(createT("xx")("nav.summary"), "Resumen"); // unknown language -> es
});

test("t falls back to es for a key missing in another language", () => {
  const original = LANGS.en.dict["nav.summary"];
  delete LANGS.en.dict["nav.summary"];
  try { assert.equal(createT("en")("nav.summary"), "Resumen"); } finally { LANGS.en.dict["nav.summary"] = original; }
});

test("formatters follow the locale and use real currencies", () => {
  const es = createFormatters("es"), en = createFormatters("en");
  const esMoney = es.money(1234.5, "EUR");
  assert.ok(/1\.?234,50/.test(esMoney) && esMoney.includes("€"), esMoney);
  assert.ok(es.money(10, "USD").includes("$"));
  const enMoney = en.money(1234.5, "EUR");
  assert.ok(enMoney.includes("1,234.50") && enMoney.includes("€"), enMoney);
  assert.equal(es.number(1.5), "1,50");
  assert.equal(en.number(1.5), "1.50");
  assert.equal(es.signed(5), "+5,00");
  assert.equal(es.signed(0), "0,00");
  assert.ok(es.moneySigned(-5, "EUR").startsWith("-5,00"));
  assert.equal(es.pct(5), "+5,00 %");
  assert.ok(es.price(12.34567, "USD").startsWith("12,3457"));
  assert.equal(es.date("2026-01-05"), "5 ene 2026");
  assert.equal(en.date("2026-01-05"), "5 Jan 2026");
  assert.equal(es.date("not-a-date"), "not-a-date");
  assert.equal(es.fx(1.08), "1 € = 1,080 $");
});
