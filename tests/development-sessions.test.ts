import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DevelopmentSessions } from "../server/development-sessions";
import {
  developmentPlan,
  developmentReader,
  safeDevelopmentText,
} from "../server/development-runner";
import {
  developmentRequest,
  type DevelopmentRunner,
} from "../shared/development-session";
import type {
  launch,
  LaunchPlan,
  RunnerHandlers,
} from "../server/agent-runner";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "genobi-development-"),
  );
  const plans: LaunchPlan[] = [];
  const handlers: RunnerHandlers[] = [];
  const deps = {
    binary: async () => "/test/runner",
    launch: ((plan, on) => {
      plans.push(plan);
      handlers.push(on);
      return {} as ReturnType<typeof launch>;
    }) as typeof launch,
  };
  const manager = new DevelopmentSessions(directory, deps);
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  cleanups.push(() => manager.close());
  const start = (owner = "owner", extra = {}) =>
    manager.start(owner, {
      runner: "codex",
      mode: "fresh",
      prompt: "Check the repo",
      ...extra,
    });
  const done = async () => {
    handlers.at(-1)!.line(
      JSON.stringify({
        type: "thread.started",
        thread_id: "native-session-123",
      }),
    );
    handlers.at(-1)!.line(
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "Verified tests. Next: review.",
        },
      }),
    );
    handlers.at(-1)!.exit(0);
    await Promise.resolve();
  };
  return { manager, directory, deps, start, done, plans, handlers };
}

describe("Development launcher", () => {
  it("finishes orphan recovery before accepting another launch", async () => {
    const f = await fixture();
    await f.start();
    let release!: () => void;
    const recovering = new Promise<void>((resolve) => {
      release = resolve;
    });
    const restored = new DevelopmentSessions(f.directory, {
      ...f.deps,
      recover: () => recovering,
    });
    cleanups.push(() => restored.close());
    const next = restored.start("owner", {
      runner: "codex",
      mode: "fresh",
      prompt: "Check",
    });
    await Promise.resolve();
    expect(f.plans).toHaveLength(1);
    release();
    await next;
    expect(f.plans).toHaveLength(2);
    expect((await restored.state("owner")).sessions[1].status).toBe(
      "interrupted",
    );
  });
  it.each(["hermes", "codex", "claude"] as DevelopmentRunner[])(
    "uses %s native resume without shell interpolation",
    (runner) => {
      const plan = developmentPlan(
        runner,
        "/runner",
        "/repo",
        "$(touch /bad)",
        "native-12345",
      );
      expect(plan.stdin).toBe("$(touch /bad)");
      expect(plan.args).toContain("native-12345");
      expect(plan.args.join(" ")).not.toMatch(/yolo|bypass|danger-full-access/);
      expect(plan.env).not.toHaveProperty("COMFY_API_KEY");
      expect(
        developmentPlan(runner, "/runner", "/repo", "fresh").args,
      ).not.toContain("native-12345");
    },
  );
  it("resumes an owned native session and persists its handover across restart", async () => {
    const f = await fixture();
    const first = await f.start();
    await f.done();
    const restored = new DevelopmentSessions(f.directory, f.deps);
    cleanups.push(() => restored.close());
    const state = await restored.state("owner");
    expect(state.sessions[0]).toMatchObject({
      status: "done",
      resumable: true,
      handover: "Verified tests. Next: review.",
    });
    await restored.start("owner", {
      runner: "codex",
      mode: "continue",
      previous: first.id,
      prompt: "Proceed",
    });
    expect(f.plans.at(-1)?.args).toContain("native-session-123");
    expect((await restored.state("different-owner")).sessions).toEqual([]);
  });
  it("starts fresh with context without resuming the native conversation", async () => {
    const f = await fixture();
    await f.start();
    await f.done();
    await f.start("owner", { handover: "Old evidence" });
    expect(f.plans.at(-1)?.args).not.toContain("resume");
    expect(f.plans.at(-1)?.stdin).toContain("Old evidence");
    expect(f.plans.at(-1)?.stdin).toContain("not authorization");
  });
  it("refuses another owner, mismatched runner, and unknown session IDs", async () => {
    const f = await fixture();
    const first = await f.start();
    await f.done();
    await expect(
      f.start("other", { mode: "continue", previous: first.id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.start("owner", {
        mode: "continue",
        previous: first.id,
        runner: "claude",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.plans).toHaveLength(1);
  });
  it("reserves before await so simultaneous starts cannot both spawn", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.start(), f.start()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.plans).toHaveLength(1);
    await expect(f.start("other")).rejects.toMatchObject({ status: 409 });
  });
  it("stops only the owned session and clears the running slot", async () => {
    const f = await fixture();
    const first = await f.start();
    expect(() => f.manager.stop(first.id, "other")).toThrow("not found");
    f.manager.stop(first.id, "owner");
    await Promise.resolve();
    expect((await f.manager.state("owner")).sessions[0].status).toBe("stopped");
    await expect(f.start()).resolves.toMatchObject({ status: "starting" });
  });
  it("does not turn a runner failure into success on a zero exit", async () => {
    const f = await fixture();
    await f.start();
    f.handlers[0].line('{"type":"turn.failed"}');
    f.handlers[0].exit(0);
    await Promise.resolve();
    expect((await f.manager.state("owner")).sessions[0].status).toBe("failed");
  });
  it("redacts stored output and stores owner hashes only", async () => {
    const f = await fixture();
    await f.start();
    f.handlers[0].line(
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "api_key=private-value" },
      }),
    );
    const text = await readFile(
      path.join(f.directory, "development-sessions.json"),
      "utf8",
    );
    expect(text).not.toContain("private-value");
    expect(text).not.toContain('"owner":"owner"');
  });
  it("validates mode and bounds and ignores internal reasoning and tool outputs", () => {
    expect(
      developmentRequest.safeParse({
        runner: "codex",
        mode: "continue",
        prompt: "Hi",
      }).success,
    ).toBe(false);
    expect(
      developmentRequest.safeParse({
        runner: "codex",
        mode: "fresh",
        prompt: "Hi",
        command: "rm",
      }).success,
    ).toBe(false);
    const read = developmentReader("codex");
    expect(
      read(
        '{"type":"item.completed","item":{"type":"reasoning","text":"secret"}}',
      ).updates,
    ).toEqual([]);
    expect(read("not json").updates).toEqual([]);
    expect(
      safeDevelopmentText("Bearer topsecret api_key=secret"),
    ).not.toContain("topsecret");
    expect(
      developmentReader("hermes")(
        '{"type":"result","session_id":"20261026_test","exit_code":0,"text":"done"}',
      ).nativeId,
    ).toBe("20261026_test");
  });
});
