import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentApproval } from "../shared/agent-approval";
import { derivedMedia } from "../server/project-derived";
import { agentStudio } from "./agent-harness";
import { hasFfmpeg } from "./ffmpeg-harness";
import { input } from "./server-harness";

// A studio agent split-upscales a long take the PERSON picked: the plan reads
// the take through the agent's read scope, as a quote does; the cuts, runs
// and join stay in the agent's session; the joined clip's history (the
// upscaled parts and the person's picked take) passes the hand-in lineage
// check through the same scope. Fake provider; real ffmpeg, skipped without.
const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

async function render(args: string[]) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-picked-"));
  folders.push(folder);
  const file = path.join(folder, "clip.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args, file]);
  return new Uint8Array(await readFile(file));
}

describe("an agent's split upscale of a take the person picked", () => {
  it.skipIf(!hasFfmpeg)(
    "plans through the read scope, is approved once, joins, and hands in",
    async () => {
      const studio = await agentStudio({ app: { upscaleFollowMs: 0 } });
      const person = await studio.fresh();
      // The person's own 23.125 s take, finished.
      studio.bfl.media = await render([
        ...["-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=23.125"],
        ...["-f", "lavfi", "-i", "sine=frequency=440:duration=23.125"],
        ...["-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
        ...["-c:a", "aac", "-f", "mp4"],
      ]);
      studio.bfl.ready = true;
      const made = await fetch(`${studio.base}/api/jobs`, {
        method: "POST",
        headers: {
          cookie: person,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ ...input, description: "The mix" }),
      });
      const take = (await made.json()).job.id as string;
      for (let i = 0; i < 50; i++) {
        const { job } = await (
          await fetch(`${studio.base}/api/jobs/${take}`, {
            headers: { cookie: person },
          })
        ).json();
        if (job.status === "Ready") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const owner = studio.store.data.sources.find((s) => s.id === take)!;
      expect(owner.duration).toBeGreaterThan(20);
      const before = studio.bfl.submissions;

      const request = {
        ...input,
        generator: "upscale",
        model: "flux-3",
        sourceId: take,
        upscaleFactor: 2,
      };
      const started = await studio.start(
        person,
        `quote ${JSON.stringify(request)} parts`,
        {
          context: {
            picks: [{ kind: "take", id: take, media: "video", name: "Mix" }],
          },
        },
      );
      const session = await studio.settle(person, started.body.id, 900);
      expect(session.lines.some((l) => l.startsWith("planned 201 "))).toBe(
        true,
      );
      const approval = session.approvals?.[0] as AgentApproval;
      expect(approval.setId).toBeTruthy();
      expect(approval.plan.upscale).toMatchObject({ sourceId: take, parts: 2 });

      const set = studio.store.data.partSets[0];
      expect(set.sourceSession).toBe(owner.sessionId);
      expect(set.sessionId).not.toBe(owner.sessionId);
      // The cuts are the agent's, made from the person's take.
      for (const part of set.parts)
        expect(
          studio.store.data.sources.find((s) => s.id === part.sourceId)
            ?.sessionId,
        ).toBe(set.sessionId);

      const approved = await studio.call(
        person,
        `/sessions/${started.body.id}/approvals/${approval.quoteId}/approve`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      expect(approved.status).toBe(202);
      expect(studio.bfl.submissions - before).toBe(2);

      for (const job of studio.store.data.jobs) job.lastPolledAt = 0;
      const { set: done } = await studio.parts.read(set.id, set.sessionId);
      expect(done.status).toBe("joined");
      expect(studio.bfl.submissions - before).toBe(2);

      // The hand-in reads the picked take as the person's, as the agent
      // scope does; without that scope the history is someone else's.
      const reader = set.sessionId;
      const scope = (id: string) => (id === take ? owner.sessionId : reader);
      const handIn = await derivedMedia(
        studio.service,
        studio.store,
        done.joined!.id,
        reader,
        scope,
      );
      expect(handIn.derived?.operation).toBe("concat");
      expect(handIn.derived?.sources).toHaveLength(3);
      await expect(
        derivedMedia(studio.service, studio.store, done.joined!.id, reader),
      ).rejects.toMatchObject({ code: "derived_foreign" });
    },
    90_000,
  );
});
