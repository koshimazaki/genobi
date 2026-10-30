/** Run against a local dev server: STUDIO_URL=http://127.0.0.1:4317 node scripts/check-director-tracks.mjs */
// Space play/stop, trim preview, cross-track moves, new tracks, units and
// the expanded timeline, in the Editor preset on the studio example.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.env.STUDIO_URL ?? "http://127.0.0.1:4317";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use a local preview",
);
const output = process.env.STUDIO_EVIDENCE ?? "/tmp/genobi-tracks-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/jobs", (route) =>
  route.request().method() === "POST" ? route.abort() : route.fallback(),
);
try {
  await page.goto(`${base}/?example=studio`);
  await page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Editor", exact: true })
    .click();
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  const playButton = page.locator(".dir-transport button").first();
  const clip = (id) => page.locator(`.dir-clip[data-layer-id="${id}"]`);
  const laneOf = (id) =>
    clip(id).evaluate((c) => c.closest("[data-lane]").dataset.lane);
  const stageFrame = () =>
    page
      .locator("canvas[aria-label='Director preview']")
      .getAttribute("data-frame");

  // Space toggles playback even after clicking a button, and stops again.
  await page.getByRole("button", { name: "Fold channels" }).click();
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () =>
      document.querySelector(".dir-transport button")?.ariaLabel === "Pause",
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => document.querySelector(".dir-transport button")?.ariaLabel === "Play",
  );
  assert.equal(await playButton.getAttribute("aria-label"), "Play");
  await page.getByRole("button", { name: "Expand channels" }).click();
  checks.push("Space plays and stops with a toolbar button focused");

  // Text entry keeps Space.
  await page.getByRole("button", { name: "Show inspector" }).click();
  const name = page.getByLabel("Name", { exact: true });
  await name.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  assert.equal(await playButton.getAttribute("aria-label"), "Play");
  await page.getByRole("button", { name: "Close inspector" }).click();
  checks.push("Space types in a text field without starting playback");

  // Units.
  await page.getByRole("button", { name: "Time", exact: true }).click();
  assert.match(
    await page.locator(".dir-transport output").first().innerText(),
    /^\d+\.\d{3}s$/,
  );
  await page.getByRole("button", { name: "Frames", exact: true }).click();
  assert.match(
    await page.locator(".dir-transport output").first().innerText(),
    /^\d{2}:\d{2}$/,
  );
  checks.push("Frames / Time switches the readout");

  // Trim preview: the viewer follows the dragged in-point.
  await clip("photo-1").scrollIntoViewIfNeeded();
  const box = await clip("photo-1").boundingBox();
  const perFrame = box.width / 30;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 2 + perFrame * 6, box.y + box.height / 2, {
    steps: 4,
  });
  await page.locator(".dir-trim-readout").waitFor();
  assert.match(await page.locator(".dir-trim-readout").innerText(), /^In 2:06/);
  await page.waitForFunction(
    () =>
      document.querySelector("canvas[aria-label='Director preview']")?.dataset
        .frame === "66",
  );
  await page.screenshot({ path: `${output}/trim-preview.png` });
  await page.mouse.up();
  await page.locator(".dir-trim-readout").waitFor({ state: "detached" });
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  assert.notEqual(await stageFrame(), "66");
  checks.push(
    "Trimming an in-point shows that frame in the viewer, then returns",
  );

  // Move photo-2 down one lane onto photo-1's track.
  const lanes = await page.locator(".dir-lane").count();
  const p2 = await clip("photo-2").boundingBox();
  const target = await page
    .locator('.dir-lane[data-lane="photo-1"] .dir-track')
    .boundingBox();
  await page.mouse.move(p2.x + p2.width / 2, p2.y + p2.height / 2);
  await page.mouse.down();
  await page.mouse.move(p2.x + p2.width / 2 + 3, target.y + target.height / 2, {
    steps: 6,
  });
  await page.locator(".dir-clip-ghost").waitFor();
  await page.screenshot({ path: `${output}/cross-track-ghost.png` });
  await page.mouse.up();
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  assert.equal(await laneOf("photo-2"), "photo-1");
  assert.equal(await page.locator(".dir-lane").count(), lanes - 1);
  checks.push("Dragging a clip onto a matching track joins it");

  // A clip cannot land on a track with no room.
  const p1 = await clip("photo-1").boundingBox();
  const plate = await page
    .locator('.dir-lane[data-lane="plate"] .dir-track')
    .boundingBox();
  await page.mouse.move(p1.x + p1.width / 2, p1.y + p1.height / 2);
  await page.mouse.down();
  await page.mouse.move(p1.x + p1.width / 2 + 3, plate.y + plate.height / 2, {
    steps: 6,
  });
  await page.locator(".dir-clip-ghost.is-blocked").waitFor();
  await page.mouse.up();
  assert.equal(await laneOf("photo-1"), "photo-1");
  checks.push("A full track shows a blocked ghost and refuses the drop");

  // Drag onto the ruler for a new top track.
  const again = await clip("photo-1").boundingBox();
  const ruler = await page.locator(".dir-ruler-row").boundingBox();
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    again.x + again.width / 2 + 6,
    again.y + again.height / 2,
    {
      steps: 2,
    },
  );
  await page.locator(".dir-new-track").waitFor();
  await page.mouse.move(
    again.x + again.width / 2 + 6,
    ruler.y + ruler.height / 2,
    {
      steps: 6,
    },
  );
  await page.locator(".dir-new-track.is-target").waitFor();
  await page.mouse.up();
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  const top = await page
    .locator(".dir-lane:not(.dir-view)")
    .first()
    .getAttribute("data-lane");
  assert.equal(await laneOf("photo-1"), top);
  assert.match(top, /^track-\d+$/);
  checks.push("Dropping on the ruler spawns a new top track");

  // Alt+Down returns it to the next matching track with room.
  await clip("photo-1").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  assert.equal(await laneOf("photo-1"), "photo-1");
  checks.push("Alt+Down moves a clip to the next matching track with room");

  // Expanded timeline: taller tracks.
  const before = (
    await page.locator(".dir-lane .dir-track").first().boundingBox()
  ).height;
  await page.getByRole("button", { name: "Expand timeline" }).click();
  const after = (
    await page.locator(".dir-lane .dir-track").first().boundingBox()
  ).height;
  assert.ok(after >= before * 1.8, `Expanded ${before} → ${after}`);
  await page.screenshot({ path: `${output}/expanded.png` });
  await page.getByRole("button", { name: "Shrink timeline" }).click();
  checks.push(`Expand grows track height ${before}px → ${after}px`);

  // Delete / Backspace removes the selected clip; Undo restores it.
  await clip("photo-2").click();
  await page.keyboard.press("Backspace");
  await page.getByText("Ready · local preview", { exact: true }).waitFor();
  assert.equal(await clip("photo-2").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await clip("photo-2").waitFor();
  checks.push("Backspace deletes the selected clip and Undo restores it");

  // Dual Swords uses the same playback controls and keys.
  await page
    .getByRole("navigation", { name: "Studio presets" })
    .getByRole("button", { name: "Dual Swords", exact: true })
    .click();
  await page
    .getByLabel("Choose video A", { exact: true })
    .setInputFiles(
      resolve("docs/director-bundle/example/media/test-pattern.mp4"),
    );
  await page.getByRole("button", { name: "▤ Timeline", exact: true }).click();
  const addA = page.getByRole("button", { name: "＋ Add viewer A" });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "＋ Add viewer A" && !b.disabled,
    ),
  );
  await addA.click();
  const dualClip = page.locator(".de-timeline-clip");
  await dualClip.waitFor();
  const dualPlay = page
    .locator(".de-timeline-transport .playback-button")
    .first();
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () =>
      document.querySelector(".de-timeline-transport .playback-button")
        ?.ariaLabel === "Pause",
  );
  await page.keyboard.press("Space");
  assert.equal(await dualPlay.getAttribute("aria-label"), "Play");
  await page.screenshot({ path: `${output}/dual-transport.png` });
  await dualClip.click();
  await page.keyboard.press("Delete");
  await dualClip.waitFor({ state: "detached" });
  checks.push(
    "Dual Swords shares the controls; Space plays and Delete removes",
  );

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ output, checks, errors }, null, 2));
} finally {
  await browser.close();
}
