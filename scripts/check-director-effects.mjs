// The motion effects (docs/director-bundle/motion-effects.md) open in the
// Director from a bundle, seek to the same pixels in any order, and export an
// MP4 whose frames match the preview. Start Vite first; Chrome is the
// default, DIRECTOR_BROWSER=chromium for an installed Playwright browser,
// DIRECTOR_URL for another local server. The frame comparison needs FFmpeg.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const out = ".local/director-effects";
await mkdir(out, { recursive: true });
const root = "docs/director-bundle/effects";
const manifest = await readFile(`${root}/project.json`);
const project = JSON.parse(manifest);
const files = { "project.json": new Uint8Array(manifest) };
for (const m of Object.values(project.modules))
  files[m.file.path] = new Uint8Array(await readFile(`${root}/${m.file.path}`));
await writeFile(`${out}/effects.zip`, zipSync(files, { level: 0 }));
// A second cut for measuring what the viewer sees: sparse, short radial
// lines (every one must still reach the picture) and a full-strength shake
// under the title, with no grade or mattes to blur the measurement.
const measured = structuredClone(project);
measured.id = "motion-effects-measured";
measured.layers = measured.layers.filter((l) =>
  ["lines", "title", "impact"].includes(l.id),
);
const layer = (id) => measured.layers.find((l) => l.id === id);
Object.assign(layer("lines").parameters, {
  density: 4,
  length: 0.05,
  thickness: 0.5,
  seed: 7,
  color: "#ffffff",
});
const shake = { amplitude: 64, frequency: 14, seed: 3, decay: 0 };
Object.assign(layer("impact").parameters, shake);
await writeFile(
  `${out}/measured.zip`,
  zipSync(
    {
      ...files,
      "project.json": new TextEncoder().encode(JSON.stringify(measured)),
    },
    { level: 0 },
  ),
);

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/director?example=studio&workspace=editor`);
  const ready = () =>
    page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 30000 });
  await ready();
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/effects.zip`);
  await page.getByText("7 layers · 0 assets", { exact: true }).waitFor();
  await ready();
  console.log("PASS the effects bundle opens: 7 layers, 5 registered recipes");

  const preview = page.locator('canvas[aria-label="Director preview"]');
  const seek = async (f) => {
    await page
      .getByRole("slider", { name: "Playhead", exact: true })
      .fill(String(f));
    await page.waitForFunction(
      (f) =>
        document.querySelector('canvas[aria-label="Director preview"]').dataset
          .frame === String(f),
      f,
    );
  };
  const pixels = () =>
    preview.evaluate((c) =>
      Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data),
    );
  // Mean channel difference, and how far the frame is from one flat colour.
  const difference = (a, b) =>
    a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
  const spread = (p) => {
    const mean = [0, 1, 2].map(
      (c) =>
        p.filter((_, i) => i % 4 === c).reduce((n, v) => n + v, 0) /
        (p.length / 4),
    );
    return (
      p.reduce(
        (n, v, i) => (i % 4 === 3 ? n : n + Math.abs(v - mean[i % 4])),
        0,
      ) /
      ((p.length * 3) / 4)
    );
  };

  await seek(80);
  const first = await pixels();
  await seek(20);
  await seek(130);
  await seek(80);
  assert.equal(difference(first, await pixels()), 0);
  console.log("PASS seek 80 → 20 → 130 → 80 draws identical pixels");
  await seek(81);
  assert.ok(difference(first, await pixels()) > 0.5, "shake and lines move");
  console.log("PASS consecutive frames under the shake differ");

  const looks = {};
  for (const f of [0, 40, 76, 90, 149]) {
    await seek(f);
    const p = await pixels();
    looks[f] = {
      spread: spread(p),
      mean: p.reduce((n, v) => n + v, 0) / p.length,
    };
    const png = await preview.evaluate(
      (c) => c.toDataURL("image/png").split(",")[1],
    );
    await writeFile(`${out}/frame-${f}.png`, Buffer.from(png, "base64"));
  }
  // Frame 0 opens on the slice matte, 149 ends on the wipe's; 76 is the
  // white flash cut; 40 shows the title over the focus lines.
  assert.ok(looks[0].spread < 1, `frame 0 spread ${looks[0].spread}`);
  assert.ok(looks[149].spread < 1, `frame 149 spread ${looks[149].spread}`);
  assert.ok(looks[76].mean > 200, `frame 76 mean ${looks[76].mean}`);
  assert.ok(looks[40].spread > 10, `frame 40 spread ${looks[40].spread}`);
  console.log(
    "PASS matte in and out, a white flash cut and a title over speed lines",
  );
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });

  // The inspector offers a recipe's choices as a menu and a hex as a colour.
  await page
    .getByRole("button", { name: "Select Slice in", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  await page.getByRole("button", { name: "type slice", exact: true }).click();
  await page.getByRole("option", { name: "wipe", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "type wipe", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Select Grade / warm", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("tint", { exact: true }).getAttribute("type"),
    "color",
  );
  console.log(
    "PASS inspector edits a transition type and shows tint as a colour",
  );
  // Fractions off the arrows' 0.05 grid (counted from a minimum of 0.01)
  // are still taken: 0.4 s for a transition, 1.3 for a scale.
  const enter = async (layer, label, value) => {
    await page
      .getByRole("button", { name: `Select ${layer}`, exact: true })
      .click();
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press("Tab");
    await ready();
  };
  await enter("Wipe out", "duration", "0.4");
  await enter("Title / slide in", "Scale", "1.3");
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save JSON", exact: true }).click();
  await (await saved).saveAs(`${out}/edited.json`);
  const edited = JSON.parse(await readFile(`${out}/edited.json`, "utf8"));
  const byId = (id) => edited.layers.find((l) => l.id === id);
  assert.equal(byId("wipe-out").parameters.duration, 0.4);
  assert.equal(byId("title").scale, 1.3);
  console.log(
    "PASS inspector keeps off-grid fractions (duration 0.4, scale 1.3)",
  );

  // Reopen the bundle so the export runs on the catalogue's own values.
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/effects.zip`);
  await ready();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page.getByText(/^Render ready · MP4/).waitFor({ timeout: 120000 });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /^Download video/ }).click();
  await (await download).saveAs(`${out}/render.mp4`);
  console.log("PASS MP4 export downloaded");

  const decode = (input, options) =>
    execFileSync("ffmpeg", ["-v", "error", "-i", input, ...options, "pipe:1"], {
      maxBuffer: 32 * 1024 * 1024,
    });
  for (const f of [0, 40, 76, 90, 149]) {
    const exported = decode(`${out}/render.mp4`, [
      "-vf",
      `select=eq(n\\,${f})`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
    ]);
    const still = decode(`${out}/frame-${f}.png`, [
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
    ]);
    assert.equal(exported.length, still.length);
    let squared = 0;
    for (let i = 0; i < still.length; i++)
      if (i % 4 !== 3) squared += (still[i] - exported[i]) ** 2;
    const rmse = Math.sqrt(squared / ((still.length * 3) / 4));
    const psnr = rmse === 0 ? Infinity : 20 * Math.log10(255 / rmse);
    assert.ok(psnr > 32, `Frame ${f}: preview/export PSNR ${psnr}`);
    console.log(`PASS frame ${f}: preview/export PSNR=${psnr.toFixed(2)} dB`);
  }
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/measured.zip`);
  await page.getByText("3 layers · 0 assets", { exact: true }).waitFor();
  await ready();
  // White line pixels, and the centre of the title's yellow plate.
  const look = async (f) => {
    await seek(f);
    const p = await pixels();
    let white = 0,
      n = 0,
      x = 0,
      y = 0;
    const width = project.composition.width;
    for (let i = 0; i < p.length; i += 4) {
      const [r, g, b] = [p[i], p[i + 1], p[i + 2]];
      // Thin lines anti-alias to grey: count neutral pixels well above the
      // background (#1a1f2b), which neither the plate nor its words are.
      if (Math.min(r, g, b) > 70 && Math.max(r, g, b) - Math.min(r, g, b) < 25)
        white++;
      if (r > 180 && g > 220 && b > 90 && b < 170) {
        n++;
        x += (i / 4) % width;
        y += Math.floor(i / 4 / width);
      }
    }
    return { white, plate: [x / n, y / n] };
  };
  for (const f of [0, 40, 74]) {
    const { white } = await look(f);
    assert.ok(white > 0, `frame ${f}: no speed line on screen`);
  }
  console.log(
    "PASS sparse, short radial lines show on screen at frames 0, 40 and 74",
  );
  const rest = (await look(74)).plate;
  let largest = 0;
  for (let f = 75; f < 105; f++) {
    const { plate } = await look(f);
    const move = plate.map((v, i) => Math.abs(v - rest[i]));
    for (const m of move)
      assert.ok(m <= shake.amplitude + 1.5, `frame ${f}: plate moved ${m} px`);
    largest = Math.max(largest, ...move);
  }
  assert.ok(largest > 10, `shake barely moved: ${largest} px`);
  console.log(
    `PASS shake moves the title at most ${shake.amplitude} px on screen (largest ${largest.toFixed(1)} px)`,
  );
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
}
