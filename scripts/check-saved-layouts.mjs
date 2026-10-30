import { chooseSelect } from "./lib/choose-select.mjs";
/**
 * Saved layouts in a real browser against the local server, which keeps them:
 *   PORT=4391 npm run dev   then   STUDIO_URL=http://127.0.0.1:4391 node scripts/check-saved-layouts.mjs
 * Save, reset, open, rename and delete through Ninja's configuration; a
 * second browser context sees the same list; a hosted-style page (no layouts
 * route) keeps them in the browser and imports an exported file; the phone
 * width has no overflow and 44 px targets. Paid routes are blocked, and the
 * layouts this check saves are deleted before it ends.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4391";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? ".local/saved-layouts";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
const name = `Check ${Date.now().toString(36)}`;

async function open(
  viewport = { width: 1440, height: 1000 },
  hosted = false,
  blocked = false,
) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  // Full or blocked storage: every write throws, reads still work.
  if (blocked)
    await context.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("full", "QuotaExceededError");
      };
    });
  await context.route(/\/api\/(jobs|uploads|chains|quotes)/, (route) =>
    route.request().method() === "GET" ? route.fallback() : route.abort(),
  );
  // The hosted Worker answers 404 for /api/layouts.
  if (hosted)
    await context.route("**/api/layouts**", (route) =>
      route.fulfill({ status: 404, json: { error: "API route not found." } }),
    );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?workspace=ninja`);
  const gear = page.getByRole("button", { name: "Configure Ninja" });
  if ((await gear.getAttribute("aria-pressed")) !== "true") await gear.click();
  await page
    .getByText(hosted ? "Kept in this browser" : "Kept by the studio server")
    .waitFor();
  return { context, page };
}
const order = (page) =>
  page
    .locator(".genobi-grid > [data-panel]:not([hidden])")
    .evaluateAll((els) => els.map((e) => e.dataset.panel));
const said = (page, text) =>
  page.locator(".genobi-layout-message", { hasText: text }).waitFor();
const button = (page, label) =>
  page
    .locator(".genobi-saved-layouts")
    .getByRole("button", { name: label, exact: true });
const choose = (page, label) =>
  chooseSelect(page.getByLabel("Saved layout", { exact: true }), { label });

try {
  const { context: first, page } = await open();
  const defaults = await order(page);
  await page.locator(".genobi-picker label", { hasText: "Prompt" }).click();
  await page
    .locator(".genobi-picker label", { hasText: "Dual Swords" })
    .click();
  await page.waitForTimeout(800);
  const arranged = await order(page);
  assert.notDeepEqual(arranged, defaults);
  await page.getByLabel("Layout name").fill(name);
  await button(page, "Save as").click();
  await said(page, /Saved as/);
  checks.push("save as on the local server");

  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.waitForTimeout(800);
  assert.deepEqual(await order(page), defaults);
  await choose(page, name);
  await button(page, "Open").click();
  await page.waitForTimeout(800);
  assert.deepEqual(await order(page), arranged);
  checks.push("opening a saved layout restores its arrangement");

  await page.getByLabel("Layout name").fill(`${name} renamed`);
  await button(page, "Rename").click();
  await said(page, /renamed/);
  checks.push("rename");

  // Another browser on the same machine: a fresh context, no shared storage.
  const { context: second, page: other } = await open();
  await choose(other, `${name} renamed`);
  await button(other, "Open").click();
  await other.waitForTimeout(800);
  assert.deepEqual(await order(other), arranged);
  checks.push("a second browser opens the same saved layout");
  const download = other.waitForEvent("download");
  await button(other, "Export").click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8"));
  assert.equal(exported.format, "genobi.layouts");
  await other.screenshot({ path: `${output}/desktop-config.png` });

  // Hosted-style: no layouts route, so the browser keeps the imported file.
  const { context: hosted, page: away } = await open(undefined, true);
  await away.getByLabel("Import saved layouts JSON").setInputFiles(file);
  await away.getByText("Layouts imported").waitFor();
  await away.reload();
  const gear = away.getByRole("button", { name: "Configure Ninja" });
  if ((await gear.getAttribute("aria-pressed")) !== "true") await gear.click();
  await away.getByText("Kept in this browser").waitFor();
  await choose(away, `${name} renamed`);
  await button(away, "Open").click();
  await away.waitForTimeout(800);
  assert.deepEqual(await order(away), arranged);
  checks.push("export, import and reload in browser storage");
  await hosted.close();

  // A closed Editor rail survives a reload once its layout is opened.
  const railId = `check-rails-${Date.now().toString(36)}`;
  const saved = await fetch(`${base}/api/layouts/${railId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${name} rails`,
      layout: exported.layouts[0].layout,
      rails: { editor: false },
    }),
  });
  assert.equal(saved.status, 200);
  const { context: railContext, page: rail } = await open();
  const editorRail = async () => {
    await rail
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "Editor", exact: true })
      .click();
    await rail.waitForTimeout(750);
    return rail.locator(".studio-workspace").getAttribute("data-assets-open");
  };
  // Never opened a saved layout: Editor's rail docks open by default.
  assert.equal(await editorRail(), "true");
  await rail
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Ninja", exact: true })
    .click();
  await choose(rail, `${name} rails`);
  await button(rail, "Open").click();
  await said(rail, /Opened/);
  await rail.reload();
  assert.equal(await editorRail(), null);
  checks.push("an opened layout's closed rail stays closed after a reload");
  await railContext.close();
  await fetch(`${base}/api/layouts/${railId}`, { method: "DELETE" });

  // Storage that refuses writes: the layout opens, but stays unsaved.
  const { context: full, page: stuck } = await open(undefined, false, true);
  await choose(stuck, `${name} renamed`);
  await button(stuck, "Open").click();
  await said(stuck, /a reload will not keep it/);
  await stuck.getByText("Unsaved changes", { exact: true }).waitFor();
  assert.deepEqual(await order(stuck), arranged);
  checks.push("blocked storage keeps the change marked unsaved");
  await full.close();

  // Delete in one browser; the other no longer lists it after a reload.
  await choose(other, `${name} renamed`);
  await button(other, "Delete").click();
  await said(other, /Deleted/);
  await page.reload();
  const again = page.getByRole("button", { name: "Configure Ninja" });
  if ((await again.getAttribute("aria-pressed")) !== "true")
    await again.click();
  await page.getByText("Kept by the studio server").waitFor();
  const names = await page
    .getByLabel("Saved layout", { exact: true })
    .locator("option")
    .allTextContents();
  assert(!names.some((n) => n.startsWith(name)));
  checks.push("delete reaches every browser");
  await first.close();
  await second.close();

  // Phone width: the controls wrap without overflow and keep 44 px targets.
  const { context: phone, page: small } = await open({
    width: 390,
    height: 844,
  });
  const fit = await small.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    smallest: Math.min(
      ...[
        ...document.querySelectorAll(
          ".genobi-saved-layouts button, .genobi-saved-layouts select, .genobi-saved-layouts input:not([type=file])",
        ),
      ].map((el) => el.getBoundingClientRect().height),
    ),
  }));
  assert(fit.overflow <= 0, `phone overflow ${fit.overflow}px`);
  assert(fit.smallest >= 44, `phone target ${fit.smallest}px`);
  await small
    .locator(".genobi-saved-layouts")
    .screenshot({ path: `${output}/phone-saved.png` });
  checks.push("phone width without overflow, 44 px targets");
  await phone.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await browser.close();
  // Leave the machine's list as it was, even when a step failed.
  const { layouts = [] } = await fetch(`${base}/api/layouts`)
    .then((r) => r.json())
    .catch(() => ({}));
  for (const layout of layouts)
    if (layout.name.startsWith(name))
      await fetch(`${base}/api/layouts/${layout.id}`, { method: "DELETE" });
}
