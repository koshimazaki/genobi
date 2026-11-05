import { runtimeCapabilities } from "../shared/runtime-capabilities";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, commandError } from "../cli/run";
import { sessionCommand } from "../cli/session";
import { StudioNoAnswer, type GenobiApi } from "../mcp/api";
import { ProfileStore } from "../mcp/profile-store";
import type { ToolDefinition } from "../mcp/definition";
import { agentStudio, fakeHermesConfig } from "./agent-harness";

const execute = promisify(execFile);
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "genobi-cli-session-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
type Studio = Awaited<ReturnType<typeof agentStudio>>;
async function person(studio: Studio) {
  const cookie = await studio.fresh();
  const { body } = await studio.start(cookie, "hang here");
  const id = body.id as string;
  const grant = (
    studio.agents as unknown as { sessions: Map<string, { grant: string }> }
  ).sessions.get(id)!.grant;
  const env = {
    GENOBI_CONFIG_DIR: directory,
    GENOBI_URL: studio.base,
    GENOBI_PROFILE: "default",
    GENOBI_AGENT_SESSION: "1",
    GENOBI_AGENT_RUN: grant,
  };
  return {
    cookie,
    id,
    env,
    say: (prompt: string) =>
      studio.call(cookie, `/sessions/${id}/messages`, {
        method: "POST",
        body: { prompt, source: "voice" },
      }),
    read: () => studio.call(cookie, `/sessions/${id}`),
    cli: (...args: string[]) =>
      execute(
        process.execPath,
        ["plugins/genobi/server/genobi-cli.mjs", ...args],
        { env: { ...process.env, ...env } },
      ),
  };
}
const notices = (stderr: string) =>
  stderr.trim()
    ? stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];

describe("CLI-only studio session", { timeout: 30_000 }, () => {
  it("delivers corrections once across processes and records activity without changing stdout", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const owner = await person(studio);
    const configured = await fetch(`${studio.base}/api/activity`, {
      method: "PUT",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      body: '{"enabled":true}',
    });
    expect(configured.status).toBe(200);
    expect(
      (await owner.say("Keep the original creature, shorten its pause."))
        .status,
    ).toBe(202);
    const first = await owner.cli("models");
    expect(Array.isArray(JSON.parse(first.stdout))).toBe(true);
    expect(notices(first.stderr)).toEqual([
      {
        notice: {
          messages: [
            { text: "Keep the original creature, shorten its pause." },
          ],
          instruction: expect.stringContaining("next message to you"),
        },
      },
    ]);
    expect((await owner.read()).body.exchange.at(-1).pending).toBeUndefined();
    expect((await owner.cli("models")).stderr).toBe("");
    await owner.say("Keep the audio.");
    const raced = await Promise.all([owner.cli("models"), owner.cli("models")]);
    expect(raced.flatMap((result) => notices(result.stderr))).toHaveLength(1);
    const history = await (
      await fetch(`${studio.base}/api/activity`, {
        headers: { cookie: owner.cookie },
      })
    ).json();
    expect(history.events).toHaveLength(4);
    expect(
      history.events.every(
        (event: { source: string; phase: string; tool: string }) =>
          event.source === "cli" &&
          event.phase === "succeeded" &&
          event.tool === "genobi_models",
      ),
    ).toBe(true);
    expect(JSON.stringify(history)).not.toContain("creature");
    const foreign = await studio.fresh();
    expect(
      (
        await (
          await fetch(`${studio.base}/api/activity`, {
            headers: { cookie: foreign },
          })
        ).json()
      ).events,
    ).toEqual([]);
  });

  it("keeps corrections pinned to the grant and supplies them after an API failure", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const one = await person(studio),
      two = await person(studio);
    await one.say("For the first session only.");
    await two.say("For the second session only.");
    const other = await two.cli("models");
    expect(other.stderr).toContain("For the second session only.");
    expect(other.stderr).not.toContain("For the first session only.");
    const notice = vi.fn();
    const runtime = {
      env: one.env,
      store: new ProfileStore(directory),
      notice,
    };
    await expect(
      run(["project", "--input", '{"copyId":"missing.abcdefghij"}'], runtime),
    ).rejects.toThrow();
    expect(notice.mock.calls.flatMap(([n]) => n.messages ?? [])).toEqual([
      { text: "For the first session only." },
    ]);
    expect((await one.cli("models")).stderr).toBe("");
    await one.say("Do not expose this to an unknown grant.");
    await run(["models"], {
      ...runtime,
      env: { ...one.env, GENOBI_AGENT_RUN: "a".repeat(24) },
      notice: (n) => expect(n.messages).toBeUndefined(),
    });
    expect((await one.read()).body.exchange.at(-1).pending).toBe(true);
    expect((await one.cli("models")).stderr).toContain(
      "Do not expose this to an unknown grant.",
    );
  });
});

it("reports an uncertain operation once, and still delivers its correction", async () => {
  const activity = vi.fn().mockResolvedValue({});
  const messages = vi.fn().mockResolvedValue([{ text: "Stop here." }]);
  const notice = vi.fn();
  const action = vi
    .fn()
    .mockRejectedValue(new StudioNoAnswer("Submission outcome unknown"));
  const tool = {
    name: "genobi_quote",
    run: action,
  } as unknown as ToolDefinition;
  let error;
  try {
    await sessionCommand(
      {
        activity,
        messages,
        get: async () => runtimeCapabilities("local"),
      } as unknown as GenobiApi,
      tool,
      {},
      notice,
    );
  } catch (caught) {
    error = caught;
  }
  expect(commandError(error).code).toBe("outcome_unknown");
  expect(action).toHaveBeenCalledOnce();
  expect(
    activity.mock.calls.map(([body]) => [body.event.source, body.event.phase]),
  ).toEqual([
    ["cli", "started"],
    ["cli", "unknown"],
  ]);
  expect(notice).toHaveBeenCalledWith(
    expect.objectContaining({ messages: [{ text: "Stop here." }] }),
  );
});

it("does not turn a completed command into a retry when optional activity is unavailable", async () => {
  const activity = vi.fn().mockRejectedValue(new Error("Unavailable"));
  const messages = vi.fn().mockResolvedValue([]);
  const notice = vi.fn();
  const action = vi.fn().mockResolvedValue({ revision: 3 });
  const tool = {
    name: "genobi_director_command",
    run: action,
  } as unknown as ToolDefinition;
  expect(
    await sessionCommand(
      {
        activity,
        messages,
        get: async () => runtimeCapabilities("local"),
      } as unknown as GenobiApi,
      tool,
      {},
      notice,
    ),
  ).toEqual({ revision: 3 });
  expect(action).toHaveBeenCalledOnce();
  expect(notice).toHaveBeenCalledWith({
    warning: expect.stringContaining("do not repeat"),
  });
});
