/**
 * The local key dialogue in a real browser, on fixtures only: no request
 * leaves the page, no key is saved and nothing is submitted. Run against a
 * frontend-only Vite server:
 *   KEYS_URL=http://127.0.0.1:5487 node scripts/check-key-dialog.mjs
 *
 * 1. Replacing a connected Keychain key checks the account again: the old
 *    balance and the verified dot go, and a refused replacement says so.
 * 2. A paused chain that could not be priced without a key is read again
 *    when a key is saved on the server, though the page key stays empty.
 * 3. A run started on a page key, still waiting, can be handed that key again
 *    from the Keychain dialogue, and its next poll carries it.
 * 0. The Keychain slots and the run location both sit in the dialogue.
 * 4. A key another window saved, or replaced, after this page loaded is
 *    picked up when the dialogue opens and reads each slot's revision: the
 *    page connects, and the account is checked again.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.KEYS_URL ?? "http://127.0.0.1:5487";
// Set KEYS_EVIDENCE to a folder to keep screenshots of the dialogue.
const evidence = process.env.KEYS_EVIDENCE;
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
// Fixture keys only; neither is a real credential.
const REPLACEMENT = "comfyui-fixture-replacement-key";
const PAGE_KEY = "comfyui-fixture-page-key-0001";
const now = new Date().toISOString();
const job = {
  id: "fixture-byo-run",
  generator: "video",
  description: "A ceramic vessel.",
  prompt: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
  aspectRatio: "16:9",
  model: "flux-3",
  status: "Generating",
  createdAt: now,
  updatedAt: now,
  costEstimateUsd: 0.85,
  keyMode: "byo",
};
const { id: _id, status: _status, ...input } = job;
const chain = {
  id: "fixture-chain",
  status: "paused",
  createdAt: now,
  updatedAt: now,
  pausedAt: 0,
  stages: [{ status: "paused", input }],
};
const keys = {
  keychain: true,
  comfy: { connected: true, source: "keychain", revision: 1 },
  bfl: { connected: false, revision: 0 },
};
const seen = {
  credits: 0,
  saved: 0,
  pollKeys: [],
  chainReads: 0,
  chainReadsAtSave: 0,
  dashboardImports: 0,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() =>
  localStorage.setItem("genobi-setup-seen-v1", "1"),
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (request.method() === "PUT" && path === "/api/keys/comfy") {
    seen.saved++;
    seen.chainReadsAtSave = seen.chainReads;
    keys.comfy.revision++;
    return route.fulfill({ json: { keys } });
  }
  if (request.method() === "PUT" && path === "/api/keys/bfl/dashboard") {
    seen.dashboardImports++;
    keys.bfl = { connected: true, source: "keychain", revision: 1 };
    assert.equal(
      request.postData(),
      null,
      "dashboard reuse sends no key from the browser",
    );
    return route.fulfill({ json: { keys } });
  }
  // No submission, quote or upload leaves this browser.
  if (request.method() !== "GET") return route.abort();
  if (path === "/api/health")
    return route.fulfill({
      json: { ok: true, hasServerKey: true, keysRevision: "1.0" },
    });
  if (path === "/api/keys") return route.fulfill({ json: { keys } });
  if (path === "/api/keys/bfl/dashboard")
    return route.fulfill({ json: { available: true } });
  if (path === "/api/agent/runners")
    return route.fulfill({ json: { runners: [] } });
  if (path === "/api/settings/run-location")
    return route.fulfill({
      json: {
        revision: 1,
        location: "cloud",
        label: "Comfy Cloud",
        source: "server",
        fixed: false,
        choices: ["local", "cloud"],
        local: { reachable: true, version: "0.3.99" },
        note: "",
      },
    });
  if (path === "/api/credits") {
    seen.credits++;
    // The first key holds $12.50; the replacement is refused by the provider.
    return seen.saved === 0
      ? route.fulfill({
          json: { credits: 1250, checkedAt: now, provider: "comfy" },
        })
      : route.fulfill({
          status: 401,
          json: { error: "The provider refused this key." },
        });
  }
  if (path === `/api/jobs/${job.id}`) {
    const sent = request.headers()["x-byo-key"];
    seen.pollKeys.push(sent === PAGE_KEY ? "page key" : sent ? "other" : "");
    return route.fulfill({
      json: sent ? { job } : { job, needsKey: true },
    });
  }
  // The chain paused with no quote because no key could price it.
  if (path === "/api/chains")
    return route.fulfill({ json: { chains: [chain] } });
  if (path === `/api/chains/${chain.id}`) {
    seen.chainReads++;
    return route.fulfill({ json: { chain, needsKey: true } });
  }
  if (path === "/api/history")
    return route.fulfill({ json: { jobs: [job], sources: [] } });
  return route.fulfill({ json: {} });
});

/**
 * A page that loaded before another window saved the first key
 * (`connectedAtLoad` false) or replaced the connected one (true). The new
 * key's account holds $9.00; the old one held $12.50.
 */
