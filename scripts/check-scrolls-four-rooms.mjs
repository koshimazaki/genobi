/**
 * The Four Rooms 3D storyboard in a real browser: loading its plan gives each
 * panel its own World Builder frame, Klein's open graph refuses it by panel,
 * and Fill panels on Klein · API quotes eight runs, each with that panel's
 * frame first. Quotes are answered by a page route; nothing is submitted.
 *
 *   DIRECTOR_URL=http://127.0.0.1:5491 node scripts/check-scrolls-four-rooms.mjs
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5396";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/scrolls-four-rooms";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("genobi-setup-seen-v1", "1"),
  );
  const quotes = [],
    writes = [],
    errors = [];
  await context.route("**/api/**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/quotes" && req.method() === "POST") {
      quotes.push(req.postDataJSON());
      return route.fulfill({
        json: {
          quote: {
            id: "12345678-1234-4123-8123-123456789abc",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            estimateUsd: 0.04,
          },
        },
      });
    }
    if (req.method() !== "GET") {
      writes.push(path);
      return route.abort();
    }
    return route.fulfill({ json: { jobs: [], sources: [] } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/scrolls`);
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  await page.getByRole("button", { name: /Four Rooms/ }).click();
  await page.getByText(/not AI-generated/).waitFor();
  await page
    .getByRole("button", { name: "Use storyboard plan", exact: true })
    .click();
  await page
    .locator(".scroll-message")
    .filter({ hasText: /each panel's 3D frame/ })
    .waitFor();
  const choose = async (label, option) => {
    await page
      .locator(".scroll-composer .select-menu")
      .filter({ hasText: label })
      .locator("button.select-menu__trigger")
      .click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  const fill = page.getByRole("button", { name: /^Fill panels · 8$/ });
  assert(await fill.isDisabled(), "Klein open must refuse panel frames");
  assert.match(
    (await fill.getAttribute("title")) ?? "",
    /Panel 1 \(Field approach\) has its own 3D frame/,
  );
  await choose("Run", "API · BFL");
  await page.screenshot({ path: `${output}/board.png`, fullPage: true });
  await fill.click();
  await page.waitForFunction(() =>
    document
      .querySelector(".scroll-approval")
      ?.textContent.includes("8 images, one per empty panel"),
  );
  assert.equal(quotes.length, 8, "one quote per panel");
  for (const [i, q] of quotes.entries()) {
    assert.equal(q.model, "flux-3-klein-api");
    assert.equal(q.imageReferences.length, 1, `panel ${i + 1}: its frame`);
    assert.match(q.imageReferences[0], /^data:image\/png;base64,/);
    assert.match(
      q.description,
      new RegExp(
        `^Reference 1 is this panel's 3D blocking frame[\\s\\S]*P0${i + 1} / `,
      ),
    );
  }
  assert.equal(
    new Set(quotes.map((q) => q.imageReferences[0])).size,
    8,
    "every panel sends a different frame",
  );
  await page.screenshot({ path: `${output}/approval.png`, fullPage: true });
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Four Rooms: plan loads eight panel frames; Klein open refused by panel; Fill quotes eight runs, each with its own frame first; nothing submitted",
  );
  await context.close();
} finally {
  await browser.close();
}
