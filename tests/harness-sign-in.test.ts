import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { harnessSignIn } from "../server/harness-sign-in";
import { setupRouter } from "../server/setup-routes";
import { jsonErrors } from "../server/error-handler";
import { AgentRunnerSetting } from "../server/agent-runner-setting";

// Fake harness binaries on PATH: each prints what its real status command
// would, plus a secret-looking value that must never leave the probe.

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function machine(
  scripts:
    Record<string, string> | ((hermes: string) => Record<string, string>),
  profile = true,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-signin-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const hermes = path.join(root, "hermes");
  await mkdir(bin);
  if (profile) {
    await mkdir(path.join(hermes, "profiles", "genobi"), { recursive: true });
    await writeFile(path.join(hermes, "profiles", "genobi", "config.yaml"), "");
  }
  const bodies = typeof scripts === "function" ? scripts(hermes) : scripts;
  for (const [name, body] of Object.entries(bodies)) {
    const file = path.join(bin, name);
    await writeFile(file, `#!/bin/sh\n${body}\n`);
    await chmod(file, 0o755);
  }
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: path.join(root, "home"),
    GENOBI_AGENT_HERMES_ROOT: hermes,
    // No provider key in the server's environment may reach a probe.
    COMFY_API_KEY: "comfyui-must-not-leak",
    BFL_API_KEY: "bfl-must-not-leak",
    RUNWARE_API_KEY: "rw-must-not-leak",
  };
  return { root, hermes, env };
}

// A leaked provider key turns each answer into "not signed in".
const leakGuard =
  'if [ -n "$COMFY_API_KEY$BFL_API_KEY$RUNWARE_API_KEY" ]; then echo leaked; exit 1; fi';
const CLAUDE_IN = `${leakGuard}
[ "$1 $2 $3" = "auth status --json" ] || exit 9
echo '{"loggedIn":true,"email":"person@example.com","orgId":"org-secret"}'`;
const CODEX_OUT = `${leakGuard}
[ "$1 $2" = "login status" ] || exit 9
echo "Not logged in"; exit 1`;
const hermesIn = (home: string) => `${leakGuard}
[ "$HERMES_HOME" = "${home}" ] || exit 7
[ "$1 $2 $3 $4 $5" = "-p genobi auth list nous" ] || exit 8
printf 'nous (1 credentials):\\n  #1  token-label  oauth  id=abc123secret priority=0\\n'`;

describe("the harness sign-in probe", () => {
  it("reduces each harness's own status to a boolean and keeps its output", async () => {
    const m = await machine((home) => ({
      claude: CLAUDE_IN,
      codex: CODEX_OUT,
      hermes: hermesIn(home),
    }));
    const rows = await harnessSignIn({ env: m.env, hermesProvider: "nous" });
    expect(rows).toEqual([
      {
        runner: "claude",
        name: "Claude Code",
        installed: true,
        signedIn: true,
      },
      { runner: "hermes", name: "Hermes", installed: true, signedIn: true },
      { runner: "codex", name: "Codex", installed: true, signedIn: false },
    ]);
    const text = JSON.stringify(rows);
    for (const secret of ["person@example.com", "org-secret", "abc123secret"])
      expect(text).not.toContain(secret);
  });

  it("answers unknown for a timeout, a failure or an unknown shape", async () => {
    const m = await machine({
      claude: "echo 'not json'",
      codex: "sleep 5",
      hermes: "exit 3",
    });
    const rows = await harnessSignIn({ env: m.env, timeoutMs: 300 });
    expect(rows.map((r) => r.signedIn)).toEqual([
      "unknown",
      "unknown",
      "unknown",
    ]);
  });

  it("reports a missing harness and a missing genobi profile without running them", async () => {
    const m = await machine(
      (home) => ({ hermes: `touch "${home}.ran"; exit 0` }),
      false,
    );
    const rows = await harnessSignIn({ env: m.env });
    await expect(stat(`${m.hermes}.ran`)).rejects.toThrow();
    expect(rows[0]).toMatchObject({ installed: false, signedIn: false });
    expect(rows[1]).toMatchObject({
      installed: true,
      signedIn: false,
      note: expect.stringContaining("Sign in sets it up first"),
      profile: "missing",
    });
    expect(rows[2]).toMatchObject({ installed: false, signedIn: false });
  });

  it("reads no credential for a Hermes provider with none listed", async () => {
    const m = await machine({ hermes: "echo 'nous: Free tier'" });
    const rows = await harnessSignIn({ env: m.env });
    expect(rows[1].signedIn).toBe(false);
  });
});

describe("/api/agent/sign-in", () => {
  it("answers the studio only, never an agent", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-signin-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const setting = await AgentRunnerSetting.load(directory, undefined, {});
    const app = express();
    let agent = false;
    app.use((_request, response, next) => {
      response.locals.sessionId = "session";
      response.locals.agent = agent;
      next();
    });
    const rows = [
      {
        runner: "claude",
        name: "Claude Code",
        installed: true,
        signedIn: true,
      },
    ] as const;
    app.use(
      "/api",
      setupRouter(setting, () => {}, undefined, {
        signIn: async () => [...rows],
      }),
    );
    app.use(jsonErrors);
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    cleanups.push(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const url = `http://127.0.0.1:${address.port}/api/agent/sign-in`;
    expect((await fetch(url)).status).toBe(403);
    const studio = { headers: { "X-Genobi-Agent": "1" } };
    expect(await (await fetch(url, studio)).json()).toEqual({
      harnesses: rows,
    });
    const login = await fetch(`${url}/codex`, { method: "POST", ...studio });
    expect(login.status).toBe(503);
    expect(
      (await fetch(`${url}/gemini`, { method: "POST", ...studio })).status,
    ).toBe(404);
    agent = true;
    expect((await fetch(url, studio)).status).toBe(403);
  });
});
