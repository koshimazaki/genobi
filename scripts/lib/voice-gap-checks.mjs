/**
 * Dictation into LTX's prompt gaps (#81), for check-voice-overlay: with the
 * Action tab open, the stubbed transcript lands in the Action gap, the
 * overlay names it, focus ends on the priced Generate, Update prompt
 * reapplies to the same gap and Escape there closes Voice. A spoken request
 * from the same tab still writes its subject into the main Prompt tab and
 * shows it. Nothing is ever submitted. Fixture routes only.
 */
import assert from "node:assert/strict";
import { listening, transcribed, TRANSCRIPT } from "./voice-fixture.mjs";

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

/** LTX-2.5 Fast through the model menu, then a gap's tab. */
async function ltxTab(page, name) {
  await page.getByRole("button", { name: /^Change model:/ }).click();
  const option = page.getByRole("option", {
    name: "LTX-2.5 Fast · Text to video",
    exact: true,
  });
  if (!(await option.isVisible()))
    await page.getByRole("button", { name: /LTX models/ }).click();
  await option.click();
  await page
    .getByRole("tablist", { name: "Prompt parts" })
    .getByRole("tab", { name: new RegExp(`^${name}`) })
    .click();
}

const tab = (page, name) =>
  page
    .getByRole("tablist", { name: "Prompt parts" })
    .getByRole("tab", { name: new RegExp(`^${name}`) });

export async function gapChecks({ open, checks, output }) {
  {
    const { context, page, voice, sent } = await open({
      path: "/?workspace=camera",
    });
    await ltxTab(page, "Action");
    await speak(page, voice);
    await page
      .getByText("In the Action gap. Nothing runs until you press Generate.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator("#prompt-action").inputValue(), TRANSCRIPT);
    assert.equal(
      await tab(page, "Action").getAttribute("aria-selected"),
      "true",
    );
    await onGenerate(page);
    await page.screenshot({ path: `${output}/voice-action-gap-1440.png` });
    // Update prompt reapplies the corrected words to the same gap.
    const corrected = "Initially, she lifts the lamp.";
    await page.getByLabel("Transcript", { exact: true }).fill(corrected);
    await page.getByRole("button", { name: "Update prompt" }).click();
    assert.equal(await page.locator("#prompt-action").inputValue(), corrected);
    await onGenerate(page);
    // Close Voice from Generate; the main prompt kept its own text.
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Voice" }).count(), 0);
    await tab(page, "Prompt").click();
    assert.notEqual(
      await page.locator("#description").inputValue(),
      corrected,
      "the main prompt is not the gap",
    );
    await page.waitForTimeout(400);
    assert.deepEqual(sent.writes, [], "nothing is submitted");
    await context.close();
  }
  {
    // Escape from the handed-off Generate closes Voice, from a gap too.
    const { context, page, voice, sent } = await open({
      path: "/?workspace=camera",
    });
    await ltxTab(page, "Audio");
    await speak(page, voice);
    await page.getByText("In the Audio gap.", { exact: false }).waitFor();
    await onGenerate(page);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "Voice" }).count(), 0);
    assert(
      await page.evaluate(() =>
        document.activeElement?.classList.contains("generate-button"),
      ),
      "Escape keeps focus on Generate",
    );
    assert.deepEqual(sent.writes, [], "nothing is submitted");
    await context.close();
  }
  {
    // A spoken request from a gap still writes the main prompt.
    const { context, page, voice, sent } = await open({
      path: "/?workspace=camera",
      text: "Make a video with LTX of a lighthouse.",
    });
    await ltxTab(page, "Action");
    await speak(page, voice);
    await page.getByText(/^Camera: LTX-2\.5/).waitFor();
    await tab(page, "Prompt")
      .and(page.locator('[aria-selected="true"]'))
      .waitFor();
    assert.equal(
      await page.locator("#description").inputValue(),
      "a lighthouse",
    );
    assert.equal(await page.locator("#prompt-action").count(), 0);
    await onGenerate(page);
    await page.waitForTimeout(400);
    assert.deepEqual(sent.writes, [], "nothing is submitted");
    await context.close();
  }
  checks.push(
    "LTX Action gap open: the transcript lands in the Action gap (“In the Action gap.”), focus ends on the priced Generate, Update prompt reapplies to the same gap, Escape from a gap closes Voice with focus on Generate, and nothing is submitted",
    "A spoken request (“Make a video with LTX of a lighthouse.”) from the Action tab writes “a lighthouse” into the main Prompt tab and shows that tab",
  );
}
