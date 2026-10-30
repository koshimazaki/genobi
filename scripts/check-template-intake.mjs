/**
 * The gallery drawer's asset intake and actions in a browser (Box 2.2), at
 * desktop and phone width, against a frontend-only Vite preview with the API
 * stubbed: no key, no provider call, no real agent. Run:
 *
 *   npm run build && npx vite preview --port 4391 --strictPort
 *   STUDIO_URL=http://127.0.0.1:4391 node scripts/check-template-intake.mjs
 *
 * It drives the Character piece card, the agent card the gallery shows with
 * a reference to swap (the Anime teaser card left the gallery on 30 October
 * 2026; its drawer's track-missing intake is covered by
 * tests/template-gallery-modes.test.tsx and template-gallery-actions).
 * Checks: the character stills open at their example; a dropped still and
 * Example again leave the zone and the actions where they were (the stills
 * are required, so they offer no Generate); an edited character rewrites the read-only prompts;
 * Generate now saves the project copy and starts one session with the
 * template's skill, the character, the intake and the copy linked; the
 * header (the bubble) is usable behind the drawer once the session starts
 * and Tab from the drawer reaches it;
 * Take it to the editor then appears and opens the Editor; the drawer never
 * scrolls sideways and has no page errors or unnamed controls.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4391";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-intake-evidence";
await mkdir(output, { recursive: true });
const COPY = "character-piece.abcdefghjk";
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Run the character-piece skill",
  startedAt: new Date().toISOString(),
  lines: [],
};

/** Stubs every API route the drawer's actions reach; records the starts. */
async function stub(page, started) {
  let pushed = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (pathname === "/api/health") return json({ hasServerKey: false });
    if (pathname === "/api/jobs" && method === "GET")
      return json({ jobs: [], sources: [] });
    if (pathname === "/api/agent/status")
      return json({ available: true, runner: "claude", terminal: false });
    if (pathname === "/api/settings/agent-runner")
      return json({
        saved: { runner: "claude" },
        environment: false,
        hermesProvider: true,
      });
    if (pathname === "/api/agent/sign-in")
      return json({
        harnesses: [
          {
            runner: "claude",
            name: "Claude Code",
            installed: true,
            signedIn: true,
          },
        ],
      });
    if (pathname === "/api/projects" && method === "GET")
      return json({
        projects: pushed
          ? [{ id: "character-piece", access: "owner", copyId: COPY }]
          : [],
      });
    if (/^\/api\/projects\/character-piece\/files\//.test(pathname))
      return json({});
    if (pathname === "/api/projects/character-piece" && method === "PUT") {
      pushed = true;
      const body = JSON.parse(request.postData() ?? "{}");
      return json({ revision: body.project?.revision ?? 1 });
    }
    if (pathname === "/api/agent/sessions" && method === "POST") {
      started.push(JSON.parse(request.postData() ?? "{}"));
      return json(SESSION, 201);
    }
    if (pathname.startsWith("/api/agent/sessions")) return json(SESSION);
    // Anything paid or unknown is refused, never sent on.
    return route.fulfill({ status: 404, json: { error: "stubbed" } });
  });
}

