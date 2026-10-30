/** Helpers for `scripts/check-3d-tab.mjs`: page setup, boxes, radar and MP4 reads. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BufferSource, EncodedPacketSink, Input, MP4 } from "mediabunny";

export async function open(browser, viewport, reducedMotion = "no-preference") {
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    acceptDownloads: true,
  });
  await context.route("**/api/**", (route) =>
    route.request().method() !== "GET"
      ? route.abort()
      : route.fulfill({
          json: { hasServerKey: false, jobs: [], sources: [] },
        }),
  );
  // The first-run setup dialog is not under test here.
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console error: ${m.text()}`);
  });
  return { context, page, errors };
}

export const section = (page, name) =>
  page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name, exact: true })
    .click();
export const sceneCanvas = (page) =>
  page.getByRole("img", { name: /^3D camera scene/ });
export const boxes = (page, selectors) =>
  page.evaluate((list) => {
    const out = {};
    for (const s of list) {
      const r = document.querySelector(s)?.getBoundingClientRect();
      out[s] = r && [
        Math.round(r.top + scrollY),
        Math.round(r.left),
        Math.round(r.width),
        Math.round(r.height),
      ];
    }
    return out;
  }, selectors);
export function same(before, after, when) {
  for (const key of Object.keys(before))
    assert.deepEqual(after[key], before[key], `${key} moved ${when}`);
}
/**
 * Radar strokes: pixels much brighter than the pane's dark wash (lines and
 * markers are theme accents). The 2D canvas is readable, unlike WebGL.
 */
export const radarInk = (page, name) =>
  page.getByRole("img", { name }).evaluate((c) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    let hash = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] + data[i + 1] + data[i + 2] > 180) {
        ink++;
        hash = (hash * 31 + i) >>> 0;
      }
    return { ink, hash };
  });

/** Encoded frames of an MP4, read without decoding. */
export async function packets(bytes) {
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const sink = new EncodedPacketSink(await input.getPrimaryVideoTrack());
    const out = [];
    for (
      let p = await sink.getFirstPacket();
      p;
      p = await sink.getNextPacket(p)
    )
      out.push(Buffer.from(p.data));
    return out;
  } finally {
    input.dispose();
  }
}
export const download = async (page, name) => {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name }).click(),
  ]);
  return new Uint8Array(await readFile(await file.path()));
};
export const timeShown = async (page) =>
  Number(
    (await page.locator(".s3d-transport output").textContent()).replace(
      " s",
      "",
    ),
  );

/** Load a Ninja layout through its JSON file input, as a visitor would. */
export const loadNinja = (page, panels) =>
  page.getByLabel("Load Ninja layout JSON").setInputFiles({
    name: "layout.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "genobi.ninja-layout", version: 3, panels }),
    ),
  });
