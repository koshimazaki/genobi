/** Real Chromium filter/recording proof using a generated tone, never hardware. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const module = await build({
  entryPoints: ["src/world-builder/input-audio.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "inputAudioCheck",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<button id="start">Test generated input tone</button>',
  );
  await page.addScriptTag({ content: module.outputFiles[0].text });
  await page.evaluate(() => {
    document.querySelector("#start").onclick = async () => {
      const source = new AudioContext({ sampleRate: 48000 });
      const tone = source.createOscillator(),
        gain = source.createGain();
      gain.gain.value = 0.5;
      const destination = source.createMediaStreamDestination();
      tone.connect(gain).connect(destination);
      const abort = new AbortController();
      try {
        tone.start();
        await source.resume();
        const input = await window.inputAudioCheck.openInputAudio(
          abort.signal,
          {
            secure: true,
            Context: AudioContext,
            Recorder: MediaRecorder,
            devices: { getUserMedia: async () => destination.stream },
          },
        );
        input.start();
        const readings = {};
        for (const frequency of [50, 500, 6000]) {
          tone.frequency.setValueAtTime(frequency, source.currentTime);
          await new Promise((resolve) => setTimeout(resolve, 300));
          readings[frequency] = input.sample();
        }
        input.stop();
        const recording = await input.done;
        window.inputAudioResult = {
          readings,
          bytes: recording.size,
          tracksEnded: destination.stream
            .getTracks()
            .every((track) => track.readyState === "ended"),
        };
      } catch (error) {
        window.inputAudioResult = { error: String(error) };
      } finally {
        abort.abort();
        tone.stop();
        await source.close();
        window.inputAudioFinished = true;
      }
    };
  });
  await page.click("#start");
  await page.waitForFunction(() => window.inputAudioFinished, undefined, {
    timeout: 10000,
  });
  const result = await page.evaluate(() => window.inputAudioResult);
  assert.deepEqual(errors, []);
  assert.equal(result.error, undefined);
  assert(
    result.bytes > 1000,
    "The real MediaRecorder must return a nonempty dry recording.",
  );
  assert.equal(result.tracksEnded, true);
  const low = result.readings[50],
    mid = result.readings[500],
    high = result.readings[6000];
  assert(
    low.level > 0.25 && mid.level > 0.25 && high.level > 0.25,
    "The analyser must receive actual signal without a speaker connection.",
  );
  assert(
    low.sub > mid.sub * 5 && low.sub > high.sub * 5,
    "Sub must measure 20–80Hz independently.",
  );
  assert(
    low.low > low.mid && mid.mid > mid.low && high.high > high.mid,
    "Crossovers must respond to the corresponding generated frequencies.",
  );
  console.log(JSON.stringify({ status: "passed", ...result }, null, 2));
} finally {
  await browser.close();
}
