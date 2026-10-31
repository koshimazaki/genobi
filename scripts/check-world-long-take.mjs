/** A real 721-frame RGB/depth export, with deterministic camera/morph seeking. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(
  process.env.WORLD_LONG_EVIDENCE ?? ".local/world-long-take",
);
await mkdir(output, { recursive: true });
const server = await createServer({
  cacheDir: resolve(output, "vite-cache"),
  server: { host: "127.0.0.1", port: 4502, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-features=LocalNetworkAccessChecks"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("LONG_TAKE")) console.log(message.text());
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4502") return route.abort();
    if (url.pathname === "/__long_take")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      });
    return route.continue();
  });
  await page.exposeFunction("writeEvidence", async (name, bytes) => {
    assert(
      ["colour.webm", "depth.webm", "first.png", "manifest.json"].includes(
        name,
      ),
    );
    await writeFile(resolve(output, name), Buffer.from(bytes));
  });
  await page.goto("http://127.0.0.1:4502/__long_take");
  const result = await page.evaluate(async () => {
    const { createWorld } = await import("/src/world-builder/runtime.ts");
    const { createMorphComposition } =
      await import("/src/world-builder/morph-asset-catalogue.ts");
    const { defaultStateAudio } =
      await import("/src/world-builder/scene-state-audio.ts");
    const { frameMorphComposition } =
      await import("/src/world-builder/morph-framing.ts");
    const { exportTake } = await import("/src/world-builder/export-take.ts");
    let recipe = createMorphComposition({
      assetIds: ["pyramid", "chamber", "cathedral"],
      count: 128,
      style: "assemble",
      durationSeconds: 30,
    });
    recipe.width = 384;
    recipe.height = 256;
    recipe = frameMorphComposition(recipe);
    recipe.cameraMotion.followMorph = true;
    recipe.cameraMotion.orbit = { axis: "y", turns: 1 };
    recipe.motion.stateAudio = {
      ...defaultStateAudio(recipe.motion),
      enabled: true,
      amount: 0.35,
    };
    const pulse = (phase) =>
      Array.from(
        { length: 721 },
        (_, i) =>
          Math.round(Math.max(0, Math.sin(i * 0.045 + phase)) ** 6 * 10000) /
          10000,
      );
    recipe.envelope = pulse(0);
    recipe.bandEnvelopes = {
      sub: pulse(0),
      low: pulse(0),
      mid: pulse(2),
      high: pulse(4),
    };
    const canvas = document.createElement("canvas");
    const world = createWorld(canvas, () => {});
    const copy = document.createElement("canvas");
    copy.width = 384;
    copy.height = 256;
    const context = copy.getContext("2d", { willReadFrequently: true });
    const hash = () => {
      context.drawImage(canvas, 0, 0);
      let value = 2166136261;
      for (const byte of context.getImageData(0, 0, 384, 256).data)
        value = Math.imul(value ^ byte, 16777619) >>> 0;
      return value;
    };
    try {
      world.configure(recipe);
      await world.renderFrame(359);
      const preview = hash();
      world.beginCapture();
      await world.renderFrame(359);
      const capture = hash();
      for (const frame of [720, 0, 600, 359]) await world.renderFrame(frame);
      const seek = hash();
      await world.renderDepthFrame(359);
      const depth = hash();
      await world.renderDepthFrame(0);
      await world.renderDepthFrame(359);
      const depthSeek = hash();
      await world.renderFrame(359);
      const restored = hash();
      if (
        preview !== capture ||
        preview !== seek ||
        preview !== restored ||
        depth !== depthSeek ||
        preview === depth
      )
        throw new Error("Long-take renderer parity failed.");
      let last = -1;
      const take = await exportTake(
        recipe,
        world,
        new AbortController().signal,
        (frame) => {
          const bucket = Math.floor(frame / 120);
          if (bucket !== last) {
            last = bucket;
            console.log(`LONG_TAKE ${frame}/721`);
          }
        },
        "morph-30-seconds",
      );
      for (const [name, blob] of [
        ["colour.webm", take.video],
        ["depth.webm", take.depth],
        ["first.png", take.first],
        ["manifest.json", take.manifest],
      ])
        await window.writeEvidence(
          name,
          Array.from(new Uint8Array(await blob.arrayBuffer())),
        );
      const manifest = JSON.parse(await take.manifest.text());
      world.endCapture();
      return {
        frameCount: manifest.frameCount,
        duration: manifest.duration,
        ltxTiming: manifest.ltxTiming,
        preview,
        capture,
        seek,
        restored,
        depth,
        depthSeek,
        recipeBytes: JSON.stringify(recipe).length,
      };
    } finally {
      world.dispose();
    }
  });
  assert.deepEqual(errors, []);
  assert.equal(result.frameCount, 721);
  for (const name of ["colour.webm", "depth.webm"]) {
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,nb_read_frames,r_frame_rate:format=duration",
          "-of",
          "json",
          resolve(output, name),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(Number(info.streams[0].nb_read_frames), 721);
    assert.equal(info.streams[0].r_frame_rate, "24/1");
    assert.equal(info.streams[0].width, 384);
    assert.equal(info.streams[0].height, 256);
    assert(Math.abs(Number(info.format.duration) - 721 / 24) < 0.002);
    result[name] = info;
  }
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ status: "passed", errors, ...result }, null, 2),
  );
  console.log(JSON.stringify({ status: "passed", errors, ...result }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
