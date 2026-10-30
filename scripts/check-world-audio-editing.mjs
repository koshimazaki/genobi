/** Local browser regression: preview locks drags, stopping saves Walk, capture during Play. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = ".local/world-audio-editing";
await mkdir(out, { recursive: true });
// Mount the real hooks and Three controls without the rest of the studio.
// Instrument the public control helper only in this private test fixture.
await writeFile(
  `${out}/harness.html`,
  `<!doctype html><base href="/"><div id="root"></div>
<script type="module">
import React from "react";
import { createRoot } from "react-dom/client";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { useBuilderSession } from "/src/world-builder/useBuilderSession.ts";
import { useWorldEditor } from "/src/world-builder/useWorldEditor.ts";
const helper = TransformControls.prototype.getHelper;
TransformControls.prototype.getHelper = function () {
  window.testGizmo = this;
  return helper.call(this);
};
function Harness() {
  const session = useBuilderSession();
  window.testSession = session;
  window.testEditor = useWorldEditor(session);
  return React.createElement(React.Fragment, null,
    React.createElement("canvas", { ref: session.canvas }),
    React.createElement("audio", { ref: session.audioElement, src: session.audioURL || undefined }));
}
createRoot(document.getElementById("root")).render(React.createElement(Harness));
</script>`,
);

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER === "bundled" ? undefined : "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    new URL(r.request().url()).origin === new URL(base).origin
      ? r.continue()
      : r.abort(),
  );
  await page.goto(`${base}/${out}/harness.html`);
  await page.waitForFunction(
    () => window.testSession?.ready || window.testSession?.error,
  );
  assert.equal(await page.evaluate(() => window.testSession.error), "");
  await page.evaluate(async () => {
    const s = window.testSession;
    const { audioWav } = await import("/src/world-builder/audio.ts");
    await s.api.current.configure({
      ...s.api.current.getRecipe(),
      width: 512,
      height: 320,
      frames: 241,
      avatar: true,
      avatarAsset: "mannequin",
    });
    await s.api.current.setAudio(
      audioWav(
        {
          channels: [new Float32Array(48000 * 10).fill(0.1)],
          sampleRate: 48000,
        },
        10,
      ),
    );
    window.testEditor.chooseMode("edit");
  });
  await page.waitForFunction(() => window.testEditor.mode === "edit");
  const cancelled = await page.evaluate(() => {
    const s = window.testSession,
      gizmo = window.testGizmo;
    let target;
    gizmo.getHelper().parent.traverse((object) => {
      if (!target && object.userData.editId) target = object;
    });
    s.runtime.current.editor.select(target.userData.editId);
    const before = target.position.toArray();
    gizmo.axis = "X";
    gizmo.pointerDown({ x: 0, y: 0, button: 0 });
    const dragging = gizmo.dragging;
    target.position.x += 1;
    s.setPlaying(true);
    const after = target.position.toArray();
    const ended = !gizmo.dragging;
    s.setPlaying(false);
    return { before, after, dragging, ended };
  });
  assert.equal(cancelled.dragging, true);
  assert.equal(cancelled.ended, true);
  assert.deepEqual(cancelled.after, cancelled.before);
  console.log("PASS Starting playback cancels an unfinished transform");
  const locked = await page.evaluate(() => {
    const s = window.testSession,
      editor = s.runtime.current.editor;
    const wasEnabled = window.testGizmo.enabled;
    s.setPlaying(true);
    const during = window.testGizmo.enabled;
    // Changing modes must not accidentally unlock a running preview.
    editor.setMode("shot");
    editor.setMode("edit");
    return { wasEnabled, during, afterModeChange: window.testGizmo.enabled };
  });
  assert.deepEqual(locked, {
    wasEnabled: true,
    during: false,
    afterModeChange: false,
  });
  await page.waitForFunction(() => window.testSession.playing);
  await page.evaluate(() => window.testSession.setPlaying(false));
  await page.waitForFunction(() => !window.testSession.playing);
  assert.equal(await page.evaluate(() => window.testGizmo.enabled), true);
  console.log("PASS Build transforms lock during playback and unlock on Stop");

  // The tab-exit order is stop, then leave Walk, in the same event turn.
  await page.evaluate(async () => {
    window.testEditor.chooseMode("walk");
    await window.testSession.api.current.live.control({
      move: [0, 1],
      seconds: 0.4,
    });
  });
  await page.waitForFunction(() => {
    const s = window.testSession,
      position = s.api.current.live.status().position;
    return Math.abs(position[2] - s.api.current.getRecipe().avatarPose.z) > 0.2;
  });
  await page.evaluate(() => window.testSession.setPlaying(true));
  await page.waitForFunction(() => window.testSession.playing);
  const frozen = await page.evaluate(() => {
    const s = window.testSession;
    const position = s.api.current.live.status().position;
    s.setPlaying(false);
    window.testEditor.chooseMode("shot");
    return position;
  });
  await page.waitForFunction((position) => {
    const p = window.testSession.api.current.getRecipe().avatarPose;
    return (
      window.testSession.error ||
      [p.x, p.y, p.z].every((n, i) => Math.abs(n - position[i]) < 1e-6)
    );
  }, frozen);
  assert.equal(await page.evaluate(() => window.testSession.error), "");
  assert.equal(
    await page.evaluate(() => window.testSession.audioElement.current.paused),
    true,
  );
  console.log(
    "PASS Stop then leave Walk saves the current position synchronously",
  );

  await page.evaluate(() => window.testSession.setPlaying(true));
  await page.waitForFunction(() => window.testSession.frame > 3);
  const during = await page.evaluate(async () => {
    const s = window.testSession,
      world = s.runtime.current,
      render = world.renderFrame,
      rendered = [];
    world.renderFrame = (n) => (rendered.push(n), render.call(world, n));
    const attempt = async (op) => {
      try {
        await op();
        return "accepted";
      } catch (e) {
        return e.message;
      }
    };
    return {
      // A live edit (the Sound tab's routing) applies under Play.
      configure: await attempt(() =>
        s.api.current.configure({ ...s.api.current.getRecipe(), audioGain: 2 }),
      ),
      stillPlaying: window.testSession.playing,
      // The edit must not rewind the preview: it never draws frame 0 here.
      rewound: rendered.includes(0),
      restored: ((world.renderFrame = render), true),
      // The agent's capture still refuses; the panel's goes through stopping.
      capture: await attempt(() => s.api.current.capture()),
    };
  });
  assert.equal(during.configure, "accepted");
  assert.equal(during.rewound, false);
  assert.equal(during.stillPlaying, true);
  assert(during.capture.includes("Stop preview"));
  console.log("PASS A live edit applies under Play; a bare capture refuses");

  // The mod matrix edits through tune: a new route lands while Play runs.
  await page.evaluate(() => window.testSession.setPlaying(true));
  await page.waitForFunction(() => window.testSession.playing);
  await page.evaluate(() => {
    const s = window.testSession,
      r = s.api.current.getRecipe();
    s.tune({
      audioRoutes: [
        ...r.audioRoutes,
        { id: "live", target: "light:key", property: "light", source: "low" },
      ],
    });
  });
  await page.waitForFunction(() =>
    window.testSession.api.current
      .getRecipe()
      .audioRoutes.some((route) => route.id === "live"),
  );
  assert.equal(await page.evaluate(() => window.testSession.playing), true);
  console.log("PASS A mod matrix route applies under Play through tune");

  await page.evaluate(() => window.testSession.change({ frames: 25 }));
  await page.waitForFunction(
    () => window.testSession.api.current.getRecipe().frames === 25,
  );
  // Loop, so the preview is still running whenever Capture is pressed.
  await page.evaluate(() => window.testSession.setLoop(true));
  await page.evaluate(() => window.testSession.setPlaying(true));
  await page.waitForFunction(() => window.testSession.frame > 3);
  const take = await page.evaluate(async () => {
    const s = window.testSession;
    const wasPlaying = s.playing;
    const result = await s.stopping(() => s.api.current.capture())();
    const receipt = JSON.parse(await result.manifest.text());
    return {
      wasPlaying,
      // A fresh render's session, not the one this call started from.
      playing: window.testSession.playing,
      paused: s.audioElement.current.paused,
      frames: receipt.frameCount,
      error: window.testSession.error,
    };
  });
  assert.deepEqual(take, {
    wasPlaying: true,
    playing: false,
    paused: true,
    frames: 25,
    error: "",
  });
  assert.deepEqual(errors, []);
  console.log("PASS Capture during Play stops it and records the whole take");
} finally {
  await browser.close();
}
