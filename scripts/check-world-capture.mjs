/**
 * World Builder take capture, end to end in a real browser, against a local
 * server: DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-capture.mjs
 *
 * Loads the cathedral room recipe through the recipe loader, puts the
 * mannequin on its walk clip, applies the Push in shot at 9 frames and clicks
 * Capture take. It then downloads the WebM, first frame, depth pass and
 * receipt, decodes them with ffmpeg and asserts that every frame carries the
 * scene, that the camera move changes each frame, that the mannequin is in
 * frame, and that the walk clip moves (a walk take differs from an idle take
 * over the same still camera). Last, it starts a 360° orbit over 10 s from
 * Walk: after a live orbit, Capture take freezes that viewport as the shot
 * camera, returns to Shot and records 241 frames that come back to the first.
 * No provider request leaves the browser.
 * Software WebGL (SwiftShader) is used so the check also runs headless.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { chooseSelect } from "./lib/choose-select.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = process.env.WORLD_CAPTURE_EVIDENCE ?? ".local/world-capture";
const cathedral =
  "custom_nodes/director_world_builder/examples/rooms/cathedral.json";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/** Greyscale frames at a fixed analysis size, one buffer per frame. */
function frames(file, width = 320, height = 176) {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `scale=${width}:${height}`].concat([
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ]),
    { maxBuffer: 1 << 28 },
  );
  const size = width * height,
    list = [];
  for (let i = 0; i + size <= raw.length; i += size)
    list.push(raw.subarray(i, i + size));
  return list;
}
const meanDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};
/** Pixels that differ by more than a compression-noise threshold. */
const changed = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) n++;
  return n;
};
const range = (f) => Math.max(...f) - Math.min(...f);

async function open() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(base).origin
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/world-builder`);
  await page.waitForFunction(() => window.directorScene);
  await page.waitForFunction(
    () => !document.querySelector(".wb-console > .wb-primary").disabled,
    null,
    { timeout: 60000 },
  );
  return { context, page, errors, app: page.locator(".wb-app") };
}
const configure = (page, patch) =>
  page.evaluate(
    (patch) =>
      window.directorScene.configure({
        ...window.directorScene.getRecipe(),
        ...patch,
      }),
    patch,
  );
async function still(page, file) {
  const bytes = await page.evaluate(async () => [
    ...new Uint8Array(
      await (await window.directorScene.snapshot()).arrayBuffer(),
    ),
  ]);
  await writeFile(file, Buffer.from(bytes));
  return frames(file)[0];
}

/** Click Capture take, then download every file the Export take fold offers. */
async function captureTake(page, app, dir, timeout = 180000) {
  await app.locator(".wb-console > .wb-primary").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".wb-capture-result[data-error]") ||
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Capture receipt",
      ),
    null,
    { timeout },
  );
  const error = await app.locator(".wb-capture-result[data-error]").count();
  assert.equal(
    error,
    0,
    `Capture failed: ${await app.locator(".wb-capture-result").textContent()}`,
  );
  await page.evaluate(() =>
    document
      .querySelectorAll(".wb-app details")
      .forEach((d) => (d.open = true)),
  );
  const files = {};
  for (const [label, name] of [
    ["Video · WebM", "take.webm"],
    ["First frame", "first.png"],
    ["Depth · WebM", "depth.webm"],
    ["Capture receipt", "receipt.json"],
  ]) {
    const button = app.getByRole("button", { name: label, exact: true }).last();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    await download.saveAs((files[name] = `${dir}/${name}`));
  }
  return files;
}

async function cathedralTake(name, patch, shot) {
  const dir = `${out}/${name}`;
  await mkdir(dir, { recursive: true });
  const { context, page, errors, app } = await open();
  try {
    await page.getByLabel("Load recipe").setInputFiles(cathedral);
    await page.waitForFunction(() =>
      window.directorScene
        .getRecipe()
        .objects.some((o) => o.id === "room-north"),
    );
    await configure(page, { frames: 9, ...patch });
    if (shot) {
      await app.getByRole("button", { name: "Camera", exact: true }).click();
      await chooseSelect(app.getByLabel("Camera move", { exact: true }), shot);
      await page.waitForFunction(
        (shot) => window.directorScene.getRecipe().cameraShot === shot,
        shot,
      );
      await page.keyboard.press("Escape");
    }
    const recipe = await page.evaluate(() => window.directorScene.getRecipe());
    // The same first frame without the character, and with no set at all.
    const withCharacter = await still(page, `${dir}/with-character.png`);
    await configure(page, { avatar: false });
    const without = await still(page, `${dir}/without-character.png`);
    // Removing all props must also remove routes addressed to those props.
    await configure(page, { avatar: false, objects: [], audioRoutes: [] });
    const blank = await still(page, `${dir}/blank-set.png`);
    await configure(page, recipe);
    const files = await captureTake(page, app, dir);
    assert.deepEqual(errors, [], `${name}: page errors`);
    return { files, withCharacter, without, blank };
  } finally {
    await context.close();
  }
}

/** A 360° orbit over 10 s, captured from Walk after a live orbit. */
async function walkOrbitTake() {
  const dir = `${out}/orbit-360-from-walk`;
  await mkdir(dir, { recursive: true });
  const { context, page, errors, app } = await open();
  try {
    await page.getByLabel("Load recipe").setInputFiles(cathedral);
    await page.waitForFunction(() =>
      window.directorScene
        .getRecipe()
        .objects.some((o) => o.id === "room-north"),
    );
    await configure(page, {
      width: 512,
      height: 320,
      seconds: 10,
      orbit: 360,
      cameraCurve: "linear",
      elevationEnd: null,
      dolly: 0,
    });
    const before = await page.evaluate(() => window.directorScene.getRecipe());
    assert.equal(before.frames, 241, "10 s is 241 frames");
    const mode = () =>
      page.evaluate(() =>
        document
          .querySelector('.wb-view-modes [aria-pressed="true"]')
          ?.textContent.trim(),
      );
    await app.getByRole("button", { name: "Walk", exact: true }).click();
    assert.equal(await mode(), "Walk");
    // Walk forward, then let the walking camera orbit the character.
    await page.evaluate(() =>
      window.directorScene.live.control({ move: [0, 1], seconds: 0.6 }),
    );
    await page.waitForTimeout(800);
    await page.evaluate(() =>
      window.directorScene.live.control({ camera: "orbit", seconds: 1.5 }),
    );
    await page.waitForTimeout(1500);
    const files = await captureTake(page, app, dir, 600000);
    assert.equal(await mode(), "Shot camera", "capture returns to Shot");
    assert.deepEqual(errors, [], "orbit-360: page errors");
    const receipt = JSON.parse(await readFile(files["receipt.json"], "utf8"));
    const r = receipt.recipe;
    assert.equal(receipt.frameCount, 241);
    assert.equal(r.seconds, 10);
    assert.equal(r.orbit, 360);
    assert.equal(r.cameraShot, "custom");
    const moved = Math.hypot(
      r.avatarPose.x - before.avatarPose.x,
      r.avatarPose.z - before.avatarPose.z,
    );
    assert(moved > 0.2, `the walk's position is saved (${moved} m)`);
    assert(
      Math.abs(r.targetY - (r.avatarPose.y + 0.9)) < 0.01,
      "the shot looks where the walking camera looked",
    );
    const frozen = Math.abs(r.azimuth - before.azimuth);
    assert(frozen > 1, `the viewport replaced the recipe's start (${frozen}°)`);
    const colour = frames(files["take.webm"]);
    assert.equal(colour.length, 241, "241 colour frames");
    const full = meanDiff(colour[0], colour[240]),
      half = meanDiff(colour[0], colour[120]);
    assert(
      full * 3 < half,
      `a full turn ends where it started (${full} vs ${half} at 180°)`,
    );
    return { frames: colour.length, full, half, moved, frozen };
  } finally {
    await context.close();
  }
}

