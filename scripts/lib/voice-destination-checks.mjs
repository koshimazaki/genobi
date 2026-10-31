/** Explicit voice routing, retained conversation and prompt targets. Fixtures only. */
import assert from "node:assert/strict";
import { listening, overflow, transcribed } from "./voice-fixture.mjs";

const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Fixture scene direction",
  startedAt: "2026-10-31T00:00:00Z",
  lines: ["Fixture agent"],
  live: true,
};
const AGENT = {
  status: { available: true, runner: "claude" },
  read: SESSION,
  session: { json: SESSION },
};
const REQUEST = "Make an image with FLUX of a penguin.";
const speak = async (page, voice) => {
  await voice.click();
  await listening(page);
  await page.waitForTimeout(700);
  await transcribed(page);
};
const delivered = async (page, sent, count) => {
  await page.waitForFunction(() =>
    document
      .querySelector(".voice-routed")
      ?.textContent?.startsWith("Sent to Claude Code."),
  );
  assert.equal(sent.messages.length, count);
};

export async function destinationChecks({ open, checks, output }) {
  for (const width of [1440, 390, 320]) {
    // null leaves browser storage empty, exercising the actual default.
    const { context, page, voice, sent } = await open({
      width,
      path: "/",
      destination: null,
      agent: AGENT,
      text: REQUEST,
    });
    if (width <= 700) {
      const header = await page.locator(".topbar").boundingBox();
      const bubble = await page.locator(".agent-bubble").boundingBox();
      assert(
        bubble.y >= header.y + header.height,
        `the open conversation leaves every header control reachable at ${width}`,
      );
    }
    const entry =
      width === 390
        ? page
            .locator(".agent-bubble")
            .getByRole("button", { name: "Speak to agent" })
        : voice;
    await speak(page, entry);
    await delivered(page, sent, 1);
    assert.equal(
      await page.getByLabel("Voice destination").inputValue(),
      "agent",
    );
    assert.equal(sent.messages[0].id, SESSION.id);
    assert.deepEqual(sent.messages[0].body, {
      prompt: REQUEST,
      source: "voice",
    });
    assert.equal(sent.messages[0].header, "1");
    assert.doesNotMatch(page.url(), /workspace=camera/);
    assert.equal(sent.sessions.length, 0);
    assert.deepEqual(sent.writes, []);
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    await page.screenshot({
      path: `${output}/voice-agent-default-${width}.png`,
    });
    // Folding and reopening the transcript never delivers it again.
    await page.getByRole("button", { name: "Hide transcript" }).click();
    await page.getByRole("button", { name: "Show transcript" }).click();
    assert.equal(sent.messages.length, 1);
    await page.getByRole("button", { name: "Close voice" }).click();
    await speak(page, voice);
    await delivered(page, sent, 2);
    assert(sent.messages.every(({ id }) => id === SESSION.id));
    await page
      .getByLabel("Transcript", { exact: true })
      .fill("Make it slower.");
    await page.getByRole("button", { name: "Send correction" }).click();
    await delivered(page, sent, 3);
    assert.equal(sent.messages[2].id, SESSION.id);
    await context.close();
  }
  checks.push(
    "Fresh browser defaults to Agent, Camera-shaped words stay with the selected conversation, notes and corrections reuse it, and folding never resends.",
  );

  // The activity log selects its own conversation through the same recorder.
  {
    const { context, page, sent } = await open({
      path: "/",
      destination: null,
      agent: AGENT,
      text: REQUEST,
    });
    await page.locator(".deck-bar").click();
    await speak(
      page,
      page.locator(".deck-log").getByRole("button", { name: "Speak to agent" }),
    );
    await delivered(page, sent, 1);
    assert.equal(sent.messages[0].id, SESSION.id);
    assert.equal(sent.sessions.length, 0);
    assert.deepEqual(sent.writes, []);
    await context.close();
  }
  checks.push(
    "Bubble and activity-log microphone entry points reuse the shared recorder and selected conversation.",
  );

  // Prompt choice is explicit, remembered, and does not resend an existing note.
  {
    const { context, page, voice, sent } = await open({
      path: "/?workspace=camera",
      destination: "prompt:description",
      text: "A quiet room.",
    });
    await speak(page, voice);
    await page
      .getByText(
        "In the Camera prompt. Nothing runs until you press Generate.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.locator("#description").inputValue(),
      "A quiet room.",
    );
    await page
      .getByLabel("Transcript", { exact: true })
      .fill("A large quiet room.");
    assert.equal(
      await page.locator("#description").inputValue(),
      "A quiet room.",
    );
    await page.getByRole("button", { name: "Update prompt" }).click();
    assert.equal(
      await page.locator("#description").inputValue(),
      "A large quiet room.",
    );
    await page.getByLabel("Voice destination").selectOption("agent");
    assert.equal(sent.messages.length, 0);
    assert.equal(sent.sessions.length, 0);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("genobi.voice.destination"),
      ),
      "agent",
    );
    assert.deepEqual(sent.writes, []);
    await context.close();
  }
  checks.push(
    "Named prompt dictation is explicit; correction edits the same field; changing the destination only affects later notes until an explicit send.",
  );

  // A refused message is retained instead of overwriting Camera's prompt.
  {
    const { context, page, voice, sent } = await open({
      path: "/?workspace=camera",
      destination: "agent",
      text: REQUEST,
      agent: {
        ...AGENT,
        message: {
          status: 409,
          json: {
            error: "Fixture: conversation is finishing.",
            code: "agent_session_finishing",
          },
        },
      },
    });
    const before = await page.locator("#description").inputValue();
    await speak(page, voice);
    await page
      .getByText("Fixture: conversation is finishing.", { exact: true })
      .waitFor();
    assert.equal(await page.locator("#description").inputValue(), before);
    assert.equal(sent.messages.length, 1);
    assert.equal(sent.sessions.length, 0);
    assert.deepEqual(sent.writes, []);
    await context.close();
  }
  checks.push(
    "A refused agent send keeps the transcript, changes no prompt and makes no automatic retry.",
  );
}
