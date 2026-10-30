// The project-prompt contract and the pieces around it that need no server:
// request parsing, the runner's status (never a path), the Claude Code
// command line and environment, and the stream-JSON reader.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_PROMPT_MAX,
  parseAgentSessionRequest,
} from "../shared/agent-session";
import { agentConfig, runnerStatus } from "../server/agent-config";
import { claudePlan, GENOBI_TOOLS, runnerEnv } from "../server/agent-runner";
import { readStreamLine } from "../server/agent-stream";
import { fakeConfig, fakeMachine } from "./agent-harness";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

describe("parseAgentSessionRequest", () => {
  it("accepts a prompt, its source and an optional copy id", () => {
    expect(
      parseAgentSessionRequest({
        prompt: "  Cut the intro\u0007 to two bars  ",
        source: "voice",
        copyId: "house-template",
      }),
    ).toEqual({
      prompt: "Cut the intro to two bars",
      source: "voice",
      copyId: "house-template",
    });
    // A short project id and a copy handle are both a project the person has.
    for (const copyId of ["demo", "product-video.k7qm2xrpab"])
      expect(
        parseAgentSessionRequest({ prompt: "Hi", source: "typed", copyId }),
      ).toMatchObject({ copyId });
    expect(parseAgentSessionRequest({ prompt: "Hi", source: "typed" })).toEqual(
      { prompt: "Hi", source: "typed" },
    );
  });

  it.each([
    [null, "JSON object"],
    [[], "JSON object"],
    [{ source: "typed" }, "Say what you want done"],
    [{ prompt: " \u0000 ", source: "typed" }, "Say what you want done"],
    [
      { prompt: "x".repeat(AGENT_PROMPT_MAX + 1), source: "typed" },
      "under 4000",
    ],
    [{ prompt: "Hi", source: "typed", copyId: "../../etc" }, "copy id"],
    [{ prompt: "Hi", source: "typed", copyId: "House_Template" }, "copy id"],
    [
      { prompt: "Hi", source: "typed", copyId: "product-video.ABCDEFGHIJ" },
      "copy id",
    ],
    [{ prompt: "Hi", source: "email" }, "spoken or typed"],
  ])("refuses %j", (body, message) => {
    expect(() => parseAgentSessionRequest(body)).toThrow(message);
  });
});

