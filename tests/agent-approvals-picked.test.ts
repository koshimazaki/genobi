// Confirm before spending with picks (issue #23): an agent quotes an upscale
// of a take the person picked; the step records that the person's session
// held the source, and Approve reads it there again, under the key lock, so
// the run submits once with that clip. An unpicked take of the person's is
// never quoted, so nothing can be approved. Fake provider only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentApproval } from "../shared/agent-approval";
import { agentStudio } from "./agent-harness";
import { input } from "./server-harness";

type Studio = Awaited<ReturnType<typeof agentStudio>>;

async function finished(studio: Studio, cookie: string, description: string) {
  const made = await fetch(`${studio.base}/api/jobs`, {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ ...input, description }),
  });
  const id = (await made.json()).job.id as string;
  for (let i = 0; i < 50; i++) {
    const { job } = await (
      await fetch(`${studio.base}/api/jobs/${id}`, { headers: { cookie } })
    ).json();
    if (job.status === "Ready") return id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The take did not finish.");
}

const upscale = (sourceId: string) => ({
  ...input,
  generator: "upscale",
  model: "flux-3",
  sourceId,
  upscaleFactor: 2,
});

describe("approving an upscale of a picked take", () => {
  it("records the person's session as the source's and submits once with that clip; an unpicked take is never offered", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    studio.bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    studio.bfl.ready = true;
    const picked = await finished(studio, person, "Picked");
    const unpicked = await finished(studio, person, "Not picked");
    const before = studio.bfl.submissions;
    const context = {
      picks: [{ kind: "take", id: picked, media: "video", name: "Picked" }],
    };

    // An unpicked take: the agent's quote is refused, so there is no step.
    const refused = await studio.start(
      person,
      `quote ${JSON.stringify(upscale(unpicked))}`,
      { context },
    );
    const none = await studio.settle(person, refused.body.id);
    expect(none.approvals).toBeUndefined();
    expect(none.lines.some((l) => /^quoted 404 /.test(l))).toBe(true);

    // The picked take: quoted through the read scope, offered, approved.
    const started = await studio.start(
      person,
      `quote ${JSON.stringify(upscale(picked))}`,
      { context },
    );
    const session = await studio.settle(person, started.body.id);
    const approval = session.approvals?.[0] as AgentApproval;
    expect(approval.plan.upscale?.sourceId).toBe(picked);
    const approved = await studio.call(
      person,
      `/sessions/${started.body.id}/approvals/${approval.quoteId}/approve`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } },
    );
    expect(approved.status, JSON.stringify(approved.body)).toBe(202);
    expect(approved.body.job).toMatchObject({
      generator: "upscale",
      sourceId: picked,
    });
    expect(studio.bfl.submissions).toBe(before + 1);
  });
});
