/** PR #79: real Chromium smoke check, no cloud credentials or paid generation. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const out = path.resolve("output/browser-pr79");
await mkdir(out, { recursive: true });
const mp4Path = path.join(out, "fixture.mp4");
const ffmpeg = spawnSync(
  "ffmpeg",
  [
    "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=10",
    "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-loglevel", "error", mp4Path,
  ],
  { encoding: "utf8" },
);
assert.equal(ffmpeg.status, 0, "FFmpeg fixture creation failed: " + ffmpeg.stderr);
const mp4 = Array.from(await readFile(mp4Path));
const png = Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
));
const port = 4177;
const url = "http://127.0.0.1:" + port + "/?workspace=director";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (data) => (serverLog += String(data)));
server.stderr.on("data", (data) => (serverLog += String(data)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ready = false;
for (let i = 0; i < 90; i++) {
  if (server.exitCode !== null) break;
  try {
    const response = await fetch(url);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await sleep(1000);
}
assert(ready, "Vite did not start: " + serverLog.slice(-4000));

let browser;
let page;
let requestedGeneration = false;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      "genobi.ninja-rails.v1",
      JSON.stringify({ director: true, camera: true }),
    );
  });

  let sources = [];
  let uploadRoute;
  let uploadBehavior = "hold";
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/history")
      return route.fulfill({ status: 200, json: { jobs: [], sources } });
    if (pathname === "/api/uploads" && request.method() === "POST") {
      if (uploadBehavior === "fail")
        return route.fulfill({
          status: 503,
          json: { error: "Simulated upload failure" },
        });
      uploadRoute = route;
      return;
    }
    if (pathname === "/api/jobs" && request.method() === "POST")
      requestedGeneration = true;
    return route.fulfill({
      status: 404,
      json: { error: "Unavailable in the offline browser fixture" },
    });
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const setup = page.getByRole("button", { name: "Skip setup for now" });
  if (await setup.isVisible().catch(() => false)) await setup.click();

  // Seed the actual StudioShell/AssetRail with its checked-in example.
  // In a Vite development session browser module imports address the PR files.
  await page.evaluate(async ({ mp4, png }) => {
    const { studioStore } = await import("/src/studio/store.ts");
    const { default: project } = await import(
      "/docs/director-bundle/example/studio.json"
    );
    const files = new Map(
      Object.values(project.assets).map((asset) => {
        const name = asset.file.path;
        const data = name.endsWith(".mp4")
          ? mp4
          : name.endsWith(".png")
            ? png
            : name.endsWith(".svg")
              ? Array.from(new TextEncoder().encode(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'
                ))
              : [0, 0, 0, 0];
        return [name, new Uint8Array(data)];
      }),
    );
    const bundle = { project, files };
    studioStore.setState((state) => ({
      director: { ...state.director, bundle, loaded: bundle },
    }));
  }, { mp4, png });
  await page.getByRole("button", { name: "Expand assets" }).click();
  const gallery = page.getByRole("dialog", { name: "Assets gallery" });
  await gallery.waitFor({ state: "visible" });
  assert.equal(await gallery.locator("#expanded-assets-pane-project .assets-expanded-card").count(), 4);
  assert(await gallery.getByRole("heading", { name: "Project" }).isVisible(),
    "Expanded collection heading is hidden");
  await page.screenshot({ path: path.join(out, "desktop-project.png") });
  console.log("PASS: desktop overlay, four project cards, visible heading");

  await gallery.getByRole("tab", { name: "Inspirations" }).click();
  assert(await gallery.getByText("Reference · style").first().isVisible());
  await gallery.getByRole("tab", { name: "Project" }).click();
  await gallery.getByRole("button", { name: "View orbit-1.png" }).click();
  const preview = page.getByRole("dialog", { name: "orbit-1.png" });
  await preview.waitFor({ state: "visible" });
  assert(await preview.locator("img.still-image").isVisible());
  await preview.getByRole("button", { name: "Next" }).click();
  assert(await page.getByRole("dialog", { name: "orbit-2.png" }).isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('dialog.video-lightbox[open]').count(), 0);
  assert(await gallery.isVisible(), "Escape closed gallery instead of lightbox");
  console.log("PASS: tabs, style label, lightbox navigation and Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    gallery: document.querySelector(".assets-expanded").getBoundingClientRect().width,
    close: document.querySelector(".assets-expanded-close").getBoundingClientRect().right,
  }));
  assert(width.document <= width.viewport + 2,
    "Mobile horizontal overflow: " + JSON.stringify(width));
  assert(width.close <= width.viewport + 2,
    "Mobile close button outside viewport: " + JSON.stringify(width));
  await page.screenshot({ path: path.join(out, "phone-project.png") });
  console.log("PASS: phone viewport, no horizontal overflow, visible Close");

  await gallery.getByRole("button", { name: "Use in Camera: orbit-motion.mp4" }).click();
  await page.locator('.genobi-shell[data-preset="camera"]').waitFor();
  for (let i = 0; i < 100 && !uploadRoute; i++) await sleep(100);
  assert(uploadRoute, "A valid MP4 did not reach /api/uploads");
  assert(await page.locator(".generate-button").isDisabled(),
    "Generate was enabled while MP4 was uploading");
  assert.equal(requestedGeneration, false, "Handoff triggered paid generation");
  console.log("PASS: MP4 handoff selects Camera/Upscale and blocks Generate");

  const source = {
    id: "pr79-qa-video",
    label: "orbit-motion.mp4",
    origin: "upload",
    width: 160,
    height: 90,
    durationSeconds: 1,
  };
  sources = [source];
  await uploadRoute.fulfill({ status: 200, json: { source } });
  await page.waitForFunction(async () => {
    const { cameraNotice } = await import("/src/camera-recipe-target.ts");
    return cameraNotice().includes("is Upscale's source");
  }, null, { timeout: 15000 });
  assert.equal(requestedGeneration, false, "Upload submitted a generation");
  console.log("PASS: successful mocked upload restores selected Upscale source");

  await page.locator('[data-preset-button="director"]').first().click();
  await page.getByRole("button", { name: "Expand assets" }).click();
  uploadBehavior = "fail";
  await page.getByRole("dialog", { name: "Assets gallery" })
    .getByRole("button", { name: "Use in Camera: orbit-motion.mp4" }).click();
  await page.locator('.genobi-shell[data-preset="camera"]').waitFor();
  await page.getByText("Simulated upload failure").waitFor({ timeout: 15000 });
  assert(await page.locator(".generate-button").isDisabled(),
    "Failed upload enabled Generate with a stale source");
  assert.equal(requestedGeneration, false);
  console.log("PASS: failed MP4 upload blocks stale-source generation");

  if (errors.length) throw new Error("Uncaught browser errors: " + errors.join(" | "));
  console.log("BROWSER QA PASS (Chromium desktop + mobile; mocked API, zero paid jobs)");
} catch (error) {
  if (page) {
    try {
      await page.screenshot({ path: path.join(out, "failure.png") });
    } catch {}
  }
  console.error("BROWSER QA FAILED:", error);
  if (errors.length) console.error("Browser uncaught errors:", errors.join(" | "));
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  console.log("Vite tail:", serverLog.slice(-800));
}
