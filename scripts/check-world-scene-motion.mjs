/**
 * Browser regression for scene-state morphs, deterministic seeking and capture.
 * Run against a local studio (ffmpeg/ffprobe and a Chrome-compatible browser):
 * DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-scene-motion.mjs
 * DIRECTOR_BROWSER_EXECUTABLE can name a local Chromium executable.
 * Evidence is written to .local/world-scene-motion. No provider call is allowed.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = process.env.WORLD_MOTION_EVIDENCE ?? ".local/world-scene-motion";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.DIRECTOR_BROWSER_EXECUTABLE
    ? { executablePath: process.env.DIRECTOR_BROWSER_EXECUTABLE }
    : {
        channel:
          process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
      }),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function inspectVideo(file) {
  const info = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-count_frames",
        "-show_frames",
        "-show_entries",
        "stream=width,height,nb_read_frames:frame=best_effort_timestamp_time:format=duration",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  const stream = info.streams[0];
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const size = stream.width * stream.height;
  assert.equal(
    raw.length,
    size * 17,
    "decoded frames must match the capture grid",
  );
  const hashes = [];
  let min = 255,
    max = 0;
  for (let i = 0; i < 17; i++) {
    const frame = raw.subarray(i * size, (i + 1) * size);
    hashes.push(hash(frame));
    for (const value of frame) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  assert(
    max - min > 20,
    "pass must contain rendered geometry, not a blank frame",
  );
  assert(
    new Set(hashes).size > 3,
    "the captured guide must change across the morph",
  );
  assert.equal(Number(stream.nb_read_frames), 17);
  assert.equal(stream.width, 320);
  assert.equal(stream.height, 256);
  const timestamps = info.frames.map((frame) =>
    Number(frame.best_effort_timestamp_time),
  );
  assert.equal(timestamps.length, 17);
  timestamps.forEach((time, i) =>
    assert(
      Math.abs(time - i / 24) <= 0.0011,
      `frame ${i} must land on the 24 fps grid`,
    ),
  );
  assert(Math.abs(Number(info.format.duration) - 17 / 24) < 0.002);
  return {
    width: stream.width,
    height: stream.height,
    frames: 17,
    timestamps,
    duration: Number(info.format.duration),
    uniqueFrames: new Set(hashes).size,
    range: max - min,
  };
}

const report = [],
  errors = [],
  blockedWrites = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      if (request.method() !== "GET") {
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      return route.fulfill({
        json: { jobs: [], sources: [], events: [], available: false },
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/world-builder`);
  await page.waitForFunction(
    () => typeof window.directorScene?.loadPreset === "function",
    null,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => !document.querySelector(".wb-console > .wb-primary")?.disabled,
    null,
    { timeout: 60000 },
  );
  const presets = await page.evaluate(() =>
    window.directorScene
      .listPresets()
      .filter((p) => p.name.startsWith("Morph · ")),
  );
  assert.equal(
    presets.length,
    4,
    "all four motion studies are exposed through the mounted agent adapter",
  );

  for (const preset of presets) {
    const slug = preset.file;
    assert.match(slug, /^[a-z-]+$/);
    console.log(`Checking ${preset.name}…`);
    const evidence = await page.evaluate(
      async ({ name, slug }) => {
        const api = window.directorScene;
        const digest = async (blob) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
        const png = async () =>
          new Promise((resolve, reject) => {
            const canvas = document.querySelector(".wb-app canvas");
            canvas.toBlob(
              (blob) =>
                blob ? resolve(blob) : reject(new Error("Missing canvas PNG")),
              "image/png",
            );
          });
        const base64 = async (blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let text = "";
          for (let at = 0; at < bytes.length; at += 32768)
            text += String.fromCharCode(...bytes.subarray(at, at + 32768));
          return btoa(text);
        };
        await api.loadPreset(name);
        const original = api.getRecipe();
        // Only frames change: this exercises configure's duration/key retiming.
        await api.configure({
          ...original,
          width: 320,
          height: 256,
          frames: 17,
        });
        const rate = 48000,
          count = Math.round((17 / 24) * rate);
        const bytes = new ArrayBuffer(44 + count * 2),
          wav = new DataView(bytes);
        const str = (offset, text) =>
          [...text].forEach((c, i) =>
            wav.setUint8(offset + i, c.charCodeAt(0)),
          );
        str(0, "RIFF");
        wav.setUint32(4, bytes.byteLength - 8, true);
        str(8, "WAVE");
        str(12, "fmt ");
        wav.setUint32(16, 16, true);
        wav.setUint16(20, 1, true);
        wav.setUint16(22, 1, true);
        wav.setUint32(24, rate, true);
        wav.setUint32(28, rate * 2, true);
        wav.setUint16(32, 2, true);
        wav.setUint16(34, 16, true);
        str(36, "data");
        wav.setUint32(40, count * 2, true);
        for (let i = 0; i < count; i++) {
          const t = i / rate,
            envelope = 0.4 + 0.6 * Math.sin((Math.PI * i) / count) ** 2;
          const sample =
            envelope *
            (0.18 * Math.sin(2 * Math.PI * 80 * t) +
              0.12 * Math.sin(2 * Math.PI * 750 * t) +
              0.08 * Math.sin(2 * Math.PI * 6500 * t));
          wav.setInt16(44 + 2 * i, Math.round(32767 * sample), true);
        }
        await api.setAudio(new Blob([bytes], { type: "audio/wav" }));
        const recipe = api.getRecipe(),
          sequential = [],
          states = {};
        for (let frame = 0; frame < 17; frame++) {
          await api.render(frame);
          const image = await png();
          sequential.push(await digest(image));
          if ([0, 8, 16].includes(frame)) states[frame] = await base64(image);
        }
        const reverse = [];
        for (const frame of [16, 8, 3, 15, 0, 9, 1, 14]) {
          await api.render(frame);
          reverse.push({ frame, hash: await digest(await png()) });
        }
        const firstSnapshot = await digest(await api.snapshot());
        const depthSnapshot = await digest(await api.snapshotDepth());
        const take = await api.capture({ name: `motion-${slug}` });
        const before = await take.manifest.text();
        const files = {};
        for (const key of ["video", "depth", "first", "depthFirst", "audio"])
          if (take[key]) files[key] = await base64(take[key]);
        const edited = api.getRecipe(),
          key = edited.motion.stateKeys[0];
        key.objects[Object.keys(key.objects)[0]].x += 0.25;
        edited.motion.intensity = 0;
        await api.configure(edited);
        const after = await take.manifest.text();
        return {
          recipe,
          keyFrames: recipe.motion.stateKeys.map((k) => k.frame),
          sequential,
          reverse,
          states,
          firstSnapshot,
          depthSnapshot,
          files,
          manifest: before,
          frozen: before === after,
          editedRecipe: api.getRecipe(),
        };
      },
      { name: preset.name, slug },
    );

    assert.deepEqual(evidence.keyFrames, [0, 8, 16]);
    assert.equal(evidence.recipe.frames, 17);
    assert.equal(evidence.recipe.envelope.length, 17);
    assert(new Set(evidence.sequential).size > 3, "rendered motion must vary");
    for (const { frame, hash: actual } of evidence.reverse)
      assert.equal(
        actual,
        evidence.sequential[frame],
        `${slug}: reverse/direct frame ${frame} equals sequential render`,
      );
    assert.equal(evidence.firstSnapshot, evidence.sequential[0]);
    assert(
      evidence.frozen,
      "later scene edits must not mutate the captured manifest",
    );
    const receipt = JSON.parse(evidence.manifest),
      scene = receipt.sceneEvaluation;
    assert.deepEqual(receipt.recipe, evidence.recipe);
    assert.equal(receipt.frameCount, 17);
    assert.equal(receipt.duration, 17 / 24);
    assert.deepEqual(receipt.passes, ["colour", "depth"]);
    assert.equal(scene.evaluator, "genobi-scene-v1");
    assert.equal(scene.motionVersion, 1);
    assert.equal(scene.recipeSha256, hash(canonical(receipt.recipe)));
    assert.notEqual(scene.recipeSha256, hash(canonical(evidence.editedRecipe)));
    assert.equal(
      scene.controlEnvelopeSha256,
      hash(
        canonical({
          level: receipt.recipe.envelope,
          ...receipt.recipe.bandEnvelopes,
        }),
      ),
    );
    assert.match(scene.firstGeometrySha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      scene.stateIds,
      receipt.recipe.motion.stateKeys.map((k) => k.id),
    );
    assert.equal(
      scene.instanceCount,
      receipt.recipe.motion.instances?.count ?? 0,
    );
    assert.equal(scene.acousticRoom, receipt.recipe.motion.room?.id ?? null);
    assert.equal(scene.controlAudioRole, "motion-control");
    assert.equal(
      scene.depthRole,
      "aligned-guide-pass-not-automatic-LTX-conditioning",
    );
    const directory = `${out}/${slug}`;
    await mkdir(directory, { recursive: true });
    const names = {
      video: "rgb.webm",
      depth: "depth.webm",
      first: "first.png",
      depthFirst: "depth-first.png",
      audio: "control.wav",
    };
    for (const [key, content] of Object.entries(evidence.files)) {
      const bytes = Buffer.from(content, "base64");
      await writeFile(`${directory}/${names[key]}`, bytes);
      assert.equal(
        hash(bytes),
        key === "audio" ? receipt.audioCompanion.sha256 : receipt.sha256[key],
      );
    }
    assert.equal(receipt.sha256.first, evidence.firstSnapshot);
    assert.equal(receipt.sha256.depthFirst, evidence.depthSnapshot);
    assert.equal(scene.controlAudioSha256, receipt.audioCompanion.sha256);
    assert.equal(receipt.audioCompanion.role, "motion-control");
    assert.equal(receipt.audioCompanion.duration, 17 / 24);
    for (const [frame, data] of Object.entries(evidence.states))
      await writeFile(
        `${directory}/state-${frame}.png`,
        Buffer.from(data, "base64"),
      );
    await writeFile(`${directory}/receipt.json`, evidence.manifest);
    const rgb = inspectVideo(`${directory}/rgb.webm`),
      depth = inspectVideo(`${directory}/depth.webm`);
    assert.deepEqual(
      rgb.timestamps,
      depth.timestamps,
      "RGB and depth use the same decoded cadence",
    );
    assert.notEqual(
      receipt.sha256.first,
      receipt.sha256.depthFirst,
      "depth must be a distinct guide",
    );
    report.push({
      preset: preset.name,
      result: "PASS",
      states: evidence.keyFrames,
      sequentialFrames: 17,
      reverseSeeks: evidence.reverse.length,
      rgb,
      depth,
      firstFrameMatches: true,
      frozenProvenance: true,
      sceneEvaluation: scene,
    });
    console.log(
      `PASS ${preset.name}: deterministic seeking, aligned 17-frame RGB/depth and frozen capture provenance`,
    );
  }
  // Old authored IDs remain editable even when they resemble new room IDs.
  await page.evaluate(async () => {
    const api = window.directorScene;
    await api.configure({
      ...api.getRecipe(),
      motion: undefined,
      avatar: false,
      screen: false,
      azimuth: 0,
      elevation: 0,
      elevationEnd: null,
      radius: 8,
      targetX: 0,
      targetY: 1,
      targetZ: 0,
      orbit: 0,
      dolly: 0,
      envelope: [],
      bandEnvelopes: { low: [], mid: [], high: [] },
      audioRoutes: [],
      textures: {},
      objects: [
        {
          id: "scene-room-marker",
          shape: "box",
          x: 0,
          y: 1,
          z: 0,
          scale: 1.5,
          spin: 0,
          color: "#c7d3a5",
          prompt: "",
        },
      ],
    });
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.evaluate(() => window.directorScene.render(0));
  const canvas = page.getByLabel("World Builder scene", { exact: true });
  const box = await canvas.boundingBox();
  assert(box, "legacy scene canvas is visible");
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Selected scene object"]')
        ?.value === "prop:scene-room-marker",
  );
  const beforeEdit = await page
    .getByLabel("Position X", { exact: true })
    .inputValue();
  assert.equal(Number(beforeEdit), 0);
  await page.getByLabel("Position X", { exact: true }).fill("0.5");
  await page.waitForFunction(
    () => window.directorScene.getRecipe().objects[0].x === 0.5,
  );
  console.log(
    "PASS legacy scene-room-* primitive remains pickable and editable",
  );
  assert.deepEqual(errors, [], "browser runtime errors");
  assert.deepEqual(
    blockedWrites,
    [],
    "the check must not attempt an API write",
  );
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ report, errors, blockedWrites }, null, 2),
  );
  console.log(`PASS ${report.length} motion studies; evidence: ${out}`);
  await context.close();
} finally {
  await browser.close();
}
