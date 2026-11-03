/**
 * A paid agent step that arrives while Make my version (a native modal
 * <dialog>, top layer) is open must be answerable inside it, without closing
 * it or losing its unsaved edits (#64 review). Run against a local studio:
 * `DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-version-approval.mjs`.
 * Agent routes are fixtures; the approval POST is intercepted and answered
 * here, so nothing reaches a provider and nothing is spent.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/version-approval";
await mkdir(output, { recursive: true });

const id = "11111111-1111-4111-8111-111111111111";
const quoteId = "0f6c3c2e-6b1a-4f0e-9a43-3d7b0f3c9a11";
const step = (status) => ({
  quoteId,
  status,
  plan: {
    entry: "flux-3-video",
    label: "FLUX 3 · Video",
    generator: "video",
    model: "flux-3",
    description: "A ceramic vessel.",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "hd",
    draft: false,
    route: "bfl",
  },
  estimateUsd: 0.85,
  expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  payer: "server",
});
const session = (approvals) => ({
  id,
  runner: "claude",
  // Running, so the studio keeps polling it and the quote can arrive.
  status: "running",
  prompt: "Make the vessel shot",
  startedAt: new Date().toISOString(),
  lines: ["Quoted one FLUX 3 shot"],
  approvals,
});

const browser = await chromium.launch({ headless: true });
let quoted = false;
const posts = [];
try {
  for (const width of [1440, 390]) {
    quoted = false;
    posts.length = 0;
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() =>
      localStorage.setItem("genobi-setup-seen-v1", "1"),
    );
    await page.route("**/api/agent/sessions**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        posts.push(url.pathname);
        const declined = url.pathname.endsWith("/decline");
        return route.fulfill({
          json: session([step(declined ? "declined" : "submitting")]),
        });
      }
      if (url.pathname === "/api/agent/sessions")
        return route.fulfill({ json: { session: session([]) } });
      // The quote arrives only after the person has edited the dialog.
      return route.fulfill({ json: session(quoted ? [step("pending")] : []) });
    });
    await page.goto(`${base}/director?example=bloom-teaser&workspace=director`);
    const dialog = page.getByRole("dialog", { name: "Make my version" });
    await dialog.waitFor({ timeout: 60_000 });
    assert(
      await dialog.evaluate((d) => d.matches(":modal")),
      "Make my version is a real modal dialog",
    );
    // Unsaved edits: a Words field and a slot pick.
    const title = dialog.locator(".dir-version-words input").nth(1);
    await title.fill("MY UNSAVED TITLE");
    const pick = dialog.locator("select").first();
    // "Choose video": an unsaved change away from the default take.
    await pick.selectOption({ index: 0 });
    const picked = await pick.inputValue();

    quoted = true;
    const card = dialog.getByRole("region", {
      name: "Paid step waiting for your approval",
    });
    await card.waitFor({ timeout: 15_000 });
    for (const text of ["FLUX 3 · Video", "$0.85", "demo key"])
      assert(
        (await card.textContent()).includes(text),
        `the card shows ${text} at ${width}`,
      );
    const approve = card.getByRole("button", { name: "Approve $0.85" });
    const decline = card.getByRole("button", { name: "Decline" });
    assert(await approve.isVisible(), `Approve is visible at ${width}`);
    assert(await decline.isVisible(), `Decline is visible at ${width}`);
    assert.deepEqual(posts, [], "nothing is answered without a click");
    // Keyboard: focus reaches Decline inside the modal and Enter answers it.
    await decline.focus();
    assert(
      await decline.evaluate((b) => b === document.activeElement),
      `Decline takes keyboard focus inside the modal at ${width}`,
    );
    await page.screenshot({
      path: `${output}/approval-in-dialog-${width}.png`,
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    assert.equal(posts.length, 1, "one answer, the person's own");
    assert.match(posts[0], /\/approvals\/.+\/decline$/);
    assert(await dialog.isVisible(), "the dialog stayed open");
    assert.equal(await title.inputValue(), "MY UNSAVED TITLE");
    assert.equal(await pick.inputValue(), picked);
    console.log(`PASS approval answered inside Make my version at ${width}`);
    await page.close();
  }
} finally {
  await browser.close();
}
