/**
 * Spoken generation requests (issue #23), for check-voice-overlay: from the
 * Gallery, "generate an image with FLUX of a penguin" opens Camera, selects
 * FLUX 3 Image Klein, writes "a penguin" and stops on the priced Generate;
 * from Camera, a request changes mode and model without moving the hero,
 * composer, toolbar or gallery; nothing is ever submitted. The transcription
 * is a fixture answer: no audio is recorded and no model runs.
 */
import assert from "node:assert/strict";
import { listening, overflow, transcribed } from "./voice-fixture.mjs";

const PENGUIN = "I want to generate an image with FLUX of a penguin.";
const KLEIN = "Change model: FLUX 3 Image Klein · Image";
const parts = {
  hero: ".featured-video",
  composer: "section.composer",
  toolbar: ".composer-toolbar",
  gallery: "section.gallery",
};

/** Each part's box in page coordinates, so a scroll is not a move. */
const measure = (page) =>
  page.evaluate(
    (parts) =>
      Object.fromEntries(
        Object.entries(parts).map(([name, selector]) => {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          // An empty part (the fixture's gallery holds no runs) has no box
          // to move, wherever the browser places its zero-size rectangle.
          return [
            name,
            r &&
              (r.width || r.height) &&
              [r.x + scrollX, r.y + scrollY, r.width, r.height]
                .map(Math.round)
                .join(" "),
          ];
        }),
      ),
    parts,
  );

async function speak(page, voice) {
  await voice.click();
  await listening(page);
  await page.waitForTimeout(700);
  return transcribed(page);
}

const onGenerate = (page) =>
  page.waitForFunction(() =>
    document.activeElement?.classList.contains("generate-button"),
  );

export async function intentChecks({ open, checks, output }) {
  // From the Gallery: Camera opens on Klein with the subject as the prompt.
  for (const width of [1440, 390]) {
    const { context, page, voice, sent } = await open({
      destination: "camera",
      width,
      path: "/",
      text: PENGUIN,
    });
    await speak(page, voice);
    await page.locator('.genobi-shell[data-preset="camera"]').waitFor();
    assert.match(page.url(), /workspace=camera/);
    await page.getByRole("button", { name: KLEIN }).waitFor();
    assert.equal(await page.locator("#image-prompt").inputValue(), "a penguin");
    await page
      .getByText(
        "Camera: FLUX 3 Image Klein · Image, prompt “a penguin”. Nothing runs until you press Generate.",
        { exact: true },
      )
      .waitFor();
    await onGenerate(page);
    assert.equal(
      await page.getByLabel("Voice destination").inputValue(),
      "camera",
    );
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    // Settled, and long enough for a submission to have shown up.
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${output}/voice-intent-${width}.png` });
    // A correction is read again only on Update prompt, then lands as before.
    await page
      .getByLabel("Transcript", { exact: true })
      .fill("I want to generate an image with FLUX of a pelican.");
    assert.equal(await page.locator("#image-prompt").inputValue(), "a penguin");
    await page.getByRole("button", { name: "Update prompt" }).click();
    assert.equal(await page.locator("#image-prompt").inputValue(), "a pelican");
    await onGenerate(page);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Voice" }).count(), 0);
    assert(
      await page.evaluate(() =>
        document.activeElement?.classList.contains("generate-button"),
      ),
      "Escape keeps focus on Generate",
    );
    await page.waitForTimeout(400);
    assert.deepEqual(sent.writes, [], "nothing is submitted");
    assert.equal(sent.agentStatus.length, 0, "no agent is asked");
    await context.close();
  }
  checks.push(
    "From the Gallery (1440 and 390 px), “generate an image with FLUX of a penguin” opens Camera, selects FLUX 3 Image Klein, writes “a penguin”, focuses the priced Generate and submits nothing; Update prompt carries a corrected subject (“a pelican”) and Escape on Generate closes Voice",
  );

  // A misheard request from the Gallery goes nowhere; an explicit resend
  // reads it once more and routes it.
  {
    const { context, page, voice, sent } = await open({
      destination: "camera",
      path: "/",
      text: "make an imag of a penguin",
    });
    await speak(page, voice);
    await page
      .getByText(
        "No Camera request was recognised. Choose Agent or a prompt to use these words directly.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Send to selected destination" })
        .count(),
      1,
      "an explicit send stays available without any automatic retry",
    );
    await page
      .getByLabel("Transcript", { exact: true })
      .fill("make an image of a penguin");
    await page
      .getByRole("button", { name: "Send to selected destination" })
      .click();
    await page.locator('.genobi-shell[data-preset="camera"]').waitFor();
    await page.getByRole("button", { name: KLEIN }).waitFor();
    assert.equal(await page.locator("#image-prompt").inputValue(), "a penguin");
    await onGenerate(page);
    await page.waitForTimeout(400);
    assert.deepEqual(sent.writes, [], "nothing is submitted");
    await context.close();
  }
  checks.push(
    "A misheard Camera request stays in the transcript; correcting and explicitly sending it opens Camera on Klein and submits nothing",
  );

  // From Camera in video: the request moves to an image mode and back to
  // LTX video; the hero, composer, toolbar and gallery stay where they are.
  for (const width of [1440, 390]) {
    let { context, page, voice, sent } = await open({
      destination: "camera",
      width,
      path: "/?workspace=camera",
      text: "image of a penguin",
    });
    await page.locator(parts.toolbar).waitFor();
    const video = await measure(page);
    await speak(page, voice);
    await page.getByRole("button", { name: KLEIN }).waitFor();
    await onGenerate(page);
    assert.deepEqual(await measure(page), video, `video → image at ${width}`);
    assert.deepEqual(sent.writes, []);
    await context.close();

    ({ context, page, voice, sent } = await open({
      destination: "camera",
      width,
      path: "/?workspace=camera",
      text: "Make a video with LTX of a neon street at night.",
    }));
    await page.locator(parts.toolbar).waitFor();
    const before = await measure(page);
    await speak(page, voice);
    await page
      .getByRole("button", {
        name: "Change model: LTX-2.5 Fast · Text to video",
      })
      .waitFor();
    assert.equal(
      await page.locator("#description").inputValue(),
      "a neon street at night",
    );
    await onGenerate(page);
    assert.deepEqual(await measure(page), before, `FLUX → LTX at ${width}`);
    assert.deepEqual(sent.writes, []);
    await context.close();
  }
  checks.push(
    "From Camera (1440 and 390 px), a spoken image request and an LTX video request switch mode and model without moving the hero, composer, toolbar or gallery",
  );
}
