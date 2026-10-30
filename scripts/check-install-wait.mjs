// Setup's install wait (Box 1.10) against a local studio: the summary step
// with voice installing and with Hermes' profile being set up, at desktop and
// phone widths, without and with an intro video address, and before either
// starts. Every API request is a fixture: nothing installs, downloads or
// spends, and the video address is never fetched.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { names, overflow } from "./lib/a11y-audit.mjs";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-install-wait";
await mkdir(output, { recursive: true });
const VIDEO = "/fixture-only/intro.mp4";
const busy = {
  phase: "download",
  bytes: 640_000_000,
  busy: true,
  steps: { environment: "done", check: "done", download: "running" },
};
const hermesRunning = {
  phase: "running",
  steps: { check: "done", create: "running" },
};

/** The summary step, restored from this tab's setup session. */
const draft = (agent) => ({
  version: 1,
  step: 6,
  draft: {
    selection: { weights: "open-weights", agent, execution: "local" },
    voice: agent === "claude",
  },
});

async function scenario(browser, { width, kind, video, start }) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: kind === "voice" ? "no-preference" : "reduce",
  });
  const errors = [];
  const writes = [];
  await context.route(`**${VIDEO}`, (route) => route.abort());
  await context.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET") writes.push(`${method} ${path}`);
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/voice/status")
      return json({ available: false, maxSeconds: 180 });
    if (path === "/api/voice/setup" && method === "GET")
      return json({
        token: "fixture-only",
        model: "Qwen3-ASR-0.6B",
        bytes: 1_880_560_703,
        folder: "/tmp/fixture-only",
        browse: false,
        supported: true,
        state: { phase: "idle", bytes: 0, busy: false },
      });
    if (path === "/api/voice/setup" && method === "POST")
      return json(busy, 202);
    if (path === "/api/voice/setup/progress") return json(busy);
    if (path === "/api/voice/setup/found") return json({ models: [] });
    if (path === "/api/settings/intro-video")
      return json({ video: video ? VIDEO : null });
    if (path === "/api/agent/status")
      return json(
        kind === "hermes"
          ? {
              available: false,
              runner: "hermes",
              setup: "hermes-profile",
              message: "Hermes' genobi profile is not set up yet.",
            }
          : { available: false, message: "Fixture: no agent." },
      );
    if (path === "/api/agent/sign-in") return json({ harnesses: [] });
    if (path === "/api/agent/hermes-profile")
      return json(hermesRunning, method === "POST" ? 202 : 200);
    if (method !== "GET") return route.abort();
    return json({ jobs: [], sources: [] });
  });
  await context.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [
      "genobi-setup-draft-v1",
      JSON.stringify(draft(kind === "voice" ? "claude" : "hermes")),
    ],
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  const dialog = page.locator("dialog.genobi-setup");
  await dialog.getByText("READY WHEN YOU ARE").waitFor();
  const label = `${kind}-${width}-${video ? "video" : "novideo"}`;
  if (!start) {
    assert.equal(await dialog.locator(".install-wait").count(), 0);
    await page.screenshot({ path: `${output}/${label}-before.png` });
    await context.close();
    return;
  }
  if (kind === "voice")
    await dialog.getByRole("button", { name: "Save & set up" }).click();
  else await dialog.getByRole("button", { name: "Set up Hermes" }).click();
  const wait = dialog.locator(".install-wait");
  await wait.waitFor();
  // The welcome first, the rain hidden and faint, the spinner on the step.
  assert.match(
    await wait.locator(".install-messages__text").innerText(),
    /^Genobi is an open-source video studio/,
  );
  assert.equal(
    await wait.locator(".install-wait__rain").getAttribute("aria-hidden"),
    "true",
  );
  const opacity = Number(
    await wait
      .locator(".install-wait__rain")
      .evaluate((node) => getComputedStyle(node).opacity),
  );
  assert(opacity > 0 && opacity <= 0.1, `rain opacity ${opacity}`);
  // The step list follows the installer's first answer.
  await wait.locator("li[data-state=running] .cli-spinner").waitFor();
  await wait.screenshot({ path: `${output}/${label}-welcome.png` });
  await wait.getByRole("button", { name: "Next" }).click();
  assert.doesNotMatch(
    await wait.locator(".install-messages__text").innerText(),
    /^Genobi is/,
  );
  assert.equal(await wait.locator("video").count(), video ? 1 : 0);
  if (video) {
    const player = wait.locator("video");
    assert.equal(await player.getAttribute("autoplay"), null);
    assert.equal(await player.evaluate((node) => node.paused), true);
  }
  assert(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth));
  assert.deepEqual(await overflow(page), []);
  assert.deepEqual(await names(page), []);
  await page.screenshot({ path: `${output}/${label}.png` });
  await wait.screenshot({ path: `${output}/${label}-panel.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(
    writes,
    kind === "voice"
      ? ["POST /api/voice/setup"]
      : ["POST /api/agent/hermes-profile"],
  );
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390])
    for (const kind of ["voice", "hermes"]) {
      await scenario(browser, { width, kind, video: false, start: false });
      await scenario(browser, { width, kind, video: false, start: true });
      await scenario(browser, { width, kind, video: true, start: true });
    }
  console.log(
    `Install wait: voice and Hermes, desktop and phone, with and without a video; screenshots in ${output}.`,
  );
} finally {
  await browser.close();
}
