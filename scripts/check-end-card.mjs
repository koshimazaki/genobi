// The Dimensions mix's end card as an editable layer
// (docs/dimensions-mix.md#the-end-card): it draws the same pixels however a
// frame is reached, its words change in the inspector, the MP4 export keeps
// 555 frames, and frames 453, 520 and 554 are saved beside the same frames
// of the cut as it was, with the baked mix-end.mp4 capture from git, for a
// side-by-side look; that old bundle first opens upgraded with the card. Start Vite first (DIRECTOR_URL, default
// http://127.0.0.1:5175); Chrome is the default browser, DIRECTOR_BROWSER
// for another. Needs FFmpeg and git. Output: END_CARD_OUT or
// .local/end-card.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { mixProject } from "../shared/templates/mix.ts";
import { dimensionsMix } from "../shared/templates/dimensions-mix.ts";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5175";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const out = process.env.END_CARD_OUT ?? ".local/end-card";
await mkdir(out, { recursive: true });
const FRAMES = [453, 520, 554];
// The last commit with the baked card, for the comparison only.
const BAKED = "54c1cb5";
const sha = (b) => createHash("sha256").update(b).digest("hex");

// The cut as it was: the card a 102-frame video on the shots lane.
const registry = JSON.parse(
  await readFile("docs/director-bundle/example/studio.json", "utf8"),
);
const mix = dimensionsMix.mix;
const old = structuredClone(mix.cut);
old.layers = old.layers.filter((l) => l.id !== "end-card");
old.shots.push({
  asset: "mix-end",
  label: "End card · produced by Genobi 2026",
  sourceSeconds: 0,
  startBeat: 44,
  beats: 10,
  cropY: null,
});
const files = {
  "media/mix-end.mp4": new Uint8Array(
    execFileSync(
      "git",
      [
        "show",
        `${BAKED}:public/media/director-templates/dimensions-mix/mix-end.mp4`,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    ),
  ),
};
const media = {
  "mix-end": {
    kind: "video",
    path: "media/mix-end.mp4",
    durationSeconds: 102 / 24,
    sha256: sha(files["media/mix-end.mp4"]),
  },
};
for (const [id, m] of Object.entries(mix.media)) {
  files[m.path] = new Uint8Array(await readFile(`public${m.url}`));
  media[id] = { ...m, sha256: sha(files[m.path]) };
}
const project = mixProject(old, "Dimensions mix (baked card)", media, {
  ...registry.modules,
});
for (const m of Object.values(project.modules))
  files[m.file.path] = new Uint8Array(
    await readFile(`docs/director-bundle/example/${m.file.path}`),
  );
files["project.json"] = new TextEncoder().encode(JSON.stringify(project));
await writeFile(`${out}/baked.zip`, zipSync(files, { level: 0 }));

const decode = (input, options) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", input, ...options, "pipe:1"], {
    maxBuffer: 64 * 1024 * 1024,
  });
const rgba = (input, frame) =>
  decode(input, [
    ...(frame === undefined
      ? []
      : ["-vf", `select=eq(n\\,${frame})`, "-frames:v", "1"]),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
  ]);
