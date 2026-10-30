// The Hermes runner without a server: its settings and status (never a
// path), the `genobi` profile and the only keys Genobi sets in it, the
// command line and environment, and the stream-JSON reader.
import { createHash } from "node:crypto";
import { mkdir, readFile, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentConfig, runnerStatus } from "../server/agent-config";
import { hermesPlan } from "../server/agent-hermes";
import {
  HERMES_BROWSER_SERVER,
  PLUGIN_SERVER,
  PROFILE_MARKER,
  applyProfile,
  createProfile,
  profileCommands,
  profileSettings,
  type HermesRun,
} from "../server/agent-hermes-profile";
import { pinnedRoutes } from "../server/agent-hermes-pins";
import { hermesReader } from "../server/agent-hermes-stream";
import { BROWSER_TOOLS, GENOBI_TOOLS } from "../server/agent-runner";
import { fakeHermesConfig, fakeMachine } from "./agent-harness";

/** Records Hermes commands instead of running them. */
const recorder = () => {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const run: HermesRun = async (args, env) => {
    calls.push({ args, env });
  };
  return { calls, run };
};

describe("Hermes settings and status", () => {
  it("reads the binary, model, provider and the genobi profile's home", async () => {
    const { root } = await fakeMachine();
    const hermes = path.join(root, "claude");
    const config = await agentConfig({
      GENOBI_AGENT_RUNNER: "hermes",
      GENOBI_AGENT_HERMES: hermes,
      GENOBI_AGENT_HERMES_MODEL: "deepseek/deepseek-v4-pro",
      GENOBI_AGENT_HERMES_PROVIDER: "nous",
      HOME: "/home/someone",
      HERMES_HOME: "/srv/their-hermes",
    });
    expect(config).toMatchObject({
      runner: "hermes",
      hermes,
      hermesModel: "deepseek/deepseek-v4-pro",
      hermesProvider: "nous",
      hermesHome: "/home/someone/.hermes/profiles/genobi",
      hermesInvalid: false,
      hermesClosed: false,
    });
    expect(config.hermesAvoid).toEqual([
      "/home/someone/.hermes",
      "/srv/their-hermes",
    ]);
    expect(
      (
        await agentConfig({
          GENOBI_AGENT_RUNNER: "hermes",
          GENOBI_AGENT_HERMES_ROOT: "/opt/hermes",
        })
      ).hermesHome,
    ).toBe("/opt/hermes/profiles/genobi");
  });

  it("never hard-codes a model: unset or malformed is not available", async () => {
    const base = await fakeHermesConfig();
    const unset = await runnerStatus({ ...base, hermesModel: undefined });
    expect(unset).toMatchObject({ available: false, runner: "hermes" });
    expect(unset.message).toMatch(/GENOBI_AGENT_HERMES_MODEL/);
    const bad = await agentConfig({
      GENOBI_AGENT_RUNNER: "hermes",
      GENOBI_AGENT_HERMES_MODEL: "--yolo model",
      GENOBI_AGENT_HERMES_PROVIDER: "nous; rm",
    });
    expect(bad.hermesModel).toBeUndefined();
    expect(bad.hermesProvider).toBeUndefined();
    expect(bad.hermesInvalid).toBe(true);
  });

  it("answers booleans and fixed sentences, never a path", async () => {
    const base = await fakeHermesConfig();
    const { root } = await fakeMachine();
    const statuses = [
      await runnerStatus(base),
      await runnerStatus({ ...base, browser: true, npx: undefined }),
      await runnerStatus({ ...base, hermes: undefined }),
      await runnerStatus({ ...base, hermesHome: undefined }),
      await runnerStatus({ ...base, hermesHome: path.join(root, "none") }),
      await runnerStatus({ ...base, hermesAvoid: [base.hermesHome!] }),
      await runnerStatus({ ...base, mcpServer: path.join(root, "x.mjs") }),
    ];
    expect(statuses[0]).toEqual({ available: true, runner: "hermes" });
    expect(statuses[1]).toMatchObject({ available: true, runner: "hermes" });
    // Only the missing profile offers setup's "Set up Hermes".
    expect(statuses.map((s) => s.setup)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      "hermes-profile",
      undefined,
      undefined,
    ]);
    expect(statuses.slice(2).map((s) => s.message)).toEqual([
      expect.stringMatching(/Hermes was not found/),
      expect.stringMatching(/never the default profile/),
      expect.stringMatching(/not set up yet.*Set up Hermes/),
      expect.stringMatching(/never the default profile/),
      expect.stringMatching(/not built/),
    ]);
    for (const status of statuses) {
      const text = JSON.stringify(status);
      expect(text).not.toMatch(/\/(Users|home|tmp|private|var)\//);
      expect(text).not.toMatch(/agent:hermes-profile|restart/);
      for (const key of Object.keys(status))
        expect(["available", "runner", "message", "setup"]).toContain(key);
    }
  });
});

