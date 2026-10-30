/**
 * A mechanical template's Generate in a browser ("Make your own"), at
 * desktop and phone width, against a frontend-only Vite preview with the API
 * stubbed: no key, no provider call, nothing paid. Run:
 *
 *   npm run build && npx vite preview --port 4391 --strictPort
 *   STUDIO_URL=http://127.0.0.1:4391 node scripts/check-template-generate.mjs
 *
 * Checks: Sheet to shot's drawer says "Preview coming soon", opens its two
 * zones at the Scrolls examples and its prompt editable; a dropped
 * storyboard swaps in; Generate asks for exactly one quote and spends
 * nothing; Confirm sends exactly one submission with the quote's id, the
 * key made at quote time and the quoted body; the run's progress, then its
 * result, play in the drawer's output box; Add to project assets copies the
 * clip into the project; zones, prompt and actions never move between those
 * states; after a reload whose history lacks the run, the drawer says a run
 * may be in progress and Generate asks before quoting; no sideways scroll, page errors or unnamed controls.
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4391";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-generate-evidence";
await mkdir(output, { recursive: true });
const clip = await readFile("public/media/template-gallery/product-video.mp4");
const QUOTE = {
  id: "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  estimateUsd: 0.78,
  recipe: {},
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
};

/** Stubs every API route the run reaches; records quotes and submissions. */
async function stub(page, seen) {
  const jobs = [];
  let polls = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (pathname === "/api/health") return json({ hasServerKey: true });
    // `seen.hide`: a reload whose history and job route do not show the run.
    if (pathname === "/api/history")
      return json({ jobs: seen.hide ? [] : jobs, sources: [] });
    if (pathname === "/api/quotes" && method === "POST") {
      seen.quotes.push(JSON.parse(request.postData() ?? "{}"));
      return json({ quote: QUOTE }, 201);
    }
    if (pathname === "/api/jobs" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}");
      const headers = request.headers();
      seen.submits.push({
        body,
        key: headers["idempotency-key"],
        quote: headers["quote-id"],
      });
      const now = new Date().toISOString();
      jobs.push({
        ...body,
        imageReferences: undefined,
        id: "job-sheet-1",
        prompt: body.description,
        status: "Pending",
        createdAt: now,
        updatedAt: now,
        costEstimateUsd: QUOTE.estimateUsd,
        keyMode: "owner",
      });
      return json({ job: jobs[0] }, 202);
    }
    if (pathname === "/api/jobs/job-sheet-1" && seen.hide)
      return route.fulfill({ status: 404, json: { error: "Not found" } });
    if (pathname === "/api/jobs/job-sheet-1") {
      polls += 1;
      const job = jobs[0];
      if (polls < 3) Object.assign(job, { status: "Generating" });
      else
        Object.assign(job, {
          status: "Ready",
          resultUrl: "/api/media/job-sheet-1.mp4",
          resultContentType: "video/mp4",
        });
      return json({ job });
    }
    if (pathname === "/api/media/job-sheet-1.mp4")
      return route.fulfill({
        status: 200,
        body: clip,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(clip.length),
        },
      });
    if (pathname === "/api/projects" && method === "GET")
      return json({ projects: [] });
    if (/^\/api\/projects\//.test(pathname)) return json({ revision: 1 });
    // Anything else is refused, never sent on.
    return route.fulfill({ status: 404, json: { error: "stubbed" } });
  });
}

// Positions within the drawer's content, so its own scrolling (a focused
// button brought into view on a phone) is not counted as movement.
const rect = (page, selector) =>
  page.$$eval(selector, (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      const top = n.closest(".template-drawer")?.scrollTop ?? 0;
      return [r.x, r.y + top, r.width, r.height].map(Math.round).join();
    }),
  );

