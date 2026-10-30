/**
 * The Start Genobi dialog's Terminal-or-bubble step, in a browser:
 *   SPAWN_URL=http://127.0.0.1:5488 node scripts/check-spawn-dialog.mjs
 * against a frontend-only Vite server (`npx vite --port 5488`). The dialog is
 * mounted inside the header's wordmark, which does not wrap; its text must
 * wrap anyway, with no sideways scroll, at desktop and phone widths and in
 * each theme. Escape closes it and nothing starts. Agent routes are answered
 * by the page itself, so no harness or model runs.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.SPAWN_URL ?? "http://127.0.0.1:5488";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local studio",
);
const output = process.env.STUDIO_EVIDENCE ?? ".local/spawn-dialog";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
let starts = 0;

async function open(width, theme, hosted = false) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  // The first-run setup guide would cover the page: mark it seen.
  await page.addInitScript((t) => {
    localStorage.setItem("genobi.startup-guide.v1", "seen");
    localStorage.setItem("genobi-setup-seen-v1", "1");
    localStorage.setItem("flux-studio-lite-theme", t);
  }, theme);
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  await page.route("**/api/agent/**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/agent/status")
      return route.fulfill({
        json: hosted
          ? { available: false, paired: false }
          : { available: true, runner: "claude", terminal: true },
      });
    if (url.pathname === "/api/agent/sign-in")
      return route.fulfill({
        json: {
          harnesses: [
            {
              runner: "claude",
              name: "Claude Code",
              installed: true,
              signedIn: true,
            },
          ],
        },
      });
    if (url.pathname === "/api/agent/sessions" && method === "POST") {
      starts++;
      return route.fulfill({ status: 500, json: { error: "Not in a check." } });
    }
    if (url.pathname === "/api/agent/sessions")
      return route.fulfill({ json: { session: null } });
    return route.fulfill({ status: 404, json: { error: "Not here." } });
  });
  await page.route("**/api/settings/agent-runner", (route) =>
    route.fulfill({
      json: {
        saved: { runner: "claude" },
        environment: false,
        hermesProvider: true,
      },
    }),
  );
  if (hosted)
    await page.route("**/api/runner/status", (route) =>
      route.fulfill({ json: { available: false, paired: false } }),
    );
  await page.goto(base);
  return page;
}

try {
  for (const theme of ["blackstone-lime", "signal"]) {
    for (const width of [1440, 390]) {
      const page = await open(width, theme);
      await page.locator(".agent-launcher").first().click();
      await page.getByRole("button", { name: "Start Genobi" }).click();
      const dialog = page.getByRole("dialog", { name: "Start Genobi" });
      const terminal = dialog.getByRole("button", { name: "Open in Terminal" });
      await terminal.waitFor();
      assert.equal(
        await terminal.evaluate((e) => e === document.activeElement),
        true,
        `Open in Terminal has focus at ${width}`,
      );
      const fit = await dialog.evaluate((node) => {
        const wide = [node, ...node.querySelectorAll("*")].filter(
          (e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0,
        );
        const r = node.getBoundingClientRect();
        return {
          wide: wide.map((e) => e.className || e.tagName),
          width: r.width,
          left: r.left,
          right: r.right,
          viewport: window.innerWidth,
        };
      });
      assert.deepEqual(fit.wide, [], `No sideways scroll at ${width}`);
      assert.ok(
        fit.left >= 0 && fit.right <= fit.viewport,
        `The dialog fits the window at ${width}`,
      );
      if (width === 1440) assert.equal(Math.round(fit.width), 560);
      const [a, b] = await Promise.all([
        terminal.boundingBox(),
        dialog
          .getByRole("button", { name: "Run in the bubble instead" })
          .boundingBox(),
      ]);
      if (width === 390)
        assert.ok(b.y >= a.y + a.height, "The buttons stack on a phone");
      await page.screenshot({
        path: `${output}/spawn-dialog-${theme}-${width}.png`,
      });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.close();
    }
  }
  for (const width of [1440, 390]) {
    const page = await open(width, "blackstone-lime", true);
    await page.locator(".agent-launcher").first().click();
    await page.getByRole("button", { name: "Start Genobi" }).click();
    const dialog = page.getByRole("dialog", { name: "Start Genobi" });
    await dialog
      .getByText("Pair hosted and local Genobi", { exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("link", { name: /Set up the local studio/ })
        .isVisible(),
      true,
    );
    assert.equal(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      true,
      `Hosted pairing fits at ${width}`,
    );
    await page.screenshot({ path: `${output}/spawn-hosted-${width}.png` });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.close();
  }
  assert.equal(starts, 0, "Nothing started");
  assert.deepEqual(errors, []);
  console.log(
    `Start Genobi: local chooser and hosted pairing fit at 1440 and 390.`,
  );
} finally {
  await browser.close();
}
