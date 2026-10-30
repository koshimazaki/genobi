/**
 * The Camera composer's model menu and controls. Run against Vite:
 *   npx vite --port 4329 --strictPort &
 *   STUDIO_URL=http://127.0.0.1:4329 node scripts/check-camera-models.mjs
 * Every API read is a local fixture and every write is aborted, so nothing
 * is submitted. At desktop and phone widths it checks that:
 * - FLUX 3 from a start image offers every camera term text to video does,
 *   and its menu row carries no "· BFL";
 * - the H3 menu leads with the Router entry (4-15 s, six ratios) and shows
 *   no Workflow picker, even with a swappable OmniRef template held;
 * - an OmniRef entry says why it is fixed and where the wider choices are;
 * - an H3 entry's camera panel speaks H3: LTX's narrowed framing without
 *   Profile, the thirteen moves under MiniMax's names, and links to
 *   MiniMax's guide sections;
 * - the toolbar keeps its place, empty and with a prompt, across the switches.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4329";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? ".local/camera-models";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_CHANNEL ?? "chrome",
});
const checks = [];
const errors = [];

// Two templates behind Omni RGB: before this change the menu drew a
// Workflow picker for it.
const workflows = {
  revision: 1,
  fixed: false,
  capabilities: [
    {
      id: "reference-to-video",
      label: "References to video",
      templates: ["minimax-h3-rgb", "minimax-h3-canny"],
    },
  ],
  templates: [
    { id: "minimax-h3-rgb", label: "FastH3 OmniRef · RGB guide" },
    { id: "minimax-h3-canny", label: "FastH3 OmniRef · CANNY guide" },
  ],
  entries: [
    {
      entry: "minimax-h3",
      capability: "reference-to-video",
      default: "minimax-h3-rgb",
      selected: "minimax-h3-rgb",
      templates: ["minimax-h3-rgb", "minimax-h3-canny"],
    },
  ],
};
const fixtures = {
  "/api/health": { ok: true, hosted: false, hasServerKey: true },
  "/api/history": { jobs: [], sources: [] },
  "/api/settings/workflows": workflows,
};

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const { pathname } = new URL(route.request().url());
    return route.fulfill({ json: fixtures[pathname] ?? {} });
  });
  await page.goto(base);
  const camera = page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Camera", exact: true });
  if (await camera.count()) await camera.click();
  await page.locator(".composer-toolbar").waitFor();
  await page.waitForTimeout(600);
  return page;
}

const toolbar = (page) =>
  page
    .locator(".composer-toolbar")
    .first()
    .evaluate((element) => {
      const r = element.getBoundingClientRect();
      return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(Math.round);
    });

function same(a, b, what) {
  a.forEach((value, i) =>
    assert(
      Math.abs(value - b[i]) <= 1,
      `${what}: toolbar moved from [${a}] to [${b}]`,
    ),
  );
}

async function chooseModel(page, label) {
  const family = label.startsWith("MiniMax") ? "H3" : "FLUX";
  await page.getByRole("button", { name: `${family} models` }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

/**
 * Beside the reference tray the camera line stays inside the prompt column
 * and ends in an ellipsis rather than running over the tray or being cut.
 */
async function cameraLine(page, what) {
  const line = await page
    .locator(".video-workspace .camera-sentences")
    .evaluate((element) => {
      const editor = element.closest(".prompt-editor").getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        right: element.getBoundingClientRect().right,
        column: editor.right,
        overflowing: element.scrollWidth > element.clientWidth,
        ellipsis: style.textOverflow === "ellipsis",
        nowrap: style.whiteSpace === "nowrap",
      };
    });
  assert(
    line.right <= line.column + 0.5,
    `${what}: camera line ends at ${line.right}, past the prompt column at ${line.column}`,
  );
  assert(
    line.overflowing && line.ellipsis && line.nowrap,
    `${what}: camera line shows no ellipsis (${JSON.stringify(line)})`,
  );
}

/** The H3 camera panel's moves, in order, and where its Movements link goes. */
async function h3Moves(page) {
  await page.getByRole("button", { name: /Camera controls/ }).click();
  const tabs = page.getByRole("tablist", { name: "Camera sections" });
  await tabs.waitFor();
  await tabs.getByRole("tab", { name: /Movements/ }).click();
  const grid = page.locator(".camera-preset-grid");
  const names = await grid.locator(".preset").allInnerTexts();
  const link = await page
    .locator(".camera-grid-footer a")
    .first()
    .getAttribute("href");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { names: names.map((n) => n.trim()), link };
}

/** Chooses a move on the camera panel's Movements tab. */
async function pickMove(page, name) {
  await page.getByRole("button", { name: /Camera controls/ }).click();
  const tabs = page.getByRole("tablist", { name: "Camera sections" });
  await tabs.waitFor();
  await tabs.getByRole("tab", { name: /Movements/ }).click();
  await page
    .locator(".camera-preset-grid .preset")
    .filter({ hasText: name })
    .first()
    .click();
  await page.getByRole("button", { name: /^Done/ }).click();
  await page.waitForTimeout(300);
}

