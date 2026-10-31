/**
 * Phone and accessibility pass over every studio section, at 390×844 and
 * 1440×1000. Local only: API routes are fixtures and paid submissions are
 * blocked. Run against a Vite dev server:
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-phone-a11y.mjs
 * Screenshots and report.json go to .local/phone-a11y/.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  focusWalk,
  movingCanvases,
  names,
  overflow,
  runningMotion,
  targets,
} from "./lib/a11y-audit.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = ".local/phone-a11y";
await mkdir(output, { recursive: true });
const viewports = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
};
const sections = [
  "Camera",
  "Director",
  "Editor",
  "3D",
  "Dual Swords",
  "Project Tools",
  "Ninja",
];
const library = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((source) => ({ ...source, origin: "sample" }));
const results = [];
const browser = await chromium.launch({
  executablePath: process.env.DIRECTOR_BROWSER_PATH,
  channel:
    process.env.DIRECTOR_BROWSER_PATH ||
    process.env.DIRECTOR_BROWSER === "bundled"
      ? undefined
      : (process.env.DIRECTOR_BROWSER ?? "chrome"),
  headless: true,
});

async function open(viewport, { populated = true, reducedMotion } = {}) {
  const context = await browser.newContext({
    viewport: viewports[viewport],
    reducedMotion: reducedMotion ?? "no-preference",
    hasTouch: viewport === "phone",
  });
  // Onboarding has its own fixture suite; measure the studio after dismissal.
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await context.route("**/api/**", (route) => {
    // No job submission, upload or key check leaves this browser.
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/arena") return route.fulfill({ json: { arenas: [] } });
    return route.fulfill({
      json:
        path === "/api/health"
          ? { hasServerKey: false }
          : { jobs: [], sources: populated ? library : [] },
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console error: ${m.text()}`);
  });
  return { context, page, errors };
}

function record(viewport, section, check, problems, note = "") {
  results.push({ viewport, section, check, problems, note });
  const status = problems.length ? "FAIL" : "PASS";
  console.log(
    `${status} ${viewport.padEnd(7)} ${section} · ${check}${note ? ` (${note})` : ""}`,
  );
  for (const p of problems) console.log(`       - ${p}`);
}

const slug = (s) =>
  s
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const button = (page, name) =>
  page.getByRole("button", { name, exact: true }).first();

/** Overflow, names, focus, target size and errors for the current view. */
async function audit(viewport, section, page, errors, { focus = true } = {}) {
  await page.screenshot({
    path: `${output}/${viewport}-${slug(section)}.png`,
    fullPage: true,
  });
  record(viewport, section, "no horizontal overflow", await overflow(page));
  record(viewport, section, "accessible names", await names(page));
  if (focus) {
    const walk = await focusWalk(page);
    record(
      viewport,
      section,
      "visible keyboard focus",
      walk.problems,
      `${walk.stops} tab stops`,
    );
  }
  if (viewport === "phone")
    record(viewport, section, "tap targets ≥ 24 px", await targets(page));
  record(viewport, section, "no page or console errors", errors.splice(0));
}

async function preset(page, name) {
  await page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name, exact: true })
    .click();
  await settle(page);
  if (name === "3D")
    await page.getByLabel("World Builder scene", { exact: true }).waitFor();
}

/** Choose a composer entry through the model menu, as a visitor would. */
async function mode(page, family, option) {
  await button(page, `${family} models`).click();
  await page.getByRole("option", { name: option }).first().click();
  await settle(page, 400);
}

/**
 * A modal opened from the keyboard takes focus, keeps Tab inside, closes on
 * Escape and returns focus to its opener.
 */
