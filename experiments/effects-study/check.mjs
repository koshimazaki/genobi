/* global window, document, innerWidth, process, URL, console, Buffer */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const out = process.env.STUDY_OUT ?? "/tmp/genobi-effects-evidence";
const base = process.env.STUDY_URL ?? "http://127.0.0.1:4321";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  channel: process.env.CHROME_BIN ? undefined : "chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const reports = [];
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1120 },
    phone: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const errors = [],
      external = [];
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.href);
        return r.abort();
      }
      return r.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${base}/experiments/effects-study/`);
    await page.waitForFunction(() => window.effectsStudy?.get().ready, null, {
      timeout: 60000,
    });
    const hashes = {};
    for (const mode of ["helmet", "mirror", "terrain"]) {
      await page.locator(`[data-mode="${mode}"]`).click();
      const first = await page.evaluate(async () => {
        await window.render(72);
        return window.effectsStudy.canvas.toDataURL();
      });
      await page.evaluate(async () => {
        await window.render(112);
        await window.render(9);
      });
      const second = await page.evaluate(async () => {
        await window.render(72);
        return window.effectsStudy.canvas.toDataURL();
      });
      assert.equal(
        first,
        second,
        `${mode} exact repeat frame after reverse seek`,
      );
      hashes[mode] = first.length;
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No page overflow",
      );
      await page.screenshot({
        path: `${out}/${name}-${mode}.png`,
        fullPage: true,
      });
      await page
        .locator("#output")
        .screenshot({ path: `${out}/${name}-${mode}-frame.png` });
    }
    await page.locator("#frame").fill("24");
    await page.waitForFunction(() => window.effectsStudy.get().frame === 24);
    await page.locator("#intensity").fill("0.32");
    await page.waitForFunction(
      () => window.effectsStudy.get().intensity === 0.32,
    );
    await page.getByRole("button", { name: "Play study", exact: true }).click();
    await page.waitForFunction(() => window.effectsStudy.get().frame > 27);
    await page
      .getByRole("button", { name: "Pause study", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.effectsStudy.get().playing),
      false,
    );
    await page.evaluate(async () => {
      await window.effectsStudy.set({ mode: "helmet", frame: 0 });
      const original = window.requestAnimationFrame;
      const cancel = window.cancelAnimationFrame;
      window.__studyRaf = {
        original,
        cancel,
        pending: new Set(),
        maxPending: 0,
        callbacks: 0,
      };
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== "studyFrame") return original(callback);
        const probe = window.__studyRaf;
        const id = original((time) => {
          probe.pending.delete(id);
          probe.callbacks++;
          callback(time);
        });
        probe.pending.add(id);
        probe.maxPending = Math.max(probe.maxPending, probe.pending.size);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        window.__studyRaf.pending.delete(id);
        cancel(id);
      };
      const button = document.querySelector("#play");
      button.click();
      for (let i = 0; i < 12; i++) {
        button.click();
        button.click();
      }
    });
    await page.waitForFunction(() => window.__studyRaf.callbacks >= 3, null, {
      polling: 50,
      timeout: 10000,
    });
    const rapid = await page.evaluate(() => {
      const state = window.effectsStudy.get();
      if (state.playing) document.querySelector("#play").click();
      const { maxPending, callbacks } = window.__studyRaf;
      const pending = window.__studyRaf.pending.size;
      window.requestAnimationFrame = window.__studyRaf.original;
      window.cancelAnimationFrame = window.__studyRaf.cancel;
      delete window.__studyRaf;
      return { state, maxPending, callbacks, pending };
    });
    assert(
      rapid.state.playing && rapid.state.frame > 0,
      "Rapid resume keeps playing",
    );
    assert(
      rapid.callbacks >= 3 && rapid.maxPending === 1 && rapid.pending === 0,
      `One owned playback schedule, cancelled on pause: ${JSON.stringify(rapid)}`,
    );
    const invalidMode = await page.evaluate(async () => {
      const before = window.effectsStudy.get();
      try {
        await window.effectsStudy.set({ mode: ["terrain"] });
        return false;
      } catch {
        return (
          JSON.stringify(window.effectsStudy.get()) === JSON.stringify(before)
        );
      }
    });
    assert(invalidMode, "Invalid mode types are refused without mutation");
    await page.evaluate(() =>
      window.effectsStudy.set({ mode: "mirror", intensity: 0.42, frame: 33 }),
    );
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save combination ↓", exact: true })
      .click();
    const download = await pending;
    const file = `${out}/${name}-combination.json`;
    await download.saveAs(file);
    await page.evaluate(() =>
      window.effectsStudy.set({ mode: "helmet", intensity: 0.1, frame: 5 }),
    );
    await page.locator("#preset-file").setInputFiles(file);
    await page.waitForFunction(
      () =>
        window.effectsStudy.get().mode === "mirror" &&
        window.effectsStudy.get().frame === 33,
    );
    const state = await page.evaluate(() => window.effectsStudy.get());
    assert.equal(state.intensity, 0.42);
    assert.equal(state.source.asset, "reverb-ltx");
    const sourceBytes = await readFile(
      new URL(
        "../../public/media/director-templates/adaptive-reverb/reverb-ltx.mp4",
        import.meta.url,
      ),
    );
    assert.equal(
      state.source.sha256,
      createHash("sha256").update(sourceBytes).digest("hex"),
    );
    const unchanged = await page.evaluate(() => window.effectsStudy.get());
    for (const [mutate, message] of [
      [
        (p) => {
          p.source.start = 0;
        },
        "This combination uses a different source or render format.",
      ],
      [
        (p) => {
          delete p.mode;
          p.intensity = 0.9;
        },
        "Choose a complete effects-study combination.",
      ],
      [
        (p) => {
          p.width = 1920;
        },
        "This combination uses a different source or render format.",
      ],
    ]) {
      const invalid = JSON.parse(JSON.stringify(state));
      delete invalid.ready;
      delete invalid.playing;
      mutate(invalid);
      await page.locator("#preset-file").setInputFiles({
        name: "invalid-study.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(invalid)),
      });
      await page.waitForFunction(
        (message) =>
          document.querySelector("#preset-status").textContent === message,
        message,
      );
      assert.deepEqual(
        await page.evaluate(() => window.effectsStudy.get()),
        unchanged,
        "Invalid import changes no state",
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    reports.push({
      viewport: name,
      result: "PASS",
      repeatFrames: hashes,
      configurationRoundTrip: true,
      singlePlaybackChainAfterRapidResume: true,
      source: state.source,
      invalidImportsLeaveStateUnchanged: true,
      errors,
      external,
    });
    console.log(JSON.stringify(reports.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
}
