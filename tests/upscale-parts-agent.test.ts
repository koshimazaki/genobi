import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { quoted } from "./agent-approvals-harness";
import { hasFfmpeg } from "./ffmpeg-harness";
import { input } from "./server-harness";

// A studio agent's split upscale: its plan becomes ONE step the person
// approves; Approve confirms the set (each part reserved and sent once) and
// the parts are joined; Decline sends nothing; the agent cannot confirm its
// own set. A fake runner plans as the agent's MCP server would; the
// provider is a fake. Real ffmpeg cuts and joins; skipped without it.
const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

async function render(args: string[]) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-agent-parts-"));
  folders.push(folder);
  const file = path.join(folder, "clip.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args, file]);
  return file;
}

const longClip = () =>
  render([
    ...["-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=23.125"],
    ...["-f", "lavfi", "-i", "sine=frequency=440:duration=23.125"],
    ...["-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"],
  ]);

const request = {
  ...input,
  generator: "upscale",
  sourceId: "SOURCE",
  upscaleFactor: 2,
};

async function planned(extra = "") {
  const file = await longClip();
  return quoted(
    request,
    { app: { upscaleFollowMs: 0 } },
    `upload ${file} parts ${extra}`,
    // Real ffmpeg cuts while the session runs: up to 45 s under load.
    900,
  );
}

describe("a studio agent's split upscale", () => {
  it.skipIf(!hasFfmpeg)(
    "is one approval; approving sends each part once and joins them",
    async () => {
      const { studio, approval, step, session } = await planned();
      expect(session.lines.some((l) => l.startsWith("planned 201 "))).toBe(
        true,
      );
      expect(approval.setId).toMatch(/^[0-9a-f-]{36}$/);
      expect(approval.plan.upscale?.parts).toBe(2);
      expect(approval.estimateUsd).toBeGreaterThan(0);
      expect(session.approvals).toHaveLength(1);
      expect(studio.bfl.submissions).toBe(0);

      const approved = await step(approval.quoteId, "approve");
      expect(approved.status).toBe(202);
      expect(studio.bfl.submissions).toBe(2);
      expect((await step(approval.quoteId, "approve")).status).toBe(409);
      expect(studio.bfl.submissions).toBe(2);

      const set = studio.store.data.partSets[0];
      expect(set.confirmation).toBeDefined();
      studio.bfl.media = new Uint8Array(
        await readFile(
          await render([
            ...["-f", "lavfi", "-i", "testsrc=size=320x180:rate=24"],
            ...["-frames:v", "456", "-c:v", "libx264", "-pix_fmt"],
            ...["yuv420p", "-an"],
          ]),
        ),
      );
      studio.bfl.ready = true;
      for (const job of studio.store.data.jobs) job.lastPolledAt = 0;
      const { set: done } = await studio.parts.read(set.id, set.sessionId);
      expect(done.status).toBe("joined");
      expect(done.joined?.width).toBe(320);
      expect(studio.bfl.submissions).toBe(2);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "sends nothing when the person declines, and never after",
    async () => {
      const { studio, approval, step } = await planned();
      expect((await step(approval.quoteId, "decline")).status).toBe(200);
      expect((await step(approval.quoteId, "approve")).status).toBe(409);
      const set = studio.store.data.partSets[0];
      expect(set.declined).toBe(true);
      await expect(
        studio.parts.confirm(set.id, set.sessionId, set.quoteId),
      ).rejects.toMatchObject({ code: "set_declined" });
      expect(studio.bfl.submissions).toBe(0);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "refuses the agent's own confirmation",
    async () => {
      const { studio, session } = await planned("self-confirm");
      expect(session.lines).toContain("self-confirm 403 agent_cannot_spend");
      expect(studio.bfl.submissions).toBe(0);
    },
    60_000,
  );
});
