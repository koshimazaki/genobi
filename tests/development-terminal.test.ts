import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DevelopmentTerminal } from "../server/development-terminal";
import {
  creativeBrief,
  supervisorBrief,
  terminalArguments,
} from "../server/development-terminal-plan";
import { terminalRequest } from "../shared/development-terminal";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(extra = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-native-"));
  cleanup.push(directory);
  const open = vi.fn(async (_file: string) => {});
  const viewer = vi.fn(async () => true);
  const manager = new DevelopmentTerminal(directory, {
    platform: "darwin",
    binary: async () => "/test/runner",
    profile: async () => true,
    open,
    viewer,
    ...extra,
  });
  const start = (input = {}, owner = "owner") =>
    manager.start(
      owner,
      { runner: "hermes", ...input },
      "http://127.0.0.1:4317",
    );
  const folder = path.join(directory, "development-terminals");
  return { directory, folder, open, viewer, manager, start };
}

describe("native development terminal", () => {
  it("opens a private interactive plan with role context, without shell-interpreting the handover", async () => {
    const f = await fixture();
    const result = await f.start({
      handover:
        "Keep $(touch /bad), `echo x`, and 'quotes' literal. api_key=secret",
    });
    const launch = f.open.mock.calls[0][0];
    const script = await readFile(launch, "utf8");
    expect(script).not.toContain("touch");
    expect(script).not.toContain("secret");
    const plan = JSON.parse(
      await readFile(path.join(path.dirname(launch), "plan.json"), "utf8"),
    );
    expect(plan.command).toBe("/test/runner");
    expect(plan.args).toEqual(
      expect.arrayContaining([
        "-p",
        "hermes-developer",
        "chat",
        "--create-if-missing",
      ]),
    );
    expect(plan.args).not.toContain("--query-file");
    expect(plan.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("$(touch /bad)");
    expect(plan.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).not.toContain(
      "api_key=secret",
    );
    expect(plan.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
      "Wait for the user's task",
    );
    expect((await stat(launch)).mode & 0o777).toBe(0o700);
    expect(
      (await stat(path.join(path.dirname(launch), "plan.json"))).mode & 0o777,
    ).toBe(0o600);
    expect(result).toMatchObject({
      viewerReady: true,
      session: { status: "opened", resumable: false },
    });
    expect(f.open).toHaveBeenCalledTimes(1);
  });
  it("keeps receipts owner-scoped and resumes only completed matching conversations", async () => {
    const f = await fixture();
    const first = await f.start();
    expect((await f.manager.state("other")).sessions).toEqual([]);
    await expect(
      f.start({ previous: first.session.id }, "other"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.start({ previous: first.session.id })).rejects.toMatchObject(
      { status: 409 },
    );
    await writeFile(
      path.join(f.folder, first.session.id, "status.json"),
      '{"status":"closed"}',
    );
    expect((await f.manager.state("owner")).sessions[0].resumable).toBe(true);
    await expect(
      f.start({ runner: "claude", previous: first.session.id }),
    ).rejects.toMatchObject({ status: 409 });
    await f.start({ previous: first.session.id });
    const plans = await Promise.all(
      f.open.mock.calls.map(async ([file]) =>
        JSON.parse(
          await readFile(path.join(path.dirname(file), "plan.json"), "utf8"),
        ),
      ),
    );
    expect(plans[1].args).toContain(plans[0].args.at(-2));
    expect(plans[1].args).not.toContain("--create-if-missing");
    expect(
      await readFile(path.join(f.folder, "sessions.json"), "utf8"),
    ).not.toContain('"owner":"owner"');
  });
  it("reserves once before opening, and does not retry an uncertain launch", async () => {
    const f = await fixture({
      open: async () => {
        throw new Error("open failed");
      },
    });
    const results = await Promise.allSettled([f.start(), f.start()]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect((await f.manager.state("owner")).sessions).toHaveLength(1);
    expect((await f.manager.state("owner")).sessions[0].status).toBe("failed");
    expect(
      (await readdir(f.folder)).filter((s) => s !== "sessions.json"),
    ).toHaveLength(1);
  });
  it("keeps an opened terminal successful if the optional viewer is unavailable", async () => {
    const f = await fixture({
      viewer: async () => {
        throw new Error("offline");
      },
    });
    expect(await f.start()).toMatchObject({
      viewerReady: false,
      session: { status: "opened" },
    });
    expect(f.open).toHaveBeenCalledTimes(1);
    f.manager.close();
    expect((await f.manager.state("owner")).sessions[0].status).toBe("opened");
  });
  it("rejects unsupported systems and missing Hermes profiles before opening", async () => {
    const linux = await fixture({ platform: "linux" });
    await expect(linux.start()).rejects.toMatchObject({ status: 400 });
    expect(linux.open).not.toHaveBeenCalled();
    const missing = await fixture({ profile: async () => false });
    await expect(missing.start()).rejects.toMatchObject({ status: 503 });
    expect(missing.open).not.toHaveBeenCalled();
  });
  it("opens one terminal per role, Developer first, each on its own Hermes profile and brief", async () => {
    const f = await fixture();
    const result = await f.start({ roles: ["developer", "creative"] });
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(result.sessions.map((s) => s.role)).toEqual([
      "developer",
      "creative",
    ]);
    expect(result.session).toEqual(result.sessions[0]);
    const plans = await Promise.all(
      f.open.mock.calls.map(async ([file]) =>
        JSON.parse(
          await readFile(path.join(path.dirname(file), "plan.json"), "utf8"),
        ),
      ),
    );
    expect(plans[0].args).toEqual(
      expect.arrayContaining(["-p", "hermes-developer"]),
    );
    expect(plans[1].args).toEqual(
      expect.arrayContaining(["-p", "hermes-creative"]),
    );
    expect(plans[1].args).not.toContain("hermes-developer");
    expect(plans[1].args.join(" ")).toMatch(/genobi-creative-/);
    expect(plans[0].env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
      "Creative is running in its own terminal",
    );
    expect(plans[1].env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
      "You are Genobi's Creative",
    );
    expect(plans[1].env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
      "Developer is running in its own terminal",
    );
    expect(plans[1].env.HERMES_EPHEMERAL_SYSTEM_PROMPT).not.toContain(
      "supervisor",
    );
    expect(f.viewer).toHaveBeenCalledTimes(1);
    const state = await f.manager.state("owner");
    expect(state.sessions.map((s) => s.role)).toEqual([
      "creative",
      "developer",
    ]);
    expect(state.runners.find((r) => r.runner === "hermes")).toMatchObject({
      available: true,
      creative: true,
    });
    // Only a Creative receipt resumes a Creative conversation, in its profile.
    await writeFile(
      path.join(f.folder, result.sessions[1].id, "status.json"),
      '{"status":"closed"}',
    );
    await f.start({ previous: result.sessions[1].id });
    const resumed = JSON.parse(
      await readFile(
        path.join(path.dirname(f.open.mock.calls[2][0]), "plan.json"),
        "utf8",
      ),
    );
    expect(resumed.args).toEqual(
      expect.arrayContaining(["-p", "hermes-creative", "--continue"]),
    );
    expect(resumed.args).not.toContain("--create-if-missing");
    expect((await f.manager.state("owner")).sessions[0].role).toBe("creative");
  });
  it("refuses the Creative terminal when only the Developer profile is installed, before opening anything", async () => {
    const f = await fixture({
      profile: async (role: string) => role === "developer",
    });
    await expect(
      f.start({ roles: ["developer", "creative"] }),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.open).not.toHaveBeenCalled();
    expect((await f.manager.state("owner")).sessions).toEqual([]);
    expect(
      (await f.manager.state("owner")).runners.find(
        (r) => r.runner === "hermes",
      ),
    ).toMatchObject({ available: true, creative: false });
    await f.start();
    expect(f.open).toHaveBeenCalledTimes(1);
  });
  it("keeps the first window when the second cannot be confirmed open", async () => {
    let calls = 0;
    const f = await fixture({
      open: async () => {
        if (++calls === 2) throw new Error("open failed");
      },
    });
    await expect(
      f.start({ roles: ["developer", "creative"] }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/for creative; the developer window/),
    });
    const sessions = (await f.manager.state("owner")).sessions;
    expect(sessions.map((s) => [s.role, s.status])).toEqual([
      ["creative", "failed"],
      ["developer", "opened"],
    ]);
  });
  it("gives a Creative plan to every harness, and reads old receipts as Developer", async () => {
    for (const runner of ["hermes", "claude", "codex"] as const) {
      const plan = terminalArguments(
        runner,
        creativeBrief("", true),
        "native-id",
        false,
        false,
        "creative",
      );
      expect(plan.args.join(" ")).not.toMatch(
        /stream-json|dontAsk|yolo|bypass|exec /,
      );
      if (runner === "hermes") expect(plan.args).toContain("hermes-creative");
      else expect(JSON.stringify(plan)).toContain("You are Genobi's Creative");
    }
    expect(
      terminalRequest.safeParse({
        runner: "hermes",
        roles: ["creative", "creative"],
      }).success,
    ).toBe(false);
    expect(
      terminalRequest.safeParse({
        runner: "claude",
        roles: ["developer", "creative"],
        resumePicker: true,
      }).success,
    ).toBe(false);
    expect(
      terminalRequest.safeParse({ runner: "hermes", roles: ["creative"] })
        .success,
    ).toBe(true);
    const f = await fixture();
    await mkdir(f.folder, { recursive: true });
    await writeFile(
      path.join(f.folder, "sessions.json"),
      JSON.stringify([
        {
          owner: createHash("sha256").update("owner").digest("hex"),
          nativeId: "genobi-supervisor-old",
          view: {
            id: "00000000-0000-4000-8000-000000000000",
            runner: "hermes",
            startedAt: "2026-10-01T00:00:00.000Z",
            status: "opened",
            resumable: false,
          },
        },
      ]),
    );
    expect((await f.manager.state("owner")).sessions).toMatchObject([
      { role: "developer", status: "opened", resumable: false },
    ]);
    // A damaged receipt cannot name a profile: its role is read as Developer.
    await writeFile(
      path.join(f.folder, "sessions.json"),
      JSON.stringify([
        {
          owner: createHash("sha256").update("owner").digest("hex"),
          nativeId: "n",
          view: {
            id: "00000000-0000-4000-8000-000000000001",
            runner: "hermes",
            role: "../../x",
            startedAt: "2026-10-01T00:00:00.000Z",
            status: "opened",
            resumable: false,
          },
        },
      ]),
    );
    await mkdir(path.join(f.folder, "00000000-0000-4000-8000-000000000001"));
    await writeFile(
      path.join(f.folder, "00000000-0000-4000-8000-000000000001/status.json"),
      '{"status":"closed"}',
    );
    expect((await f.manager.state("owner")).sessions[0].role).toBe("developer");
    await f.start({ previous: "00000000-0000-4000-8000-000000000001" });
    const plan = JSON.parse(
      await readFile(
        path.join(path.dirname(f.open.mock.calls.at(-1)![0]), "plan.json"),
        "utf8",
      ),
    );
    expect(plan.args).toContain("hermes-developer");
    expect(plan.args.join(" ")).not.toContain("..");
  });
  it("uses native interactive controls without bypass flags or an automatic task", () => {
    for (const runner of ["hermes", "claude", "codex"] as const) {
      const plan = terminalArguments(
        runner,
        supervisorBrief(),
        "native-id",
        false,
      );
      expect(plan.args).not.toEqual(expect.arrayContaining(["--oneshot"]));
      expect(plan.args.join(" ")).not.toMatch(
        /stream-json|dontAsk|yolo|bypass|exec /,
      );
    }
    expect(terminalArguments("claude", "role", "id", false).args).toContain(
      "--append-system-prompt",
    );
    expect(terminalArguments("codex", "role", "id", false, true).args[0]).toBe(
      "resume",
    );
    expect(
      terminalRequest.safeParse({ runner: "hermes", command: "arbitrary" })
        .success,
    ).toBe(false);
    expect(
      terminalRequest.safeParse({
        runner: "claude",
        previous: "00000000-0000-4000-8000-000000000000",
        resumePicker: true,
      }).success,
    ).toBe(false);
  });
});
