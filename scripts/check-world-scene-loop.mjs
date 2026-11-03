/** Real global-slot RGB/depth capture, including resampled colors and rebuilt parts. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(
  process.env.WORLD_LOOP_EVIDENCE ?? ".local/world-scene-loop",
);
const port = Number(process.env.WORLD_LOOP_PORT ?? 4504);
const origin = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });
const server = await createServer({
  cacheDir: resolve(output, "vite-cache"),
  server: { host: "127.0.0.1", port, strictPort: true },
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
    if (message.text().startsWith("SCENE_LOOP")) console.log(message.text());
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/__scene_loop")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      });
    return route.continue();
  });
  const names = new Set([
    "colour.webm",
    "depth.webm",
    "first.png",
    "depth-first.png",
    "manifest.json",
    "bank.json",
    "recipe.json",
    "state-A.png",
    "state-B.png",
    "state-C.png",
    "transition.png",
    "primitive-A.png",
    "primitive-B.png",
    "primitive-mid.png",
  ]);
  await page.exposeFunction("writeEvidence", async (name, bytes) => {
    assert(names.has(name));
    await writeFile(resolve(output, name), Buffer.from(bytes));
  });
  await page.goto(`${origin}/__scene_loop`);
  const result = await page.evaluate(async () => {
    const { createWorld } = await import("/src/world-builder/runtime.ts");
    const { createMotionPreset } =
      await import("/src/world-builder/motion-presets.ts");
    const {
      createSceneLoopBank,
      saveSceneLoopSlot,
      sceneLoopSlotRecipe,
      composeSceneLoop,
    } = await import("/src/world-builder/scene-loop.ts");
    const { evaluateScene } =
      await import("/src/world-builder/evaluate-scene.ts");
    const { sceneObjects } =
      await import("/src/world-builder/scene-instances.ts");
    const { scaledAxes } = await import("/src/world-builder/scene-contract.ts");
    const {
      defaultRecipe,
      validateRecipe,
      cameraAt,
      cameraTargetAt,
      cameraFovAt,
    } = await import("/src/world-builder/recipe.ts");
    const { exportTake, png } =
      await import("/src/world-builder/export-take.ts");
    const expect = (ok, message) => {
      if (!ok) throw new Error(message);
    };
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const width = 384,
      height = 256;
    const canvas = document.createElement("canvas");
    const world = createWorld(canvas, () => {});
    const copy = document.createElement("canvas");
    copy.width = width;
    copy.height = height;
    const context = copy.getContext("2d", { willReadFrequently: true });
    const hash = async () => {
      context.drawImage(canvas, 0, 0);
      const bytes = context.getImageData(0, 0, width, height).data;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const saveBlob = async (name, blob) =>
      window.writeEvidence(
        name,
        Array.from(new Uint8Array(await blob.arrayBuffer())),
      );
    const saveJSON = (name, value) =>
      saveBlob(
        name,
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
    const screenshot = async (name) => saveBlob(name, await png(canvas));
    const visible = (recipe, frame) => {
      const retained = new Set(sceneObjects(recipe).map((part) => part.id));
      return evaluateScene(recipe, frame, { audio: false }).objects.filter(
        (part) => retained.has(part.id) && (part.presence ?? 1) > 0,
      );
    };
    async function parity(recipe, frames) {
      world.configure(recipe);
      const rgb = {},
        depth = {};
      for (const frame of frames) {
        await world.renderFrame(frame);
        rgb[frame] = await hash();
      }
      world.beginCapture();
      try {
        for (const frame of frames) {
          await world.renderFrame(frame);
          expect(
            (await hash()) === rgb[frame],
            `Preview/capture mismatch at ${frame}.`,
          );
          await world.renderDepthFrame(frame);
          depth[frame] = await hash();
          expect(
            depth[frame] !== rgb[frame],
            `RGB/depth unexpectedly equal at ${frame}.`,
          );
          await world.renderFrame(frame);
          expect(
            (await hash()) === rgb[frame],
            `RGB restoration mismatch at ${frame}.`,
          );
        }
        for (const frame of [...frames].reverse()) {
          await world.renderFrame(frame);
          expect(
            (await hash()) === rgb[frame],
            `Reverse RGB seek mismatch at ${frame}.`,
          );
          await world.renderDepthFrame(frame);
          expect(
            (await hash()) === depth[frame],
            `Reverse depth seek mismatch at ${frame}.`,
          );
        }
      } finally {
        world.endCapture();
      }
      return {
        rgb,
        depth,
        previewEqualsCapture: true,
        reverseSeekExact: true,
        rgbRestoredAfterDepth: true,
      };
    }
    try {
      expect(
        world.kind === "webgl",
        "This proof requires the real WebGL renderer.",
      );
      const cube = validateRecipe({
        ...structuredClone(defaultRecipe),
        width,
        height,
        stageLook: "dark-grid",
        background: "#080b12",
        screen: false,
        orbit: 0,
        audioRoutes: [],
        objects: [
          {
            id: "artifact",
            shape: "box",
            x: -1,
            y: 1,
            z: 0,
            scale: 1.5,
            spin: 0,
            color: "#ef4848",
            prompt: "",
          },
        ],
      });
      const sphere = validateRecipe({
        ...cube,
        objects: [
          { ...cube.objects[0], shape: "sphere", x: 1.5, color: "#70e489" },
        ],
      });
      let primitiveBank = saveSceneLoopSlot(createSceneLoopBank(), 0, cube, 0, {
        label: "Red cube",
        camera: { position: [8, 4, 10], target: [0, 1, 0], fov: 48 },
      });
      primitiveBank = saveSceneLoopSlot(primitiveBank, 1, sphere, 0, {
        label: "Green sphere",
        camera: { position: [10, 5, 9], target: [1, 1, 0], fov: 50 },
      });
      const primitives = composeSceneLoop(primitiveBank, {
        style: "scatter",
        durationSeconds: 8,
      });
      const primitiveParity = await parity(primitives, [0, 37, 96, 144, 192]);
      expect(
        primitiveParity.rgb[0] === primitiveParity.rgb[192],
        "Primitive return-to-A pixels changed.",
      );
      const endpointReferences = [];
      for (const [index, frame] of [
        [0, 0],
        [1, 96],
      ]) {
        const parts = visible(primitives, frame);
        expect(
          parts.length === 1,
          `Absent primitive remained visible at ${frame}.`,
        );
        expect(
          parts[0].shape === (index === 0 ? "box" : "sphere"),
          "Wrong endpoint primitive.",
        );
        const absent = evaluateScene(primitives, frame).objects.filter(
          (part) => part.presence === 0,
        );
        expect(
          absent.length === 1 && equal(scaledAxes(absent[0]), [0, 0, 0]),
          "Missing part did not reach zero size.",
        );
        const recalled = sceneLoopSlotRecipe(primitiveBank, index);
        world.configure(recalled);
        await world.renderFrame(0);
        const reference = await hash();
        expect(
          reference === primitiveParity.rgb[frame],
          "Rebuilt endpoint pixels differ from its recalled saved scene.",
        );
        endpointReferences.push({
          frame,
          shape: parts[0].shape,
          color: parts[0].color,
          exactReferenceHash: reference,
        });
        await screenshot(`primitive-${index === 0 ? "A" : "B"}.png`);
      }
      world.configure(primitives);
      await world.renderFrame(37);
      await screenshot("primitive-mid.png");
      console.log(
        "SCENE_LOOP primitive visibility, colors, saved-view pixels and RGB/depth parity passed",
      );

      const sources = [
        createMotionPreset("voxel-architecture"),
        createMotionPreset("fruit-morph"),
        createMotionPreset("voxel-architecture"),
      ];
      const labels = ["Pyramid", "Banana", "Chamber"];
      const sourceFrames = [0, 0, 72];
      let bank = createSceneLoopBank();
      for (let i = 0; i < sources.length; i++) {
        sources[i].width = width;
        sources[i].height = height;
        bank = saveSceneLoopSlot(bank, i, sources[i], sourceFrames[i], {
          label: labels[i],
          camera: {
            position: [18 + i, 14, 26 - i],
            target: [0, 3, 0],
            fov: 48,
          },
        });
      }
      const recipe = composeSceneLoop(bank, {
        durationSeconds: 30,
        style: "assemble",
      });
      expect(recipe.frames === 721, "The global loop must have721 frames.");
      expect(
        recipe.motion.instances.count === 96,
        "Different voxel counts were not matched into the bounded shared set.",
      );
      expect(
        equal(
          recipe.motion.stateKeys.map((key) => key.frame),
          [0, 240, 480, 720],
        ),
        "The return to A is not inside the selected duration.",
      );
      expect(
        recipe.motion.stateAudio.routes.length === 3,
        "Return A became an extra audio destination.",
      );
      const endpointCameras = [];
      const volumeByColor = (parts) => {
        const result = {};
        for (const part of parts)
          result[part.color] =
            (result[part.color] ?? 0) +
            scaledAxes(part).reduce((a, b) => a * b, 1);
        return result;
      };
      let maxRelativeColorVolumeError = 0;
      for (let i = 0; i < 3; i++) {
        const frame = i * 240,
          expected = bank.slots[i].camera;
        const actual = {
          position: [...cameraAt(recipe, frame)],
          target: [...cameraTargetAt(recipe, frame)],
          fov: cameraFovAt(recipe, frame),
        };
        expect(
          equal(actual, expected),
          `Saved camera${i} changed at its endpoint.`,
        );
        endpointCameras.push({
          slot: String.fromCharCode(65 + i),
          frame,
          actual,
        });
        const before = volumeByColor(visible(bank.slots[i].recipe, 0));
        const after = volumeByColor(visible(recipe, frame));
        expect(
          equal(Object.keys(before).sort(), Object.keys(after).sort()),
          `Saved colors changed at slot${i}.`,
        );
        for (const color of Object.keys(before)) {
          const error =
            Math.abs(before[color] - after[color]) /
            Math.max(1e-12, before[color]);
          expect(
            error < 1e-10,
            `Resampling changed occupied volume for${color} at slot${i}.`,
          );
          maxRelativeColorVolumeError = Math.max(
            maxRelativeColorVolumeError,
            error,
          );
        }
      }
      const loopParity = await parity(
        recipe,
        [0, 120, 240, 359, 480, 600, 720],
      );
      expect(
        loopParity.rgb[0] === loopParity.rgb[720],
        "Return-to-A RGB pixels changed.",
      );
      expect(
        loopParity.depth[0] === loopParity.depth[720],
        "Return-to-A depth pixels changed.",
      );
      for (const [frame, name] of [
        [0, "state-A.png"],
        [240, "state-B.png"],
        [480, "state-C.png"],
        [359, "transition.png"],
      ]) {
        await world.renderFrame(frame);
        await screenshot(name);
      }
      await saveJSON("bank.json", bank);
      await saveJSON("recipe.json", recipe);
      console.log(
        "SCENE_LOOP independent64/96/64 snapshots, saved cameras/colors, return and RGB/depth parity passed",
      );
      let previous = -1;
      world.beginCapture();
      const take = await exportTake(
        recipe,
        world,
        new AbortController().signal,
        (frame) => {
          const bucket = Math.floor(frame / 120);
          if (bucket !== previous) {
            previous = bucket;
            console.log(`SCENE_LOOP capture ${frame}/721`);
          }
        },
        "global-scene-loop-30-seconds",
      );
      world.endCapture();
      for (const [name, blob] of [
        ["colour.webm", take.video],
        ["depth.webm", take.depth],
        ["first.png", take.first],
        ["depth-first.png", take.depthFirst],
        ["manifest.json", take.manifest],
      ])
        await saveBlob(name, blob);
      const manifest = JSON.parse(await take.manifest.text());
      expect(
        manifest.audio === false,
        "This proof must not claim a soundtrack.",
      );
      return {
        renderer: world.kind,
        encoder: "WebCodecs VP8",
        audio: false,
        frameCount: manifest.frameCount,
        duration: manifest.duration,
        ltxTiming: manifest.ltxTiming,
        recipeBytes: JSON.stringify(recipe).length,
        sourceInstanceCounts: [64, 96, 64],
        composedInstanceCount: 96,
        endpointCameras,
        maxRelativeColorVolumeError,
        primitives: { ...primitiveParity, endpointReferences },
        loop: loopParity,
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
          "stream=width,height,codec_name,nb_read_frames,r_frame_rate:format=duration",
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
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    resolve(output, "colour.webm"),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    resolve(output, "world-loop-30s.mp4"),
  ]);
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ status: "passed", errors, ...result }, null, 2),
  );
  console.log(JSON.stringify({ status: "passed", errors, ...result }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
