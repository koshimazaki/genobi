/**
 * Where the transcript goes (issue #23), for check-voice-overlay: with a
 * prompt on screen it goes straight in, says which, focuses the priced
 * Generate and submits nothing; with none on screen the overlay says so and
 * offers a session without switching the section; Send to agent instead (or
 * Do it in a session) asks the agent status first and starts a session only
 * when the route is there and available. Fixture routes only.
 */
import assert from "node:assert/strict";
import {
  HANDLE,
  layout,
  listening,
  overflow,
  SEND,
  transcribed,
  TRANSCRIPT,
} from "./voice-fixture.mjs";

const NOT_SET_UP = "Agent sessions aren't set up on this server.";
const STARTED = {
  status: { available: true, runner: "claude" },
  session: {
    status: 201,
    json: {
      id: "session-1",
      runner: "claude",
      status: "starting",
      prompt: "fixture",
      startedAt: "2026-10-21T12:00:00.000Z",
      lines: ["Starting Claude Code…"],
    },
  },
};

/** Opens the pill (which records), stops it and returns the transcript. */
async function speak(page, voice) {
  await voice.click();
  await listening(page);
  await page.waitForTimeout(700);
  return transcribed(page);
}

const UPDATE = "Update prompt";
const onGenerate = (page) =>
  page.waitForFunction(() =>
    document.activeElement?.classList.contains("generate-button"),
  );
const button = (page, name) => page.getByRole("button", { name, exact: true });

