// The session token sweep: a group is found by the exact token in one of its
// processes' environment, never by another token, after it was orphaned.
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { RUN_TOKEN_VARIABLE, tokenGroups } from "../server/agent-reap";

const started: number[] = [];
afterEach(() => {
  // Only the groups this test started, by their own pid.
  for (const pid of started.splice(0))
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Already gone.
    }
});

/** A detached node process, a group of its own, carrying `token`. */
async function marked(token: string) {
  const child = spawn(
    process.execPath,
    ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000);"],
    {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, [RUN_TOKEN_VARIABLE]: token },
    },
  );
  await new Promise((resolve) => child.stdout.once("data", resolve));
  child.stdout.destroy();
  child.unref();
  started.push(child.pid!);
  return child.pid!;
}

describe.runIf(["darwin", "linux"].includes(process.platform))(
  "tokenGroups",
  () => {
    it("finds the group holding the exact token, and no other", async () => {
      const mine = await marked("a1b2c3d4e5f6a1b2c3d4e5f6");
      const other = await marked("a1b2c3d4e5f6a1b2c3d4e5f6ff");
      const groups = await tokenGroups("a1b2c3d4e5f6a1b2c3d4e5f6");
      expect(groups).toContain(mine);
      expect(groups).not.toContain(other);
      expect(groups).not.toContain(process.pid);
      expect(await tokenGroups("0000000000000000000000ff")).toEqual([]);
    });
  },
);
