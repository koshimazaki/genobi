/**
 * Captures every take in the mannequin move library, headless on SwiftShader,
 * through the builder's own `window.directorScene` adapter (the same capture
 * the Capture take button runs). Local only; nothing is paid.
 *
 *   npx vite --port 5491 --strictPort        # or npm run dev
 *   DIRECTOR_URL=http://127.0.0.1:5491 node scripts/capture-move-library.mjs [id …]
 *
 * Per move, under OUT (default .local/move-library, gitignored): take.webm
 * and depth.webm (the colour and linear-depth passes of the whole take),
 * first.png, depth-first.png, receipt.json and sheet.png, five frames across
 * the take. stats.json records each take's frame count, how much the
 * character changes between those frames and the share of pixels it covers.
 * Canny is drawn from the colour frames by the Comfy Capture node.
 *
 * Recipes name no track. AUDIO=<file> attaches one to every take of the run
 * (through the adapter's setAudio) so audio routes move; capture a take that
 * needs audio on its own: AUDIO=beat.wav … capture-move-library.mjs dance-balls
 */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = process.env.OUT ?? ".local/move-library";
const audio = process.env.AUDIO
  ? (await readFile(process.env.AUDIO)).toString("base64")
  : null;
const recipes = "custom_nodes/director_world_builder/examples/moves";
const all = (await readdir(recipes))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();
const ids = process.argv.length > 2 ? process.argv.slice(2) : all;
for (const id of ids) assert(all.includes(id), `no move recipe ${id}`);

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
  await mkdir(out, { recursive: true });
  for (const id of ids) {
    const recipe = JSON.parse(
      await readFile(path.join(recipes, `${id}.json`), "utf8"),
    );
    const dir = path.join(out, id);
    await mkdir(dir, { recursive: true });
    const started = Date.now();
    const job = [recipe, audio];
    const result = await page.evaluate(async ([recipe, audio]) => {
      const scene = window.directorScene;
      const b64 = async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      };
      const canvas = () => document.querySelector(".wb-canvas-fit canvas");
      const small = (source) => {
        const c = new OffscreenCanvas(256, 144);
        c.getContext("2d").drawImage(source, 0, 0, 256, 144);
        return c;
      };
      const pixels = (c) =>
        Array.from(c.getContext("2d").getImageData(0, 0, 256, 144).data);
      const picks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
        Math.round(t * (recipe.frames - 1)),
      );
      // The set alone, for how much of the frame the character covers.
      await scene.configure({ ...recipe, avatar: false });
      await scene.render(picks[2]);
      const empty = pixels(small(canvas()));
      await scene.configure(recipe);
      if (audio)
        await scene.setAudio(
          new Blob([Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))]),
        );
      const take = await scene.capture();
      const shots = [];
      for (const f of picks) {
        await scene.render(f);
        shots.push(small(canvas()));
      }
      const [w, h, band] = [256, 144, 18];
      const sheet = new OffscreenCanvas(w * picks.length, h + band);
      const g = sheet.getContext("2d");
      g.fillStyle = "#111";
      g.fillRect(0, 0, sheet.width, sheet.height);
      g.fillStyle = "#eee";
      g.font = "600 12px sans-serif";
      shots.forEach((c, i) => {
        g.drawImage(c, i * w, band);
        g.fillText(`f${picks[i]}`, i * w + 6, 13);
      });
      return {
        first: await b64(take.first),
        depthFirst: take.depthFirst ? await b64(take.depthFirst) : null,
        video: await b64(take.video),
        depth: take.depth ? await b64(take.depth) : null,
        receipt: await take.manifest.text(),
        sheet: await b64(await sheet.convertToBlob({ type: "image/png" })),
        shots: shots.map(pixels),
        empty,
      };
    }, job);
    await write(path.join(dir, "first.png"), result.first);
    await write(path.join(dir, "take.webm"), result.video);
    await write(path.join(dir, "sheet.png"), result.sheet);
    if (result.depth) await write(path.join(dir, "depth.webm"), result.depth);
    if (result.depthFirst)
      await write(path.join(dir, "depth-first.png"), result.depthFirst);
    await writeFile(path.join(dir, "receipt.json"), result.receipt);
    const receipt = JSON.parse(result.receipt);
    assert.equal(receipt.frameCount, recipe.frames, `${id}: frame count`);
    const diff = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i += 4)
        for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] - b[i + c]);
      return sum / ((a.length / 4) * 3) / 255;
    };
    let covered = 0;
    const mid = result.shots[2];
    for (let i = 0; i < mid.length; i += 4)
      if (
        Math.abs(result.empty[i] - mid[i]) +
          Math.abs(result.empty[i + 1] - mid[i + 1]) +
          Math.abs(result.empty[i + 2] - mid[i + 2]) >
        24
      )
        covered++;
    const steps = result.shots
      .slice(1)
      .map((s, i) => +diff(result.shots[i], s).toFixed(4));
    stats.push({
      id,
      frames: receipt.frameCount,
      seconds: +(receipt.frameCount / 24).toFixed(2),
      shot: recipe.cameraShot,
      moves: recipe.avatarMotion,
      passes: receipt.passes,
      changeBetweenSheetFrames: steps,
      characterCover: +(covered / (mid.length / 4)).toFixed(3),
      captureSeconds: Math.round((Date.now() - started) / 1000),
    });
    console.log(
      `${id}: ${receipt.frameCount} f ${recipe.cameraShot}, change ${steps.join("/")}, character ${(stats.at(-1).characterCover * 100).toFixed(1)}%, ${stats.at(-1).captureSeconds} s`,
    );
  }
  await writeFile(
    path.join(out, "stats.json"),
    JSON.stringify({ takes: stats }, null, 2),
  );
  for (const s of stats) {
    assert(s.characterCover >= 0.001, `${s.id}: character not visible`);
    assert(
      s.changeBetweenSheetFrames.some((d) => d > 0.0005),
      `${s.id}: the take does not move`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${stats.length} moves captured under ${out}`);
} finally {
  await browser.close();
}
