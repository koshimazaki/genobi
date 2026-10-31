/**
 * Confirm before spending (issue #23), for check-voice-overlay: a session
 * started from Voice reads a paid step the agent quoted; the bubble shows its
 * plan, price and payer with Approve and Decline; Approve sends one request
 * with a request key, Decline another, and a refusal shows the studio's
 * words. Fixture routes only: no agent runs and nothing is paid.
 */
import assert from "node:assert/strict";
import { listening, transcribed } from "./voice-fixture.mjs";

const QUOTE = "0f6c3c2e-6b1a-4f0e-9a43-3d7b0f3c9a11";
const session = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  prompt: "fixture",
  startedAt: "2026-10-21T12:00:00.000Z",
  lines: ["Working…"],
};
const pending = () => ({
  quoteId: QUOTE,
  status: "pending",
  plan: {
    entry: "flux-3-video",
    label: "FLUX 3 · Video",
    generator: "video",
    model: "flux-3",
    description: "A ceramic vessel turning on a plinth.",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "hd",
    draft: false,
    route: "bfl",
  },
  estimateUsd: 0.85,
  expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  payer: "server",
});
const job = {
  id: "job-approved-1",
  generator: "video",
  model: "flux-3",
  description: "A ceramic vessel turning on a plinth.",
  prompt: "A ceramic vessel turning on a plinth.",
  cameraEnabled: false,
  duration: 5,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
  status: "Pending",
  createdAt: "2026-10-21T12:00:00.000Z",
  updatedAt: "2026-10-21T12:00:00.000Z",
  costEstimateUsd: 0.85,
  keyMode: "server",
};

function agent(answers) {
  return {
    status: { available: true, runner: "claude" },
    session: { status: 201, json: { ...session, status: "starting" } },
    read: { ...session, status: "running", approvals: [pending()] },
    job,
    ...answers,
  };
}

async function waitingStep(open, answers) {
  const opened = await open({
    agent: agent(answers),
    path: "/",
    destination: "agent",
  });
  const { page, voice } = opened;
  await voice.click();
  await listening(page);
  await page.waitForTimeout(700);
  await transcribed(page);
  await page.getByText(/^Sent to Claude Code\./).waitFor();
  assert.equal(opened.sent.messages.length, 1);
  await page.getByText("Waiting for your approval").waitFor({ timeout: 8000 });
  return opened;
}

export async function approvalChecks({ open, checks, output }) {
  // The step: plan, price, payer, and the two buttons.
  let { context, page, sent } = await waitingStep(open, {
    approve: {
      status: 202,
      json: {
        session: {
          ...session,
          status: "running",
          approvals: [{ ...pending(), status: "started", jobId: job.id }],
        },
        job,
      },
    },
  });
  const steps = page.getByRole("list", {
    name: "Paid steps for you to approve",
  });
  for (const text of [
    "FLUX 3 · Video · 5 s, 16:9, hd · BFL",
    "A ceramic vessel turning on a plinth.",
    "$0.85",
    "The studio's demo key",
  ])
    assert(await steps.getByText(text, { exact: false }).count(), text);
  await page.screenshot({ path: `${output}/agent-approval-step.png` });
  assert.equal(sent.approvals.length, 0, "nothing is approved by showing it");
  await page.getByRole("button", { name: "Approve $0.85" }).click();
  await page
    .getByText("Approved. The run started; it is in your gallery.")
    .waitFor();
  assert.equal(sent.approvals.length, 1, "one Approve, one request");
  const [approval] = sent.approvals;
  assert.equal(approval.quote, QUOTE);
  assert.equal(approval.action, "approve");
  assert.equal(approval.header, "1");
  assert.match(approval.key, /^[0-9a-f-]{36}$/);
  assert.equal(
    await page.getByRole("button", { name: "Approve $0.85" }).count(),
    0,
  );
  assert.deepEqual(sent.writes, [], "no generation or other write");
  await context.close();
  checks.push(
    "Confirm before spending: an agent's quoted step shows its plan, price and payer; Approve sends one request with a request key and the step reads started; no other write",
  );

  // Decline: one request, no Approve left.
  ({ context, page, sent } = await waitingStep(open, {
    decline: {
      status: 200,
      json: {
        ...session,
        status: "running",
        approvals: [{ ...pending(), status: "declined" }],
      },
    },
  }));
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.getByText("Declined. Nothing ran.").waitFor();
  assert.deepEqual(
    sent.approvals.map((a) => a.action),
    ["decline"],
  );
  assert.deepEqual(sent.writes, []);
  await context.close();

  // A refusal (the run location changed): the studio's words, not retried.
  const words =
    "The run location or workflow changed since you chose it. Check them and try again; nothing was sent or charged.";
  ({ context, page, sent } = await waitingStep(open, {
    approve: { status: 409, json: { error: words, code: "settings_changed" } },
  }));
  await page.getByRole("button", { name: "Approve $0.85" }).click();
  await page.getByRole("alert").filter({ hasText: words }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(sent.approvals.length, 1, "a refusal is not retried");
  await context.close();
  checks.push(
    "Decline sends one request and the step reads declined; a refused Approve shows the studio's words and is not retried",
  );
}
