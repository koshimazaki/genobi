/**
 * Captures the eight Ninja storyboard recipes in World Builder, headless on
 * SwiftShader, through the builder's own `window.directorScene` adapter (the
 * same capture the Capture take button runs). Local only; nothing is paid.
 *
 *   npx vite --port 5491 --strictPort        # or npm run dev
 *   DIRECTOR_URL=http://127.0.0.1:5491 node scripts/capture-ninja-storyboard.mjs
 *
 * Per panel, under OUT (default .local/ninja-storyboard, gitignored):
 * rgb-00…16.png (each frame), take.webm and depth.webm (the 17-frame colour
 * and linear-depth passes), first.png, depth-first.png and receipt.json.
 * The board's frames go to public/scrolls/ninja/pNN.png and the contact sheet
 * to public/scrolls/ninja-rooms.png; stats.json records each panel's mean
 * luminance, its first-to-last frame change, the share of pixels the
 * character covers and the closest pair of first frames.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = process.env.OUT ?? ".local/ninja-storyboard";
const recipes = "custom_nodes/director_world_builder/examples/storyboard/ninja";
const board = "public/scrolls/ninja";
const ids = ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08"];
const SAMPLE = [64, 36];

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const write = (file, base64) => writeFile(file, Buffer.from(base64, "base64"));
const stats = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== new URL(base).origin) return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.request().method() === "GET"
        ? r.fulfill({ json: { jobs: [], sources: [] } })
        : r.abort();
    return r.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/world-builder`);
  await page.waitForFunction(() => window.directorScene, null, {
    timeout: 60000,
  });
  // Shared helpers in the page: blob → base64, PNG → downsampled pixels.
  await page.evaluate((sample) => {
    window.__ninja = {
      async b64(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
      async pixels(blob, w = sample[0], h = sample[1]) {
        const bitmap = await createImageBitmap(blob);
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext("2d");
        g.drawImage(bitmap, 0, 0, w, h);
        return Array.from(g.getImageData(0, 0, w, h).data);
      },
    };
  }, SAMPLE);
  await mkdir(board, { recursive: true });
  for (const id of ids) {
    const recipe = JSON.parse(
      await readFile(path.join(recipes, `${id}.json`), "utf8"),
    );
    const dir = path.join(out, id);
    await mkdir(dir, { recursive: true });
    const result = await page.evaluate(async (recipe) => {
      const scene = window.directorScene,
        n = window.__ninja;
      // The set alone, for how much of the frame the character covers.
      await scene.configure({ ...recipe, avatar: false });
      const empty = await n.pixels(await scene.snapshot(), 256, 144);
      await scene.configure(recipe);
      const take = await scene.capture();
      const canvas = document.querySelector(".wb-canvas-fit canvas");
      const frames = [];
      for (let i = 0; i < recipe.frames; i++) {
        await scene.render(i);
        frames.push(canvas.toDataURL("image/png").split(",")[1]);
      }
      const last = await (
        await fetch(`data:image/png;base64,${frames.at(-1)}`)
      ).blob();
      return {
        first: await n.b64(take.first),
        depthFirst: take.depthFirst ? await n.b64(take.depthFirst) : null,
        video: await n.b64(take.video),
        depth: take.depth ? await n.b64(take.depth) : null,
        receipt: await take.manifest.text(),
        frames,
        firstPixels: await n.pixels(take.first),
        lastPixels: await n.pixels(last),
        withCharacter: await n.pixels(take.first, 256, 144),
        empty,
      };
    }, recipe);
    await write(path.join(dir, "first.png"), result.first);
    await write(path.join(board, `${id}.png`), result.first);
    await write(path.join(dir, "take.webm"), result.video);
    if (result.depth) await write(path.join(dir, "depth.webm"), result.depth);
    if (result.depthFirst)
      await write(path.join(dir, "depth-first.png"), result.depthFirst);
    await writeFile(path.join(dir, "receipt.json"), result.receipt);
    for (const [i, frame] of result.frames.entries())
      await write(
        path.join(dir, `rgb-${String(i).padStart(2, "0")}.png`),
        frame,
      );
    const receipt = JSON.parse(result.receipt);
    assert.equal(receipt.frameCount, 17, `${id}: 17 frames`);
    assert.equal(result.frames.length, 17);
    const lum = (px) => {
      let sum = 0;
      for (let i = 0; i < px.length; i += 4)
        sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      return sum / (px.length / 4) / 255;
    };
    const diff = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i += 4)
        for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] - b[i + c]);
      return sum / ((a.length / 4) * 3) / 255;
    };
    let covered = 0;
    for (let i = 0; i < result.empty.length; i += 4)
      if (
        Math.abs(result.empty[i] - result.withCharacter[i]) +
          Math.abs(result.empty[i + 1] - result.withCharacter[i + 1]) +
          Math.abs(result.empty[i + 2] - result.withCharacter[i + 2]) >
        24
      )
        covered++;
    stats.push({
      id,
      scene: recipe.scene,
      motion: recipe.avatarMotion,
      shot: recipe.cameraShot,
      frames: receipt.frameCount,
      passes: receipt.passes,
      luminance: +lum(result.firstPixels).toFixed(3),
      motionDiff: +diff(result.firstPixels, result.lastPixels).toFixed(3),
      characterCover: +(covered / (result.empty.length / 4)).toFixed(3),
      pixels: result.firstPixels,
    });
    console.log(
      `${id} ${recipe.avatarMotion}/${recipe.cameraShot}: luminance ${stats.at(-1).luminance}, first→last ${stats.at(-1).motionDiff}, character ${(stats.at(-1).characterCover * 100).toFixed(1)}%`,
    );
  }
  // Contact sheet: the eight first frames, 2 × 4, with their panel numbers.
  const firsts = await Promise.all(
    ids.map((id) => readFile(path.join(out, id, "first.png"), "base64")),
  );
  const sheet = await page.evaluate(
    async ([ids, firsts]) => {
      const [w, h, band] = [512, 288, 28];
      const c = new OffscreenCanvas(w * 4, (h + band) * 2);
      const g = c.getContext("2d");
      g.fillStyle = "#111";
      g.fillRect(0, 0, c.width, c.height);
      for (const [i, id] of ids.entries()) {
        const blob = await (
          await fetch(`data:image/png;base64,${firsts[i]}`)
        ).blob();
        const x = (i % 4) * w,
          y = Math.floor(i / 4) * (h + band);
        g.drawImage(await createImageBitmap(blob), x, y + band, w, h);
        g.fillStyle = "#eee";
        g.font = "600 16px sans-serif";
        g.fillText(id.toUpperCase(), x + 10, y + 19);
      }
      return window.__ninja.b64(await c.convertToBlob({ type: "image/png" }));
    },
    [ids, firsts],
  );
  await write(path.join(out, "contact-sheet.png"), sheet);
  await write("public/scrolls/ninja-rooms.png", sheet);
  const pairs = [];
  for (let a = 0; a < stats.length; a++)
    for (let b = a + 1; b < stats.length; b++) {
      let sum = 0;
      const pa = stats[a].pixels,
        pb = stats[b].pixels;
      for (let i = 0; i < pa.length; i += 4)
        for (let c = 0; c < 3; c++) sum += Math.abs(pa[i + c] - pb[i + c]);
      pairs.push({
        pair: `${stats[a].id}/${stats[b].id}`,
        diff: +(sum / ((pa.length / 4) * 3) / 255).toFixed(3),
      });
    }
  pairs.sort((x, y) => x.diff - y.diff);
  for (const s of stats) delete s.pixels;
  await writeFile(
    path.join(out, "stats.json"),
    JSON.stringify({ panels: stats, closestPair: pairs[0] }, null, 2),
  );
  console.log(
    `closest first frames: ${pairs[0].pair} differ by ${pairs[0].diff}`,
  );
  for (const s of stats) {
    assert(s.luminance > 0.02 && s.luminance < 0.98, `${s.id} is blank`);
    assert(s.characterCover >= 0.001, `${s.id}: character not visible`);
  }
  assert(pairs[0].diff > 0.01, "two first frames are nearly identical");
  assert.deepEqual(errors, []);
  console.log(`PASS eight panels captured under ${out}`);
} finally {
  await browser.close();
}