describe("the genobi profile", () => {
  it("is created with Hermes' own command, without an alias or bundled skills, once", async () => {
    const { root } = await fakeMachine();
    const { calls, run } = recorder();
    expect(
      await createProfile(root, run, { PATH: "/usr/bin", HERMES_HOME: "/x" }),
    ).toBe(true);
    expect(calls).toEqual([
      {
        args: ["profile", "create", "genobi", "--no-alias", "--no-skills"],
        env: {
          PATH: "/usr/bin",
          HERMES_HOME: root,
          PYTHONDONTWRITEBYTECODE: "1",
        },
      },
    ]);
    await mkdir(path.join(root, "profiles", "genobi"), { recursive: true });
    expect(await createProfile(root, run, {})).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("sets the plugin, the filtered Genobi server and the marked browser, nothing else", async () => {
    const config = await fakeHermesConfig({
      browser: true,
      npx: "/usr/bin/npx",
    });
    const home = config.hermesHome!;
    const commands = profileCommands(
      home,
      profileSettings(config, "http://127.0.0.1:4431"),
    );
    const set = Object.fromEntries(
      commands
        .filter((c) => c[0] === "config")
        .map((c) => [c[2], /^[[{]/.test(c[3]) ? JSON.parse(c[3]) : c[3]]),
    );
    expect(commands[0]).toEqual(["plugins", "enable", "genobi"]);
    expect(commands.every((c) => ["plugins", "config"].includes(c[0]))).toBe(
      true,
    );
    expect(Object.keys(set).sort()).toEqual(
      [
        "mcp_servers.genobi",
        `mcp_servers.${PLUGIN_SERVER}`,
        `mcp_servers.${HERMES_BROWSER_SERVER}`,
        "tools.tool_search.enabled",
        // Every model route, pinned (agent-hermes-pins.ts).
        ...pinnedRoutes({ model: "x", provider: "y" }).map(([key]) => key),
      ].sort(),
    );
    expect(set["mcp_servers.genobi"]).toEqual({
      command: process.execPath,
      args: [config.mcpServer],
      env: {
        GENOBI_URL: "http://127.0.0.1:4431",
        GENOBI_AGENT_SESSION: "1",
        // Filled in by Hermes from the runner's environment.
        GENOBI_AGENT_RUN: "${GENOBI_AGENT_RUN}",
      },
      tools: { include: GENOBI_TOOLS, prompts: false, resources: false },
    });
    expect(set["mcp_servers.genobi"].tools.include).not.toContain(
      "genobi_submit",
    );
    // The plugin's own, unfiltered server is switched off by its Hermes name.
    expect(PLUGIN_SERVER).toBe(
      `agent-plugin-genobi-${createHash("sha256").update("genobi").digest("hex").slice(0, 8)}__genobi`,
    );
    expect(set[`mcp_servers.${PLUGIN_SERVER}`]).toEqual({ enabled: false });
    const browser = set[`mcp_servers.${HERMES_BROWSER_SERVER}`];
    expect(browser.tools.include).toEqual(BROWSER_TOOLS);
    expect(browser.env).toEqual({ GENOBI_AGENT_RUN: "${GENOBI_AGENT_RUN}" });
    expect(browser.tools.include.join()).not.toMatch(
      /evaluate|run_code|cookie|upload/,
    );
    expect(browser.args).toContain("@playwright/mcp@0.0.83");
    expect(browser.args).toContain("--isolated");
    expect(browser.args[browser.args.indexOf("--allowed-origins") + 1]).toBe(
      "http://127.0.0.1:4431",
    );
    expect(
      browser.args[browser.args.indexOf("--config") + 1].startsWith(home),
    ).toBe(true);
    expect(set["tools.tool_search.enabled"]).toBe("off");
    expect(set["model.default"]).toBe("deepseek/deepseek-v4-pro");
  });

  it("switches the browser off when there is none", async () => {
    const config = await fakeHermesConfig();
    const commands = profileCommands(
      config.hermesHome!,
      profileSettings(config, "http://127.0.0.1:4431"),
    );
    expect(commands).toContainEqual([
      "config",
      "set",
      `mcp_servers.${HERMES_BROWSER_SERVER}`,
      '{"enabled":false}',
    ]);
  });

  it("applies only when something changed, and only inside the profile", async () => {
    const config = await fakeHermesConfig({
      browser: true,
      npx: "/usr/bin/npx",
    });
    const home = config.hermesHome!;
    const { calls, run } = recorder();
    const settings = profileSettings(config, "http://127.0.0.1:4431");
    expect(
      await applyProfile(home, settings, run, {
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "x",
      }),
    ).toBe(true);
    expect(calls.length).toBeGreaterThan(3);
    for (const { env } of calls)
      expect(env).toEqual({
        PATH: "/usr/bin",
        HERMES_HOME: home,
        PYTHONDONTWRITEBYTECODE: "1",
      });
    expect(await readlink(path.join(home, "plugins", "genobi"))).toBe(
      config.plugin,
    );
    const marked = JSON.parse(
      await readFile(path.join(home, "genobi-browser", "browser.json"), "utf8"),
    );
    expect(marked.browser.contextOptions.extraHTTPHeaders).toEqual({
      "X-Genobi-Agent-Session": "1",
    });
    expect(
      JSON.parse(await readFile(path.join(home, PROFILE_MARKER), "utf8"))
        .settings,
    ).toEqual(settings);
    calls.length = 0;
    expect(await applyProfile(home, settings, run, {})).toBe(false);
    expect(calls).toEqual([]);
    expect(
      await applyProfile(
        home,
        { ...settings, studioOrigin: "http://127.0.0.1:9" },
        run,
        {},
      ),
    ).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("refuses to replace a plugins/genobi folder it did not link", async () => {
    const config = await fakeHermesConfig();
    const home = config.hermesHome!;
    await rm(path.join(home, "plugins", "genobi"));
    await mkdir(path.join(home, "plugins", "genobi"));
    const { run } = recorder();
    await expect(
      applyProfile(
        home,
        profileSettings(config, "http://127.0.0.1:2"),
        run,
        {},
      ),
    ).rejects.toThrow(/not Genobi's link/);
    // A link to another checkout is moved to this one.
    await rm(path.join(home, "plugins", "genobi"), { recursive: true });
    await symlink(
      "/elsewhere/plugins/genobi",
      path.join(home, "plugins", "genobi"),
    );
    await applyProfile(
      home,
      profileSettings(config, "http://127.0.0.1:3"),
      run,
      {},
    );
    expect(await readlink(path.join(home, "plugins", "genobi"))).toBe(
      config.plugin,
    );
  });
});

describe("the Hermes command", () => {
  async function plan(overrides = {}) {
    const { root: workdir } = await fakeMachine();
    const config = await fakeHermesConfig({
      npx: "/usr/bin/npx",
      browser: true,
      ...overrides,
    });
    const { run } = recorder();
    const launch = await hermesPlan(
      config,
      {
        prompt: "--yolo do it",
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
        ANTHROPIC_API_KEY: "not-for-hermes",
        HERMES_HOME: "/home/someone/.hermes",
        HERMES_YOLO_MODE: "1",
        HERMES_SHARED_AUTH_DIR: "/home/someone/.hermes/shared",
      },
      { run },
    );
    return { config, workdir, plan: launch };
  }

  it("runs one query from stdin with only the Genobi and browser toolsets", async () => {
    const { plan: p, workdir, config } = await plan();
    const flag = (name: string) => p.args[p.args.indexOf(name) + 1];
    expect(p.command).toBe(config.hermes);
    expect(p.args[0]).toBe("chat");
    expect(flag("--query-file")).toBe("-");
    expect(p.args).toContain("--oneshot");
    expect(flag("--format")).toBe("stream-json");
    expect(flag("-m")).toBe("deepseek/deepseek-v4-pro");
    expect(flag("--provider")).toBe("nous");
    expect(flag("-t")).toBe(`genobi,${HERMES_BROWSER_SERVER}`);
    expect(p.args).toContain("--ignore-rules");
    expect(flag("--source")).toBe("tool");
    expect(flag("--run-budget")).toBe("60");
    for (const never of ["--yolo", "--accept-hooks", "--worktree", "-s"])
      expect(p.args).not.toContain(never);
    // The prompt is stdin, so nothing in it can read as a flag.
    expect(p.stdin).toBe("--yolo do it");
    expect(p.args.join(" ")).not.toContain("do it");
    expect(p.cwd).toBe(workdir);
    expect(p.tracksDescendants).toBe(true);
    const brief = p.env.HERMES_EPHEMERAL_SYSTEM_PROMPT;
    expect(brief).toContain("# Genobi studio");
    expect(brief).toContain("`ABCD2345`");
    expect(brief).toContain("http://127.0.0.1:4431/api/agent/ticket/T");
  });

  it("leaves the browser out when it is off", async () => {
    const { plan: p } = await plan({ browser: false });
    expect(p.args[p.args.indexOf("-t") + 1]).toBe("genobi");
  });

  it("runs in the genobi profile with no server keys and none of the person's Hermes settings", async () => {
    const { plan: p, config } = await plan();
    expect(p.env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/someone",
      HERMES_HOME: config.hermesHome,
      HERMES_EPHEMERAL_SYSTEM_PROMPT: expect.any(String),
      GENOBI_AGENT_RUN: p.runToken,
      PYTHONDONTWRITEBYTECODE: "1",
    });
    expect(p.runToken).toMatch(/^[0-9a-f]{24}$/);
    expect((await plan()).plan.runToken).not.toBe(p.runToken);
  });
});

describe("hermesReader", () => {
  const events = (...list: object[]) => list.map((e) => JSON.stringify(e));

  it("gathers text into lines, names tools and ends with the summary", () => {
    const read = hermesReader();
    const updates = events(
      {
        type: "system",
        subtype: "init",
        model: "deepseek/deepseek-v4-pro",
      },
      { type: "text", text: "Linking\n\tthe " },
      { type: "text", text: "project\u0007." },
      { type: "tool_use", name: "mcp__genobi__genobi_link_project" },
      { type: "tool_result", name: "x", output: "{}", is_error: false },
      { type: "text", text: "One.\n\nTwo " },
      { type: "text", text: "and three." },
      { type: "result", exit_code: 0, text: "Done.\n\n\n\nApprove it." },
    ).flatMap(read);
    expect(updates).toEqual([
      { started: true, line: "Hermes on deepseek/deepseek-v4-pro." },
      { line: "Linking the project ." },
      { line: "Using genobi_link_project" },
      { line: "One." },
      { line: "Two and three." },
      { finished: "done", summary: "Done.\n\nApprove it." },
    ]);
  });

  it("flags a paid refusal, a tool error and a failed sign-in", () => {
    const read = hermesReader();
    expect(
      read(
        JSON.stringify({
          type: "tool_result",
          output: "Refused (agent_cannot_spend)",
          is_error: true,
        }),
      ),
    ).toEqual([
      {
        refusedSpend: true,
        line: "A paid step needs your approval in the studio.",
      },
    ]);
    expect(
      read(
        JSON.stringify({ type: "tool_result", output: "Nope", is_error: true }),
      ),
    ).toEqual([{ line: "A tool refused: Nope" }]);
    expect(
      read(
        JSON.stringify({
          type: "result",
          exit_code: 1,
          text: "",
          error: "credentials or agent init failed",
        }),
      ),
    ).toEqual([
      {
        finished: "failed",
        summary: expect.stringMatching(/could not sign in/),
      },
    ]);
    expect(read(JSON.stringify({ type: "result", exit_code: 130 }))).toEqual([
      { finished: "failed", summary: "The agent stopped before it finished." },
    ]);
  });

  it("bounds every line and skips what it does not know", () => {
    const read = hermesReader();
    const [long] = read(
      JSON.stringify({ type: "text", text: "a".repeat(5000) }),
    );
    expect(long.line!.length).toBeLessThanOrEqual(300);
    expect(read("not json")).toEqual([]);
    expect(read("[1,2]")).toEqual([]);
    expect(read('{"type":"reasoning"}')).toEqual([]);
  });
});
