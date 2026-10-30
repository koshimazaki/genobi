import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ServerRestart } from "../server/server-restart";
import { setup } from "./server-harness";
import {
  AGENT_MARK_HEADER,
  AGENT_REQUEST_HEADER,
} from "../shared/agent-session-events";

async function checkout() {
  const root = await mkdtemp(path.join(tmpdir(), "genobi-restart-"));
  await mkdir(path.join(root, "server/nested"), { recursive: true });
  await mkdir(path.join(root, "shared"));
  const file = path.join(root, "server/nested/app.ts");
  await writeFile(file, "export {};");
  const past = new Date(Date.now() - 60_000);
  await utimes(file, past, past);
  return { root, file };
}

describe("local server restart", () => {
  it("reports server code changed after start, including nested files", async () => {
    const { root, file } = await checkout();
    const server = new ServerRestart(() => {}, root);
    expect(await server.state()).toEqual({ restartable: true, changed: false });
    const later = new Date(Date.now() + 5_000);
    await utimes(file, later, later);
    expect((await server.state()).changed).toBe(true);
  });

  it("schedules one restart however often it is asked, and none unsupervised", async () => {
    vi.useFakeTimers();
    try {
      const restart = vi.fn();
      const server = new ServerRestart(restart);
      expect(server.request()).toBe(true);
      expect(server.request()).toBe(true);
      vi.runAllTimers();
      expect(restart).toHaveBeenCalledTimes(1);
      expect(new ServerRestart().request()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses while a submission is in flight and schedules nothing", async () => {
    vi.useFakeTimers();
    try {
      const restart = vi.fn();
      let reason: string | undefined = "1 submission is still being sent.";
      const server = new ServerRestart(restart, undefined, () => reason);
      expect(server.busy()).toBe(reason);
      reason = undefined;
      expect(server.busy()).toBeUndefined();
      expect(server.request()).toBe(true);
      vi.runAllTimers();
      expect(restart).toHaveBeenCalledTimes(1);
      expect(new ServerRestart(restart).busy()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers restart_busy from the route while a job is submitting", async () => {
    const studio = await setup();
    studio.store.data.jobs.push({
      id: "job-submitting",
      status: "submitting",
      keyMode: "owner",
      take: { recipe: { id: "x", version: 1, route: "router" }, inputs: [] },
    } as unknown as (typeof studio.store.data.jobs)[number]);
    const response = await fetch(
      `${studio.base}/api/development/server/restart`,
      { method: "POST", headers: { [AGENT_REQUEST_HEADER]: "1" } },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("restart_busy");
  });

  it("keeps the restart route behind the studio boundary and refuses without a supervisor", async () => {
    const studio = await setup();
    const url = `${studio.base}/api/development/server/restart`;
    const headers = { [AGENT_REQUEST_HEADER]: "1" };
    expect((await fetch(url, { method: "POST" })).status).toBe(403);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, [AGENT_MARK_HEADER]: "1" },
        })
      ).status,
    ).toBe(403);
    const manual = await fetch(url, { method: "POST", headers });
    expect(manual.status).toBe(409);
    expect((await manual.json()).code).toBe("restart_manual");
    const state = await fetch(`${studio.base}/api/development/server`, {
      headers,
    });
    expect((await state.json()).restartable).toBe(false);
  });
});
