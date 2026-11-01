/** Real browser CPU convolution evidence; no server, GPU or network request. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    contents: `
      export { renderDynamicRoomAudio } from './src/world-builder/dynamic-room-audio';
      export { buildRoomImpulse, ROOM_AUDIO_ENGINE } from './src/world-builder/scene-room-ir';
      export { acousticWeightsAt, buildAcousticSchedule } from './src/world-builder/acoustic-schedule';
      export { createStoryPreset } from './src/world-builder/story-presets';
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "RoomAudio",
  write: false,
});
const browser = await chromium.launch({
  executablePath: process.env.DIRECTOR_BROWSER_PATH,
  channel: process.env.DIRECTOR_BROWSER === "chrome" ? "chrome" : undefined,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent("<!doctype html><title>Room CPU audio check</title>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const report = await page.evaluate(async () => {
    const {
      renderDynamicRoomAudio,
      buildRoomImpulse,
      ROOM_AUDIO_ENGINE,
      acousticWeightsAt,
      buildAcousticSchedule,
      createStoryPreset,
    } = globalThis.RoomAudio;
    const room = {
      id: "room",
      dimensions: [4, 3, 4],
      center: [0, 0, 0],
      source: [-1, 1, 0],
      listener: [1, 1, 0],
      absorption: {
        floor: 0.3,
        ceiling: 0.2,
        north: 0.2,
        south: 0.2,
        east: 0.2,
        west: 0.2,
      },
      seed: 42,
    };
    const schedule = {
      version: 1,
      engine: ROOM_AUDIO_ENGINE,
      treatment: "dynamic",
      frames: 9,
      fps: 24,
      duration: 9 / 24,
      sampleEveryFrames: 4,
      maxIRSeconds: 0.1,
      interpolation: "linear-wet-crossfade",
      controlAudio: "frozen-recipe-envelopes",
      snapshots: [
        { frame: 0, room },
        { frame: 4, room: { ...room, dimensions: [5, 4, 5] } },
        { frame: 8, room: { ...room, dimensions: [6, 5, 7] } },
      ],
    };
    const rate = 8000;
    const source = new Float32Array(3000);
    source[1300] = 0.1;
    source[2999] = 0.1;
    const started = performance.now();
    const result = await renderDynamicRoomAudio(
      {
        channels: [source, source.map((n) => -n)],
        sampleRate: rate,
        envelope: [],
      },
      schedule,
      { wet: 1, dry: 0 },
    );
    const responses = schedule.snapshots.map(
      (s) => buildRoomImpulse(s.room, rate, 0.1).samples,
    );
    let maxError = 0,
      tailEnergy = 0,
      stereoError = 0;
    const output = result.track.channels[0];
    for (let sample = 0; sample < output.length; sample++) {
      const expected = acousticWeightsAt(schedule, sample / rate).reduce(
        (sum, w) => {
          const ir = responses[w.index];
          return (
            sum +
            w.weight *
              ((ir[sample - 1300] ?? 0) * source[1300] +
                (ir[sample - 2999] ?? 0) * source[2999])
          );
        },
        0,
      );
      maxError = Math.max(maxError, Math.abs(output[sample] - expected));
      const channelDifference = Math.abs(
        output[sample] + result.track.channels[1][sample],
      );
      stereoError = Math.max(stereoError, channelDifference);
      if (sample >= 3000) tailEnergy += output[sample] ** 2;
    }
    const storySchedule = buildAcousticSchedule(
      createStoryPreset("endless-descent"),
    );
    const storySource = new Float32Array(
      Math.round(storySchedule.duration * rate),
    );
    for (let sample = 1600; sample < storySource.length; sample += rate * 2)
      storySource[sample] = 0.08;
    storySource[storySource.length - 1] = 0.08;
    const story = await renderDynamicRoomAudio(
      { channels: [storySource], sampleRate: rate, envelope: [] },
      storySchedule,
    );
    const firstRoom = storySchedule.snapshots.find(
      (snapshot) => snapshot.room,
    ).frame;
    let outdoorError = 0,
      storyTailEnergy = 0;
    for (let sample = 0; sample < (firstRoom / 24) * rate; sample++)
      outdoorError = Math.max(
        outdoorError,
        Math.abs(
          story.track.channels[0][sample] -
            storySource[sample] * story.peakGain,
        ),
      );
    for (
      let sample = storySource.length;
      sample < story.track.channels[0].length;
      sample++
    )
      storyTailEnergy += story.track.channels[0][sample] ** 2;
    const avenueSchedule = buildAcousticSchedule(
      createStoryPreset("bass-avenue"),
    );
    const avenue = await renderDynamicRoomAudio(
      { channels: [source], sampleRate: rate, envelope: [] },
      avenueSchedule,
    );
    return {
      engine: result.engine,
      frames: output.length,
      sampleRate: rate,
      channels: 2,
      irs: result.irs.length,
      maxError,
      stereoError,
      tailEnergy,
      elapsedMs: Math.round(performance.now() - started),
      wavBytes: result.wav.size,
      story: {
        pictureFrames: storySchedule.frames,
        snapshots: storySchedule.snapshots.length,
        boundaryFrames: storySchedule.snapshots
          .filter((snapshot) => snapshot.transition === "hold")
          .map((snapshot) => snapshot.frame),
        irs: story.irs.length,
        truncatedIRs: story.irs.filter((ir) => ir.truncated).length,
        outdoorError,
        tailEnergy: storyTailEnergy,
        finite: story.track.channels[0].every(Number.isFinite),
      },
      outdoorOnly: {
        irs: avenue.irs.length,
        tailSeconds: avenue.tailSeconds,
        finite: avenue.track.channels[0].every(Number.isFinite),
      },
    };
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  assert.equal(report.frames, 3799);
  assert.equal(report.irs, 3);
  assert(
    report.maxError < 1e-6,
    `Browser convolution differs from exact impulse response: ${report.maxError}`,
  );
  assert(
    report.stereoError < 1e-7,
    "Stereo channels leaked or changed relative gain",
  );
  assert(report.tailEnergy > 0.001, "The final impulse lost its decay tail");
  assert.equal(report.wavBytes, 44 + 3799 * 4);
  assert.deepEqual(report.story.boundaryFrames, [193, 289, 337]);
  assert(
    report.story.outdoorError < 1e-7,
    "Outdoor frames received a wet enclosure response",
  );
  assert(report.story.tailEnergy > 0, "The final studio lost its decay");
  assert(report.story.finite, "Story CPU convolution produced invalid samples");
  assert(
    report.story.truncatedIRs > 0,
    "Long cathedral decay must report its response cap",
  );
  assert.equal(report.outdoorOnly.irs, 0);
  assert.equal(report.outdoorOnly.tailSeconds, 0);
  assert(report.outdoorOnly.finite);
} finally {
  await browser.close();
}