async function dialog(
  viewport,
  section,
  page,
  errors,
  opener,
  findDialog,
  { modal = true } = {},
) {
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await opener.evaluate((el) => (el.dataset.a11yOpener = "1"));
  await page.keyboard.press("Enter");
  const box = findDialog();
  await box.waitFor();
  await settle(page, 300);
  const problems = [];
  const inside = () => box.evaluate((d) => d.contains(document.activeElement));
  if (!(await inside())) problems.push("focus did not move into the dialog");
  for (let i = 0; modal && i < 30; i++) {
    await page.keyboard.press("Tab");
    const escaped = await box.evaluate(
      (d) =>
        document.activeElement !== document.body &&
        !d.contains(document.activeElement),
    );
    if (escaped) {
      problems.push(`Tab ${i + 1} left the dialog`);
      break;
    }
  }
  // A popover closes when focus leaves it, so it is audited without a Tab walk.
  await audit(viewport, section, page, errors, { focus: modal });
  // Escape from a control inside, as a keyboard user would.
  await box.evaluate((d) =>
    d
      .querySelector(
        "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )
      ?.focus(),
  );
  await page.keyboard.press("Escape");
  await settle(page, 400);
  if (await box.isVisible().catch(() => false))
    problems.push("Escape did not close it");
  const returned = await page.evaluate(
    () => document.activeElement?.dataset.a11yOpener === "1",
  );
  if (!returned) {
    const at = await page.evaluate(
      () =>
        `${document.activeElement?.tagName.toLowerCase()} "${(document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30)}"`,
    );
    problems.push(`focus did not return to the opener (now on ${at})`);
  }
  await opener.evaluate((el) => delete el.dataset.a11yOpener);
  record(viewport, section, "dialog focus, Escape and return", problems);
}

/** Composer modes keep the hero, toolbar and gallery where they were. */
async function stableModes(viewport, page, state) {
  const measure = () =>
    page.evaluate(() => {
      const at = (s, includeHeight = true) => {
        const el = document.querySelector(s);
        // Not rendered (a phone keeps the gallery in the closed Assets
        // rail): an empty box would only report the scroll position.
        if (el && !el.checkVisibility()) return "hidden";
        const r = el?.getBoundingClientRect();
        return (
          r && [
            Math.round(r.top + scrollY),
            ...(includeHeight ? [Math.round(r.height)] : []),
          ]
        );
      };
      return {
        hero: at(".genobi-panel-preview"),
        toolbar: at(".composer-toolbar"),
        // Examples intentionally filter by mode. Their count/height may change;
        // the gallery's starting position must remain fixed below the composer.
        gallery: at(".genobi-panel-gallery", false),
      };
    });
  const baseline = await measure();
  const problems = [];
  for (const [family, option, label] of [
    ["Upscale", /Upscale/, "Upscale"],
    ["FLUX", /Image$/, "Image"],
    ["FLUX", /Edit$/, "Edit"],
    ["H3", /Music 3/, "Music"],
    ["FLUX", /Text to video$/, "Text to video"],
  ]) {
    await mode(page, family, option);
    const now = await measure();
    for (const part of ["hero", "toolbar", "gallery"])
      if (JSON.stringify(now[part]) !== JSON.stringify(baseline[part]))
        problems.push(
          `${label}: ${part} moved from ${baseline[part]} to ${now[part]}`,
        );
  }
  record(
    viewport,
    `Camera (${state} gallery)`,
    "modes keep hero, toolbar and gallery",
    problems,
  );
}

async function cameraSections(viewport) {
  const { context, page, errors } = await open(viewport);
  try {
    await page.goto(`${base}/?workspace=camera`);
    await button(page, "Generate").waitFor();
    await settle(page, 1200);
    await audit(viewport, "Camera · Text to video", page, errors);
    await dialog(
      viewport,
      "Camera · key dialog",
      page,
      errors,
      page.getByRole("button", { name: "Settings", exact: true }).first(),
      () => page.locator("dialog.key-dialog"),
    );
    await dialog(
      viewport,
      "Camera · camera controls dialog",
      page,
      errors,
      button(page, "Camera controls"),
      () => page.locator("dialog.camera-dialog"),
    );
    await dialog(
      viewport,
      "Camera · enlarged preview",
      page,
      errors,
      button(page, "Enlarge preview"),
      () => page.locator("dialog.video-lightbox"),
    );
    await dialog(
      viewport,
      "Camera · model menu",
      page,
      errors,
      page.getByRole("button", { name: /^Change model/ }),
      () => page.locator(".family-model__popover"),
      { modal: false },
    );
    await dialog(
      viewport,
      "Camera · duration popover",
      page,
      errors,
      page
        .locator(
          "button[aria-controls='duration-panel'], button[aria-labelledby='duration-label duration-value']",
        )
        .first(),
      () => page.locator("#duration-panel"),
      { modal: false },
    );
    for (const [family, option, label] of [
      ["Upscale", /Upscale/, "Upscale"],
      ["FLUX", /Image$/, "Image"],
      ["FLUX", /Edit$/, "Edit"],
    ]) {
      await mode(page, family, option);
      await audit(viewport, `Camera · ${label}`, page, errors);
    }
    // LTX's prompt parts: a gap tab with its chips, and the Light tab.
    await mode(page, "LTX", /^LTX-2.5 Fast/);
    await page.getByRole("tab", { name: /^Scene/ }).click();
    await audit(viewport, "Camera · LTX Scene gap", page, errors);
    await dialog(
      viewport,
      "Camera · LTX camera controls (Light)",
      page,
      errors,
      button(page, "Camera controls"),
      () => page.locator("dialog.camera-dialog"),
    );
    await page.getByRole("tab", { name: /^Prompt/ }).click();
    await mode(page, "FLUX", /Text to video$/);
    await stableModes(viewport, page, "populated");
  } finally {
    await context.close();
  }
  const empty = await open(viewport, { populated: false });
  try {
    await empty.page.goto(`${base}/?workspace=camera`);
    await button(empty.page, "Generate").waitFor();
    await settle(empty.page, 1200);
    await stableModes(viewport, empty.page, "empty");
    record(
      viewport,
      "Camera (empty gallery)",
      "no page or console errors",
      empty.errors.splice(0),
    );
  } finally {
    await empty.context.close();
  }
}

async function workspaceSections(viewport) {
  const { context, page, errors } = await open(viewport);
  try {
    await page.goto(`${base}/?workspace=camera`);
    await button(page, "Generate").waitFor();
    await preset(page, "Director");
    // The template's text fields sit behind the remix panel now; the
    // project prompt is what the simple view opens on.
    await page
      .getByRole("textbox", { name: "Animation prompt", exact: true })
      .waitFor();
    await audit(viewport, "Director (simple)", page, errors);
    // Project media opens from the prompt's reference picker.
    await page
      .locator(".prompt-reference-toolbar")
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await dialog(
      viewport,
      "Director · project media dialog",
      page,
      errors,
      button(page, "Open assets & inspirations"),
      () => page.locator("dialog[aria-labelledby='project-media-title']"),
    );
    for (const name of ["3D", "Dual Swords", "Project Tools", "Ninja"]) {
      await preset(page, name);
      await audit(
        viewport,
        name === "3D" ? "3D (World Builder)" : name,
        page,
        errors,
      );
    }
  } finally {
    await context.close();
  }
  const editor = await open(viewport);
  try {
    await editor.page.goto(`${base}/director?example=studio&workspace=editor`);
    await editor.page
      .getByText("Ready · local preview", { exact: true })
      .waitFor();
    await settle(editor.page);
    await audit(viewport, "Editor", editor.page, editor.errors);
    await dialog(
      viewport,
      "Editor · add track dialog",
      editor.page,
      editor.errors,
      button(editor.page, "Add layer"),
      () => editor.page.locator("dialog[aria-labelledby='add-track-heading']"),
    );
  } finally {
    await editor.context.close();
  }
}

/** Reduced motion: presets switch without travel and nothing keeps moving. */
async function reducedMotion(viewport) {
  const { context, page, errors } = await open(viewport, {
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${base}/?workspace=camera`);
    await button(page, "Generate").waitFor();
    for (const name of sections) {
      await page
        .getByRole("navigation", { name: "Studio presets" })
        .getByRole("button", { name, exact: true })
        .click();
      await page.waitForTimeout(60);
      const during = await page.evaluate(() =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === "running" && a.effect?.getTiming().duration > 0,
          )
          .map(
            (a) =>
              `layout animation during switch on ${a.effect?.target?.className}`,
          ),
      );
      await settle(page, 1500);
      if (name === "3D")
        await page.getByLabel("World Builder scene", { exact: true }).waitFor();
      record(viewport, name, "reduced motion honoured", [
        ...during,
        ...(await runningMotion(page)),
        ...(await movingCanvases(page)),
      ]);
    }
    // The camera dialogue's 3D preview orbits unless motion is reduced.
    await page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "Camera", exact: true })
      .click();
    await settle(page);
    await button(page, "Camera controls").click();
    await page.locator("dialog.camera-dialog canvas").first().waitFor();
    await settle(page, 1500);
    record(viewport, "Camera controls dialog", "reduced motion honoured", [
      ...(await runningMotion(page)),
      ...(await movingCanvases(page)),
    ]);
    record(
      viewport,
      "reduced motion run",
      "no page or console errors",
      errors.splice(0),
    );
  } finally {
    await context.close();
  }
}

try {
  for (const viewport of Object.keys(viewports)) {
    await cameraSections(viewport);
    await workspaceSections(viewport);
    await reducedMotion(viewport);
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => r.problems.length);
await writeFile(
  `${output}/report.json`,
  JSON.stringify({ base, results }, null, 2),
);
console.log(
  `\n${failed.length ? "FAIL" : "PASS"}: ${results.length - failed.length}/${results.length} checks passed. Screenshots and report.json in ${output}/`,
);
process.exitCode = failed.length ? 1 : 0;