/** The number of terms on each camera tab, in tab order. */
async function cameraTerms(page) {
  await page.getByRole("button", { name: /Camera controls/ }).click();
  const tabs = page.getByRole("tablist", { name: "Camera sections" });
  await tabs.waitFor();
  const counts = [];
  for (let i = 0; i < (await tabs.getByRole("tab").count()); i++) {
    await tabs.getByRole("tab").nth(i).click();
    counts.push(await page.locator(".camera-preset-grid .preset").count());
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return counts;
}

try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const page = await open(viewport);
    await chooseModel(page, "FLUX 3 · Text to video");
    const start = await toolbar(page);
    const t2v = await cameraTerms(page);
    assert.equal(t2v.length, 3, `${label}: FLUX 3 shows three camera tabs`);

    await chooseModel(page, "FLUX 3 · Image to video");
    same(start, await toolbar(page), `${label} FLUX text → image to video`);
    assert.deepEqual(await cameraTerms(page), t2v, `${label}: i2v camera`);
    await cameraLine(page, `${label} empty FLUX i2v`);

    // The H3 menu: Router first, no Workflow picker under the rows.
    await page.getByRole("button", { name: "H3 models" }).click();
    const rows = page.locator("#family-model-options [role=option]");
    assert.equal(
      await rows.first().innerText(),
      "MiniMax H3 · Reference to video · 4–15 s",
    );
    await page.screenshot({ path: `${output}/${label}-h3-menu.png` });
    await page
      .getByRole("option", { name: "MiniMax H3 · Omni RGB · 5 s" })
      .click();
    await page.waitForTimeout(400);
    same(start, await toolbar(page), `${label} FLUX → H3 Omni RGB`);
    await page.getByRole("button", { name: /^Change model:/ }).click();
    const popover = page.locator(".family-model__popover");
    await popover.waitFor();
    assert.equal(await popover.locator("select, label").count(), 1);
    assert.doesNotMatch(await popover.innerText(), /Workflow/);
    await page.screenshot({ path: `${output}/${label}-h3-omni-menu.png` });
    await page.keyboard.press("Escape");
    assert.match(
      await page.locator("#duration-label + button").getAttribute("title"),
      /choose MiniMax H3 · Reference to video/,
    );

    await chooseModel(page, "MiniMax H3 · Reference to video · 4–15 s");
    same(start, await toolbar(page), `${label} Omni → Router H3`);
    await page.locator("#aspect-ratio").click();
    assert.equal(await page.getByRole("option").count(), 6);
    await page.keyboard.press("Escape");

    // A prompt in the composer does not move the toolbar on a switch either.
    await page.locator("textarea").first().fill("A lighthouse at dusk.");
    const filled = await toolbar(page);
    await chooseModel(page, "FLUX 3 · Image to video");
    same(filled, await toolbar(page), `${label} filled H3 → FLUX i2v`);
    // Switched on here if it is off; on, the camera line must not wrap.
    const cameraSwitch = page.locator(
      '[role=switch][aria-labelledby="camera-label"]',
    );
    if ((await cameraSwitch.getAttribute("aria-checked")) !== "true")
      await cameraSwitch.click();
    await page.waitForTimeout(300);
    // The trip through H3 cleared Orbit, which H3's panel leaves out.
    await pickMove(page, "Orbit");
    assert(await page.locator(".camera-sentences").count());
    same(filled, await toolbar(page), `${label} filled FLUX i2v camera on`);
    await cameraLine(page, `${label} filled FLUX i2v`);
    await page.screenshot({ path: `${output}/${label}-flux-i2v-filled.png` });
    // Last, since a switch to H3 clears the terms its panel does not show.
    await chooseModel(page, "MiniMax H3 · Reference to video · 4–15 s");
    const h3 = await cameraTerms(page);
    assert.deepEqual(h3, [6, 4, 13], `${label}: H3 camera terms`);
    const moves = await h3Moves(page);
    assert.deepEqual(
      moves.names,
      [
        "Push in",
        "Pull out",
        "Pan left",
        "Pan right",
        "Truck left",
        "Truck right",
        "Tilt up",
        "Pedestal up",
        "Pedestal down",
        "Arc shot",
        "Tracking shot",
        "Static shot",
        "Shake slightly",
      ],
      `${label}: H3 move names`,
    );
    assert.match(
      moves.link,
      /MiniMax-H3\/blob\/42ed227.*#43-camera-motion/,
      `${label}: H3 movement link`,
    );
    same(filled, await toolbar(page), `${label} H3 camera panel`);
    await page.screenshot({ path: `${output}/${label}-h3-camera.png` });
    checks.push(
      `${label}: FLUX i2v camera terms [${t2v}] match text to video; H3 leads with Router, no Workflow picker, Omni says it is fixed; H3 camera [${h3}] in MiniMax's names and guide; camera line ends in an ellipsis inside the prompt column; toolbar holds empty and filled`,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(checks.map((c) => `ok - ${c}`).join("\n"));
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