async function changedElsewhere(connectedAtLoad) {
  const other = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await other.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  other.on("pageerror", (e) => errors.push(e.message));
  let changed = false;
  await other.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") return route.abort();
    if (path === "/api/health")
      return route.fulfill({
        json: {
          ok: true,
          hasServerKey: connectedAtLoad,
          keysRevision: connectedAtLoad ? "1.0" : "0.0",
        },
      });
    if (path === "/api/keys") {
      // The other window's change is what this read reports.
      changed = true;
      const comfy = { connected: true, source: "keychain", revision: 2 };
      return route.fulfill({ json: { keys: { ...keys, comfy } } });
    }
    if (path === "/api/agent/runners")
      return route.fulfill({ json: { runners: [] } });
    if (path === "/api/credits")
      return route.fulfill({
        json: {
          credits: changed ? 900 : 1250,
          checkedAt: now,
          provider: "comfy",
        },
      });
    if (path === "/api/history")
      return route.fulfill({ json: { jobs: [], sources: [] } });
    return route.fulfill({ json: {} });
  });
  const account = other.locator("button.account-balance");
  await other.goto(`${base}/?workspace=camera`);
  if (connectedAtLoad)
    await account.filter({ hasText: "$12.50" }).waitFor({ timeout: 15_000 });
  await other
    .getByRole("button", {
      name: "Settings",
    })
    .first()
    .click();
  await other.locator("dialog.key-dialog #key-comfy").waitFor();
  await other.keyboard.press("Escape");
  await other
    .getByRole("button", { name: "Settings" })
    .waitFor({ timeout: 5_000 });
  await account.filter({ hasText: "$9.00" }).waitFor({ timeout: 5_000 });
  await other.close();
  console.log(
    connectedAtLoad
      ? "PASS a key replaced in another window is checked again"
      : "PASS a key saved in another window connects the page",
  );
}

const balance = page.locator("button.account-balance");
const keyButton = page.getByRole("button", { name: "Settings" });
const dialog = page.locator("dialog.key-dialog");
try {
  await changedElsewhere(false);
  await changedElsewhere(true);
  await page.goto(`${base}/?workspace=camera`);
  await balance.filter({ hasText: "$12.50" }).waitFor({ timeout: 15_000 });
  await page.locator(".connection-group .connection-dot.connected").waitFor();

  await keyButton.click();
  await dialog.waitFor();
  await dialog.locator("#key-comfy").waitFor();
  await dialog.locator("fieldset.run-location").waitFor({ timeout: 5_000 });
  assert.equal(
    await dialog.getByRole("radio", { name: /Local ComfyUI/ }).count(),
    1,
    "the run location offers Local ComfyUI",
  );
  if (evidence) await page.screenshot({ path: `${evidence}/desktop.png` });
  console.log(
    "PASS the Keychain slots and the run location share the dialogue",
  );
  await dialog.locator("#key-comfy").fill(REPLACEMENT);
  await dialog.getByRole("button", { name: "Replace key" }).click();
  await balance
    .filter({ hasText: "BALANCE UNAVAILABLE" })
    .waitFor({ timeout: 10_000 });
  assert.equal(seen.saved, 1, "the replacement was saved once");
  assert(seen.credits >= 2, "the replaced key's account was checked again");
  assert.equal(
    await page.locator(".connection-group .connection-dot.connected").count(),
    0,
    "a refused replacement is not shown as verified",
  );
  console.log("PASS a replaced key is checked again and its balance cleared");

  const chainDeadline = Date.now() + 5_000;
  while (seen.chainReads <= seen.chainReadsAtSave && Date.now() < chainDeadline)
    await page.waitForTimeout(100);
  assert(
    seen.chainReads > seen.chainReadsAtSave,
    "a paused chain waiting on a key is read again after a saved key change",
  );
  console.log("PASS a paused chain is priced again after a saved key change");

  const visit = dialog.locator("#visit-key");
  await visit.waitFor({ timeout: 5_000 });
  // The reconnection sits in the dialogue at phone width without overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  if (evidence) await page.screenshot({ path: `${evidence}/phone.png` });
  assert(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    "the dialogue does not overflow at 390 px",
  );
  await visit.fill(PAGE_KEY);
  await dialog.getByRole("button", { name: /Resume the run/ }).click();
  await dialog.waitFor({ state: "detached" });
  const deadline = Date.now() + 15_000;
  while (!seen.pollKeys.includes("page key") && Date.now() < deadline)
    await page.waitForTimeout(250);
  assert(
    seen.pollKeys.includes("page key"),
    `the waiting run is polled with its key (polls: ${seen.pollKeys.join(",") || "none"})`,
  );
  console.log("PASS a waiting page-key run resumes after reconnecting");
  assert.equal(
    seen.dashboardImports,
    0,
    "opening Settings never imports a key",
  );
  await keyButton.click();
  const reuse = dialog.getByRole("button", { name: "Use BFL Dashboard key" });
  await reuse.waitFor();
  await reuse.click();
  await dialog
    .locator(".key-slot")
    .filter({ has: page.locator("#key-bfl") })
    .getByText("Connected · saved in your Keychain", { exact: true })
    .waitFor();
  assert.equal(seen.dashboardImports, 1, "one explicit click imports once");
  assert(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    "the Dashboard key action fits at phone width",
  );
  console.log(
    "PASS Dashboard key reuse is explicit and passes no secret through the browser",
  );
  assert.deepEqual(errors, [], "no page errors");
} finally {
  await browser.close();
}