export async function destinationChecks({ open, checks, output }) {
  // A prompt on screen: Camera takes the transcript with no picker, and
  // focus ends on the priced Generate, which nothing presses.
  let { context, page, voice, sent } = await open({
    path: "/?workspace=camera",
  });
  await speak(page, voice);
  await page
    .getByText("In the Camera prompt. Nothing runs until you press Generate.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator("#description").inputValue(), TRANSCRIPT);
  await onGenerate(page);
  assert.equal(await button(page, "Camera prompt").count(), 0, "no picker");
  assert(await button(page, SEND).isVisible(), "the session stays offered");
  assert.equal(sent.agentStatus.length, 0, "a fill asks no agent");
  await page.waitForTimeout(400);
  assert.deepEqual(sent.writes, [], "nothing is submitted");
  await page.screenshot({ path: `${output}/voice-destinations-1440.png` });
  // A corrected transcript reaches the prompt only through Update prompt.
  const corrected = "A slow dolly in on a forest shaman.";
  assert.equal(await button(page, UPDATE).count(), 0, "nothing to update yet");
  await page.getByLabel("Transcript", { exact: true }).fill(corrected);
  assert.equal(await page.locator("#description").inputValue(), TRANSCRIPT);
  await button(page, UPDATE).click();
  assert.equal(await page.locator("#description").inputValue(), corrected);
  await onGenerate(page);
  assert.equal(await button(page, UPDATE).count(), 0, "up to date");
  // Escape on the handed-off Generate closes Voice and presses nothing.
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "Voice" }).count(), 0);
  assert(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("generate-button"),
    ),
    "focus stays on Generate",
  );
  await page.waitForTimeout(400);
  assert.deepEqual(sent.writes, [], "nothing is submitted");
  await context.close();
  checks.push(
    "Camera with a prompt: the transcript goes straight into the Camera prompt, focus ends on the priced Generate and nothing is submitted",
    "A corrected transcript reaches the Camera prompt through Update prompt; Escape on the focused Generate closes Voice, keeps focus there and submits nothing",
  );

  // No prompt on screen: Gallery says so, offers a session and stays put.
  for (const width of [1440, 390]) {
    ({ context, page, voice, sent } = await open({ width, path: "/" }));
    const still = await layout(page);
    await speak(page, voice);
    await page.getByText("No prompt on this screen.").waitFor();
    assert.equal(await page.locator(".voice-use").count(), 1);
    assert.equal(await button(page, SEND).count(), 0);
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    await page.screenshot({ path: `${output}/voice-no-prompt-${width}.png` });
    await button(page, "Do it in a session").click();
    await page.getByText(NOT_SET_UP, { exact: true }).waitFor();
    assert.equal(
      await page.locator(".genobi-shell").getAttribute("data-preset"),
      "gallery",
      "no silent switch to Camera",
    );
    assert.doesNotMatch(page.url(), /workspace=camera/);
    assert.deepEqual(await layout(page), still, `Gallery stays at ${width}`);
    assert.equal(sent.agentStatus.length, 1);
    assert.equal(sent.sessions.length, 0);
    await context.close();
  }
  checks.push(
    "No prompt on screen (Gallery, 1440 and 390 px): says so, offers Do it in a session, runs the session path and does not switch section",
  );

  // Send to agent instead, route missing: says so and sends nothing.
  ({ context, page, voice, sent } = await open());
  await speak(page, voice);
  await button(page, SEND).click();
  await page.getByText(NOT_SET_UP, { exact: true }).waitFor();
  assert.deepEqual(sent.agentStatus, ["1"], "status first, with the header");
  assert.equal(sent.sessions.length, 0, "nothing is sent");
  assert(await button(page, SEND).isVisible(), "it stays");
  await context.close();
  checks.push(
    "Send to agent instead with no agent route: asks the status, says sessions aren't set up and sends nothing",
  );

  // Project prompt, not available: the server's message, nothing sent.
  const reason = "Install Claude Code or Hermes, then restart the server.";
  ({ context, page, voice, sent } = await open({
    agent: { status: { available: false, message: reason } },
  }));
  await speak(page, voice);
  await button(page, SEND).click();
  await page.getByText(`${NOT_SET_UP} ${reason}`, { exact: true }).waitFor();
  assert.equal(sent.sessions.length, 0);
  await context.close();
  checks.push(
    "Send to agent instead with available: false shows the server's message and sends nothing",
  );

  // Project prompt, available: posts the transcript and the open project's
  // copy, says the session started and opens the session panel.
  for (const width of [1440, 320]) {
    ({ context, page, voice, sent } = await open({
      width,
      agent: STARTED,
      copy: true,
    }));
    // The studio pushes its copy once the Director project is open.
    for (let i = 0; i < 50 && !sent.copies.size; i++)
      await page.waitForTimeout(100);
    const still = await layout(page);
    await speak(page, voice);
    assert(!(await overflow(page)), `no horizontal overflow at ${width}`);
    await button(page, SEND).click();
    await page
      .getByText("Session started with Claude Code on the open project.")
      .waitFor();
    await page.screenshot({ path: `${output}/voice-session-${width}.png` });
    assert.equal(sent.sessions.length, 1);
    const [{ header, body }] = sent.sessions;
    const [project] = [...sent.copies];
    assert(project, "the fixture holds the open project's copy");
    assert.equal(header, "1");
    const { context: studio, ...request } = body;
    assert.deepEqual(request, {
      prompt: TRANSCRIPT,
      source: "voice",
      copyId: `${project}.${HANDLE}`,
    });
    // The studio's context: picks (none made here) and the composer's
    // settings in genobi_quote's names, with no prompt text and no key.
    assert(Array.isArray(studio?.picks), "the start carries the picks");
    assert.equal(typeof studio.settings?.model, "string");
    assert.equal(typeof studio.settings?.generator, "string");
    assert(!/key|https?:|description/i.test(JSON.stringify(studio)));
    await page
      .getByRole("region", { name: "Agent session" })
      .waitFor({ timeout: 5000 });
    // Folding and reopening the transcript keeps the one-session guard.
    await page.getByRole("button", { name: "Hide transcript" }).click();
    await page.getByRole("button", { name: "Show transcript" }).click();
    const again = button(page, SEND);
    assert.equal(await again.getAttribute("aria-disabled"), "true");
    await again.click({ force: true });
    await page.waitForTimeout(300);
    assert.equal(sent.sessions.length, 1, "one session per transcript");
    assert.deepEqual(await layout(page), still, `nothing moves at ${width}`);
    await context.close();
  }
  checks.push(
    "Send to agent instead when available (1440 and 320 px): posts {prompt, copyId, source: voice, context: picks and composer settings} with X-Genobi-Agent, says the session started, opens the session panel; folding keeps the one-session guard",
  );

  // Project prompt, refused by the server: its message, as an alert.
  ({ context, page, voice, sent } = await open({
    agent: {
      status: { available: true, runner: "hermes" },
      session: {
        status: 409,
        json: { error: "A session is already running." },
      },
    },
  }));
  await speak(page, voice);
  await button(page, SEND).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "A session is already running." })
    .waitFor();
  assert.equal(sent.sessions.length, 1);
  assert.equal(
    await page.getByRole("region", { name: "Agent session" }).count(),
    0,
    "a refused session opens no panel",
  );
  await context.close();
  checks.push(
    "Send to agent instead, refused by the server, shows its message",
  );
}
