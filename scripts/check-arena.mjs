/**
 * Arena's generator and comparison window, at 1440×1000 and 390×844. Local
 * only: every API route is a fixture, quotes are answered here and the spend
 * confirmation is dismissed, so nothing is submitted. Run against Vite:
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-arena.mjs
 * Screenshots go to .local/arena-check/.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { names, overflow, targets } from "./lib/a11y-audit.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/arena-check";
await mkdir(output, { recursive: true });
const clip = await readFile("public/media/library-01.mp4");
const hash = (n) => String(n).repeat(64);
const id = "00000000-0000-4000-8000-0000000000a1";
const media = [1, 2, 3].map((n) => ({
  hash: hash(n),
  kind: "video",
  label: `clip-${n}.mp4`,
  contentType: "video/mp4",
  width: 1280,
  height: 720,
  duration: 5,
  bytes: clip.length,
}));
const fixture = () => ({
  id,
  revision: 3,
  updatedAt: "2026-10-27T10:00:00.000Z",
  title: "Lighthouse",
  prompt: "",
  notes: "",
  media,
  slots: ["rgb", "canny", "depth"].map((slot, i) => ({
    id: slot,
    label: ["RGB", "Canny", "Depth"][i],
    // The owner's case: a typed name already in the field.
    model: i === 0 ? "LTX 2.5" : "",
    workflow: "",
    guide: slot,
    prompt: "",
    notes: "",
    status: "ready",
    media: hash(i + 1),
    ...(i === 0 ? { run: { entry: "ltx-2-5-fast" } } : {}),
  })),
});
const browser = await chromium.launch({
  channel:
    process.env.DIRECTOR_BROWSER === "bundled"
      ? undefined
      : (process.env.DIRECTOR_BROWSER ?? "chrome"),
  headless: true,
});
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(name);
};

async function run(viewportName, viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewportName === "phone",
    reducedMotion: viewportName === "phone" ? "reduce" : "no-preference",
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  let arena = fixture();
  const quotes = [],
    submissions = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.startsWith(`/api/arena/${id}/files/`))
      return route.fulfill({ body: clip, contentType: "video/mp4" });
    if (path === "/api/arena" && method === "GET")
      return route.fulfill({ json: { arenas: [arena] } });
    if (path === `/api/arena/${id}` && method === "GET")
      return route.fulfill({ json: { arena } });
    if (path === `/api/arena/${id}` && method === "POST") {
      const { draft } = request.postDataJSON();
      arena = { ...arena, ...draft, revision: arena.revision + 1 };
      return route.fulfill({ json: { arena } });
    }
    if (path === "/api/quotes" && method === "POST") {
      const input = request.postDataJSON();
      quotes.push(input);
      return route.fulfill({
        status: 201,
        json: {
          quote: {
            id: crypto.randomUUID(),
            estimateUsd: 0.25 * quotes.length,
            expiresAt: "2026-10-27T10:10:00.000Z",
          },
        },
      });
    }
    if (method !== "GET") {
      if (path === "/api/jobs") submissions.push(path);
      return route.abort();
    }
    const fixtures = {
      "/api/health": { ok: true, hosted: false, hasServerKey: true },
      "/api/history": { jobs: [], sources: [] },
      "/api/chains": { chains: [] },
      "/api/agent/runners": { runners: [] },
      "/api/agent/sessions": { session: null },
      "/api/activity": { enabled: false, events: [] },
    };
    return route.fulfill({ json: fixtures[path] ?? {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const tag = (name) => `${viewportName}: ${name}`;
  await page.goto(base);
  await page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Project Tools", exact: true })
    .click();
  const generator = page.getByRole("region", { name: "Arena generator" });
  await generator.waitFor({ timeout: 15000 });

  // 2. The model menu takes effect at once, even with a typed name.
  const trigger = page.locator("#arena-gen-model-rgb");
  await trigger.click();
  await page
    .getByRole("option", { name: /FLUX 3 · Text to video/ })
    .first()
    .click();
  check(
    tag("generator model menu sets the model immediately"),
    (await trigger.innerText()).includes("FLUX 3 · Text to video"),
  );
  const card = page.locator(".arena-card").first();
  await card.locator("summary", { hasText: "Prompt & settings" }).click();
  const cardMenu = page.locator("#arena-card-model-rgb");
  await cardMenu.click();
  await page
    .getByRole("option", { name: /LTX-2.5 Pro/ })
    .first()
    .click();
  check(
    tag("card model menu replaces a typed name"),
    (await cardMenu.innerText()).includes("LTX-2.5 Pro") &&
      (await card.getByLabel("Recorded as").inputValue()).includes(
        "LTX-2.5 Pro",
      ),
  );
  for (const [slot, name] of [
    ["canny", /FLUX 3 · Text to video/],
    ["depth", /^FLUX 3 · Image Router/],
  ]) {
    await page.locator(`#arena-gen-model-${slot}`).click();
    await page.getByRole("option", { name }).first().click();
  }

  // 3. A load's own prompt is used for its run; the others use the main one.
  await generator.getByLabel("Main prompt").fill("A lighthouse at dusk.");
  await card.getByLabel("Prompt override").fill("A storm at noon.");
  check(
    tag("row says which prompt a load uses"),
    (await generator.locator(".arena-loads li").first().innerText()).includes(
      "Own prompt",
    ),
  );
  await page.screenshot({ path: `${output}/${viewportName}-generator.png` });

  // 1. Generate quotes each load, then asks once; dismissing sends nothing.
  // Every load already has a result: Generate all runs none of them.
  const generateAll = generator
    .getByRole("button", { name: /^Generate/ })
    .last();
  check(
    tag("Generate all skips loads with a result"),
    (await generateAll.isDisabled()) && quotes.length === 0,
    `${quotes.length} quotes`,
  );
  // A row's Generate is the deliberate re-run, and says what it replaces.
  for (const label of ["RGB", "Canny", "Depth"]) {
    await generator
      .getByRole("button", { name: `Generate ${label}`, exact: true })
      .click();
    await page.waitForTimeout(600);
  }
  check(tag("one quote per re-run"), quotes.length === 3, `${quotes.length}`);
  check(
    tag("each quote carries its own model and prompt"),
    JSON.stringify(quotes.map((q) => [q.model, q.description])) ===
      JSON.stringify([
        ["ltx-2.5-pro", "A storm at noon."],
        ["flux-3", "A lighthouse at dusk."],
        ["flux-3", "A lighthouse at dusk."],
      ]),
  );
  check(
    tag("re-run confirmation says it replaces the result"),
    dialogs.length === 3 &&
      ["RGB", "Canny", "Depth"].every(
        (l, i) =>
          dialogs[i].includes(l) && dialogs[i].includes("replaces its result"),
      ),
  );
  check(tag("nothing submitted"), submissions.length === 0);

  // 5 and 6. Enlarge: solo play, movable and resizable.
  await page.getByRole("button", { name: "Enlarge comparison" }).click();
  const dialog = page.locator("dialog.arena-lightbox");
  await dialog.waitFor();
  await page.waitForTimeout(800);
  const box = async () => dialog.boundingBox();
  if (viewportName === "phone") {
    const b = await box();
    check(
      tag("window fills the phone screen"),
      Math.round(b.width) === viewport.width && Math.round(b.x) === 0,
    );
    check(
      tag("no move handle on a phone"),
      (await dialog.locator(".arena-window-move").count()) === 0,
    );
  } else {
    const before = await box();
    const bar = dialog.locator(".arena-window-bar h2");
    const at = await bar.boundingBox();
    // Shrink first so there is room to move it.
    const resize = dialog.locator(".arena-window-resize");
    const r = await resize.boundingBox();
    await page.mouse.move(r.x + 5, r.y + 5);
    await page.mouse.down();
    await page.mouse.move(r.x - 395, r.y - 295, { steps: 5 });
    await page.mouse.up();
    const resized = await box();
    check(
      tag("resize handle resizes"),
      Math.abs(before.width - resized.width - 400) < 3 &&
        Math.abs(before.height - resized.height - 300) < 3,
      `${Math.round(resized.width)}×${Math.round(resized.height)}`,
    );
    await page.mouse.move(at.x + 10, at.y + 5);
    await page.mouse.down();
    await page.mouse.move(at.x + 130, at.y + 85, { steps: 5 });
    await page.mouse.up();
    const moved = await box();
    check(
      tag("title bar drags the window"),
      Math.abs(moved.x - resized.x - 120) < 3 &&
        Math.abs(moved.y - resized.y - 80) < 3,
    );
    await dialog.locator(".arena-window-move").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowUp");
    const keyed = await box();
    check(
      tag("arrow keys move the window"),
      Math.abs(moved.x - keyed.x - 16) < 2 &&
        Math.abs(moved.y - keyed.y - 64) < 2,
    );
    const handle = await dialog.locator(".arena-window-move").boundingBox();
    await page.mouse.move(handle.x + 8, handle.y + 8);
    await page.mouse.down();
    await page.mouse.move(handle.x - 32, handle.y - 12, { steps: 4 });
    await page.mouse.up();
    const dragged = await box();
    check(
      tag("move handle drags the window once"),
      Math.abs(keyed.x - dragged.x - 40) < 2 &&
        Math.abs(keyed.y - dragged.y - 20) < 2,
    );
    await dialog.locator(".arena-window-resize").focus();
    await page.keyboard.press("ArrowRight");
    check(
      tag("arrow keys resize the window"),
      Math.abs((await box()).width - dragged.width - 16) < 2,
    );
  }
  await dialog
    .getByRole("button", { name: "Play RGB alone" })
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  const states = await dialog
    .locator("video")
    .evaluateAll((videos) => videos.map((v) => !v.paused));
  check(
    tag("solo plays one result alone"),
    states[0] === true && states.slice(1).every((s) => !s),
    JSON.stringify(states),
  );
  await dialog.getByRole("button", { name: "Play all" }).click();
  await page.waitForTimeout(600);
  const all = await dialog
    .locator("video")
    .evaluateAll((videos) => videos.map((v) => !v.paused));
  check(
    tag("Play all plays every result"),
    all.every(Boolean),
    JSON.stringify(all),
  );
  await page.screenshot({ path: `${output}/${viewportName}-window.png` });
  const named = await names(page);
  check(tag("window controls are named"), !named.length, named.join("; "));
  if (viewportName === "phone") {
    const small = await targets(page);
    check(tag("window tap targets ≥ 24 px"), !small.length, small.join("; "));
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const arenaNames = await names(page);
  check(
    tag("Arena controls are named"),
    !arenaNames.length,
    arenaNames.join("; "),
  );
  if (viewportName === "phone") {
    const small = await targets(page);
    check(tag("Arena tap targets ≥ 24 px"), !small.length, small.join("; "));
  }
  const wide = await overflow(page);
  check(tag("no horizontal overflow"), !wide.length, wide.join("; "));
  check(tag("no page errors"), !errors.length, errors.join("; "));
  await page.screenshot({
    path: `${output}/${viewportName}-arena.png`,
    fullPage: true,
  });
  await context.close();
}

try {
  await run("desktop", { width: 1440, height: 1000 });
  await run("phone", { width: 390, height: 844 });
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`${failures.length} Arena check(s) failed.`);
  process.exit(1);
}
console.log("Arena checks passed.");
