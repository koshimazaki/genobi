/** Run against a local dev server: STUDIO_URL=http://127.0.0.1:4329 node scripts/check-studio-shell.mjs */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-shell-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() =>
  localStorage.setItem("genobi.startup-guide.v1", "seen"),
);
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
// A frontend-only Vite preview can use fixtures without starting a job service.
if (process.env.STUDIO_FIXTURE_API === "1") {
  const sources = JSON.parse(
    await readFile("public/media/gallery.json", "utf8"),
  ).map((source) => ({ ...source, origin: "sample" }));
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    return route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/health"
          ? { hasServerKey: false }
          : { jobs: [], sources },
    });
  });
}
// No provider submissions during a shell check, even if a local key is configured.
await page.route("**/api/jobs", (route) =>
  route.request().method() === "POST" ? route.abort() : route.fallback(),
);
const nav = page.getByRole("navigation", { name: "Studio presets" });
async function mode(name) {
  await nav.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(750);
}
try {
  await page.goto(base);
  // Gallery is the first view, and no section moves the header or toolbar.
  await page.locator(".template-gallery").waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await nav
      .getByRole("button", { name: "Gallery", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const bar = () =>
    page.evaluate(() =>
      [".topbar", ".genobi-presets", ".voice-button"].map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return [r.x, r.y + scrollY, r.width, r.height].map(Math.round).join();
      }),
    );
  const header = await bar();
  for (const name of ["Camera", "Director", "3D", "Ninja", "Gallery"]) {
    await mode(name);
    assert.deepEqual(await bar(), header, `${name} moves the header`);
  }
  checks.push("Gallery opens first; switching sections keeps the header still");
  await mode("Director");
  // Since #67 the simple Director opens on its project prompt.
  const title = page.getByRole("textbox", {
    name: "Animation prompt",
    exact: true,
  });
  await title.waitFor();
  await title.fill("SHELL RETAINS THIS EDIT");
  const stage = await page
    .locator('canvas[aria-label="Director preview"]')
    .elementHandle();
  await mode("Camera");
  await mode("Editor");
  assert(
    await stage.evaluate((el) => el.isConnected),
    "Director canvas was remounted",
  );
  // Since #67 the Editor's gallery is the Assets rail's Library tab.
  await page
    .getByRole("tablist", { name: "Asset collection" })
    .getByRole("tab", { name: "Library", exact: true })
    .click();
  await page
    .locator("#assets-pane-gallery")
    .getByRole("button", { name: "Recreate", exact: true })
    .first()
    .click();
  assert.equal(
    await nav
      .getByRole("button", { name: "Camera", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  checks.push(
    "Editor gallery Recreate reveals the Camera composer without submitting",
  );
  await mode("Director");
  assert.equal((await title.innerText()).trim(), "SHELL RETAINS THIS EDIT");
  checks.push("Director edits and canvas survive Camera → Editor → Director");
  // #67 removed the template form and its "Open advanced editor" button;
  // the Editor is reached from the presets.
  await mode("Dual Swords");
  await page
    .getByLabel("Choose video A", { exact: true })
    .setInputFiles(
      resolve("docs/director-bundle/example/media/test-pattern.mp4"),
    );
  const keep = page
    .getByRole("region", { name: "Video A", exact: true })
    .getByRole("button", { name: "＋ Keep frame", exact: true });
  await keep.waitFor();
  await keep.click();
  const notice = page.locator(".genobi-notice");
  await notice
    .filter({ hasText: /added to project assets · Inspirations\.$/ })
    .waitFor();
  // Export to assets puts the frame under Project, with no download.
  let downloads = 0;
  page.on("download", () => downloads++);
  // References need both sides at least 256 px, so B holds a 640 × 360 clip.
  await page
    .getByLabel("Choose video B", { exact: true })
    .setInputFiles(
      resolve("docs/director-bundle/example/media/orbit-motion.mp4"),
    );
  const exportB = page
    .getByRole("region", { name: "Video B", exact: true })
    .getByRole("button", { name: "Export to assets", exact: true });
  await page.waitForFunction(
    () =>
      ![
        ...document.querySelectorAll(
          '[aria-label="Video B"] .de-export .de-button--primary',
        ),
      ].some((b) => b.disabled),
  );
  await exportB.click();
  await notice
    .filter({
      hasText:
        /orbit-motion_frame-000000\.png added to project assets · Project\.$/,
    })
    .waitFor();
  assert.equal(downloads, 0, "Export to assets downloads nothing");
  await mode("Camera");
  await mode("Dual Swords");
  assert(
    (await page.getByText("test-pattern.mp4", { exact: true }).count()) > 0,
  );
  checks.push(
    "Dual Swords keeps decoded source across presets, keeps a real PNG in Inspirations and exports one to Project without a download",
  );
  // The exported frame, dragged from the Project tab onto Camera's reference
  // tray, becomes a reference (the drag carries identity, not bytes).
  await mode("Camera");
  await page.getByRole("button", { name: /^Change model:/ }).click();
  await page
    .getByRole("option", { name: "FLUX 3 · Image", exact: true })
    .click();
  const tray = page.locator("section.image-references:visible");
  await tray.waitFor();
  const before = await tray.locator("header").innerText();
  const dropped = await page.evaluate(() => {
    const card = [
      ...document.querySelectorAll(
        "#assets-pane-project .genobi-project-asset [draggable=true]",
      ),
    ].find((el) => el.title.endsWith("orbit-motion_frame-000000.png"));
    const target = [
      ...document.querySelectorAll("section.image-references"),
    ].find((el) => el.offsetParent);
    if (!card || !target) return false;
    const data = new DataTransfer();
    card.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, dataTransfer: data }),
    );
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      }),
    );
    return data.types.includes("application/x-genobi-project-asset");
  });
  assert(dropped, "A Project asset drag reached the reference tray");
  for (
    let i = 0;
    i < 25 && (await tray.locator("header").innerText()) === before;
    i++
  )
    await page.waitForTimeout(200);
  assert.notEqual(await tray.locator("header").innerText(), before);
  await page.getByRole("button", { name: /^Change model:/ }).click();
  await page
    .getByRole("option", { name: "LTX-2.5 Fast · Text to video", exact: true })
    .click()
    .catch(() => page.keyboard.press("Escape"));
  checks.push(
    "An exported frame drags from Project into Camera's reference tray",
  );
  await mode("3D");
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  // The Assets rail's Inspirations tab counts the project's inspirations.
  const inspirations = () =>
    page
      .locator("#assets-pane-inspirations .genobi-shelf-toolbar > span")
      .evaluate((el) => el.textContent);
  const mediaCount = await inspirations();
  await page
    .getByRole("button", { name: "Send first frame to Director", exact: true })
    .click();
  for (let i = 0; i < 50 && (await inspirations()) === mediaCount; i++)
    await page.waitForTimeout(200);
  assert.notEqual(await inspirations(), mediaCount);
  await notice
    .filter({
      hasText:
        /world-first-frame\.png (added to|is already in) project assets · Inspirations/,
    })
    .waitFor();
  checks.push(
    "3D first-frame capture imports a real image into project Inspirations",
  );
  // Capture take records the take and adds it as an MP4 under Project.
  const projectCount = () =>
    page
      .locator("#assets-pane-project .genobi-shelf-toolbar > span")
      .evaluate((el) => el.textContent);
  const projectBefore = await projectCount();
  const length = page.locator(".wb-console .wb-take-length output");
  assert.match(await length.innerText(), /\d+\.\d\d s\s+\d+ f/);
  await page
    .locator(".wb-console")
    .getByRole("button", { name: /^Capture take/ })
    .click();
  await notice
    .filter({ hasText: /\.mp4 added to project assets · Project\.$/ })
    .waitFor({ timeout: 60_000 });
  assert.notEqual(await projectCount(), projectBefore);
  checks.push(
    "3D Capture take shows its length and lands as an MP4 in project assets",
  );
  await mode("Ninja");
  await page
    .getByRole("checkbox", { name: "Camera preview", exact: true })
    .check();
  await mode("Camera");
  await mode("Ninja");
  assert(
    await page
      .getByRole("checkbox", { name: "Camera preview", exact: true })
      .isChecked(),
  );
  checks.push("Ninja selection survives leaving and returning");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [
      "Gallery",
      "Camera",
      "Director",
      "Editor",
      "3D",
      "Dual Swords",
      "Project Tools",
      "Ninja",
    ]) {
      await mode(name);
      if (name === "3D")
        await page.getByLabel("World Builder scene", { exact: true }).waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name} overflows at ${width}`,
      );
      await page.screenshot({
        path: `${output}/${width}-${name.replaceAll(" ", "-")}.png`,
        fullPage: true,
      });
    }
    checks.push(
      `All eight sections clickable with no document overflow at ${width}px`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mode("Director");
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
    0,
  );
  checks.push("Reduced motion settles immediately");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await mode("Camera");
  // The local render must finish while its preview is hidden.
  await page
    .locator(".dir-render-result video")
    .waitFor({ state: "attached", timeout: 60000 });
  assert.equal(
    await nav
      .getByRole("button", { name: "Camera", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  checks.push(
    "Local MP4 export finishes in the background without changing the active preset",
  );
  await mode("Director");
  const result = page.getByRole("region", {
    name: "Finished video and usage report",
  });
  await result.waitFor();
  await result
    .getByText("What was used and what needs review", { exact: true })
    .click();
  assert.match(await result.innerText(), /Needs review/);
  const downloaded = page.waitForEvent("download");
  await result
    .getByRole("button", { name: "Download README ↓", exact: true })
    .click();
  const readme = await readFile(await (await downloaded).path(), "utf8");
  assert.match(readme, /# Director render/);
  assert.match(readme, /Recorded models/);
  assert.doesNotMatch(readme, /SHELL RETAINS THIS EDIT/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await result.screenshot({ path: `${output}/render-report-${width}.png` });
  }
  await result
    .getByRole("button", { name: "Edit in Editor", exact: true })
    .click();
  assert.equal(
    await nav
      .getByRole("button", { name: "Editor", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  checks.push(
    "Finished video report downloads a private-prompt-free README, fits phone/desktop and returns to Editor",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ base, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser.close();
}
