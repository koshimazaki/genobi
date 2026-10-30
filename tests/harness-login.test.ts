import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevelopmentTerminal } from "../server/development-terminal";
import { loginArguments } from "../server/development-terminal-plan";

// Setup's Sign in button: the existing native Terminal launcher, running each
// harness's own login from a fixed list. No session receipt is kept.

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(extra = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-login-"));
  cleanup.push(directory);
  const open = vi.fn(async (_file: string) => {});
  const terminal = new DevelopmentTerminal(directory, {
    platform: "darwin",
    binary: async () => "/test/harness",
    genobiProfile: async () => true,
    open,
    ...extra,
  });
  const plan = async () =>
    JSON.parse(
      await readFile(
        path.join(path.dirname(open.mock.calls.at(-1)![0]), "plan.json"),
        "utf8",
      ),
    );
  return { directory, open, terminal, plan };
}

describe("a harness sign-in in Terminal", () => {
  it("runs each harness's own login, as an argument list", async () => {
    expect(loginArguments("claude").args).toEqual(["auth", "login"]);
    expect(loginArguments("codex").args).toEqual(["login"]);
    expect(loginArguments("hermes", "nous").args).toEqual([
      "-p",
      "genobi",
      "auth",
      "add",
      "nous",
      "--type",
      "oauth",
    ]);
    expect(loginArguments("hermes", "openrouter").args).toEqual([
      "-p",
      "genobi",
      "auth",
      "add",
      "openrouter",
    ]);
    expect(() => loginArguments("hermes")).toThrow();
  });

  it("writes a private plan and opens it, without a receipt", async () => {
    const f = await fixture();
    expect(await f.terminal.login("claude")).toEqual({ opened: true });
    const launch = f.open.mock.calls[0][0];
    expect((await stat(launch)).mode & 0o777).toBe(0o700);
    const plan = await f.plan();
    expect(plan).toMatchObject({
      command: "/test/harness",
      args: ["auth", "login"],
    });
    expect(await readFile(launch, "utf8")).not.toContain("auth");
    // Nothing for the development panel to list or resume.
    expect(
      await readdir(path.join(f.directory, "development-terminals")),
    ).not.toContain("sessions.json");
    expect((await f.terminal.state("owner")).sessions).toEqual([]);
  });

  it("signs Hermes in for its checked open provider, in the genobi profile", async () => {
    const f = await fixture();
    await f.terminal.login("hermes", "nous");
    expect((await f.plan()).args).toContain("nous");
    expect((await f.plan()).env.HERMES_HOME).toBeTruthy();
    for (const provider of [undefined, "anthropic", "a b", "$(touch x)"])
      await expect(f.terminal.login("hermes", provider)).rejects.toMatchObject({
        status: 409,
        code: "hermes_provider_missing",
      });
    expect(f.open).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing profile, a missing harness and other systems", async () => {
    const noProfile = await fixture({ genobiProfile: async () => false });
    await expect(
      noProfile.terminal.login("hermes", "nous"),
    ).rejects.toMatchObject({ code: "hermes_profile_missing" });
    const missing = await fixture({ binary: async () => undefined });
    await expect(missing.terminal.login("codex")).rejects.toMatchObject({
      status: 503,
    });
    const linux = await fixture({ platform: "linux" });
    await expect(linux.terminal.login("claude")).rejects.toMatchObject({
      status: 400,
    });
    for (const f of [noProfile, missing, linux])
      expect(f.open).not.toHaveBeenCalled();
  });
});
