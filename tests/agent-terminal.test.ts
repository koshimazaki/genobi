// Box 1.6: an agent session in a Terminal window. The plan names the Genobi
// brief, the link code and a fresh session id, never the grant; the grant
// reaches only the session's Genobi MCP server, so its quotes still land in
// the studio's approvals; the session follows the window's receipt. No real
// Terminal or harness is opened: the launcher is faked.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSessions } from "../server/agent-sessions";
import { sweepTerminalFolders } from "../server/agent-session-terminal";
import { claudeTerminalPlan, TERMINAL_BRIEF } from "../server/agent-terminal";
import type { AgentTerminal } from "../server/agent-terminal";
import { DevelopmentTerminal } from "../server/development-terminal";
import { relayRequest } from "../shared/runner-relay";
import { parseAgentSessionRequest } from "../shared/agent-session";
import { fakeConfig } from "./agent-harness";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});
async function scratch() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-terminal-"));
  folders.push(folder);
  return folder;
}

const input = (workdir: string) => ({
  prompt: "-- cut the drop to the beat",
  studioOrigin: "http://127.0.0.1:4431",
  ticketUrl: "http://127.0.0.1:4431/api/agent/ticket/t",
  linkCode: "LINK2345",
  workdir,
});

describe("the Terminal session's plan", () => {
  it("runs claude with its own MCP config, the brief and a fresh session id", async () => {
    const folder = await scratch();
    const plan = await claudeTerminalPlan(
      await fakeConfig(),
      input(folder),
      folder,
    );
    const at = (flag: string) => plan.args[plan.args.indexOf(flag) + 1];
    expect(at("--mcp-config")).toBe(path.join(folder, "mcp.json"));
    expect(plan.args).toContain("--strict-mcp-config");
    expect(at("--disallowedTools")).toBe("mcp__genobi__genobi_submit");
    expect(at("--session-id")).toMatch(/^[0-9a-f-]{36}$/);
    const brief = at("--append-system-prompt");
    expect(brief).toContain("`LINK2345`");
    expect(brief).toContain(TERMINAL_BRIEF);
    expect(brief).toContain("You have no browser in this session.");
    // The person's words come last, after a one-value option, never as a flag.
    expect(plan.args.at(-2)).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.args.at(-1)).toBe("cut the drop to the beat");
    // The grant is only in the owner-only MCP config, with the agent's mark.
    expect(plan.grant).toMatch(/^[0-9a-f]{24}$/);
    expect(JSON.stringify(plan.args)).not.toContain(plan.grant);
    const server = JSON.parse(plan.files["mcp.json"]).mcpServers.genobi;
    expect(server.env).toEqual({
      GENOBI_URL: "http://127.0.0.1:4431",
      GENOBI_AGENT_SESSION: "1",
      GENOBI_AGENT_RUN: plan.grant,
    });
  });

  it("is asked for by the local studio only", () => {
    const request = { prompt: "Go", source: "typed", mode: "terminal" };
    expect(parseAgentSessionRequest(request).mode).toBe("terminal");
    expect(
      parseAgentSessionRequest({ ...request, mode: "headless" }),
    ).not.toHaveProperty("mode");
    expect(() =>
      parseAgentSessionRequest({ ...request, mode: "tmux" }),
    ).toThrow("Run the session headless or in a terminal.");
    expect(() => relayRequest(request)).toThrow("local studio only");
  });
});

