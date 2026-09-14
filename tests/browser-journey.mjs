import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:3000";
const output = resolve(".wrangler/browser-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: process.env.BROWSER_HEADED !== "1",
  args: ["--enable-webgl", "--ignore-gpu-blocklist", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
});
const errors = [];
const record = [];
function track(page) { page.on("pageerror", error => errors.push(error.message)); page.setDefaultTimeout(30000); }
async function chapter(page, index) { await page.waitForSelector(`.journey-shell.chapter-${index}`); }
async function ready(page, fallback = false) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(fallback ? ".world-fallback" : '.world-host[data-ready="true"]', { timeout: 120000 });
}
async function capture(page, name) {
  await page.waitForTimeout(250);
  if (!name.includes("webgl-fallback")) assert.equal(await page.locator("canvas").count(), 1);
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true, timeout: 120000 });
  record.push(name); console.log(`Verified ${name}`);
}
async function progress(page, amount) {
  await page.waitForFunction(value => document.querySelector(".making-progress")?.value >= value, amount, { timeout: 60000 });
}
async function finishQuickly(page) {
  for (let index = 4; index <= 6; index++) { await chapter(page, index); await page.getByRole("button", { name: "Skip this step" }).click(); }
  await chapter(page, 7); await page.getByRole("button", { name: "Finish wrapping" }).click();
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" }); track(page);
  await ready(page); await page.getByRole("button", { name: "Enable bakery sound" }).click(); assert.equal(await page.getByRole("button", { name: "Mute bakery sound" }).getAttribute("aria-pressed"), "true"); await page.getByRole("button", { name: "Mute bakery sound" }).click(); assert.equal(await page.locator("canvas").count(), 1); await capture(page, "01-arrival-desktop");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Enter the bakery", exact: true }).click(); await chapter(page, 1); await page.waitForTimeout(5000); await capture(page, "02-welcome-desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Explore the counter" }).click(); await chapter(page, 2);
  await page.getByRole("button", { name: /Dark Cacao From/ }).focus(); await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("button", { name: /Dark Cacao From/ }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /Pistachio Cloud From/ }).focus(); await page.keyboard.press("Enter"); await capture(page, "03-counter-desktop");
  await page.getByRole("button", { name: "Make this cake yours" }).click(); await chapter(page, 3);
  await page.getByRole("button", { name: "8 servings", exact: true }).click();
  await page.getByRole("button", { name: "Dark chocolate", exact: true }).click();
  await page.getByRole("button", { name: "Pistachio", exact: true }).click();
  assert.match(await page.locator(".price-line").innerText(), /2,980/);
  await page.getByRole("button", { name: "Rotate cake right" }).click(); await capture(page, "04-create-desktop");
  await page.getByRole("button", { name: /Your cake/ }).click();
  assert.match(await page.locator(".summary-drawer").innerText(), /8 servings[\s\S]*Dark chocolate[\s\S]*Pistachio[\s\S]*2,980/);
  await page.getByRole("button", { name: "Close order summary" }).click();
  await page.getByRole("button", { name: "Give Émile my order" }).click(); await chapter(page, 4);
  await page.getByRole("button", { name: "Ⅱ Pause", exact: true }).click(); await page.waitForTimeout(200);
  const frozen = await page.locator(".making-progress").evaluate(el => el.value); await page.waitForTimeout(800);
  assert.equal(await page.locator(".making-progress").evaluate(el => el.value), frozen);
  await page.getByRole("button", { name: "▶ Resume", exact: true }).click();
  await progress(page, .44); await capture(page, "05-ingredients-desktop");
  await chapter(page, 5); await progress(page, .26); await capture(page, "06-pouring-desktop");
  await progress(page, .62); await capture(page, "07-baking-desktop");
  assert.match(await page.locator(".order-ticket").innerText(), /8 servings[\s\S]*Dark chocolate[\s\S]*Pistachio[\s\S]*2,980/);
  await chapter(page, 6); await progress(page, .5); await capture(page, "08-piping-desktop");
  await progress(page, .88); await capture(page, "09-decorated-desktop");
  await chapter(page, 7); await progress(page, .46); await capture(page, "10-wrapping-desktop");
  await progress(page, 1); await capture(page, "11-box-desktop");
  await page.getByRole("button", { name: /Confirm demo order/ }).click();
  assert.match(await page.locator(".completion").innerText(), /Pistachio Cloud[\s\S]*8 servings[\s\S]*2,980[\s\S]*No payment taken/);
  await page.getByRole("button", { name: "5. The kitchen", exact: true }).click(); await chapter(page, 4); await page.waitForTimeout(2000);
  assert.equal(await page.locator(".journey-shell.chapter-4").count(), 1);
  await page.getByRole("button", { name: "8. Made for you", exact: true }).click(); await chapter(page, 7); await capture(page, "12-confirmed-desktop");
  await page.getByRole("button", { name: "Create another cake" }).click(); await chapter(page, 2);
  await page.getByRole("button", { name: "Make this cake yours" }).click();
  await page.getByRole("button", { name: "Vanilla bean", exact: true }).click(); await page.getByRole("button", { name: "Fresh berries", exact: true }).click();
  assert.match(await page.locator(".price-line").innerText(), /2,760/);
  assert.equal(await page.getByRole("button", { name: "8. Made for you", exact: true }).isDisabled(), true);
  await page.locator("canvas").evaluate(canvas => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await page.waitForSelector(".world-fallback"); assert.equal(await page.locator("canvas").count(), 0);
  console.log("Verified order revisions, completed chapter review, and context-loss cleanup");
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" }); track(mobile);
  await ready(mobile); assert.match(await mobile.locator("h1").innerText(), /Every crumb\s+tells a story/); await capture(mobile, "13-arrival-mobile");
  await mobile.getByRole("button", { name: "Enter the bakery", exact: true }).click();
  await mobile.getByRole("button", { name: "Explore the counter" }).click(); await chapter(mobile, 2);
  await mobile.getByRole("button", { name: /Dark Cacao From/ }).click(); await capture(mobile, "14-counter-mobile");
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 180 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 280, y: 185 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await mobile.getByRole("button", { name: "Make this cake yours" }).click();
  await mobile.getByRole("button", { name: "6 servings", exact: true }).click(); await mobile.getByRole("button", { name: "Fresh berries", exact: true }).click();
  assert.match(await mobile.locator(".price-line").innerText(), /1,860/);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await capture(mobile, "15-create-mobile");
  await mobile.getByRole("button", { name: "Give Émile my order" }).click(); await finishQuickly(mobile);
  await mobile.getByRole("button", { name: /Confirm demo order/ }).click();
  assert.match(await mobile.locator(".completion").innerText(), /Dark Cacao[\s\S]*6 servings[\s\S]*1,860/); await capture(mobile, "16-confirmed-mobile");
  await mobile.close();

  const fallback = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" }); track(fallback);
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind.includes("webgl") ? null : getContext.call(this, kind, ...args); };
  });
  await ready(fallback, true); assert.equal(await fallback.locator("canvas").count(), 0);
  await fallback.getByRole("button", { name: "Enter the bakery", exact: true }).click(); await fallback.getByRole("button", { name: "Explore the counter" }).click();
  await fallback.getByRole("button", { name: "Make this cake yours" }).click(); await fallback.getByRole("button", { name: "Give Émile my order" }).click();
  await finishQuickly(fallback); await fallback.getByRole("button", { name: /Confirm demo order/ }).click();
  assert.match(await fallback.locator(".completion").innerText(), /Demo order confirmed/); await capture(fallback, "17-webgl-fallback");
  assert.deepEqual(errors, []); await writeFile(resolve(output, "results.json"), JSON.stringify({ url, screenshots: record, javascriptErrors: errors, desktopOrder: 2980, mobileOrder: 1860, checked: ["all automatic stages", "pause", "keyboard", "touch rotation", "recipe revisions", "chapter review", "reduced motion", "WebGL failure", "context loss", "demo confirmation"] }, null, 2));
  console.log("All browser journey checks passed.");
} finally { await browser.close(); }