const report = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() =>
      localStorage.setItem("genobi.startup-guide.v1", "seen"),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const seen = { quotes: [], submits: [] };
    await stub(page, seen);
    await page.goto(base);
    await page.locator(".template-gallery").waitFor();
    await page.getByRole("button", { name: "View Sheet to shot" }).click();
    const drawer = page.getByRole("dialog", { name: "Sheet to shot" });
    await drawer.waitFor();
    await page.waitForTimeout(400);
    await drawer.getByText("Preview coming soon").waitFor();
    for (const id of ["character", "storyboard"])
      assert.equal(
        await drawer
          .locator(`[data-reference="${id}"]`)
          .getAttribute("data-state"),
        "example",
      );
    const prompt = drawer.getByLabel("Sheet to shot prompt");
    assert.match(await prompt.inputValue(), /^Use the first image as/);
    const layout = async () => ({
      output: await rect(page, ".template-output"),
      zones: await rect(page, ".template-zone"),
      prompt: await rect(page, ".template-prompt"),
      actions: await rect(page, ".template-actions > *"),
    });
    const before = await layout();
    await page.screenshot({ path: `${output}/${label}-mechanical.png` });

    await drawer
      .getByLabel("Drop your storyboard")
      .setInputFiles("public/scrolls/creature-action.png");
    await drawer
      .locator('[data-reference="storyboard"][data-state="yours"]')
      .waitFor();
    await drawer.getByLabel("Length").selectOption("8");
    assert.deepEqual(await layout(), before, `${label}: a swap moved it`);

    await drawer.getByRole("button", { name: /^Generate/ }).click();
    const confirm = drawer.getByRole("button", { name: /^Confirm · \$0\.78/ });
    await confirm.waitFor();
    assert.equal(seen.quotes.length, 1, "one quote");
    assert.equal(seen.submits.length, 0, "nothing submitted before Confirm");
    const quoted = seen.quotes[0];
    assert.equal(quoted.model, "minimax-h3-router");
    assert.equal(quoted.duration, 8);
    assert.equal(quoted.resolution, "hd");
    assert.equal(quoted.imageReferences.length, 2);
    assert.deepEqual(await layout(), before, `${label}: the quote moved it`);
    await page.screenshot({ path: `${output}/${label}-quoted.png` });

    await confirm.click();
    await drawer.getByText(/GENERATING H3/).waitFor({ timeout: 15000 });
    assert.equal(seen.submits.length, 1, "one submission");
    const [submit] = seen.submits;
    assert.equal(submit.quote, QUOTE.id, "the quote's id is spent");
    assert.match(submit.key, /^[0-9a-f-]{36}$/, "the key made at quote time");
    assert.deepEqual(submit.body, quoted, "exactly the quoted run");
    assert.deepEqual(await layout(), before, `${label}: progress moved it`);
    await page.screenshot({ path: `${output}/${label}-running.png` });

    await drawer
      .locator('video[aria-label="Your Sheet to shot result"]')
      .waitFor({ timeout: 20000 });
    assert.deepEqual(await layout(), before, `${label}: the result moved it`);
    await drawer.getByRole("button", { name: "Add to project assets" }).click();
    await drawer
      .getByText(/added to project assets · Project\./)
      .waitFor({ timeout: 20000 });
    assert.equal(seen.quotes.length, 1, "still one quote");
    assert.equal(seen.submits.length, 1, "still one submission");
    await page.screenshot({ path: `${output}/${label}-result.png` });

    // A reload whose history does not show the run: the drawer says a run
    // may be in progress, and Generate asks first; declining quotes nothing.
    seen.hide = true;
    await page.reload();
    await page.locator(".template-gallery").waitFor();
    await page.getByRole("button", { name: "View Sheet to shot" }).click();
    await drawer
      .getByText("A run may be in progress; see Camera history.")
      .waitFor();
    page.once("dialog", (dialog) => dialog.dismiss());
    await drawer
      .getByRole("button", { name: "Generate · check Camera history first" })
      .click();
    await page.waitForTimeout(300);
    assert.equal(seen.quotes.length, 1, "declining the check quotes nothing");
    await page.screenshot({ path: `${output}/${label}-reloaded.png` });

    const overflow = await drawer.evaluate(
      (n) => n.scrollWidth - n.clientWidth,
    );
    assert.equal(overflow, 0, `${label}: the drawer scrolls sideways`);
    const unnamed = await drawer.evaluate((n) =>
      [...n.querySelectorAll("button, a[href], input, select, textarea")]
        .filter((el) => {
          if (getComputedStyle(el).visibility === "hidden") return false;
          const name =
            el.getAttribute("aria-label") ||
            el.textContent?.trim() ||
            el.closest("label")?.textContent?.trim();
          return !name;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    assert.deepEqual(unnamed, [], `${label}: unnamed controls`);
    assert.deepEqual(errors, [], `${label}: page errors`);
    const status = await drawer
      .locator('.template-metadata[role="status"]')
      .textContent();
    report.push(
      `${label} ${viewport.width}x${viewport.height}: output ${before.output}; zones ${before.zones.join(" | ")}; prompt ${before.prompt}; actions ${before.actions.join(" | ")}; unchanged through swap, quote, progress and result; 1 quote, 1 submission (Quote-Id and key sent); reload asks before a new run; status "${status?.trim()}"`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(report.join("\n"));
console.log(`Screenshots in ${output}`);
