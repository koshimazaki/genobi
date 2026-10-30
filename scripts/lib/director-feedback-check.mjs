// The feedback round trip in a real browser, run by check-director-copy.mjs
// once the agent is linked: the agent edits the title, the person moves it
// and pins a note, the Feedback panel shows and exports exactly that as
// Director commands, and the agent reads the same from the copy.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const poll = async (read, done, what) => {
  for (let i = 0; i < 40; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail(`timed out waiting for ${what}`);
};

/**
 * `agent(route, method, body)` calls the project routes as the linked agent;
 * `shell()` measures the toolbar, stage and timeline once the preview is ready.
 */
export async function checkFeedback({ page, base, agent, copy, out, shell }) {
  // The agent's edit: the title's words. Its revision is the feedback base.
  const read = await agent(`/${copy}`);
  const worded = await agent(`/${copy}/commands`, "POST", {
    baseRevision: read.revision,
    command: {
      op: "set-parameters",
      layerId: "title",
      parameters: { text: "AGENT CUT" },
    },
  });
  assert.equal(worded.status, 200, JSON.stringify(worded));
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="text"]')?.value === "AGENT CUT",
    null,
    { timeout: 10000 },
  );

  // The person moves the title 12 frames earlier and pins a note to it.
  const title = read.project.layers.find((l) => l.id === "title");
  const start = page.getByLabel("Start frame", { exact: true });
  await start.fill(String(title.startFrame - 12));
  await start.press("Tab");
  await page.getByRole("button", { name: /^Notes \(\d+ open\)$/ }).click();
  const notes = page.getByRole("complementary", { name: "Frame notes" });
  await notes
    .getByLabel("New note", { exact: true })
    .fill("Land it on the kick");
  await notes.getByRole("button", { name: /^Add note at / }).click();
  await notes
    .locator("li[data-note]")
    .filter({ hasText: "Land it on the kick" })
    .waitFor();
  await notes.getByRole("button", { name: "Close notes", exact: true }).click();

  // The panel: summary, the move in frames (and beats, when the project has a
  // tempo), and no shell movement.
  const before = await shell();
  const button = page.getByRole("button", { name: "Feedback for the agent" });
  await button.click();
  const panel = page.getByRole("complementary", {
    name: "Feedback for the agent",
  });
  await panel
    .getByTestId("feedback-summary")
    .filter({ hasText: /^2 changes · \d+ open notes? · 0 unmapped$/ })
    .waitFor({ timeout: 10000 });
  const items = await panel
    .getByRole("list", { name: "Changes as commands" })
    .innerText();
  assert.match(
    items,
    /move-clip title AGENT CUT starts 12 frames (?:\([\d.]+ beats\) )?earlier, at frame \d+/,
  );
  assert.match(items, /add-note note at frame \d+ .*"Land it on the kick"/);
  assert.match(
    await panel.innerText(),
    new RegExp(`since revision ${worded.revision}, the agent's`),
  );
  assert.deepEqual(
    await shell(),
    before,
    "the feedback drawer moved the shell",
  );
  console.log("PASS the Feedback panel shows the person's move and note");

  // Download JSON and Copy give the same file the agent reads from the copy.
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const file = `${out}/feedback.json`;
  await (await download).saveAs(file);
  const text = await readFile(file, "utf8");
  const saved = JSON.parse(text);
  assert.equal(saved.schema, "genobi.director-feedback.v1");
  assert.equal(saved.baseRevision, worded.revision);
  assert.deepEqual(
    saved.commands.map((c) => c.command.op),
    ["move-clip", "add-note"],
  );
  assert.deepEqual(saved.commands[0].command, {
    op: "move-clip",
    layerId: "title",
    startFrame: title.startFrame - 12,
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(base).origin,
  });
  await panel.getByRole("button", { name: "Copy", exact: true }).click();
  await panel.getByRole("status").filter({ hasText: "Copied" }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
  const fromCopy = await poll(
    () => agent(`/${copy}/feedback`),
    (f) => f.revision === saved.revision,
    "the studio's push",
  );
  assert.equal(fromCopy.status, 200);
  assert.deepEqual(
    { ...fromCopy, status: undefined },
    { ...saved, status: undefined },
  );
  console.log("PASS Download JSON, Copy and the agent's read agree");

  // Phone width: the drawer stays on screen with no sideways scroll.
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      document.querySelector(".dir-feedback-drawer").getAnimations().length ===
      0,
    null,
    { timeout: 5000 },
  );
  const phone = await page.evaluate(() => {
    const box = document
      .querySelector(".dir-feedback-drawer")
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
  await page.screenshot({ path: `${out}/feedback-phone.png`, fullPage: true });
  await panel
    .getByRole("button", { name: "Close feedback", exact: true })
    .click();
  await page.setViewportSize(size);
  console.log("PASS the feedback drawer fits a phone with no sideways scroll");
}