describe("runner status", () => {
  it("is off unless a runner is configured", async () => {
    const config = await agentConfig({ PATH: "" });
    expect(await runnerStatus(config)).toMatchObject({ available: false });
    expect(config.runner).toBeUndefined();
  });

  it("names Hermes when it is asked for but not found", async () => {
    const status = await runnerStatus(
      await agentConfig({ GENOBI_AGENT_RUNNER: "hermes", PATH: "" }),
    );
    expect(status).toMatchObject({ available: false, runner: "hermes" });
    expect(status.message).toMatch(/Hermes was not found/);
  });

  it("finds the binary on PATH, not through a shell", async () => {
    const { root, claude } = await fakeMachine();
    const config = await agentConfig({
      GENOBI_AGENT_RUNNER: "claude",
      PATH: `/nonexistent:${root}`,
    });
    expect(config.claude).toBe(claude);
  });

  it("never answers a path, set or missing", async () => {
    const { root, claude } = await fakeMachine();
    const statuses = [
      await runnerStatus(await fakeConfig()),
      await runnerStatus(await fakeConfig({ browser: true })),
      await runnerStatus(await fakeConfig({ claude: undefined })),
      await runnerStatus(
        await fakeConfig({ mcpServer: path.join(root, "missing.mjs") }),
      ),
      await runnerStatus(
        await agentConfig({
          GENOBI_AGENT_RUNNER: "claude",
          GENOBI_AGENT_CLAUDE: path.join(root, "nope"),
        }),
      ),
      await runnerStatus(await agentConfig({ GENOBI_AGENT_RUNNER: "codex" })),
    ];
    expect(statuses[0]).toEqual({ available: true, runner: "claude" });
    for (const status of statuses) {
      const text = JSON.stringify(status);
      expect(text).not.toContain(root);
      expect(text).not.toContain(claude);
      expect(text).not.toMatch(/\/(Users|home|tmp|private|var)\//);
      expect(Object.keys(status).sort()).toEqual(
        expect.arrayContaining(["available"]),
      );
      for (const key of Object.keys(status))
        expect(["available", "runner", "message"]).toContain(key);
    }
  });
});

describe("the Claude Code command", () => {
  async function plan(overrides = {}) {
    const workdir = await mkdtemp(path.join(os.tmpdir(), "genobi-plan-"));
    folders.push(workdir);
    const config = await fakeConfig({
      npx: "/usr/bin/npx",
      browser: true,
      ...overrides,
    });
    return {
      workdir,
      plan: await claudePlan(
        config,
        {
          prompt: "--dangerously-skip-permissions do it",
          studioOrigin: "http://127.0.0.1:4431",
          ticketUrl: "http://127.0.0.1:4431/api/agent/ticket/T",
          linkCode: "ABCD2345",
          workdir,
        },
        {
          PATH: "/usr/bin",
          HOME: "/home/someone",
          COMFY_API_KEY: "comfy-secret",
          BFL_API_KEY: "bfl-secret",
          GENOBI_VOICE_PYTHON: "/opt/python",
          ANTHROPIC_API_KEY: "the-agent-own-login",
        },
      ),
    };
  }

  it("runs headless with only the Genobi and browser tools, never submit", async () => {
    const { plan: p, workdir } = await plan();
    const flag = (name: string) => p.args[p.args.indexOf(name) + 1];
    expect(p.args[0]).toBe("-p");
    expect(flag("--output-format")).toBe("stream-json");
    expect(p.args).toContain("--verbose");
    expect(p.args).toContain("--strict-mcp-config");
    expect(p.args).toContain("--restricted");
    expect(flag("--tools")).toBe("");
    expect(flag("--permission-mode")).toBe("dontAsk");
    const allowed = flag("--allowedTools").split(",");
    expect(allowed).not.toContain("mcp__genobi__genobi_submit");
    expect(allowed).toEqual(
      expect.arrayContaining([
        ...GENOBI_TOOLS.map((t) => `mcp__genobi__${t}`),
        "mcp__browser__browser_navigate",
      ]),
    );
    expect(allowed.some((t) => /evaluate|run_code|cookie|upload/.test(t))).toBe(
      false,
    );
    expect(flag("--disallowedTools")).toBe("mcp__genobi__genobi_submit");
    // The prompt is stdin, so nothing in it can read as a flag.
    expect(p.stdin).toBe("--dangerously-skip-permissions do it");
    expect(p.args.join(" ")).not.toContain("do it");
    expect(p.cwd).toBe(workdir);
    const brief = flag("--append-system-prompt");
    expect(brief).toContain("# Genobi studio");
    // Only the entry skill: the agent loads the others it needs through
    // genobi_skill, which the session may call.
    expect(brief).toContain("genobi_skill");
    expect(brief).not.toContain("# Genobi director");
    expect(brief).not.toContain("# Genobi camera");
    expect(brief).not.toMatch(/^name: genobi-/m);
    expect(allowed).toContain("mcp__genobi__genobi_skill");
    // The Director skill hands takes into the project; that never spends.
    expect(allowed).toContain("mcp__genobi__genobi_take_to_project");
    expect(brief).toContain("genobi_link_project");
    expect(brief).toContain("ABCD2345");
    expect(brief).toContain("http://127.0.0.1:4431/api/agent/ticket/T");
  });

  it("points the MCP servers at the local studio, marked as an agent's", async () => {
    const { plan: p } = await plan();
    const file = p.args[p.args.indexOf("--mcp-config") + 1];
    const { mcpServers } = JSON.parse(await readFile(file, "utf8"));
    expect(mcpServers.genobi.env).toEqual({
      GENOBI_URL: "http://127.0.0.1:4431",
      GENOBI_AGENT_SESSION: "1",
      // The grant that names this session to the studio (its reads, and its
      // quotes as the person's approvals); the browser and the runner itself
      // do not get it.
      GENOBI_AGENT_RUN: p.grant,
    });
    expect(p.grant).toMatch(/^[0-9a-f]{24}$/);
    expect(p.env.GENOBI_AGENT_RUN).toBeUndefined();
    expect(JSON.stringify(mcpServers.browser)).not.toContain(p.grant);
    const args: string[] = mcpServers.browser.args;
    expect(args).toContain("@playwright/mcp@0.0.83");
    expect(args).toContain("--isolated");
    expect(args[args.indexOf("--allowed-origins") + 1]).toBe(
      "http://127.0.0.1:4431",
    );
    const browser = JSON.parse(
      await readFile(args[args.indexOf("--config") + 1], "utf8"),
    );
    expect(browser.browser.contextOptions.extraHTTPHeaders).toEqual({
      "X-Genobi-Agent-Session": "1",
    });
  });

  it("leaves the browser out when it is off", async () => {
    const { plan: p } = await plan({ browser: false });
    const file = p.args[p.args.indexOf("--mcp-config") + 1];
    expect(
      Object.keys(JSON.parse(await readFile(file, "utf8")).mcpServers),
    ).toEqual(["genobi"]);
    expect(p.args.join(" ")).not.toContain("mcp__browser__");
  });

  it("passes the agent's own login but no server keys", async () => {
    const { plan: p } = await plan();
    expect(p.env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/someone",
      ANTHROPIC_API_KEY: "the-agent-own-login",
    });
    expect(runnerEnv({ CLAUDE_CODE_USE_BEDROCK: "1" })).toEqual({
      CLAUDE_CODE_USE_BEDROCK: "1",
    });
  });
});

