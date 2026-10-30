/**
 * The LTX prompt parts keep the studio still and read in both themes. Run
 * against Vite with the fixture API:
 *   npx vite --port 4329 --strictPort &
 *   STUDIO_URL=http://127.0.0.1:4329 node scripts/check-ltx-prompt.mjs
 * At desktop and phone widths it moves FLUX 3 → LTX-2.5 Fast and through the
 * Prompt, Scene, Character, Action and Audio tabs, and asserts the hero,
 * composer, toolbar and gallery keep their place and size (AGENTS.md,
 * "Stable studio dimensions"). It checks that a chip inserts rather than
 * replaces, that the LTX camera dialog orders Shot sizes, Angles, Light,
 * Movements and FLUX keeps three tabs, the counter and the cut-off warning,
 * and that every part colour switches with the theme, keeps 4.5:1 on the
 * composer and stays apart from the others. Nothing is submitted.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { contrast, distance, parseRgb } from "./lib/colour.mjs";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4329";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? ".local/ltx-prompt";
await mkdir(output, { recursive: true });
const sources = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));
const parts = {
  hero: ".featured-video",
  composer: "section.composer",
  toolbar: ".composer-toolbar",
  gallery: "section.gallery",
};
const tokens = [
  "--camera-shot",
  "--camera-angle",
  "--camera-light",
  "--camera-movement",
  "--prompt-scene",
  "--prompt-character",
  "--prompt-action",
  "--prompt-audio",
];
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_CHANNEL ?? "chrome",
});
const checks = [];
const errors = [];
const evidence = {};

async function open(viewport, { populated = true } = {}) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Fixture API: no job submission, upload or key check leaves the browser.
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    return route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/health"
          ? { hasServerKey: false }
          : { jobs: [], sources: populated ? sources : [] },
    });
  });
  await page.goto(`${base}/?workspace=camera`);
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
        if (!element.checkVisibility()) return { hidden: true };
        const r = element.getBoundingClientRect();
        return Object.fromEntries(
          Object.entries({
            x: r.x + scrollX,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
          }).map(([k, v]) => [k, Math.round(v)]),
        );
      });
  return rects;
}

function same(a, b, what) {
  for (const name of Object.keys(parts)) {
    assert.equal(!!b[name].hidden, !!a[name].hidden, `${what}: ${name}`);
    if (a[name].hidden) continue;
    for (const key of ["x", "y", "width", "height"])
      assert(
        Math.abs(a[name][key] - b[name][key]) <= 1,
        `${what}: ${name}.${key} moved from ${a[name][key]} to ${b[name][key]}`,
      );
  }
}

async function choose(page, family, option) {
  await page.getByRole("button", { name: /^Change model:/ }).click();
  const choice = page.getByRole("option", { name: option, exact: true });
  // The menu opens on the held family; another family is a click away.
  if (!(await choice.isVisible()))
    await page.getByRole("button", { name: family }).click();
  await choice.click();
  await page.waitForTimeout(400);
}

const tab = (page, name) =>
  page
    .getByRole("tablist", { name: "Prompt parts" })
    .getByRole("tab", { name: new RegExp(`^${name}`) });
const field = (page) => page.locator("#prompt-part-panel textarea");

/** Each token's computed colour, and the composer's background behind it. */
const colours = (page) =>
  page.evaluate((names) => {
    const probe = document.createElement("span");
    document.querySelector("section.composer").append(probe);
    const read = (name) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    const values = Object.fromEntries(names.map((n) => [n, read(n)]));
    probe.remove();
    let el = document.querySelector("section.composer");
    let background = "rgba(0, 0, 0, 0)";
    while (el && /rgba\(.*, 0\)$/.test(background)) {
      background = getComputedStyle(el).backgroundColor;
      el = el.parentElement;
    }
    const segment = document.querySelector('.composed-part[data-part="scene"]');
    return {
      values,
      background,
      segment: segment && getComputedStyle(segment).color,
    };
  }, tokens);

