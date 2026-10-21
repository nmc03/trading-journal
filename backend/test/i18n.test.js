const test = require("node:test");
const assert = require("node:assert/strict");
const { MESSAGES, LANGS, translate, pickLang } = require("../i18n");

const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every language has exactly the same keys and placeholders as Spanish", () => {
  const base = MESSAGES.es;
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(MESSAGES[lang]).sort(), Object.keys(base).sort(), `${lang}: keys differ from es`);
    for (const key of Object.keys(base)) {
      assert.equal(vars(MESSAGES[lang][key]), vars(base[key]), `${lang}.${key}: placeholders differ`);
      assert.ok(MESSAGES[lang][key].trim(), `${lang}.${key} is empty`);
    }
  }
});

test("translate fills the localised field label and falls back to Spanish", () => {
  assert.equal(translate("es", "positive", { field: "entryPrice" }), "Precio de entrada: debe ser mayor que cero");
  assert.equal(translate("en", "positive", { field: "entryPrice" }), "Entry price: must be greater than zero");
  assert.equal(translate("xx", "internal"), "Error interno");
  assert.equal(translate("en", "nope"), "nope");
});

test("pickLang honours Accept-Language and defaults to Spanish", () => {
  const req = (header) => ({ acceptsLanguages: (...langs) => {
    if (!header) return langs[0];
    const want = header.split(",").map((x) => x.trim().split(";")[0].split("-")[0]);
    return want.find((w) => langs.includes(w)) || false;
  } });
  assert.equal(pickLang(req("")), "es");
  assert.equal(pickLang(req("en-GB,en;q=0.9")), "en");
  assert.equal(pickLang(req("ja")), "es");
});
