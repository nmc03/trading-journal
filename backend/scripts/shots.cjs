// Generates the README media for every UI language from a running dev instance seeded with scripts/seed-demo.js:
//   docs/screenshots/<lang>/{dashboard,dashboard-dark,history,stats,new-trade,mobile}.png and docs/demo-<lang>.gif
// Needs dev-only tools that are not project dependencies, and a local Chrome:
//   npm i --no-save playwright-core gifenc pngjs
//   TJ_USER=... TJ_PASSWORD=... node scripts/shots.cjs            (all languages)
//   SHOT_LANGS=es,en TJ_USER=... TJ_PASSWORD=... node scripts/shots.cjs
// Selectors are language-neutral (names, positions, classes) so the same flow runs in every language.
const { chromium } = require("playwright-core");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const URL = process.env.TJ_APP_URL || "http://localhost:5173";
const DOCS = path.join(__dirname, "..", "..", "docs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const { TJ_USER, TJ_PASSWORD } = process.env;
const LOCALES = { es: "es-ES", en: "en-GB", fr: "fr-FR", de: "de-DE", pt: "pt-PT" };
const WANTED = (process.env.SHOT_LANGS || Object.keys(LOCALES).join(",")).split(",");

// The browser language drives the app's language detection; a fresh context has no stored preference.
const newContext = (browser, lang, opts) => browser.newContext({ locale: LOCALES[lang], ...opts });

// The API limits logins (10 per 15 minutes), so log in once and reuse the token in every context.
// Only the GIF goes through the login screen.
let TOKEN;
async function apiToken() {
  if (TOKEN) return TOKEN;
  const res = await fetch(`${process.env.TJ_API_URL || "http://localhost:3001"}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TJ_USER, password: TJ_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  TOKEN = (await res.json()).token;
  return TOKEN;
}

async function login(page) {
  const token = await apiToken();
  await page.addInitScript((t) => { try { localStorage.setItem("tj_token", t); } catch {} }, token);
  await page.goto(URL);
  await page.waitForSelector(".hero");
}

// Full-page captures would repeat the sticky header mid-page.
const flatten = (page) => page.addStyleTag({ content: ".topbar{position:static!important}" });
const tab = (page, i) => page.locator(".tabs button").nth(i).click();

async function fillNewTrade(page, ticker, entry, stop, target) {
  const inputs = page.locator(".form input");
  await inputs.nth(1).fill(ticker); // 0 = date, 1 = ticker
  await inputs.nth(2).fill(entry);
  await inputs.nth(4).fill(stop);
  await inputs.nth(5).fill(target);
}

async function stills(browser, lang) {
  const out = path.join(DOCS, "screenshots", lang);
  fs.mkdirSync(out, { recursive: true });
  const shot = (name) => path.join(out, `${name}.png`);

  for (const scheme of ["light", "dark"]) {
    const ctx = await newContext(browser, lang, { viewport: { width: 1000, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await login(page);
    await flatten(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot(scheme === "light" ? "dashboard" : "dashboard-dark"), fullPage: true });
    if (scheme === "light") {
      await tab(page, 2);
      await page.locator(".row__main", { hasText: "NVDA" }).click();
      await page.screenshot({ path: shot("history"), fullPage: true });
      await tab(page, 3);
      await page.screenshot({ path: shot("stats"), fullPage: true });
      await tab(page, 1);
      await fillNewTrade(page, "NVDA", "118.4", "114", "128");
      await page.screenshot({ path: shot("new-trade"), fullPage: true });
    }
    await ctx.close();
  }

  const mobile = await newContext(browser, lang, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const m = await mobile.newPage();
  await login(m);
  await m.waitForTimeout(1200);
  await m.screenshot({ path: shot("mobile") });
  await mobile.close();
}

async function demoGif(browser, lang) {
  const W = 880, H = 600;
  const ctx = await newContext(browser, lang, { viewport: { width: W, height: H }, colorScheme: "light" });
  const page = await ctx.newPage();
  const gif = GIFEncoder();
  const frame = async (delay) => {
    const png = PNG.sync.read(await page.screenshot());
    const rgba = new Uint8Array(png.data);
    const palette = quantize(rgba, 128, { format: "rgb565" });
    gif.writeFrame(applyPalette(rgba, palette, "rgb565"), png.width, png.height, { palette, delay });
  };
  await page.goto(URL);
  await page.fill('input[name="username"]', TJ_USER);
  await page.fill('input[name="password"]', TJ_PASSWORD);
  await frame(1100);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector(".hero");
  for (let i = 0; i < 7; i++) { await frame(110); await page.waitForTimeout(90); }
  await frame(1400);
  await page.mouse.wheel(0, 520); await page.waitForTimeout(250); await frame(1500);
  await tab(page, 2);
  await page.locator(".row__main", { hasText: "NVDA" }).click();
  await page.waitForTimeout(200); await frame(1800);
  await tab(page, 1);
  await page.locator(".form input").nth(1).fill("AMD");
  await frame(500);
  await fillNewTrade(page, "AMD", "152.8", "148", "162");
  await page.waitForTimeout(150); await frame(1800);
  await tab(page, 3);
  await page.waitForTimeout(200); await frame(1800);
  gif.finish();
  fs.writeFileSync(path.join(DOCS, `demo-${lang}.gif`), gif.bytes());
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const lang of WANTED) {
    if (!LOCALES[lang]) throw new Error(`unknown language: ${lang}`);
    await stills(browser, lang);
    await demoGif(browser, lang);
    console.log("done:", lang);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