function palette(theme, read) {
  const background = parseRgb(read.background);
  for (const name of tokens) {
    const ratio = contrast(parseRgb(read.values[name]), background);
    assert(ratio >= 4.5, `${theme}: ${name} is ${ratio.toFixed(2)}:1`);
  }
  let closest = Infinity;
  for (const [i, a] of tokens.entries())
    for (const b of tokens.slice(i + 1)) {
      const d = distance(parseRgb(read.values[a]), parseRgb(read.values[b]));
      assert(d >= 10, `${theme}: ${a} and ${b} are ΔE ${d.toFixed(1)} apart`);
      closest = Math.min(closest, d);
    }
  return closest;
}

try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const page = await open(viewport);
    await choose(page, /FLUX models/, "FLUX 3 · Text to video");
    const flux = await measure(page);
    assert.equal(
      await page.getByRole("tablist", { name: "Prompt parts" }).count(),
      0,
    );
    await page.getByRole("button", { name: /Camera controls/ }).click();
    assert.equal(
      await page
        .getByRole("tablist", { name: "Camera sections" })
        .getByRole("tab")
        .count(),
      3,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await choose(page, /LTX models/, "LTX-2.5 Fast · Text to video");
    same(flux, await measure(page), `${label} FLUX → LTX`);
    await page.screenshot({ path: `${output}/${label}-ltx-prompt.png` });
    for (const name of ["Scene", "Character", "Action", "Audio", "Prompt"]) {
      await tab(page, name).click();
      same(flux, await measure(page), `${label} ${name} tab, empty`);
      if (name !== "Prompt")
        await page.locator("section.composer").screenshot({
          path: `${output}/${label}-${name.toLowerCase()}-empty.png`,
        });
    }

    // A chip inserts after what is there; it never replaces it.
    await tab(page, "Scene").click();
    await field(page).fill("A workshop at night");
    await page
      .getByRole("button", { name: "Rough stone", exact: true })
      .click();
    await page.getByRole("button", { name: "Intimate", exact: true }).click();
    assert.equal(
      await field(page).inputValue(),
      "A workshop at night, rough stone surfaces, an intimate space",
    );
    await tab(page, "Character").click();
    await page.getByRole("button", { name: "Twenties", exact: true }).click();
    await page
      .getByRole("button", { name: "Jaw clenched", exact: true })
      .click();
    await tab(page, "Action").click();
    await page.getByRole("button", { name: "Initially…", exact: true }).click();
    assert.equal(await field(page).inputValue(), "Initially, ");
    await field(page).fill("Initially, she lifts the lamp.");
    await page
      .getByRole("button", { name: "A moment later…", exact: true })
      .click();
    assert.equal(
      await field(page).inputValue(),
      "Initially, she lifts the lamp. A moment later, ",
    );
    await tab(page, "Audio").click();
    await page.getByRole("button", { name: "Whisper", exact: true }).click();
    assert.match(await field(page).inputValue(), /^A voice whispers, "…"$/);
    assert(
      await page.getByRole("button", { name: /^Acoustic space · Off/ }).count(),
      "the Audio tab shows the Acoustic Space choice",
    );
    await page
      .locator("section.composer")
      .screenshot({ path: `${output}/${label}-audio-filled.png` });
    const filledTabs = await page
      .getByRole("tablist", { name: "Prompt parts" })
      .getByRole("tab", { name: /, filled$/ })
      .count();
    assert.equal(filledTabs, 5, "every filled tab is marked");

    // Light: the guide's order in the LTX camera dialog.
    await page.getByRole("button", { name: /Camera controls/ }).click();
    const sections = page.getByRole("tablist", { name: "Camera sections" });
    await sections.waitFor();
    const names = await sections
      .getByRole("tab")
      .evaluateAll((tabs) =>
        tabs.map((t) => t.getAttribute("aria-label").split(":")[0]),
      );
    assert.deepEqual(names, ["Shot sizes", "Angles", "Light", "Movements"]);
    await sections.getByRole("tab", { name: /^Light/ }).click();
    await page.getByRole("button", { name: "Neon glow", exact: true }).click();
    await page.getByRole("button", { name: "Fog", exact: true }).click();
    await page
      .locator("dialog.camera-dialog")
      .screenshot({ path: `${output}/${label}-camera-light.png` });
    await page.getByRole("button", { name: /^Done/ }).click();
    await page.waitForTimeout(300);
    await tab(page, "Prompt").click();
    const filled = await measure(page);
    await page.screenshot({ path: `${output}/${label}-ltx-filled.png` });

    // The counter and the colour-coded preview.
    const count = await page.locator(".prompt-count").innerText();
    await page.getByRole("button", { name: /View composed prompt/ }).click();
    const preview = await page.locator(".composed-parts").innerText();
    for (const part of [
      "SHOT",
      "PROMPT",
      "SCENE",
      "LIGHT",
      "ACTION",
      "CHARACTER",
      "MOVEMENT",
      "AUDIO",
    ])
      assert(preview.includes(part), `${label}: the preview names ${part}`);
    await page
      .locator(".composed-prompt")
      .screenshot({ path: `${output}/${label}-preview.png` });

    // Theme switch: the highlighted segment recolours live and stays readable.
    const lime = await colours(page);
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "cyberpunk"),
    );
    await page.waitForTimeout(100);
    const cyber = await colours(page);
    assert.notEqual(lime.segment, cyber.segment, "the Scene segment recolours");
    const spread = {
      lime: palette("lime", lime),
      cyberpunk: palette("cyberpunk", cyber),
    };
    await page
      .locator(".composed-prompt")
      .screenshot({ path: `${output}/${label}-preview-cyberpunk.png` });
    await page.evaluate(() => delete document.documentElement.dataset.theme);

    // Past 1,200 characters: the counter says so and names what is cut.
    await tab(page, "Action").click();
    await field(page).fill("She walks slowly along the corridor. ".repeat(30));
    const warning = page.locator(".prompt-cut");
    await warning.waitFor();
    assert.match(
      await warning.innerText(),
      /Over by [\d,]+ characters\. The end of .* will be cut\./,
    );
    assert.match(
      await page.locator(".prompt-count").getAttribute("class"),
      /is-over/,
    );
    await page
      .locator("section.composer")
      .screenshot({ path: `${output}/${label}-over-limit.png` });

    // A gap near its own limit: a chip that would pass it is disabled, by name.
    await field(page).fill("x".repeat(1195));
    const blocked = page.getByRole("button", {
      name: "Slow motion, unavailable: the Action gap would pass 1,200 characters",
    });
    assert(
      await blocked.isDisabled(),
      "a chip past the gap's limit is disabled",
    );
    assert.equal((await field(page).inputValue()).length, 1195);

    await choose(page, /FLUX models/, "FLUX 3 · Text to video");
    same(flux, await measure(page), `${label} LTX → FLUX`);
    await page.close();

    // Empty: no catalogue clip, so the composer opens on an empty prompt.
    const empty = await open(viewport, { populated: false });
    await choose(empty, /FLUX models/, "FLUX 3 · Text to video");
    const bare = await measure(empty);
    await choose(empty, /LTX models/, "LTX-2.5 Fast · Text to video");
    same(bare, await measure(empty), `${label} empty FLUX → LTX`);
    for (const name of ["Scene", "Character", "Action", "Audio", "Prompt"]) {
      await tab(empty, name).click();
      same(bare, await measure(empty), `${label} empty ${name} tab`);
    }
    await empty
      .locator("section.composer")
      .screenshot({ path: `${output}/${label}-empty-ltx.png` });
    evidence[label] = {
      flux,
      filled,
      empty: bare,
      count,
      contrastSpread: spread,
    };
    checks.push(
      `${label}: hero, composer, toolbar and gallery hold across FLUX → LTX and every gap tab, populated and empty; chips insert and stop at the gap's limit; Light sits between Angles and Movements; counter ${count}; the preview labels every part; colours switch with the theme (closest pair ΔE ${spread.lime.toFixed(1)} lime, ${spread.cyberpunk.toFixed(1)} cyberpunk)`,
    );
    await empty.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(evidence, null, 2));
  console.log(checks.map((c) => `ok - ${c}`).join("\n"));
  console.log(`Screenshots and report.json: ${output}`);
} finally {
  await browser.close();
}
