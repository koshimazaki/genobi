import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
// /director opens a template in the simple Director; these checks need the
// studio example's layers and the Editor's timeline.
const editor = `${base}/director?example=studio&workspace=editor`;
const ready = () =>
  page.getByText("Ready · local preview", { exact: true }).waitFor();
const clip = (name) =>
  page.getByRole("button", { name: `Select ${name}`, exact: true });
try {
  await page.goto(editor);
  await ready();
  await page.getByRole("slider", { name: "Playhead", exact: true }).fill("75");
  await clip("Orbit 1").click();
  await clip("Orbit 1").focus();
  await clip("Orbit 1").press("c");
  await ready();
  assert.equal(await page.locator(".dir-clip").count(), 10);
  await clip("Orbit 1 cut").click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Start frame", { exact: true }).inputValue(),
    "75",
  );
  assert.equal(
    await page.getByLabel("Duration frames", { exact: true }).inputValue(),
    "15",
  );
  await page.getByRole("slider", { name: "Playhead", exact: true }).fill("80");
  await clip("Orbit 1 cut").focus();
  await clip("Orbit 1 cut").press("s");
  await ready();
  assert.equal(await page.locator(".dir-clip").count(), 11);
  await page
    .getByRole("button", { name: "Hide Anime bars", exact: true })
    .click();
  await ready();
  assert.equal(
    await page
      .getByRole("button", { name: "Show Anime bars", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await clip("Orbit 1").focus();
  await clip("Orbit 1").press("Space");
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await clip("Orbit 1").press("Space");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await clip("Orbit 1").click();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("C");
  await name.press("s");
  assert.equal(await page.locator(".dir-clip").count(), 11);
  await name.press("Tab");
  await ready();
  await page.getByRole("radio", { name: "Snap Beat", exact: true }).check();
  assert.equal(
    await page.locator(".dir-transport .tick-fader__ruler").count(),
    1,
  );
  await mkdir(".local/director", { recursive: true });
  await page.screenshot({
    path: ".local/director/consistent-controls.png",
    fullPage: true,
  });
  console.log(
    "PASS C/S split, source/pose continuity metadata, locked mute, Space transport, form guards, shared menu/fader",
  );
  const runtimeProof = await page.evaluate(async () => {
    const { loadExample } = await import("/src/director/bundle.ts");
    const { DirectorRenderer } = await import("/src/director/renderer.ts");
    const { splitLayer } = await import("/shared/director/split.ts");
    const b = await loadExample();
    const output = document.createElement("canvas");
    const original = new DirectorRenderer(b, output);
    await original.init();
    await original.render(75);
    const before = output
      .getContext("2d")
      .getImageData(0, 0, 640, 360)
      .data.slice();
    original.dispose();
    let project = splitLayer(b.project, "pulse", 60, "pulse-cut");
    project = splitLayer(project, "title", 60, "title-cut");
    project = splitLayer(project, "photo-1", 70, "image-cut");
    project = splitLayer(project, "crt-pass", 60, "crt-cut");
    const split = new DirectorRenderer({ ...b, project }, output);
    await split.init();
    await split.render(75);
    const after = output.getContext("2d").getImageData(0, 0, 640, 360).data;
    let sum = 0;
    for (let i = 0; i < after.length; i++)
      sum += Math.abs(before[i] - after[i]);
    split.dispose();
    project = {
      ...b.project,
      layers: b.project.layers.map((l) => ({ ...l, muted: true })),
    };
    const mute = new DirectorRenderer({ ...b, project }, output);
    await mute.init();
    await mute.render(75);
    const pixels = output.getContext("2d").getImageData(0, 0, 640, 360).data;
    let uniform = true;
    for (let i = 4; i < pixels.length; i++)
      if (pixels[i] !== pixels[i % 4]) {
        uniform = false;
        break;
      }
    let scheduled = 0;
    const createSource = mute.audio.createBufferSource.bind(mute.audio);
    mute.audio.createBufferSource = () => {
      scheduled++;
      return createSource();
    };
    mute.scheduleAudio(75, mute.audio.currentTime);
    const mix = await mute.mix();
    let peak = 0;
    for (let c = 0; c < mix.numberOfChannels; c++)
      for (const sample of mix.getChannelData(c))
        peak = Math.max(peak, Math.abs(sample));
    const { exportMp4 } = await import("/src/director/export.ts");
    // This also proves a muted audio layer produces an exportable silent AAC track.
    mute.bundle.project.composition.durationFrames = 5;
    mute.bundle.project.layers = mute.bundle.project.layers.map((l) => ({
      ...l,
      startFrame: 0,
      durationFrames: 5,
    }));
    const blob = await exportMp4(mute, () => {}, new AbortController().signal);
    const { Input, BufferSource, MP4, AudioBufferSink } =
      await import("/node_modules/.vite/deps/mediabunny.js");
    const input = new Input({
      source: new BufferSource(await blob.arrayBuffer()),
      formats: [MP4],
    });
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new Error("Muted export lost its silent audio track");
    let decodedPeak = 0;
    for await (const { buffer } of new AudioBufferSink(audio).buffers())
      for (let c = 0; c < buffer.numberOfChannels; c++)
        for (const sample of buffer.getChannelData(c))
          decodedPeak = Math.max(decodedPeak, Math.abs(sample));
    input.dispose();
    mute.dispose();
    return {
      mean: sum / after.length,
      uniform,
      peak,
      bytes: blob.size,
      scheduled,
      decodedPeak,
    };
  });
  assert.ok(runtimeProof.mean < 0.15, JSON.stringify(runtimeProof));
  assert.equal(runtimeProof.uniform, true);
  assert.equal(runtimeProof.peak, 0);
  assert.equal(runtimeProof.scheduled, 0);
  assert.ok(runtimeProof.bytes > 0);
  assert.ok(runtimeProof.decodedPeak < 0.00001);
  console.log(
    "PASS split p5/text/image/CRT preview parity and muted visual/audio MP4",
    runtimeProof,
  );
  // Leaving the Editor for another preset and coming back must keep the
  // same composition.
  const presets = page.getByRole("navigation", { name: "Studio presets" });
  await page.goto(editor);
  await ready();
  await page
    .getByRole("button", { name: "Mute Pulse / 120 BPM", exact: true })
    .click();
  await ready();
  await presets.getByRole("button", { name: "Camera", exact: true }).click();
  await page.locator(".dir-console").waitFor({ state: "hidden" });
  await presets.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Unmute Pulse / 120 BPM", exact: true })
    .waitFor();
  await page.locator(".dir-clip").first().focus();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  console.log("PASS leaving and reopening the Editor retains composition");
  await page.goto(editor);
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/director/controls-portrait.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log("PASS portrait layout and no browser errors");
} finally {
  await browser.close();
}
