/** Direct runtime proof, no application UI. Start Vite, then run this script. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { format } from "prettier";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4173";
const selectedViews = process.env.WORLD_STORY_VIEWS?.split(",");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve(process.env.WORLD_STORY_EVIDENCE ?? "docs/media");
const temporary = await mkdtemp(join(tmpdir(), "genobi-world-stories-"));
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ["scripts/lib/world-story-check.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: "es2022",
  logLevel: "silent",
});
const browser = await chromium.launch({
  executablePath: process.env.DIRECTOR_BROWSER_PATH ?? process.env.CHROME_BIN,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const errors = [],
  assets = new Map(),
  assetReads = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("STORY_PROOF")) console.log(message.text());
  });
  page.on("response", (response) => {
    const name = new URL(response.url()).pathname.split("/").at(-1);
    if (!["AnimationLibrary.glb", "testMap.glb", "vehicles.glb"].includes(name))
      return;
    assetReads.push(
      (async () => {
        assert.equal(response.status(), 200, `${name} did not load.`);
        const bytes = await response.body();
        const evidence = {
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
        if (name === "AnimationLibrary.glb") {
          const gltf = JSON.parse(
            bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
          );
          evidence.skins = gltf.skins.length;
          evidence.authoredClips = ["Jump_Loop", "Jump_Land", "Dance_Loop"].map(
            (clip) => {
              assert(
                gltf.animations.some((animation) => animation.name === clip),
                `Missing ${clip}.`,
              );
              return clip;
            },
          );
          assert(evidence.skins > 0, "The mannequin has no skin rig.");
        }
        assets.set(name, evidence);
      })(),
    );
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === "/__world_story_proof")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      });
    return route.continue();
  });
  await page.exposeFunction("writeStoryEvidence", async (name, bytes) => {
    assert(
      /^(endless-descent|descent-follow|bass-avenue)-(colour\.webm|depth\.webm|audio\.wav|contact\.png)$/.test(
        name,
      ),
    );
    await writeFile(join(temporary, name), Buffer.from(bytes));
  });
  await page.goto(`${base}/__world_story_proof`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const stories = await page.evaluate(
    (ids) => window.runWorldStoryProof(ids),
    selectedViews,
  );
  await Promise.all(assetReads);
  assert.deepEqual(errors, []);
  assert.equal(assets.size, 3, "All three real runtime asset files must load.");
  const probe = (file, frames) => {
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
          file,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(Number(info.streams[0].nb_read_frames), frames);
    assert.equal(info.streams[0].r_frame_rate, "24/1");
    assert.equal(info.streams[0].width, 640);
    assert.equal(info.streams[0].height, 384);
    assert(Math.abs(Number(info.format.duration) - frames / 24) < 0.05);
    return info;
  };
  for (const story of stories) {
    const stem = {
      "endless-descent": "world-story-descent",
      "descent-follow": "world-story-descent-follow",
      "bass-avenue": "world-story-avenue",
    }[story.id];
    for (const pass of ["colour", "depth"])
      probe(join(temporary, `${story.id}-${pass}.webm`), story.frameCount);
    const destination = join(output, `${stem}.mp4`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      join(temporary, `${story.id}-colour.webm`),
      "-i",
      join(temporary, `${story.id}-audio.wav`),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-shortest",
      destination,
    ]);
    const depthDestination = join(output, `${stem}-depth.mp4`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      join(temporary, `${story.id}-depth.webm`),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      depthDestination,
    ]);
    await copyFile(
      join(temporary, `${story.id}-contact.png`),
      join(output, `${stem}-contact.png`),
    );
    story.video = {
      file: `${stem}.mp4`,
      ...probe(destination, story.frameCount),
      sha256: createHash("sha256")
        .update(await readFile(destination))
        .digest("hex"),
    };
    story.depthVideo = {
      file: `${stem}-depth.mp4`,
      ...probe(depthDestination, story.frameCount),
      sha256: createHash("sha256")
        .update(await readFile(depthDestination))
        .digest("hex"),
    };
    story.contactSheet = `${stem}-contact.png`;
  }
  let retained = [];
  if (selectedViews) {
    try {
      const earlier = JSON.parse(
        await readFile(join(output, "world-stories-report.json"), "utf8"),
      );
      if (earlier.status === "passed")
        retained = earlier.stories.filter(
          (story) => !selectedViews.includes(story.id),
        );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const report = {
    status: "passed",
    proof:
      "Direct createWorld WebGL/SwiftShader, not a schematic or application UI recording.",
    audioCapture:
      "Dry original synthesized regression beat. Offline bands drive poses; room convolution is verified separately.",
    assets: Object.fromEntries(assets),
    stories: [...stories, ...retained].map((story) => {
      if (story.id !== "bass-avenue") return story;
      // A closed sway is not the monotonic downward path measured above.
      const { maxCameraStepMetres: _step, ...rest } = story;
      return {
        ...rest,
        cameraPath: "Cyclic sway with matching endpoint views",
      };
    }),
    errors,
  };
  await writeFile(
    join(output, "world-stories-report.json"),
    await format(JSON.stringify(report), { parser: "json" }),
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        files: stories.map((story) => story.video.file),
        frames: stories.map((story) => story.frameCount),
        errors,
      },
      null,
      2,
    ),
  );
  await rm(temporary, { recursive: true, force: true });
} catch (error) {
  console.error(
    `World story proof failed; local captures retained at ${temporary}.`,
  );
  throw error;
} finally {
  await browser.close();
}
