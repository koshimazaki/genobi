/**
 * Scrolls' Script and Describe the video, in a browser against a dev server
 * whose API the page answers itself:
 *   DIRECTOR_URL=http://127.0.0.1:5399 node scripts/check-scrolls-script.mjs
 * The Script becomes the Director's prompt without leaving Scrolls, Undo and
 * a repeat say so; Send starts one agent session whose prompt carries the
 * description and the one-use code, and the panels the (faked) agent sends
 * land on the storyboard. No harness, model or paid route runs.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { overflow } from "./lib/a11y-audit.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5399";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".local/scrolls-script";
await mkdir(output, { recursive: true });
const CODE = "0123456789abcdef0123456789abcdef";
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Fill",
  startedAt: new Date().toISOString(),
  lines: ["Filling the panels…"],
};
const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript(() => {
      localStorage.setItem("genobi-setup-seen-v1", "1");
      localStorage.setItem("genobi.startup-guide.v1", "seen");
    });
    const errors = [],
      unexpected = [],
      starts = [],
      asks = [];
    let agentDone = false,
      sessionStatus = "running";
    await context.route("**/api/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname,
        method = req.method();
      if (path === "/api/agent/status")
        return route.fulfill({ json: { available: true, runner: "claude" } });
      if (path === "/api/agent/sign-in")
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
      if (path === "/api/settings/agent-runner")
        return route.fulfill({
          json: {
            saved: { runner: "claude" },
            environment: false,
            hermesProvider: true,
          },
        });
      if (path === "/api/agent/sessions" && method === "POST") {
        starts.push(req.postDataJSON());
        return route.fulfill({ status: 201, json: SESSION });
      }
      if (path === "/api/agent/sessions")
        return route.fulfill({ json: { session: null } });
      if (path === `/api/agent/sessions/${SESSION.id}`)
        return route.fulfill({ json: { ...SESSION, status: sessionStatus } });
      if (path === "/api/scrolls/fill" && method === "POST") {
        asks.push(req.postDataJSON());
        return route.fulfill({ json: { id: "req-1", code: CODE } });
      }
      if (path === "/api/scrolls/fill/req-1")
        return route.fulfill({
          json: agentDone
            ? {
                documentId: asks[0].documentId,
                panels: [
                  { cellId: "cell-1", title: "Standoff", camera: "Locked" },
                  { cellId: "cell-2", title: "Rooftop chase" },
                ],
              }
            : { panels: null },
        });
      if (method !== "GET") {
        unexpected.push(`${method} ${path}`);
        return route.abort();
      }
      return route.fulfill({ json: { jobs: [], sources: [] } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/scrolls`);
    await page.getByRole("button", { name: "Script", exact: true }).click();
    const script = page.getByRole("textbox", { name: "Script", exact: true });
    await script.fill("Two ninjas meet on a moonlit roof, fight, and escape.");
    const use = page.getByRole("button", {
      name: "Use as Director prompt",
      exact: true,
    });
    const status = page.locator(".scroll-script .send-director-status");
    await use.click();
    await status.filter({ hasText: "Set as the Director's prompt." }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/scrolls");
    await page.screenshot({ path: `${output}/${width}-prompt-set.png` });
    await status.getByRole("button", { name: "Undo", exact: true }).click();
    await status.filter({ hasText: "Undone." }).waitFor();
    await use.click();
    await status.filter({ hasText: "Set as the Director's prompt." }).waitFor();
    await use.click();
    await status
      .filter({ hasText: "Already the Director's prompt." })
      .waitFor();

    // Describe the video → one session with the description and the code.
    await page
      .getByRole("textbox", { name: "Describe the video", exact: true })
      .fill("Eight panels: a standoff, a chase across roofs, a leap, escape.");
    const send = page.getByRole("button", { name: "Send", exact: true });
    await send.click();
    await page.getByText("Sent to Genobi.", { exact: false }).waitFor();
    assert.equal(starts.length, 1, "one Send, one session");
    assert.match(starts[0].prompt, /a standoff, a chase across roofs/);
    assert.match(starts[0].prompt, new RegExp(`code ${CODE}`));
    assert.match(starts[0].prompt, /Example pair 1/);
    assert(starts[0].prompt.length <= 4000);
    assert.deepEqual(asks[0].cellIds.slice(0, 2), ["cell-1", "cell-2"]);
    await page.screenshot({ path: `${output}/${width}-sent.png` });

    // The agent sends its panels; they land on the storyboard.
    await page.getByRole("button", { name: "Storyboard", exact: true }).click();
    agentDone = true;
    await page
      .locator(".scroll-cell-nav button")
      .first()
      .filter({ hasText: "Standoff" })
      .waitFor();
    assert.match(
      await page.locator(".scroll-message").innerText(),
      /Genobi filled 2 panels/,
    );
    await page.screenshot({ path: `${output}/${width}-filled.png` });
    assert.equal(starts.length, 1);

    // A long script stands in for an empty description: its first 1,500
    // characters go, and a session that ends without panels stops the wait.
    sessionStatus = "done";
    agentDone = false;
    await page.getByRole("button", { name: "Script", exact: true }).click();
    await script.fill(`${"Ninjas run across the roofs. ".repeat(60)}`);
    await page
      .getByRole("textbox", { name: "Describe the video", exact: true })
      .fill("");
    // Busy until the bubble has read the first session as done; a busy Send
    // starts nothing, so it is safe to press again.
    for (let i = 0; i < 40 && starts.length < 2; i++) {
      await send.click();
      await page.waitForTimeout(500);
    }
    await page
      .getByText("The first 1,500 characters of the script were sent.", {
        exact: false,
      })
      .waitFor();
    assert.equal(starts.length, 2);
    assert.match(starts[1].prompt, /cut to its first 1,500 characters/);
    await page
      .locator(".scroll-script-fill [role=status]")
      .filter({ hasText: "Genobi finished without sending panels." })
      .waitFor();
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(await overflow(page), []);
    console.log(
      `PASS Scrolls Script ${width}px: Director prompt set, undone, repeated; one session per Send with the code; agent panels landed; long script cut and said; a session ending without panels stops the wait; no paid calls`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
