/**
 * The model menu's Local tick and the run-mode tags keep the studio still.
 * Run against Vite:
 *   npx vite --port 4329 --strictPort &
 *   STUDIO_URL=http://127.0.0.1:4329 node scripts/check-run-mode.mjs
 * A fake `/api` answers the run location (POST changes it) and a local check
 * whose ComfyUI does not answer. At desktop and phone widths it holds MiniMax
 * Music 3, ticks Local, unticks it, and moves to an API entry, asserting the
 * hero, composer and toolbar keep their place and size (AGENTS.md, "Stable
 * studio dimensions"), that a song's Max field fits as Duration does, and
 * that the tags say where the run goes. Nothing is
 * submitted: every write other than the run location is aborted.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4329";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-run-mode";
await mkdir(output, { recursive: true });
const sources = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));
const parts = {
  hero: ".featured-video",
  composer: "section.composer",
  toolbar: ".composer-toolbar",
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_CHANNEL ?? "chrome",
});
const errors = [];

async function open(viewport) {
  let revision = 1;
  let mode = "cloud";
  const location = () => ({
    revision,
    location: mode === "cloud" ? "cloud" : "local",
    mode,
    label: "",
    source: "session",
    fixed: false,
    choices: ["local", "cloud", "both"],
    local: { reachable: false, version: null },
    note: "",
  });
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/settings/run-location") {
      if (request.method() === "POST") {
        mode = JSON.parse(request.postData() ?? "{}").location;
        revision++;
      }
      return route.fulfill({ json: location() });
    }
    if (request.method() !== "GET") return route.abort();
    if (path === "/api/settings/workflows")
      return route.fulfill({
        json: {
          revision,
          fixed: false,
          capabilities: [],
          templates: [],
          entries: [],
          local: { reachable: false, templates: {} },
        },
      });
    return route.fulfill({
      json:
        path === "/api/health"
          ? { hasServerKey: false }
          : { jobs: [], sources },
    });
  });
  await page.goto(base);
  const camera = page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Camera", exact: true });
  if (await camera.count()) await camera.click();
  await page.locator(parts.toolbar).waitFor();
  await page.waitForTimeout(600);
  return page;
}

async function measure(page) {
  const rects = {};
  for (const [name, selector] of Object.entries(parts))
    rects[name] = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const r = element.getBoundingClientRect();
        return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(
          Math.round,
        );
      });
  return rects;
}
function same(a, b, what) {
  for (const name of Object.keys(parts))
    a[name].forEach((value, i) =>
      assert(
        Math.abs(value - b[name][i]) <= 1,
        `${what}: ${name} moved from ${a[name]} to ${b[name]}`,
      ),
    );
}
const tags = (page) => page.locator(".run-mode").innerText();
/**
 * The duration field's size and whether its label or value wraps or spills:
 * a song's "Max" and "≤20s" must fit the fixed field as "Duration" does.
 */
const durationField = (page) =>
  page.locator(".generation-controls__duration").evaluate((field) => {
    const label = field.querySelector(".instrument-label");
    const value = field.querySelector("#duration-value");
    const line = parseFloat(getComputedStyle(value).lineHeight) || 16;
    return {
      size: [field.offsetWidth, field.offsetHeight],
      spills:
        label.scrollWidth > label.clientWidth ||
        field.scrollWidth > field.clientWidth ||
        value.offsetHeight > line * 1.5,
    };
  });

async function menu(page, family) {
  await page.getByRole("button", { name: `${family} models` }).click();
  await page.waitForTimeout(200);
}
async function choose(page, family, label) {
  await menu(page, family);
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}
async function local(page, family) {
  await menu(page, family);
  await page.getByRole("checkbox", { name: "Local" }).click();
  await page.waitForTimeout(500);
  const note = await page.locator(".family-model__hidden").innerText();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  return note;
}

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
]) {
  const page = await open(viewport);
  const start = await measure(page);
  const startField = await durationField(page);
  await choose(page, "H3", "MiniMax Music 3 · Text to music");
  const music = await measure(page);
  same(start, music, `${name} start → Music 3`);
  const musicField = await durationField(page);
  assert.deepEqual(musicField.size, startField.size, `${name} duration field`);
  assert(!musicField.spills, `${name}: the song's duration field spills`);
  assert.match(await tags(page), /OPEN WEIGHTS[\s\S]*COMFY CLOUD/i);
  await page.screenshot({ path: `${output}/${name}-cloud.png` });

  const hidden = await local(page, "H3");
  assert.match(hidden, /more with Local off/);
  same(music, await measure(page), `${name} tick Local`);
  assert.match(await tags(page), /LOCAL[\s\S]*not answering/i);
  assert.equal(await page.locator(".run-mode__tag--warn").count(), 1);
  await page.screenshot({ path: `${output}/${name}-local.png` });

  await local(page, "H3");
  same(music, await measure(page), `${name} untick Local`);
  assert.match(await tags(page), /COMFY CLOUD/i);

  // Open only is still ticked: untick it and reach an API entry.
  await menu(page, "H3");
  await page.getByRole("checkbox", { name: "Open only" }).click();
  await page
    .getByRole("option", { name: "MiniMax H3 · Reference to video" })
    .click();
  await page.waitForTimeout(400);
  same(music, await measure(page), `${name} → H3 Router`);
  assert.match(await tags(page), /COMFY ROUTER/i);
  await page.screenshot({ path: `${output}/${name}-router.png` });
  console.log(`${name}: toolbar ${music.toolbar.join(" × ")} held still`);
  await page.close();
}
await browser.close();
assert.deepEqual(errors, [], "page errors");
console.log(`Run-mode checks passed; screenshots in ${output}`);
