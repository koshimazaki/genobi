/**
 * The Editor's Regenerate, in a browser against the local studio:
 *   DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-editor-regenerate.mjs
 * Opening it moves no toolbar, stage or timeline and fits every width; Send
 * starts one session with the project linked and the instruction in its
 * prompt; with no agent saved it opens the spawn chooser instead. Agent
 * routes are answered by the page itself, so no harness or model runs, and
 * a generation request is refused (and counted) if anything sends one.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { clipSendChecks } from "./lib/clip-send-checks.mjs";

const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local studio",
);
const output = process.env.STUDIO_EVIDENCE ?? ".local/editor-regenerate";
await mkdir(output, { recursive: true });
const editor = `${base}/director?example=studio&workspace=editor`;
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Regenerate",
  startedAt: new Date().toISOString(),
  lines: ["Reading the project feedback…"],
};
const browser = await chromium.launch({ headless: true });
/** The popover's Send: "Send to Genobi", whichever agent is set up. */
const sendIn = (page) =>
  page
    .getByRole("dialog", { name: "Regenerate with the agent" })
    .getByRole("button", { name: "Send to Genobi", exact: true });
const checks = [];
let generations = 0;
const errors = [];

async function open(width, agent, copy = true) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() =>
    localStorage.setItem("genobi.startup-guide.v1", "seen"),
  );
  page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
  await page.route("**/api/jobs", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    generations++;
    return route.abort();
  });
  const starts = [];
  await page.route("**/api/agent/**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/agent/status")
      return route.fulfill({
        json: agent
          ? { available: true, runner: "claude" }
          : { available: false, message: "No agent is set up on this server." },
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
            { runner: "hermes", name: "Hermes", installed: false },
            { runner: "codex", name: "Codex", installed: false },
          ],
        },
      });
    if (url.pathname === "/api/agent/sessions" && method === "POST") {
      starts.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 201, json: SESSION });
    }
    if (url.pathname === "/api/agent/sessions")
      return route.fulfill({ json: { session: null } });
    if (url.pathname === `/api/agent/sessions/${SESSION.id}`)
      return route.fulfill({ json: SESSION });
    return route.fulfill({ status: 404, json: { error: "Not here." } });
  });
  await page.route("**/api/settings/agent-runner", (route) =>
    route.fulfill({
      json: {
        saved: { runner: agent ? "claude" : null },
        environment: false,
        hermesProvider: true,
      },
    }),
  );
  // The hosted studio answers no project list: it keeps no copy.
  if (!copy)
    await page.route("**/api/projects", (route) =>
      route.fulfill({ status: 404, json: { error: "API route not found." } }),
    );
  await page.goto(editor);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) =>
        button.textContent.startsWith("Render MP4") && !button.disabled,
    ),
  );
  return { page, starts };
}

const rects = (page) =>
  page.evaluate(() =>
    [".dir-heading", ".dir-file-actions", ".dir-stage", ".dir-timeline"].map(
      (selector) => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r ? [r.x, r.y, r.width, r.height].map(Math.round).join() : "";
      },
    ),
  );

