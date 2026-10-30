// The Genobi teaser's studio footage (docs/genobi-teaser.md#the-footage):
// drives the studio in headless Chrome and records each shot through the
// DevTools screencast, then encodes it as a silent 24 fps H.264 MP4 under
// public/media/director-templates/genobi-teaser/. Nothing is generated or
// paid for: every POST that could spend is aborted before it leaves the
// page, and the balance readout is a stub. Cursor, clicks, zooms and
// highlights are not in the footage; they are overlay recipes in the cut,
// placed from the log this script writes for each shot
// (docs/genobi-teaser-footage.json: the time and the element's box, as
// fractions of the frame, of every move and click).
//
// Start your own local server first (never someone else's), with keys that
// cannot spend, for example:
//   COMFY_API_KEY=comfyui-capture-only BFL_API_KEY=bfl-capture-only \
//     PORT=4317 node --import tsx server/index.ts
// then: TEASER_URL=http://127.0.0.1:4317 node scripts/capture-genobi-teaser.mjs [shot…]
// Needs Chrome and FFmpeg. Raw frames go to .local/genobi-teaser/.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { shots } from "./genobi-teaser-shots.mjs";
import { CRF_FLOOR, MAX_BYTES, sizeStep } from "./lib/capture-size.mjs";

const base = process.env.TEASER_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Capture from a local server",
);
const RAW = ".local/genobi-teaser";
const OUT = "public/media/director-templates/genobi-teaser";
const FPS = 24;
// The page is 1440 × 810 CSS pixels at 8/3 device pixels: 3840 × 2160 frames,
// so a 2× camera move on a 1920 × 1080 render still has native detail.
// The screencast ignores an emulated scale, so the window itself is scaled;
// headless Chrome's window is 87 px taller than its page.
const VIEW = { width: 1440, height: 810 };
const SCALE = 8 / 3;
/** The smallest frame a take may have, and its encode (see `encode`). */
const TARGET = { width: 3840, height: 2160 };
const CRF = Number(process.env.TEASER_CRF ?? 18);
const WINDOW = [
  `--window-size=${VIEW.width},${VIEW.height + 87}`,
  `--force-device-scale-factor=${SCALE}`,
];
const wanted = process.argv.slice(2);
// The studio must run the branch being cut, so its cards and library are
// current: print the commit the takes are recorded from.
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"])
  .toString()
  .trim();
const dirty = execFileSync("git", [
  "status",
  "--porcelain",
  "--",
  "src",
  "shared",
  "public",
])
  .toString()
  .trim();
console.log(
  `Recording from ${head}${dirty ? " with uncommitted studio changes" : ""}; the studio at ${base} must be serving this checkout.`,
);
// Every shot's log, kept across runs that redo only some shots.
const LOGS = "docs/genobi-teaser-footage.json";
const logs = JSON.parse(await readFile(LOGS, "utf8").catch(() => "{}"));

/** Records the page through the screencast; frames keep their wall time. */
async function recorder(page, dir) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `${dir}/f${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, at: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, "base64")));
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    maxWidth: VIEW.width * SCALE,
    maxHeight: VIEW.height * SCALE,
    everyNthFrame: 1,
  });
  return {
    frames,
    async stop() {
      await cdp.send("Page.stopScreencast");
      await Promise.all(writes);
    },
  };
}

/** Samples the frames at 24 fps (the newest frame at or before each tick). */
async function encode(name, frames, start, seconds) {
  const seq = `${RAW}/${name}/seq`;
  await rm(seq, { recursive: true, force: true });
  await mkdir(seq, { recursive: true });
  let k = 0;
  const count = Math.round(seconds * FPS);
  for (let i = 0; i < count; i++) {
    const t = start + i / FPS;
    while (k + 1 < frames.length && frames[k + 1].at <= t) k++;
    await symlink(
      `${process.cwd()}/${frames[k].file}`,
      `${seq}/${String(i).padStart(5, "0")}.jpg`,
    );
  }
  // Recording quality is the default, not an option (the owner, 30 October
  // 2026): every take is checked at the full 3840 × 2160 and encoded once,
  // near-lossless (CRF 18), from the screencast's own frames. Zooms crop the
  // take, so a soft or low-resolution take turns into artifacts on screen.
  // Only when a file would pass the 25 MiB Pages limit does the CRF rise.
  const [w, h] = execFileSync("ffprobe", [
    ...["-v", "error", "-select_streams", "v:0"],
    ...["-show_entries", "stream=width,height", "-of", "csv=p=0"],
    `${seq}/00000.jpg`,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  assert.ok(
    w >= TARGET.width && h >= TARGET.height,
    `${name}: frames are ${w} × ${h}, below ${TARGET.width} × ${TARGET.height}; refusing a low-resolution take`,
  );
  const file = `${OUT}/${name}.mp4`;
  for (let crf = CRF; ; crf += 1) {
    execFileSync("ffmpeg", [
      ...["-v", "error", "-y", "-framerate", String(FPS)],
      ...["-i", `${seq}/%05d.jpg`],
      ...["-c:v", "libx264", "-preset", "slow", "-crf", String(crf)],
      ...["-pix_fmt", "yuv420p", "-g", String(FPS), "-an"],
      ...["-movflags", "+faststart", file],
    ]);
    const bytes = (await stat(file)).size;
    const step = sizeStep(bytes, crf);
    if (step === "keep") {
      console.log(`${name}: ${w} × ${h}, CRF ${crf}`);
      break;
    }
    if (step === "fail") {
      await rm(file, { force: true });
      throw new Error(
        `${name}: still ${(bytes / 1048576).toFixed(1)} MiB at CRF ${crf}, over the ${MAX_BYTES / 1048576} MiB limit; the CRF floor (${CRF_FLOOR}) is reached and the file was removed. Shorten the take (its \`seconds\`) or record it smaller on purpose.`,
      );
    }
  }
  return count;
}

