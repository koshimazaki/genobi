// Program shows the picture after the person changes workspace
// (docs/dimensions-mix.md#projects-saved-before-the-editable-card): the
// Dimensions mix opened from the Gallery with Take it to the editor draws
// its end card at frames 500 and 554, switching Director → Editor keeps
// Program drawing, and a finished render survives Edit in Editor. The first
// two went blank when the Editor mounted a new canvas and
// the renderer kept the old one. Start the local server first
// (DIRECTOR_URL, default http://127.0.0.1:4317, or any `npm run dev`
// port); Chrome is the default browser, DIRECTOR_BROWSER for another.
// Frames go to EDITOR_PROGRAM_OUT, default .local/editor-program.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local server",
);
const out = process.env.EDITOR_PROGRAM_OUT ?? ".local/editor-program";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  const preview = page.locator('canvas[aria-label="Director preview"]');
  const seek = async (f) => {
    for (let attempt = 0; ; attempt++) {
      await page
        .getByRole("slider", { name: "Playhead", exact: true })
        .fill(String(f));
      try {
        await page.waitForFunction(
          (f) =>
            document.querySelector('canvas[aria-label="Director preview"]')
              ?.dataset.frame === String(f),
          f,
          { timeout: 15000 },
        );
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  };
  /** Share of pixels that are not the Signal black background. */
  const drawn = () =>
    preview.evaluate((c) => {
      const { data } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
      return lit / (data.length / 4);
    });
  const save = async (name) =>
    writeFile(
      `${out}/${name}.png`,
      Buffer.from(
        await preview.evaluate((c) => c.toDataURL("image/png").split(",")[1]),
        "base64",
      ),
    );

  // The Gallery opens the mix straight into the Editor.
  await page.goto(`${base}/`);
  // The studio's first project is open before the Gallery replaces it.
  await page.waitForFunction(
    () =>
      document.querySelector('canvas[aria-label="Director preview"]')?.dataset
        .frame !== undefined,
    null,
    { timeout: 60000 },
  );
  await page.getByLabel("View Dimensions mix").first().click();
  await page.getByRole("link", { name: "Take it to the editor" }).click();
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 60000 });
  assert.deepEqual(
    await preview.evaluate((c) => [c.width, c.height]),
    [1920, 1080],
    "Program draws into the Editor's canvas",
  );
  for (const f of [500, 554]) {
    await seek(f);
    await save(`gallery-editor-${f}`);
  }
  assert.ok((await drawn()) > 0.05, "the end card is drawn at frame 554");
  console.log("PASS Gallery → Take it to the editor draws card 13");

  // The simple Director, then the Editor: Program keeps drawing.
  await page.goto(`${base}/director?example=dimensions-mix`);
  // The simple Director hides the status line; its canvas says it drew.
  await page.waitForFunction(
    () =>
      document.querySelector('canvas[aria-label="Director preview"]')?.dataset
        .frame !== undefined,
    null,
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Editor", exact: true })
    .first()
    .click();
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 60000 });
  await seek(100);
  await save("switch-editor-100");
  assert.ok((await drawn()) > 0.05, "a clip is drawn at frame 100");
  console.log("PASS Director → Editor keeps Program drawing");

  // A finished render survives the canvas changing under it: render in the
  // Editor, go to the Director (its own canvas) and back; the result and
  // Save to library stay usable.
  await page.goto(`${base}/director?example=studio&workspace=editor`);
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: /^Render MP4/ }).click();
  await page.getByText(/^Render ready · MP4/).waitFor({ timeout: 10 * 60000 });
  await page
    .getByRole("button", { name: "Director", exact: true })
    .first()
    .click();
  // The Director still shows the result, and back in the Editor (a third
  // canvas) Save to library is still on.
  await page
    .getByRole("button", { name: "Edit in Editor", exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Editor", exact: true })
    .first()
    .click();
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 60000 });
  // The panel is a closed <details>, so the button is read from the page.
  const keep = await page.evaluate(() => {
    const button = [
      ...document.querySelectorAll(".dir-saved-videos button"),
    ].find((b) => /rendered video to/.test(b.textContent));
    return button ? !button.disabled : null;
  });
  assert.equal(keep, true, "Save the render is still offered and enabled");
  console.log("PASS a finished render survives Editor → Director → Editor");
  assert.deepEqual(errors, []);
  console.log(`Frames in ${out}`);
} finally {
  await browser.close();
}
