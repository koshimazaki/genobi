import { chooseSelect } from "./lib/choose-select.mjs";
/**
 * Voice mode's header pill, in Chrome with a fake microphone. Local only:
 * every API route is a fixture, so nothing is transcribed, submitted or run.
 *   STUDIO_URL=http://127.0.0.1:4441 node scripts/check-voice-overlay.mjs
 * Asserts Voice is in the header of every section, the pill hangs under the
 * header on the right and leaves the toolbar, gallery and panels where they
 * were, one click on the mic records and the next stops and transcribes,
 * the chevron folds the panel, and explicit routing keeps Agent as default,
 * pins conversations and offers opt-in prompt dictation and Camera requests
 * (scripts/lib/voice-destination-checks.mjs, voice-intent-checks.mjs and
 * voice-gap-checks.mjs, which also covers LTX's prompt gaps), the
 * recording goes through MediaRecorder as WAV, Escape closes with focus
 * back on the Voice button, the server-side prewarm is cancelled when a
 * recording is discarded, cannot be decoded or the page is hidden
 * mid-recording, the microphone is released when the recorder cannot start,
 * it fits a phone, keeps a still loader under reduced motion, and reports a
 * refused microphone (once, without asking again) and a missing worker.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { destinationChecks } from "./lib/voice-destination-checks.mjs";
import { intentChecks } from "./lib/voice-intent-checks.mjs";
import { gapChecks } from "./lib/voice-gap-checks.mjs";
import { approvalChecks } from "./lib/voice-approval-checks.mjs";
import {
  fieldText,
  focusedName,
  layout,
  listening,
  overflow,
  pixels,
  transcribed,
  TRANSCRIPT,
  underHeader,
  voiceFixture,
} from "./lib/voice-fixture.mjs";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-voice-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const checks = [],
  errors = [];
const open = voiceFixture(browser, base, errors);

try {
  // Desktop: one click opens and records, the mic again stops and
  // transcribes, and the transcript fills the prompt on screen.
  let { context, page, voice, sent } = await open();
  const before = await layout(page);
  await voice.focus();
  await page.keyboard.press("Enter");
  const overlay = page.getByRole("dialog", { name: "Voice" });
  await overlay.waitFor();
  await listening(page);
  assert.equal(
    await focusedName(page),
    "Stop and transcribe",
    "focus moves to Stop",
  );
  assert.deepEqual(await layout(page), before, "the pill moves nothing");
  await underHeader(page, 1440);
  checks.push(
    "The pill hangs under the header on the right and moves no toolbar button or panel",
  );
  // Folded, as in the mockup; the state is still spoken.
  const chevron = page.getByRole("button", { name: "Show transcript" });
  assert.equal(await chevron.getAttribute("aria-expanded"), "false");
  assert((await page.locator(".voice-details").boundingBox()).height <= 1);
  await chevron.click();
  await page.getByText(/^LISTENING/).waitFor();
  await page.getByRole("button", { name: "Hide transcript" }).click();
  checks.push("The chevron opens and folds the panel under the pill");
  await page.waitForTimeout(1500);
  assert((await pixels(page)).lit > 0, "LEDs are drawn");
  assert.equal(sent.prewarm, 1, "recording prewarms the worker");
  await page.screenshot({ path: `${output}/voice-listening-1440.png` });
  const transcript = await transcribed(page, voice);
  assert.equal(await overlay.count(), 1, "the mic stops, it does not close");
  assert.equal(await transcript.inputValue(), TRANSCRIPT);
  assert.equal(sent.wav.length, 1);
  assert.equal(sent.wav[0].type, "audio/wav");
  assert.equal(sent.wav[0].language, "English", "English until chosen");
  assert.match(
    sent.wav[0].head,
    /^RIFF....WAVE$/s,
    "the recording is sent as WAV",
  );
  assert.equal(await page.evaluate(() => window.voiceMicRequests), 1);
  checks.push(
    "One click on the mic records (no Record press); the mic again stops and transcribes",
  );
  checks.push(
    "Fake microphone records through MediaRecorder, prewarms, sends WAV and shows the transcript",
  );
  await page.screenshot({ path: `${output}/voice-transcript-1440.png` });
  // The fixture explicitly selected Current prompt for recorder checks.
  const routed = await page.locator(".voice-routed").textContent();
  const id = {
    "Camera prompt": "description",
    "Project prompt field": "project-prompt-text",
  }[routed.match(/^In the (.+?)\./)?.[1]];
  assert(id, `the transcript names the prompt it filled: ${routed}`);
  assert.equal(await fieldText(page, id), TRANSCRIPT);
  assert.equal(
    await page.getByLabel("Voice destination").inputValue(),
    "prompt",
  );
  assert.equal(sent.sessions.length, 0, "dictation starts no agent session");
  assert.equal(sent.messages.length, 0, "dictation sends no agent message");
  assert.equal(sent.approvals.length, 0, "dictation approves no paid step");
  assert.equal(sent.cancel, 0, "a finished note keeps nothing to cancel");
  checks.push(
    "Explicit Current prompt dictation names the field it filled; Agent is exercised separately as the fresh-browser default",
  );
  await page.getByRole("button", { name: "Close voice" }).click();
  assert.equal(await overlay.count(), 0);
  // Escape closes and returns focus, from inside the overlay. The filled
  // prompt is the new baseline: opening and closing must move nothing.
  const filled = await layout(page);
  await voice.click();
  await listening(page);
  await page.keyboard.press("Escape");
  assert.equal(await overlay.count(), 0);
  assert.equal(await focusedName(page), "Voice");
  assert.deepEqual(
    await layout(page),
    filled,
    "opening and closing again moves nothing",
  );
  // Stopping with the header mic leaves focus on it; Escape still closes.
  await voice.click();
  await listening(page);
  await page.waitForTimeout(500);
  await transcribed(page, voice);
  assert.equal(await focusedName(page), "Voice");
  await page.keyboard.press("Escape");
  assert.equal(await overlay.count(), 0, "Escape after a mic stop closes");
  checks.push(
    "Escape closes the overlay and focus returns to the Voice button, also after stopping with the mic",
  );
  // Theme colours.
  const led = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--voice-led-2")
        .trim(),
    );
  const lime = await led();
  await page.evaluate(
    () => (document.documentElement.dataset.theme = "cyberpunk"),
  );
  assert.notEqual(await led(), lime, "Cyberpunk has its own LED stops");
  await voice.click();
  await listening(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${output}/voice-cyberpunk-1440.png` });
  await page.keyboard.press("Escape");
  checks.push(
    "Blackstone / Lime and Cyberpunk each give the LEDs their own colours",
  );
  await context.close();

  // Gallery, the first view: Voice in the header; recording moves nothing.
  for (const width of [1440, 390]) {
    ({ context, page, voice, sent } = await open({ width, path: "/" }));
    assert.equal(
      await page.locator(".genobi-shell").getAttribute("data-preset"),
      "gallery",
    );
    const still = await layout(page);
    await voice.click();
    await listening(page);
    await page.waitForTimeout(1200);
    assert.deepEqual(await layout(page), still, `Gallery stays at ${width}`);
    await underHeader(page, width);
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    await page.screenshot({ path: `${output}/voice-gallery-${width}.png` });
    await context.close();
  }
  checks.push("Gallery at 1440 and 390 px: recording moves nothing");

  await destinationChecks({ open, checks, output });
  await intentChecks({ open, checks, output });
  await gapChecks({ open, checks, output });
  await approvalChecks({ open, checks, output });

  // The language: English first, the server's list, kept per browser and
  // sent with the note; storage that refuses still means English.
  ({ context, page, voice, sent } = await open({ width: 320 }));
  await voice.click();
  await listening(page);
  await page.getByRole("button", { name: "Show transcript" }).click();
  const language = page
    .getByRole("dialog", { name: "Voice" })
    .getByLabel("Language", { exact: true });
  await language.waitFor();
  await language.click();
  assert.deepEqual(
    await page
      .getByRole("listbox", { name: "Language" })
      .getByRole("option")
      .allTextContents(),
    ["English", "Auto-detect", "French", "Japanese"],
  );
  await page.keyboard.press("Escape");
  const languageValue = () =>
    page.locator("#voice-language-native").inputValue();
  assert.equal(await languageValue(), "English");
  await chooseSelect(language, "auto");
  assert(!(await overflow(page)), "no horizontal overflow at 320");
  await page.screenshot({ path: `${output}/voice-language-320.png` });
  await transcribed(page, voice);
  assert.equal(sent.wav[0].language, "auto", "the choice goes with the note");
  await page.reload();
  await voice.click();
  await listening(page);
  await page.getByRole("button", { name: "Show transcript" }).click();
  assert.equal(await languageValue(), "auto", "kept in this browser");
  await context.close();
  ({ context, page, voice, sent } = await open({
    // Storage that refuses the voice key, read and write.
    script: () => {
      const { getItem, setItem } = Storage.prototype;
      const refuse = (key) => {
        if (key === "genobi.voice.language")
          throw new DOMException("blocked", "SecurityError");
      };
      Storage.prototype.getItem = function (key) {
        refuse(key);
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        refuse(key);
        return setItem.call(this, key, value);
      };
    },
  }));
  await voice.click();
  await listening(page);
  await page.getByRole("button", { name: "Show transcript" }).click();
  await chooseSelect(
    page
      .getByRole("dialog", { name: "Voice" })
      .getByLabel("Language", { exact: true }),
    "French",
  );
  await transcribed(page, voice);
  assert.equal(sent.wav[0].language, "French");
  await context.close();
  checks.push(
    "Language: English by default, the server's list, kept per browser, sent with each note; blocked storage still works",
  );

  // Every section keeps Voice in the header.
  ({ context, page, voice } = await open({ path: "/" }));
  // Director's first-entry dialog loads lazily and may appear between clicks.
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Close Generate my version" }),
    (close) => close.click(),
  );
  for (const button of await page
    .locator("[data-preset-button]")
    .elementHandles()) {
    await button.click();
    await page.waitForTimeout(150);
    assert(await voice.isVisible(), "Voice in every section");
  }
  await context.close();
  checks.push("Voice is in the header of every section");

  // Phone widths: the overlay fits and the toolbar stays put.
  for (const width of [390, 320]) {
    ({ context, page, voice, sent } = await open({ width }));
    const still = await layout(page);
    await voice.click();
    await page.getByRole("dialog", { name: "Voice" }).waitFor();
    assert.deepEqual(await layout(page), still, `nothing moves at ${width}`);
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    await underHeader(page, width);
    await listening(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${output}/voice-listening-${width}.png` });
    await page.keyboard.press("Escape");
    assert.equal(await focusedName(page), "Voice");
    await page.waitForTimeout(300);
    assert.equal(sent.prewarm, 1);
    assert.equal(sent.cancel, 1, "a discarded recording frees the prewarm");
    await context.close();
  }
  checks.push(
    "390 and 320 px: the overlay fits, moves nothing and closes on Escape",
  );
  checks.push("Closing during a recording cancels the server-side prewarm");

  // Reduced motion: the transcribing loader is a still row of dots.
  for (const reducedMotion of ["reduce", "no-preference"]) {
    ({ context, page, voice } = await open({ delay: 2500 }));
    await page.emulateMedia({ reducedMotion });
    await voice.click();
    await listening(page);
    await page.waitForTimeout(700);
    await page
      .getByRole("button", { name: "Stop and transcribe", exact: true })
      .click();
    await page.getByText("TRANSCRIBING", { exact: true }).waitFor();
    await page.waitForTimeout(500);
    const first = await pixels(page);
    await page.waitForTimeout(400);
    const second = await pixels(page);
    if (reducedMotion === "reduce")
      assert.deepEqual(second, first, "a still loader");
    else
      assert.notDeepEqual(
        second,
        first,
        "the loader runs without reduced motion",
      );
    await context.close();
  }
  checks.push(
    "Reduced motion keeps the transcribing loader still; otherwise it runs",
  );

  // Closing the tab mid-recording: pagehide frees the prewarm.
  ({ context, page, voice, sent } = await open());
  await voice.click();
  await listening(page);
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })),
  );
  await page.waitForTimeout(300);
  assert.equal(sent.cancel, 1, "pagehide cancels the prewarm");
  await context.close();
  checks.push("Hiding or closing the page mid-recording cancels the prewarm");

  // A recorder that cannot start: the granted tracks are stopped, no worker
  // is prewarmed, and the overlay says so.
  ({ context, page, voice, sent } = await open({
    script: () => {
      const granted = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await granted(constraints);
        (window.voiceStreams ??= []).push(stream);
        return stream;
      };
      window.MediaRecorder = class {
        constructor() {
          throw new DOMException("unsupported", "NotSupportedError");
        }
      };
    },
  }));
  await voice.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "could not start recording" })
    .waitFor();
  assert(
    await page.evaluate(() =>
      window.voiceStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
    "the microphone is released",
  );
  assert.equal(sent.prewarm, 0, "a failed start prewarms nothing");
  await context.close();
  // A recording that cannot be decoded: the prewarm is cancelled and nothing
  // is sent to transcribe.
  ({ context, page, voice, sent } = await open({
    script: () => {
      OfflineAudioContext.prototype.decodeAudioData = () =>
        Promise.reject(new DOMException("short", "EncodingError"));
    },
  }));
  await voice.click();
  await listening(page);
  await page.waitForTimeout(600);
  await page
    .getByRole("button", { name: "Stop and transcribe", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "The recording could not be read." })
    .waitFor();
  await page.waitForTimeout(300);
  assert.equal(sent.prewarm, 1);
  assert.equal(sent.cancel, 1, "an undecodable note frees the prewarm");
  assert.equal(sent.wav.length, 0);
  await context.close();
  checks.push(
    "A recorder that cannot start releases the microphone and prewarms nothing; an undecodable note cancels its prewarm",
  );

  // A refused microphone says so once and is not asked again; an
  // unconfigured or hosted server says so too.
  ({ context, page, voice } = await open({ refuse: true }));
  await voice.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Microphone access was refused" })
    .waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.voiceMicRequests), 1);
  await page.getByRole("button", { name: "Record", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/voice-refused-1440.png` });
  await context.close();
  // Since #67 an unconfigured server's mic offers to install Voice Mode
  // (src/voice/VoiceSetup.tsx): the offer opens, asks for nothing until the
  // person says yes, records nothing, and Escape returns to the mic.
  ({ context, page, voice } = await open({
    status: { available: false, maxSeconds: 180 },
  }));
  let installs = 0;
  await page.route("**/api/voice/setup", (route) => {
    if (route.request().method() !== "GET") {
      installs++;
      return route.abort();
    }
    return route.fulfill({
      json: {
        token: "fixture-grant",
        model: "Qwen3-ASR-0.6B",
        bytes: 1_880_000_000,
        folder: "/tmp/genobi-voice",
        browse: false,
        supported: true,
        state: { phase: "idle", bytes: 0, busy: false },
      },
    });
  });
  assert.equal(await voice.getAttribute("data-available"), "false");
  await voice.click();
  const offer = page.getByRole("dialog", { name: "Install Voice Mode?" });
  await offer.waitFor();
  const yes = offer.getByRole("button", {
    name: "Yes, install Voice Mode",
    exact: true,
  });
  await yes.waitFor();
  assert.equal(await focusedName(page), "Yes, install Voice Mode");
  assert.equal(
    await page.getByRole("button", { name: "Record", exact: true }).count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.voiceMicRequests), 0);
  await page.keyboard.press("Escape");
  await offer.waitFor({ state: "detached" });
  assert.equal(await focusedName(page), "Voice");
  assert.equal(installs, 0, "the offer installed without a yes");
  await context.close();
  // The hosted studio has neither route: the offer says where Voice Mode
  // installs and cannot be confirmed.
  ({ context, page, voice } = await open({ status: null }));
  await page.route("**/api/voice/setup", (route) =>
    route.fulfill({ status: 404, json: { error: "API route not found." } }),
  );
  await voice.click();
  // The hosted studio has no setup route, so the offer shows where Voice Mode
  // installs (the local-run instructions) and cannot be confirmed.
  await page
    .getByText(/Voice mode runs in the local studio/)
    .first()
    .waitFor();
  assert.equal(await page.evaluate(() => window.voiceMicRequests), 0);
  await context.close();
  checks.push(
    "Refused microphone (asked once, no loop) and hosted studio each show a message; an unconfigured server offers to install, and installs nothing without a yes",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output }, null, 2));
} finally {
  await browser.close();
}
