// Box 1.7: Hermes signs in where it runs. A Terminal start whose Hermes the
// studio read as signed out carries `signIn`; its plan runs Hermes' own
// `auth add <provider>` in the session's window, then the chat, through the
// launcher without a shell. `auth add` is not idempotent (each run adds a
// credential; Nous starts another login), so the launcher first asks
// `auth list <provider>` and skips the sign-in when one is listed.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSessions } from "../server/agent-sessions";
import {
  hermesSignIn,
  hermesTerminalPlan,
  watchTerminal,
  type AgentTerminal,
} from "../server/agent-terminal";
import { loginArguments } from "../server/development-terminal-plan";
import { HERMES_SIGNED_IN } from "../server/harness-sign-in";
import { parseAgentSessionRequest } from "../shared/agent-session";
import { fakeHermesConfig } from "./agent-harness";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});
async function scratch() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-sign-in-"));
  folders.push(folder);
  return folder;
}

describe("the start request", () => {
  it("takes signIn only as true, and only for a Terminal start", () => {
    const base = { prompt: "Cut", source: "typed" };
    expect(
      parseAgentSessionRequest({ ...base, mode: "terminal", signIn: true }),
    ).toMatchObject({ mode: "terminal", signIn: true });
    for (const bad of [
      { ...base, signIn: true },
      { ...base, mode: "headless", signIn: true },
      { ...base, mode: "terminal", signIn: "yes" },
    ])
      expect(() => parseAgentSessionRequest(bad)).toThrow(/Terminal start/);
  });
});

describe("Hermes' sign-in in the plan", () => {
  it("is setup's own sign-in, with auth list as its check", () => {
    expect(hermesSignIn("nous")).toEqual({
      args: loginArguments("hermes", "nous").args,
      check: ["-p", "genobi", "auth", "list", "nous"],
      signedIn: HERMES_SIGNED_IN.source,
    });
    expect(hermesSignIn("nous")!.args).toEqual([
      "-p",
      "genobi",
      "auth",
      "add",
      "nous",
      "--type",
      "oauth",
    ]);
    expect(hermesSignIn("deepseek")!.args).not.toContain("--type");
  });

  it("refuses a provider that is not a checked open name", () => {
    for (const provider of ["--type", "nous; rm -rf /", "", "anthropic"])
      expect(() => hermesSignIn(provider)).toThrow(
        /open model provider in setup/,
      );
  });

  it("is in the Terminal plan only when the start asked for it", async () => {
    const config = await fakeHermesConfig();
    const folder = await scratch();
    const input = {
      prompt: "Cut the drop",
      studioOrigin: "http://127.0.0.1:4431",
      ticketUrl: "http://127.0.0.1:4431/api/agent/ticket/t",
      workdir: folder,
    };
    const plain = await hermesTerminalPlan(config, input, folder);
    expect(plain.signIn).toBeUndefined();
    const signing = await hermesTerminalPlan(
      config,
      { ...input, signIn: true },
      folder,
    );
    expect(signing.signIn?.args).toEqual(loginArguments("hermes", "nous").args);
    // The chat itself is unchanged.
    expect(signing.args).toEqual(plain.args);
  });
});

