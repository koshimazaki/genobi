/** Local browser regression: empty/populated output at 1440 and 390 px,
 * panel resizing, pane divider dragging, and panel reordering. No paid calls.
 * DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-editor-monitors.mjs
 * Start Vite in this checkout first. Captures stay in .local/editor-monitors/.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/editor-monitors";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.DIRECTOR_BROWSER || undefined,
});
const errors = [];
let writes = 0;

async function geometry(page, width) {
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const canvas = document.querySelector(".dir-monitor-panes canvas");
    return {
      prompt: rect(".dir-project-direction"),
      program: rect(".dir-stage"),
      result: rect(".dir-render-result, .dir-output-empty"),
      panes: rect(".dir-monitor-panes"),
      backing: [canvas.width, canvas.height],
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const { prompt, program, result, panes } = boxes;
  assert(!boxes.overflow, `${width}: no horizontal page overflow`);
  assert(prompt.bottom <= program.y + 1, "prompt above monitors");
  assert(
    program.right <= result.x + 1 || program.bottom <= result.y + 1,
    "Program and output do not overlap",
  );
  assert(result.right <= panes.right + 1, "output stays inside panel width");
  if (width === 390 || panes.width <= 700)
    assert(program.bottom <= result.y + 1, "narrow panels stack monitors");
  else
    assert(
      program.right <= result.x + 1,
      "desktop monitors sit beside each other",
    );
  assert.deepEqual(
    boxes.backing,
    [1920, 1080],
    "native composition backing store",
  );
}

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("genobi.startup-guide.v1", "seen");
      localStorage.setItem("genobi-setup-seen-v1", "1");
    });
    // Stub every API read; abort every write, including generation and upload.
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") {
        writes++;
        return route.abort();
      }
      return route.fulfill({
        json: {
          jobs: [],
          sources: [],
          projects: [],
          sessions: [],
          arenas: [],
          hasServerKey: false,
        },
      });
    });
    await page.goto(`${base}/director?example=studio&workspace=editor`);
    await page.waitForSelector(".dir-stage-footer .dir-live", {
      timeout: 60000,
    });
    // A three-frame real local render tests the finished card without encoding
    // the whole fixture. This is an isolated browser document, never a saved copy.
    await page.evaluate(async () => {
      const { studioStore } = await import("/src/studio/store.ts");
      const { bundle } = studioStore.getState().director;
      const project = structuredClone(bundle.project);
      Object.assign(project.composition, {
        width: 1920,
        height: 1080,
        durationFrames: 3,
      });
      project.layers = project.layers
        .filter((l) => l.startFrame === 0)
        .map((l) => ({ ...l, durationFrames: 3 }));
      studioStore.getState().actions.commit({ ...bundle, project }, bundle);
    });
    await page.waitForSelector(".dir-stage-footer .dir-live", {
      timeout: 60000,
    });
    for (const populated of [false, true]) {
      if (populated) {
        await page.getByRole("button", { name: /^Render MP4/ }).click();
        await page.waitForSelector(".dir-render-result video", {
          timeout: 120000,
        });
      }
      await geometry(page, width);
      await page.locator(".dir-program-row").screenshot({
        path: `${output}/${width}-${populated ? "populated" : "empty"}.png`,
      });
      const resize = page.getByRole("button", {
        name: "Resize Composition",
        exact: true,
      });
      await resize.focus();
      for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowUp");
      await geometry(page, width);
      for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowDown");
      await geometry(page, width);
      if (width === 1440) {
        const divider = page.getByRole("separator", {
          name: "Preview width",
          exact: true,
        });
        await divider.scrollIntoViewIfNeeded();
        const at = await divider.boundingBox();
        await page.mouse.move(at.x + at.width / 2, at.y + 30);
        await page.mouse.down();
        await page.mouse.move(at.x + 800, at.y + 30, { steps: 8 });
        await page.mouse.up();
        await geometry(page, width);
        await divider.focus();
        for (let i = 0; i < 15; i++)
          await page.keyboard.press("Shift+ArrowLeft");
        await geometry(page, width);
      }
      await resize.focus();
      await page.keyboard.press("Home");
    }
    // The shell reorders whole panels; monitors must travel as one unit.
    const stage = page.locator('[data-panel="stage"]');
    const timeline = page.locator('[data-panel="timeline"]');
    const stageHead = stage.locator(".genobi-panel-heading").first();
    const timelineHead = timeline.locator(".genobi-panel-heading").first();
    // The Editor preset hides panel headings; reorder only where they show.
    if ((await stageHead.isVisible()) && (await timelineHead.isVisible())) {
      await stageHead.dragTo(timelineHead);
    } else console.log(`${width}px: panel headings hidden, reorder skipped`);
    await geometry(page, width);
    await page.close();
  }
  assert.equal(writes, 0, "no API mutation or paid request");
  assert.deepEqual(errors, [], "no page errors");
  console.log(
    `Editor monitor checks passed at 1440 and 390 px; captures: ${output}`,
  );
} finally {
  await browser.close();
}