describe("readStreamLine", () => {
  it("turns events into short lines, a summary and an ending", () => {
    expect(
      readStreamLine(
        JSON.stringify({
          type: "system",
          subtype: "init",
          cwd: "/private/tmp/x",
          mcp_servers: [
            { name: "genobi", status: "connected" },
            { name: "browser", status: "failed" },
          ],
        }),
      ),
    ).toEqual([
      { started: true, line: "Connected: genobi." },
      { line: "Could not start: browser." },
    ]);
    expect(
      readStreamLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Linking\n\tthe project\u0007." },
              { type: "tool_use", name: "mcp__genobi__genobi_link_project" },
            ],
          },
        }),
      ),
    ).toEqual([
      { line: "Linking the project ." },
      { line: "Using genobi_link_project" },
    ]);
    expect(
      readStreamLine(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: "Done.\n\n\n\nApprove it.",
        }),
      ),
    ).toEqual([{ finished: "done", summary: "Done.\n\nApprove it." }]);
  });

  it("flags a paid refusal and bounds every line", () => {
    const [refusal] = readStreamLine(
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              is_error: true,
              content: "Refused (agent_cannot_spend)",
            },
          ],
        },
      }),
    );
    expect(refusal.refusedSpend).toBe(true);
    const [long] = readStreamLine(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "a".repeat(5000) }] },
      }),
    );
    expect(long.line!.length).toBeLessThanOrEqual(300);
  });

  it("skips what it does not know", () => {
    expect(readStreamLine("not json")).toEqual([]);
    expect(readStreamLine("[1,2]")).toEqual([]);
    expect(readStreamLine('{"type":"stream_event"}')).toEqual([]);
    expect(
      readStreamLine('{"type":"result","subtype":"error_max_turns"}'),
    ).toEqual([
      { finished: "failed", summary: "The agent stopped before it finished." },
    ]);
  });
});