const rect = (page, selector) =>
  page.$$eval(selector, (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(Math.round).join();
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
    const started = [];
    await stub(page, started);
    await page.goto(base);
    await page.locator(".template-gallery").waitFor();
    await page.getByRole("button", { name: "View Character piece" }).click();
    const drawer = page.getByRole("dialog", { name: "Character piece" });
    await drawer.waitFor();
    await page.waitForTimeout(400);
    const zones = drawer.locator(".template-zone");
    assert.equal(await zones.count(), 1, "one drop zone");
    const state = (id) =>
      drawer.locator(`[data-reference="${id}"]`).getAttribute("data-state");
    assert.equal(await state("character"), "example", "stills at the example");
    const layout = async () => ({
      zones: await rect(page, ".template-zone"),
      actions: await rect(page, ".template-actions > *"),
    });
    const before = await layout();
    await page.screenshot({ path: `${output}/${label}-examples.png` });

    await drawer
      .getByLabel("Drop your character stills")
      .setInputFiles("public/scrolls/creature.png");
    await drawer
      .locator('[data-reference="character"][data-state="yours"]')
      .waitFor();
    const after = await layout();
    assert.deepEqual(after, before, `${label}: a pick moved the drawer`);
    await page.screenshot({ path: `${output}/${label}-picked.png` });
    await drawer
      .getByRole("button", { name: "Use the example character stills" })
      .click();
    assert.deepEqual(await layout(), before, `${label}: Example moved it`);
    await drawer
      .getByLabel("Drop your character stills")
      .setInputFiles("public/scrolls/creature.png");
    await drawer
      .locator('[data-reference="character"][data-state="yours"]')
      .waitFor();
    await drawer
      .getByRole("textbox", { name: "Character" })
      .fill("a fox courier in a rust wool coat");
    assert.match(
      await drawer.locator(".template-prompts").textContent(),
      /A fox courier in a rust wool coat walks in through a pale doorway/,
    );
    assert.deepEqual(
      await layout(),
      before,
      `${label}: the character moved it`,
    );

    const overflow = await drawer.evaluate(
      (n) => n.scrollWidth - n.clientWidth,
    );
    assert.equal(overflow, 0, `${label}: the drawer scrolls sideways`);
    const unnamed = await drawer.evaluate((n) =>
      [...n.querySelectorAll("button, a[href], input")]
        .filter((el) => {
          const name =
            el.getAttribute("aria-label") ||
            el.textContent?.trim() ||
            el.closest("label")?.textContent?.trim();
          return !name;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    assert.deepEqual(unnamed, [], `${label}: unnamed controls`);

    await drawer.getByRole("button", { name: "Generate now" }).click();
    await drawer.getByText("Take it to the editor").waitFor({ timeout: 15000 });
    assert.equal(started.length, 1, "one session started");
    const [start] = started;
    assert.equal(start.copyId, COPY, "the project is linked");
    assert.match(start.prompt, /genobi_skill with name "character-piece"/);
    assert.match(start.prompt, /Mine: Character stills\./);
    assert.match(start.prompt, /a fox courier in a rust wool coat/);
    const headerInert = await page.evaluate(
      () => document.querySelector(".genobi-shell > .genobi-host")?.inert,
    );
    assert.equal(headerInert, false, `${label}: the bubble is inert`);
    // Tab from the drawer's last control reaches the bubble in the header,
    // and every stop on the way is the drawer's or the header's.
    await drawer.locator(".template-actions > *").last().focus();
    const stops = [];
    let bubble = false;
    for (let i = 0; i < 40 && !bubble; i += 1) {
      await page.keyboard.press("Tab");
      const at = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          name: el?.getAttribute("aria-label") ?? el?.textContent?.trim(),
          header: !!el?.closest(".genobi-shell > .genobi-host"),
          drawer: !!el?.closest(".template-drawer"),
        };
      });
      assert(at.header || at.drawer, `${label}: Tab left drawer and header`);
      stops.push(at.name);
      bubble = at.header && /Genobi (bubble|activity)/.test(at.name ?? "");
    }
    assert(bubble, `${label}: Tab never reached the bubble: ${stops}`);
    const tabs = stops.length;
    const status = await drawer
      .locator('.template-metadata[role="status"]')
      .textContent();
    await page.screenshot({ path: `${output}/${label}-started.png` });
    await drawer.getByText("Take it to the editor").click();
    await page.waitForURL(/workspace=editor/);
    assert.deepEqual(errors, [], `${label}: page errors`);
    report.push(
      `${label} ${viewport.width}x${viewport.height}: zones ${before.zones.join(" | ")}; actions ${before.actions.join(" | ")}; unchanged after a drop, Example and a new character; header usable after the start, bubble ${tabs} Tab(s) past the drawer's last control; status "${status?.trim()}"; editor ${new URL(page.url()).search}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(report.join("\n"));
console.log(`Screenshots in ${output}`);