const psnr = (a, b) => {
  assert.equal(a.length, b.length);
  let squared = 0;
  for (let i = 0; i < a.length; i++)
    if (i % 4 !== 3) squared += (a[i] - b[i]) ** 2;
  const rmse = Math.sqrt(squared / ((a.length * 3) / 4));
  return rmse === 0 ? Infinity : 20 * Math.log10(255 / rmse);
};

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
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  const ready = () =>
    page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 60000 });
  const preview = page.locator('canvas[aria-label="Director preview"]');
  // A seek sent while an edit rebuilds the renderer can be dropped, so it
  // is sent again until the preview reports the frame.
  const seek = async (f) => {
    for (let attempt = 0; ; attempt++) {
      await page
        .getByRole("slider", { name: "Playhead", exact: true })
        .fill(String(f));
      try {
        await page.waitForFunction(
          (f) =>
            document.querySelector('canvas[aria-label="Director preview"]')
              .dataset.frame === String(f),
          f,
          { timeout: 15000 },
        );
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  };
  const pixels = () =>
    preview.evaluate((c) =>
      Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data),
    );
  const save = async (name) => {
    const png = await preview.evaluate(
      (c) => c.toDataURL("image/png").split(",")[1],
    );
    await writeFile(`${out}/${name}.png`, Buffer.from(png, "base64"));
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // The cut as it was, through the same renderer, for the comparison.
  await page.goto(`${base}/director?example=studio&workspace=editor`);
  await ready();
  await page
    .locator('.director input[accept=".zip,.json"]')
    .setInputFiles(`${out}/baked.zip`);
  await ready();
  // An old bundle opens with the editable card over its baked one
  // (docs/dimensions-mix.md#projects-saved-before-the-editable-card); Undo
  // gives back the bundle as saved, the baked card on top.
  await page
    .getByText(/The end card is now the editable End card layer/)
    .first()
    .waitFor({ timeout: 15000 });
  await seek(554);
  await save("upgraded-554");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  console.log("PASS an old bundle opens upgraded, and Undo restores it");
  for (const f of FRAMES) {
    await seek(f);
    await save(`baked-${f}`);
  }

  await page.goto(`${base}/director?example=dimensions-mix&workspace=editor`);
  await ready();
  const at = {};
  for (const f of FRAMES) {
    await seek(f);
    at[f] = await pixels();
    await save(`editable-${f}`);
  }
  // The pixel face is the bundled file, not only a font on this computer.
  await seek(345);
  const bundled = await page.evaluate(() =>
    [...document.fonts].some(
      (f) =>
        f.family.replace(/"/g, "") === "Nokia Cellphone FC" &&
        f.status === "loaded",
    ),
  );
  assert.ok(bundled, "the bundled Nokia Cellphone FC loads");
  await save("editable-345");
  console.log("PASS the bundled Nokia Cellphone FC loads for the title slam");
  // Out of order, and from a fresh build: the same pixels.
  for (const f of [554, 453, 520, 453]) {
    await seek(f);
    assert.ok(same(at[f], await pixels()), `frame ${f} changed on a re-seek`);
  }
  console.log("PASS 453 → 520 → 554 → 453 → 520 → 453 draw identical pixels");

  for (const f of FRAMES) {
    const a = rgba(`${out}/baked-${f}.png`);
    const b = rgba(`${out}/editable-${f}.png`);
    console.log(
      `frame ${f}: editable vs baked PSNR ${psnr(a, b).toFixed(2)} dB`,
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      `${out}/baked-${f}.png`,
      "-i",
      `${out}/editable-${f}.png`,
      "-filter_complex",
      "hstack",
      `${out}/compare-${f}.png`,
    ]);
  }

  // The words are parameters: change the title in the inspector.
  await page
    .getByRole("button", {
      name: "Select End card · produced by Genobi 2026",
      exact: true,
    })
    .click();
  const inspector = page.getByRole("button", {
    name: "Show inspector",
    exact: true,
  });
  if (await inspector.isVisible()) await inspector.click();
  const title = page.getByLabel("title", { exact: true });
  await title.fill("KOSHIMAZAKI");
  await title.press("Tab");
  await ready();
  await seek(554);
  await save("edited-554");
  assert.ok(!same(at[554], await pixels()), "the edited title shows");
  console.log("PASS the inspector's title field re-renders the card");

  // Render MP4: the card is in the export and the cut keeps 555 frames.
  await page.goto(`${base}/director?example=dimensions-mix&workspace=editor`);
  await ready();
  await seek(554);
  const preview554 = await pixels();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page.getByText(/^Render ready · MP4/).waitFor({ timeout: 10 * 60000 });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /^Download video/ }).click();
  await (await download).saveAs(`${out}/render.mp4`);
  const frames = execFileSync("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=nb_read_frames",
    "-of",
    "csv=p=0",
    `${out}/render.mp4`,
  ])
    .toString()
    .trim();
  assert.equal(frames, "555");
  const exported = rgba(`${out}/render.mp4`, 554);
  const p = psnr(Uint8Array.from(preview554), exported);
  assert.ok(p > 32, `frame 554: preview/export PSNR ${p}`);
  console.log(
    `PASS Render MP4: 555 frames, frame 554 preview/export PSNR ${p.toFixed(2)} dB`,
  );
  assert.deepEqual(errors, []);
  console.log(`Frames and comparisons in ${out}`);
} finally {
  await browser.close();
}
