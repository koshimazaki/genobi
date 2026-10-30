// The project copy and Director commands in a real browser: the studio pushes
// its project to the local server, the person links an agent, the agent's
// command shows up live, an agent edit that crosses an unpushed one reloads
// the copy with a one-line notice, and a frame note added in the studio
// reaches the agent, whose resolve shows live; the person's changes then come
// back to the agent as feedback (lib/director-feedback-check.mjs). Start
// `npm run dev` first (the project copy lives on the local server, not on a
// bare Vite preview).
// Chrome is the default, DIRECTOR_BROWSER=chromium for an installed
// Playwright browser, DIRECTOR_URL for another local server. Nothing is paid.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { checkFeedback } from "./lib/director-feedback-check.mjs";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local server",
);
const out = ".local/director";
await mkdir(out, { recursive: true });
const id = "product-video";

// The agent: its own session, as the MCP server has.
const agentCookie = (await fetch(`${base}/api/health`)).headers
  .get("set-cookie")
  .split(";")[0];
const agent = async (route, method = "GET", body) => {
  const response = await fetch(`${base}/api/projects${route}`, {
    method,
    headers: { cookie: agentCookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, ...(await response.json()) };
};

const browser = await chromium.launch({
  channel: process.env.DIRECTOR_BROWSER ?? "chrome",
  headless: true,
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await page.goto(`${base}/director?example=${id}&workspace=editor`);
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 30000 });
  const boxes = async () => ({
    presets: await page
      .getByRole("navigation", { name: "Studio presets" })
      .boundingBox(),
    stage: await page
      .locator('canvas[aria-label="Director preview"]')
      .boundingBox(),
  });
  const before = await boxes();

  // The studio pushes its project without being asked.
  await page.waitForFunction(
    async (id) => {
      const r = await fetch("/api/projects");
      const { projects } = await r.json();
      return projects.some((p) => p.id === id);
    },
    id,
    { timeout: 15000, polling: 300 },
  );
  assert.equal((await agent(`/${id}`)).status, 404, "unlinked agent saw it");
  console.log(
    "PASS the studio mirrors its project; an unlinked agent sees nothing",
  );

  // The person links the agent from the agent panel in Project Tools.
  const preset = (name) =>
    page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name, exact: true })
      .click();
  await preset("Project Tools");
  await page.getByText(/JSON editor & agent tools/).click();
  await page
    .getByRole("button", { name: "Link an agent", exact: true })
    .click();
  const receipt = page.getByLabel("Agent receipt");
  await receipt.filter({ hasText: "linkCode" }).waitFor();
  const { linkCode } = JSON.parse(await receipt.innerText());
  assert.match(linkCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const linked = await agent("/link", "POST", { code: linkCode });
  assert.equal(linked.status, 200);
  // The agent names the copy by its handle, not the template's shared id.
  const copy = linked.project.copyId;
  assert.match(copy, new RegExp(`^${id}\\.[a-z2-9]{10}$`));
  await preset("Editor");
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 30000 });
  console.log("PASS Link an agent shows a code the agent spends once");

  const read = await agent(`/${copy}`);
  const title = read.project.layers.find((l) => l.id === "title");
  const end = title.startFrame + title.durationFrames;
  const trimmed = await agent(`/${copy}/commands`, "POST", {
    baseRevision: read.revision,
    command: {
      op: "trim-clip",
      layerId: "title",
      startFrame: title.startFrame + 30,
      durationFrames: end - title.startFrame - 30,
    },
  });
  assert.equal(trimmed.status, 200, JSON.stringify(trimmed));
  await page
    .getByRole("button", { name: `Select ${title.name}`, exact: true })
    .click();
  const showInspector = page.getByRole("button", {
    name: "Show inspector",
    exact: true,
  });
  if (await showInspector.isVisible()) await showInspector.click();
  const start = page.getByLabel("Start frame", { exact: true });
  await page
    .waitForFunction(
      (want) =>
        document.querySelector('input[aria-label="Start frame"]')?.value ===
        want,
      String(title.startFrame + 30),
      { timeout: 10000 },
    )
    .catch(async () =>
      assert.equal(await start.inputValue(), String(title.startFrame + 30)),
    );
  assert.equal(await page.locator(".dir-error").count(), 0);
  console.log("PASS an agent's trim appears live, with no conflict notice");

  // An audio analysis report's beat grid, applied by an agent, shows in the
  // transport's beat grid fields live.
  const gridded = await agent(`/${copy}/commands`, "POST", {
    baseRevision: trimmed.revision,
    command: {
      op: "set-beat-grid",
      bpm: 98.2047,
      beatOffsetSeconds: 1.3,
      beatsPerBar: 3,
    },
  });
  assert.equal(gridded.status, 200, JSON.stringify(gridded));
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Beat offset seconds"]')
        ?.value === "1.3" &&
      document.querySelector('input[aria-label="Beats per bar"]')?.value ===
        "3",
    null,
    { timeout: 10000 },
  );
  assert.equal(
    await page.getByLabel("BPM", { exact: true }).inputValue(),
    "98.2047",
  );
  assert.equal(await page.locator(".dir-error").count(), 0);
  console.log("PASS an agent's beat grid appears live");

  // A placement and words an agent sets show in the inspector live.
  const placed = await agent(`/${copy}/commands`, "POST", {
    baseRevision: gridded.revision,
    command: {
      op: "set-placement",
      layerId: "title",
      scale: 1.25,
      motion: { scaleTo: 1.5 },
    },
  });
  assert.equal(placed.status, 200, JSON.stringify(placed));
  const worded = await agent(`/${copy}/commands`, "POST", {
    baseRevision: placed.revision,
    command: {
      op: "set-parameters",
      layerId: "title",
      parameters: { text: "AGENT TITLE" },
    },
  });
  assert.equal(worded.status, 200, JSON.stringify(worded));
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Scale"]')?.value === "1.25" &&
      document.querySelector('input[aria-label="End scale"]')?.value ===
        "1.5" &&
      document.querySelector('input[aria-label="text"]')?.value ===
        "AGENT TITLE",
    null,
    { timeout: 10000 },
  );
  assert.equal(await page.locator(".dir-error").count(), 0);
  console.log("PASS an agent's placement and title text appear live");

  // A recipe the template does not hold, from the trusted registry: the
  // studio has no file for it, so it reloads the copy and shows the layer.
  const bars = await agent(`/${copy}/commands`, "POST", {
    baseRevision: worded.revision,
    command: {
      op: "add-graphic",
      layerId: "agent-bars",
      moduleId: "bars",
      track: "new",
      startFrame: 0,
      durationFrames: 30,
      name: "Agent bars",
      parameters: { color: "#ff5a36", length: 120 },
    },
  });
  assert.equal(bars.status, 200, JSON.stringify(bars));
  await page
    .getByRole("button", { name: "Select Agent bars", exact: true })
    .waitFor({ timeout: 10000 });
  const reloaded = page.locator(".dir-error");
  if (await reloaded.count())
    await reloaded.getByRole("button", { name: "Dismiss" }).click();
  console.log("PASS an agent's registry recipe appears after a reload");

  // The person edits; before the push, the agent edits the same revision.
  const now = await agent(`/${copy}`);
  const duration = page.getByLabel("Duration frames", { exact: true });
  await duration.fill(String(end - title.startFrame - 40));
  await duration.press("Tab");
  const crossed = await agent(`/${copy}/commands`, "POST", {
    baseRevision: now.revision,
    command: { op: "set-prompt", text: "Agent brief" },
  });
  assert.equal(crossed.status, 200, JSON.stringify(crossed));
  await page
    .locator(".dir-error")
    .filter({ hasText: /reloaded revision \d+ from the project copy/ })
    .waitFor({ timeout: 10000 });
  const notice = await page.locator(".dir-error").innerText();
  assert.equal(notice.split("\n").filter(Boolean).length <= 2, true, notice);
  console.log("PASS a crossed edit reloads the copy with a one-line notice");

  await page.screenshot({ path: `${out}/project-copy-notice.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.deepEqual(
    (await boxes()).presets,
    before.presets,
    "the toolbar moved with the notice",
  );
  await page
    .locator(".dir-error")
    .getByRole("button", { name: "Dismiss" })
    .click();
  assert.deepEqual(await boxes(), before, "the shell moved");
  console.log("PASS the toolbar and stage did not move");

  // A camera an agent sets on a shot reaches the studio's project: the shot's
  // plan holds the camera and the prompt reworded for it, as the copy does.
  // (#67 removed the simple Director's shot summary, so the person reads it
  // in the project JSON.)
  const latest = await agent(`/${copy}`);
  const shotCamera = { "shot-sizes": "wide", angles: null, movements: "orbit" };
  const camera = await agent(`/${copy}/commands`, "POST", {
    baseRevision: latest.revision,
    command: { op: "set-camera", shotId: "hero", camera: shotCamera },
  });
  assert.equal(camera.status, 200, JSON.stringify(camera));
  const served = await agent(`/${copy}`);
  const heroPlan = (project) =>
    project.generationPlans.find((g) => g.id === "plan-hero");
  assert.deepEqual(heroPlan(served.project).camera, shotCamera);
  assert.notEqual(
    heroPlan(served.project).prompt,
    heroPlan(latest.project).prompt,
    "the plan prompt was not reworded for the camera",
  );
  await preset("Project Tools");
  const tools = page.locator("details.dir-agent");
  if (!(await tools.evaluate((d) => d.open)))
    await tools.locator("summary").click();
  // The studio's revision numbers are its own; read its JSON until the
  // command's event has landed (10 s, as the shot summary waited).
  let shown;
  for (let i = 0; i < 50; i++) {
    await tools
      .getByRole("button", { name: "Load project JSON", exact: true })
      .click();
    shown = heroPlan(
      JSON.parse(
        await tools.getByLabel("Agent command", { exact: true }).inputValue(),
      ).project,
    );
    if (shown.prompt === heroPlan(served.project).prompt) break;
    await page.waitForTimeout(200);
  }
  assert.deepEqual(shown, heroPlan(served.project));
  console.log("PASS an agent's shot camera reaches the studio's shot plan");
  await page.screenshot({ path: `${out}/project-copy.png` });

  // Frame notes: the person pins one to the playhead and the title, the
  // agent reads it from the copy and resolves it, the studio shows that live.
  await preset("Editor");
  await page
    .getByText("Ready · local preview", { exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: `Select ${title.name}`, exact: true })
    .click();
  // Measured once the preview is ready again: every edit rebuilds it.
  const shell = async () => {
    await page
      .getByText("Ready · local preview", { exact: true })
      .waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    return {
      ...(await boxes()),
      timeline: await page.locator(".dir-timeline").first().boundingBox(),
    };
  };
  const unnoted = await shell();
  await page.getByRole("button", { name: /^Notes \(\d+ open\)$/ }).click();
  const drawer = page.getByRole("complementary", { name: "Frame notes" });
  await drawer
    .getByLabel("New note", { exact: true })
    .fill("Move the title lower");
  await drawer.getByRole("button", { name: /^Add note at / }).click();
  await drawer.locator("li[data-note]").first().waitFor({ timeout: 5000 });
  assert.deepEqual(
    await shell(),
    unnoted,
    "opening notes or adding one moved the shell",
  );
  let note;
  for (let i = 0; i < 40 && !note; i++) {
    const copyRead = await agent(`/${copy}`);
    note = copyRead.project.notes?.find(
      (n) => n.text === "Move the title lower",
    );
    if (!note) await new Promise((r) => setTimeout(r, 250));
  }
  assert(note, "the agent never saw the studio's note");
  assert.equal(note.layerId, "title");
  assert.equal(note.author, "person");
  console.log(
    "PASS a note added in the studio reaches the agent, on its layer",
  );

  const current = await agent(`/${copy}`);
  const resolved = await agent(`/${copy}/commands`, "POST", {
    baseRevision: current.revision,
    command: { op: "resolve-note", noteId: note.id },
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved));
  await drawer
    .locator(`li[data-note="${note.id}"].is-resolved`)
    .waitFor({ timeout: 10000 });
  await page
    .locator(`.dir-note-marker.is-resolved[data-note="${note.id}"]`)
    .waitFor({ timeout: 5000 });
  assert.equal(await page.locator(".dir-error").count(), 0);
  console.log("PASS an agent's resolve shows live in the list and the ruler");

  // Rewording a note and pressing Reopen straight away keeps both changes.
  const item = drawer.locator(`li[data-note="${note.id}"]`);
  await item.locator("textarea").fill("Move the HUD lower, by a beat");
  await item.getByRole("button", { name: "Reopen", exact: true }).click();
  await drawer
    .locator(`li[data-note="${note.id}"]:not(.is-resolved)`)
    .waitFor({ timeout: 10000 });
  let reopened;
  for (
    let i = 0;
    i < 40 && reopened?.text !== "Move the HUD lower, by a beat";
    i++
  ) {
    reopened = (await agent(`/${copy}`)).project.notes?.find(
      (n) => n.id === note.id,
    );
    if (reopened?.text !== "Move the HUD lower, by a beat")
      await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(reopened?.text, "Move the HUD lower, by a beat");
  assert.equal(reopened?.resolved ?? false, false);
  console.log("PASS a reworded note pressed straight into Reopen keeps both");

  // A keyboard edit is saved once focus tabs past the note's own actions.
  await item.locator("textarea").fill("Lower the HUD by forty pixels");
  await item.locator("textarea").focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await item.evaluate((li) =>
      li.contains(document.activeElement),
    );
    if (!inside) break;
  }
  let tabbed;
  for (
    let i = 0;
    i < 40 && tabbed?.text !== "Lower the HUD by forty pixels";
    i++
  ) {
    tabbed = (await agent(`/${copy}`)).project.notes?.find(
      (n) => n.id === note.id,
    );
    if (tabbed?.text !== "Lower the HUD by forty pixels")
      await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(tabbed?.text, "Lower the HUD by forty pixels");
  console.log("PASS a keyboard edit is saved when focus tabs past the note");

  // Enter while an input method composes accepts the candidate, not the note.
  const notesBefore = await drawer.locator("li[data-note]").count();
  const draft = drawer.getByLabel("New note", { exact: true });
  await draft.fill("フレーム");
  await draft.evaluate((field) =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await page.waitForTimeout(300);
  assert.equal(await drawer.locator("li[data-note]").count(), notesBefore);
  assert.equal(await draft.inputValue(), "フレーム");
  await draft.fill("");
  console.log("PASS Enter during IME composition does not add the note");

  // The ruler pin seeks to its frame and selects its layer.
  await drawer
    .getByRole("button", { name: "Close notes", exact: true })
    .click();
  const other = read.project.layers.find((l) => l.id !== "title");
  await page
    .getByRole("button", { name: `Select ${other.name}`, exact: true })
    .click();
  await page.locator(`.dir-note-marker[data-note="${note.id}"]`).click();
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll(".dir-inspector input")].some(
        (i) => i.value === name,
      ),
    title.name,
    { timeout: 5000 },
  );
  console.log("PASS a ruler pin selects its note's layer");

  await checkFeedback({ page, base, agent, copy, out, shell });

  // Phone width: the drawer stays inside the screen and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Notes \(\d+ open\)$/ }).click();
  await drawer.locator(`li[data-note="${note.id}"]`).waitFor();
  // Once it has slid in.
  await page.waitForFunction(
    () =>
      document.querySelector(".dir-notes-drawer").getAnimations().length === 0,
    null,
    { timeout: 5000 },
  );
  const phone = await page.evaluate(() => {
    const box = document
      .querySelector(".dir-notes-drawer")
      .getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    };
  });
  assert(phone.left >= 0 && phone.right <= phone.width, JSON.stringify(phone));
  assert(phone.scroll <= phone.width, JSON.stringify(phone));
  await page.screenshot({
    path: `${out}/frame-notes-phone.png`,
    fullPage: true,
  });
  console.log("PASS the notes drawer fits a phone with no sideways scroll");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