const browser = await chromium.launch({
  channel: process.env.TEASER_BROWSER ?? "chrome",
  headless: true,
  args: WINDOW,
});
await mkdir(OUT, { recursive: true });
try {
  for (const shot of shots) {
    if (wanted.length && !wanted.includes(shot.name)) continue;
    const dir = `${RAW}/${shot.name}`;
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    const inner = await page.evaluate(() => [innerWidth, innerHeight]);
    assert.deepEqual(
      inner,
      [VIEW.width, VIEW.height],
      "the page is 1440 × 810",
    );
    await page.addInitScript(() => {
      localStorage.setItem("genobi.startup-guide.v1", "seen");
    });
    // Balances to show; no request reaches a provider for them. One
    // `/api/credits?provider=all` read answers every key slot ({balances});
    // a single provider's read answers that slot alone.
    await page.route("**/api/credits*", (r) => {
      const checkedAt = new Date().toISOString();
      const rows = [
        { provider: "comfy", credits: 4210, checkedAt },
        { provider: "bfl", credits: 1830, checkedAt },
      ];
      const asked = new URL(r.request().url()).searchParams.get("provider");
      return r.fulfill({
        json:
          asked === "all"
            ? { balances: rows }
            : (rows.find((row) => row.provider === asked) ?? rows[0]),
      });
    });
    // Nothing that could spend leaves the page.
    await page.route("**/api/**", (r) => {
      const { pathname } = new URL(r.request().url());
      if (
        r.request().method() !== "GET" &&
        /^\/api\/(jobs|chains\/[^/]+\/approve|agent\/sessions\/.+\/approve)/.test(
          pathname,
        )
      ) {
        console.warn(`blocked ${r.request().method()} ${pathname}`);
        return r.abort();
      }
      return r.fallback();
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await shot.setup(page, base);
    const rec = await recorder(page, dir);
    const t0 = Date.now() / 1000;
    const log = [];
    const at = () => Math.round((Date.now() / 1000 - t0) * 1000) / 1000;
    // Moves the pointer to an element (or a point) and logs where it went.
    const box = async (target) => {
      await target.scrollIntoViewIfNeeded();
      const b = await target.boundingBox();
      assert(b, "the target is on screen");
      return {
        x: b.x / VIEW.width,
        y: b.y / VIEW.height,
        w: b.width / VIEW.width,
        h: b.height / VIEW.height,
      };
    };
    const act = {
      page,
      base,
      wait: (ms) => page.waitForTimeout(ms),
      mark: (label) => log.push({ t: at(), kind: "mark", label }),
      // A click the page takes another way (a hidden native select).
      logClick: (rect, label) =>
        log.push({ t: at(), kind: "click", label, rect }),
      async move(target, label, steps = 18) {
        const r = typeof target.x === "number" ? target : await box(target);
        const x = (r.x + (r.w ?? 0) / 2) * VIEW.width;
        const y = (r.y + (r.h ?? 0) / 2) * VIEW.height;
        await page.mouse.move(x, y, { steps });
        log.push({ t: at(), kind: "move", label, rect: r });
        return r;
      },
      async click(target, label) {
        const r = await act.move(target, label);
        log.push({ t: at(), kind: "click", label, rect: r });
        await page.mouse.down();
        await page.mouse.up();
        return r;
      },
      async type(target, text, label, delay = 45) {
        await act.click(target, label);
        await page.keyboard.type(text, { delay });
      },
      async wheel(dy, steps = 12) {
        for (let i = 0; i < steps; i++) {
          await page.mouse.wheel(0, dy / steps);
          await page.waitForTimeout(40);
        }
      },
    };
    await act.wait(300);
    await shot.run(act);
    await act.wait(400);
    await rec.stop();
    const seconds = Math.min(shot.seconds, at());
    const count = await encode(shot.name, rec.frames, t0, seconds);
    logs[shot.name] = { seconds: count / FPS, log };
    await writeFile(LOGS, `${JSON.stringify(logs, null, 1)}\n`);
    console.log(
      `${shot.name}: ${count} frames (${(count / FPS).toFixed(2)} s) from ${rec.frames.length} screencast frames${errors.length ? `, page errors: ${errors.join(" | ")}` : ""}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