const report = [];
try {
  // 1. Push in on the walking mannequin: the owner's reported take.
  const take = await cathedralTake(
    "push-in-walk",
    { avatarMotion: "walk" },
    "pushIn",
  );
  const colour = frames(take.files["take.webm"]);
  assert.equal(colour.length, 9, "9 colour frames");
  for (const [i, frame] of colour.entries()) {
    assert(range(frame) > 40, `frame ${i} is not one flat colour`);
    assert(
      meanDiff(frame, take.blank) > 5,
      `frame ${i} carries the set, not an empty render`,
    );
  }
  const steps = colour.slice(1).map((f, i) => meanDiff(f, colour[i]));
  assert(
    steps.every((d) => d > 0.5),
    `camera move changes every frame: ${steps}`,
  );
  const [first] = frames(take.files["first.png"]);
  assert(
    meanDiff(first, take.withCharacter) < 1,
    "first frame matches the preview",
  );
  const mannequin = changed(take.withCharacter, take.without);
  assert(mannequin > 8, `mannequin is in frame (${mannequin} px)`);
  const depth = frames(take.files["depth.webm"]);
  assert.equal(depth.length, 9, "9 depth frames");
  assert(
    depth.every((f) => range(f) > 40),
    "depth frames carry geometry",
  );
  const receipt = JSON.parse(
    await readFile(take.files["receipt.json"], "utf8"),
  );
  assert.equal(receipt.frameCount, 9);
  assert.deepEqual(receipt.passes, ["colour", "depth"]);
  assert.equal(receipt.recipe.avatarMotion, "walk");
  report.push({
    take: "push-in-walk",
    frames: colour.length,
    steps,
    mannequin,
  });

  // 2. The walk clip moves: same still camera, walk against idle.
  const walk = frames(
    (await cathedralTake("still-walk", { avatarMotion: "walk" })).files[
      "take.webm"
    ],
  );
  const idle = frames(
    (await cathedralTake("still-idle", { avatarMotion: "idle" })).files[
      "take.webm"
    ],
  );
  const apart = walk.map((f, i) => changed(f, idle[i]));
  assert(
    apart.slice(1).every((n) => n > 20),
    `walk frames differ from idle frames: ${apart}`,
  );
  report.push({ take: "walk-vs-idle", pixelsApart: apart });

  // 3. Orbit 360 over 10 s, captured from Walk.
  report.push({ take: "orbit-360-from-walk", ...(await walkOrbitTake()) });
  console.log("PASS World Builder capture", JSON.stringify(report));
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