try {
  for (const width of [1440, 768, 390, 320]) {
    const { page } = await open(width, true);
    const button = page.getByRole("button", { name: "Regenerate" });
    const render = page.getByRole("button", { name: /^Render MP4/ });
    const [b, r] = [await button.boundingBox(), await render.boundingBox()];
    assert.ok(b && r, "Regenerate and Render MP4 are on screen");
    assert.ok(b.height >= 24, `Regenerate is a 24 px target at ${width}`);
    const before = await rects(page);
    await button.click();
    const field = page.getByRole("textbox", { name: "What should change?" });
    await field.waitFor();
    assert.equal(
      await field.evaluate((e) => e === document.activeElement),
      true,
    );
    assert.deepEqual(
      await rects(page),
      before,
      `Opening Regenerate moves nothing at ${width}`,
    );
    const pop = await page.locator(".dir-regenerate-pop").boundingBox();
    assert.ok(
      pop.x >= 0 && pop.x + pop.width <= width,
      `The field fits at ${width}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `No horizontal overflow at ${width}`,
    );
    await page.screenshot({ path: `${output}/regenerate-${width}.png` });
    await field.press("Escape");
    assert.equal(await field.count(), 0, "Escape closes the field");
    assert.equal(
      await button.evaluate((e) => e === document.activeElement),
      true,
      "Escape returns focus to Regenerate",
    );
    checks.push(
      `${width}px: opens in place, fits, Escape closes to the button`,
    );
    await page.close();
  }

  // Send with an agent saved: one start, the project linked, the words in it.
  {
    const { page, starts } = await open(1440, true);
    await page.getByRole("button", { name: "Regenerate" }).click();
    await page
      .getByRole("textbox", { name: "What should change?" })
      .fill("Keep my trims and redo the title");
    // Model-agnostic: the agent is named in the tooltip, never the label.
    assert.equal(await sendIn(page).textContent(), "Send to Genobi");
    assert.match(await sendIn(page).getAttribute("title"), /Claude Code/);
    await sendIn(page).click();
    await page
      .getByText("Claude Code started on this project", { exact: false })
      .waitFor();
    assert.equal(starts.length, 1);
    assert.match(starts[0].prompt, /Keep my trims and redo the title/);
    assert.match(starts[0].prompt, /Regenerate the linked Director project/);
    assert.match(starts[0].prompt, /The timeline now, bottom track first/);
    assert.match(starts[0].copyId ?? "", /^signal-studies\.[a-z2-9]{10}$/);
    await page
      .getByRole("region", { name: "Agent session" })
      .or(page.getByRole("button", { name: "Open Genobi activity" }))
      .first()
      .waitFor();
    await page.screenshot({ path: `${output}/regenerate-sent.png` });
    checks.push("Send: one session, project copy linked, instruction sent");
    await page.close();
  }

  // Keys on the field's buttons stay there: no clip deleted, focus kept on scroll.
  {
    const { page, starts } = await open(1440, true);
    const clips = () => page.getByRole("button", { name: /^Select / }).count();
    await page
      .getByRole("button", { name: "Select Orbit 1", exact: true })
      .click();
    const before = await clips();
    await page.getByRole("button", { name: "Regenerate" }).click();
    await page
      .getByRole("textbox", { name: "What should change?" })
      .fill("Hold the title");
    const close = page.getByRole("button", { name: "Close", exact: true });
    await close.focus();
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");
    await page.keyboard.press("KeyS");
    assert.equal(await clips(), before, "Keys on Close leave the clips alone");
    await page.evaluate(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(100);
    assert.equal(
      await close.evaluate((e) => e === document.activeElement),
      true,
      "A scroll or resize keeps focus where it was",
    );
    await close.click();
    assert.equal(
      await page
        .getByRole("button", { name: "Regenerate" })
        .evaluate((e) => e === document.activeElement),
      true,
      "Close returns focus to Regenerate",
    );
    assert.equal(starts.length, 0);
    checks.push(
      "Keys on the field's buttons stay there; focus kept and returned",
    );
    await page.close();
  }

  // A studio with no project copy says so, and Send stays off.
  {
    const { page, starts } = await open(390, true, false);
    await page.getByRole("button", { name: "Regenerate" }).click();
    await page
      .getByRole("textbox", { name: "What should change?" })
      .fill("Use the new order");
    await page
      .getByRole("dialog", { name: "Regenerate with the agent" })
      .getByText("This studio keeps no project copy")
      .waitFor();
    assert.equal(await sendIn(page).isDisabled(), true);
    assert.equal(starts.length, 0);
    checks.push("No project copy: explained, Send off");
    await page.close();
  }

  // No agent saved: the spawn chooser, never a dead button.
  {
    const { page, starts } = await open(390, false);
    await page.getByRole("button", { name: "Regenerate" }).click();
    await page
      .getByRole("textbox", { name: "What should change?" })
      .fill("Use the new order");
    assert.equal(await sendIn(page).textContent(), "Send to Genobi");
    await page
      .getByRole("dialog", { name: "Regenerate with the agent" })
      .getByText("No agent is set up yet.", { exact: false })
      .waitFor();
    await sendIn(page).click();
    await page.getByRole("heading", { name: "Start Genobi" }).waitFor();
    // The words stay in the field while the agent is set up.
    assert.equal(
      await page
        .getByRole("textbox", { name: "What should change?" })
        .inputValue(),
      "Use the new order",
    );
    await page.screenshot({ path: `${output}/regenerate-no-agent-390.png` });
    assert.equal(starts.length, 0);
    checks.push("No agent saved: the spawn chooser opens");
    await page.close();
  }

  await clipSendChecks(open, checks, output);

  assert.equal(generations, 0, "No generation request was sent");
  assert.deepEqual(errors, []);
  checks.push("No generation request and no page errors");
  console.log(checks.map((c) => `PASS ${c}`).join("\n"));
} finally {
  await browser.close();
}