/** The launcher, run for real, with Node standing in for each Hermes step. */
async function launch(steps: {
  list: string;
  listCode?: number;
  addCode?: number;
}) {
  const folder = await scratch();
  const log = path.join(folder, "log.txt");
  const statusFile = path.join(folder, "status.json");
  const step = (name: string, code = 0) => [
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(`${name}\n`)}); process.exit(${code})`,
  ];
  const planFile = path.join(folder, "plan.json");
  await writeFile(
    planFile,
    JSON.stringify({
      command: process.execPath,
      args: step("chat"),
      cwd: folder,
      env: {},
      statusFile,
      signIn: {
        args: step("add", steps.addCode),
        check: [
          "-e",
          `require("fs").appendFileSync(${JSON.stringify(log)}, "list\\n"); console.log(${JSON.stringify(steps.list)}); process.exit(${steps.listCode ?? 0})`,
        ],
        signedIn: HERMES_SIGNED_IN.source,
      },
    }),
  );
  const code = await new Promise<number>((resolve) =>
    execFile(
      process.execPath,
      [path.resolve("scripts/development-terminal.mjs"), planFile],
      (error) => resolve(error ? Number(error.code ?? 1) : 0),
    ),
  );
  return {
    code,
    ran: (await readFile(log, "utf8")).trim().split("\n"),
    receipt: JSON.parse(await readFile(statusFile, "utf8")).status,
  };
}

describe("the window's launcher", () => {
  it("signs in, then starts the chat in the same window", async () => {
    expect(await launch({ list: "nous (0 credentials):" })).toEqual({
      code: 0,
      ran: ["list", "add", "chat"],
      receipt: "closed",
    });
  });

  it("does not add a second credential when one is already listed", async () => {
    expect(await launch({ list: "nous (1 credential):\n  #1 oauth" })).toEqual({
      code: 0,
      ran: ["list", "chat"],
      receipt: "closed",
    });
  });

  it("signs in when the list cannot say, as the studio read signed out", async () => {
    expect((await launch({ list: "", listCode: 2 })).ran).toEqual([
      "list",
      "add",
      "chat",
    ]);
  });

  it("does not start the chat when the sign-in fails", async () => {
    expect(await launch({ list: "", addCode: 1 })).toEqual({
      code: 1,
      ran: ["list", "add"],
      receipt: "failed",
    });
  });
});

describe("a Terminal session that signs in first", () => {
  it("passes signIn to the plan and says so; the window reports the sign-in", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const folder = await scratch();
      const plans: { signIn?: true }[] = [];
      const terminal: AgentTerminal = {
        supported: true,
        agentFolder: (id) => path.join(folder, id),
        openAgent: vi.fn(async (id) => {
          await mkdir(path.join(folder, id), { recursive: true });
          return { statusFile: path.join(folder, id, "status.json") };
        }),
      };
      const sessions = new AgentSessions({
        config: await fakeHermesConfig(),
        studioOrigin: "http://127.0.0.1:4431",
        link: () => ({ code: "LINK2345" }),
        launch: vi.fn(() => ({ pid: undefined })),
        terminal,
        terminalPlan: async (_runner, _config, input) => {
          plans.push({ ...(input.signIn ? { signIn: input.signIn } : {}) });
          return {
            command: "hermes",
            args: ["chat"],
            env: {},
            files: {},
            grant: "g".repeat(24),
            ...(input.signIn ? { signIn: hermesSignIn("nous") } : {}),
          };
        },
      });
      const view = await sessions.start("owner", {
        prompt: "Cut the drop",
        source: "typed",
        mode: "terminal",
        signIn: true,
      });
      expect(plans).toEqual([{ signIn: true }]);
      expect(view.lines.at(-1)).toMatch(/signs in there first/);
      await writeFile(
        path.join(folder, view.id, "status.json"),
        JSON.stringify({ status: "signed-in" }),
      );
      await vi.advanceTimersByTimeAsync(2100);
      await vi.waitFor(() =>
        expect(sessions.read(view.id, "owner").lines.at(-1)).toMatch(
          /is signed in\. The chat is starting/,
        ),
      );
      expect(sessions.read(view.id, "owner").status).toBe("running");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hears the sign-in once, and the end as before", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const folder = await scratch();
      const statusFile = path.join(folder, "status.json");
      const signedIn = vi.fn();
      const ended = vi.fn();
      watchTerminal(statusFile, ended, 100, signedIn);
      await writeFile(statusFile, JSON.stringify({ status: "signed-in" }));
      await vi.advanceTimersByTimeAsync(350);
      await vi.waitFor(() => expect(signedIn).toHaveBeenCalledTimes(1));
      await writeFile(statusFile, JSON.stringify({ status: "closed" }));
      await vi.advanceTimersByTimeAsync(150);
      await vi.waitFor(() => expect(ended).toHaveBeenCalledWith("closed"));
      expect(signedIn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