describe("DevelopmentTerminal.openAgent", () => {
  it("writes the private files and plan, then opens Terminal once", async () => {
    const directory = await scratch();
    const open = vi.fn(async () => {});
    const terminal = new DevelopmentTerminal(directory, {
      platform: "darwin",
      open,
    });
    const id = "11111111-1111-4111-8111-111111111111";
    const { statusFile } = await terminal.openAgent(
      id,
      "claude",
      "/usr/local/bin/claude",
      { args: ["--session-id", id], env: { GENOBI_AGENT_RUN: "a".repeat(24) } },
      { "mcp.json": "{}" },
    );
    const folder = terminal.agentFolder(id);
    expect(statusFile).toBe(path.join(folder, "status.json"));
    expect((await stat(path.join(folder, "mcp.json"))).mode & 0o777).toBe(
      0o600,
    );
    const plan = JSON.parse(
      await readFile(path.join(folder, "plan.json"), "utf8"),
    );
    expect(plan).toMatchObject({
      command: "/usr/local/bin/claude",
      statusFile,
    });
    expect((await stat(path.join(folder, "plan.json"))).mode & 0o777).toBe(
      0o600,
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(path.join(folder, "Genobi.command"));
  });

  it("refuses off macOS", async () => {
    const terminal = new DevelopmentTerminal(await scratch(), {
      platform: "linux",
    });
    expect(terminal.supported).toBe(false);
    await expect(
      terminal.openAgent("x", "claude", "/bin/true", { args: [] }),
    ).rejects.toThrow("Run it in the bubble instead.");
  });

  it("the launcher passes the plan's grant on, never one from the shell", async () => {
    const folder = await scratch();
    const out = path.join(folder, "env.txt");
    const run = async (env: Record<string, string>) => {
      const planFile = path.join(folder, "plan.json");
      await writeFile(
        planFile,
        JSON.stringify({
          command: process.execPath,
          args: [
            "-e",
            `require("fs").writeFileSync(${JSON.stringify(out)}, [process.env.GENOBI_AGENT_RUN ?? "none", process.env.GENOBI_AGENT_SESSION, process.env.COMFY_API_KEY ?? "no key"].join(" "))`,
          ],
          cwd: folder,
          env,
          statusFile: path.join(folder, "status.json"),
        }),
      );
      await new Promise<void>((resolve, reject) =>
        execFile(
          process.execPath,
          [path.resolve("scripts/development-terminal.mjs"), planFile],
          {
            env: {
              ...process.env,
              GENOBI_AGENT_RUN: "inherited",
              COMFY_API_KEY: "secret",
            },
          },
          (error) => (error ? reject(error) : resolve()),
        ),
      );
      return readFile(out, "utf8");
    };
    expect(await run({})).toBe("none 1 no key");
    expect(await run({ GENOBI_AGENT_RUN: "b".repeat(24) })).toBe(
      `${"b".repeat(24)} 1 no key`,
    );
    expect(
      JSON.parse(await readFile(path.join(folder, "status.json"), "utf8")),
    ).toEqual({
      status: "closed",
    });
  });
});

describe("closing the Terminal window", () => {
  it("still leaves the launcher's receipt when the group is hung up", async () => {
    const folder = await scratch();
    const ready = path.join(folder, "ready");
    const statusFile = path.join(folder, "status.json");
    const planFile = path.join(folder, "plan.json");
    // The harness stand-in says it runs, then waits as an interactive one does.
    await writeFile(
      planFile,
      JSON.stringify({
        command: process.execPath,
        args: [
          "-e",
          `require("fs").writeFileSync(${JSON.stringify(ready)}, "1"); setInterval(() => {}, 1000)`,
        ],
        cwd: folder,
        env: {},
        statusFile,
      }),
    );
    // Its own process group, as Terminal gives the window's shell.
    const launcher = spawn(
      process.execPath,
      [path.resolve("scripts/development-terminal.mjs"), planFile],
      { detached: true, stdio: "ignore" },
    );
    const exited = new Promise((resolve) => launcher.on("exit", resolve));
    await vi.waitFor(() => expect(existsSync(ready)).toBe(true), {
      timeout: 5000,
    });
    // What closing the window does: SIGHUP to the whole group.
    process.kill(-launcher.pid!, "SIGHUP");
    await exited;
    expect(JSON.parse(await readFile(statusFile, "utf8"))).toEqual({
      status: "closed",
    });
  });
});

describe("a Terminal session in the studio", () => {
  async function studio(supported = true) {
    const folder = await scratch();
    const opened: { files: Record<string, string>; env?: object }[] = [];
    const terminal: AgentTerminal = {
      supported,
      agentFolder: (id) => path.join(folder, id),
      // As the launcher does: the private files and plan in the session's
      // folder, the receipt beside them.
      openAgent: vi.fn(async (id, _runner, _command, plan, files = {}) => {
        opened.push({ files, env: plan.env });
        const own = path.join(folder, id);
        await mkdir(own, { recursive: true });
        const written: Record<string, string> = {
          ...files,
          "plan.json": JSON.stringify(plan),
          "Genobi.command": "#!/bin/sh\n",
        };
        for (const [name, text] of Object.entries(written))
          await writeFile(path.join(own, name), text);
        return { statusFile: path.join(own, "status.json") };
      }),
    };
    const launch = vi.fn(() => ({ pid: undefined }));
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4431",
      link: () => ({ code: "LINK2345" }),
      launch,
      terminal,
    });
    return { sessions, terminal, opened, launch, folder };
  }

  it("says the server can open one, then follows the window by its grant", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { sessions, opened, launch, folder } = await studio();
      expect(await sessions.status()).toMatchObject({ terminal: true });
      const view = await sessions.start("owner", {
        prompt: "Cut the drop",
        source: "typed",
        copyId: "house-template",
        mode: "terminal",
      });
      expect(launch).not.toHaveBeenCalled();
      expect(view.status).toBe("running");
      expect(view.lines.at(-1)).toContain("is open in Terminal");
      const grant = JSON.parse(opened[0].files["mcp.json"]).mcpServers.genobi
        .env.GENOBI_AGENT_RUN;
      // The window's Genobi MCP server, by its grant, belongs to the session.
      expect(sessions.scope("mcp-session", grant)).toMatchObject({
        owner: "owner",
      });
      expect(sessions.scope("other", "c".repeat(24))).toBeUndefined();
      // A reload finds it again; a second start is refused naming it.
      expect(sessions.active("owner")?.id).toBe(view.id);
      expect(sessions.active("someone else")).toBeUndefined();
      await expect(
        sessions.start("owner", { prompt: "Again", source: "typed" }),
      ).rejects.toMatchObject({
        code: "agent_busy",
        details: { sessionId: view.id },
      });
      // The harness exits: the launcher's receipt ends the session.
      await writeFile(
        path.join(folder, view.id, "status.json"),
        JSON.stringify({ status: "closed" }),
      );
      await vi.advanceTimersByTimeAsync(2100);
      await vi.waitFor(() =>
        expect(sessions.read(view.id, "owner").status).toBe("done"),
      );
      expect(sessions.scope("mcp-session-2", grant)).toBeUndefined();
      expect(sessions.active("owner")).toBeUndefined();
      // Its private folder, grant file included, goes with it.
      await vi.waitFor(() =>
        expect(existsSync(path.join(folder, view.id))).toBe(false),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("Stop lets the window be, stops following it and removes its secrets", async () => {
    const { sessions, folder } = await studio();
    const view = await sessions.start("owner", {
      prompt: "Cut the drop",
      source: "typed",
      mode: "terminal",
    });
    const own = path.join(folder, view.id);
    expect(existsSync(path.join(own, "mcp.json"))).toBe(true);
    const stopped = sessions.stop(view.id, "owner");
    await vi.waitFor(() =>
      expect(sessions.read(view.id, "owner").status).toBe("stopped"),
    );
    expect(stopped.lines).toContain(
      "The Terminal window stays open until you close it.",
    );
    // The grant, plan and prompt go; the folder stays for the receipt.
    await vi.waitFor(() =>
      expect(existsSync(path.join(own, "mcp.json"))).toBe(false),
    );
    expect(existsSync(path.join(own, "plan.json"))).toBe(false);
    expect(existsSync(path.join(own, "prompt.txt"))).toBe(false);
    expect(existsSync(path.join(own, "Genobi.command"))).toBe(true);
    // The window closes later: its receipt takes the folder with it.
    await writeFile(
      path.join(own, "status.json"),
      JSON.stringify({ status: "closed" }),
    );
    await vi.waitFor(() => expect(existsSync(own)).toBe(false), {
      timeout: 5000,
    });
  });

  it("at server start, sweeps the folders of windows that closed", async () => {
    const root = await scratch();
    const folder = (name: string, status?: string) =>
      mkdir(path.join(root, name)).then(() =>
        status
          ? writeFile(
              path.join(root, name, "status.json"),
              JSON.stringify({ status }),
            )
          : undefined,
      );
    await folder("agent-closed", "closed");
    await folder("agent-failed", "failed");
    // No receipt yet: a window still open.
    await folder("agent-open");
    // A supervisor session's receipt is kept for its resume.
    await folder("11111111-1111-4111-8111-111111111111", "closed");
    await sweepTerminalFolders({
      supported: true,
      agentFolder: (id) => path.join(root, `agent-${id}`),
      openAgent: vi.fn(),
    });
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(root)).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "agent-open",
    ]);
  });

  it("is refused where the server cannot open a Terminal", async () => {
    const { sessions } = await studio(false);
    expect(await sessions.status()).not.toHaveProperty("terminal");
    await expect(
      sessions.start("owner", {
        prompt: "Go",
        source: "typed",
        mode: "terminal",
      }),
    ).rejects.toThrow("Run the session in the bubble instead.");
  });
});
