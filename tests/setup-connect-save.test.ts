// Box 1.6: the Connect step saves the harness every time. The owner's third
// fresh run signed in to a harness, continued, and found `.local/agent.json`
// never written. Here the step's own actions post to a real
// AgentRunnerSetting in a temporary folder.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentRunnerSetting } from "../server/agent-runner-setting";
import {
  connectChoice,
  prefilledHermes,
  saveAndSignIn,
  saveOnContinue,
} from "../src/setup/SetupConnect";
import type { AgentRunnerSettingState } from "../shared/agent-runner-setting";

let directory = "";
let setting: AgentRunnerSetting;
const opened: string[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "genobi-connect-"));
  // No environment: the saved choice is all the server knows.
  setting = await AgentRunnerSetting.load(directory, undefined, {});
  opened.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/settings/agent-runner" && init?.method === "POST")
        return json(await setting.save(JSON.parse(String(init.body))));
      const signIn = /^\/api\/agent\/sign-in\/(\w+)$/.exec(url);
      if (signIn && init?.method === "POST") {
        opened.push(signIn[1]);
        return json({ opened: true }, 201);
      }
      throw new Error(`Unexpected request ${url}`);
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

const saved = async () =>
  JSON.parse(await readFile(path.join(directory, "agent.json"), "utf8"));
const hooks = (onSaved: (state: AgentRunnerSettingState) => void) => ({
  profileMissing: false,
  onSaved,
  onProfile: () => {},
  onProfileDone: () => {},
});

it("a Claude Code sign-in followed by Continue leaves agent.json written", async () => {
  // No card chosen in this visit, nothing saved before.
  let state = setting.state();
  const hermes = prefilledHermes(state.saved);
  await saveAndSignIn(
    "claude",
    connectChoice(undefined, state, hermes),
    hooks((next) => (state = next)),
  );
  // Saved before the Terminal opened, for Claude Code too.
  expect(opened).toEqual(["claude"]);
  expect((await saved()).runner).toBe("claude");
  // Continue: the runner saved by the sign-in is known, so it is saved again.
  await rm(path.join(directory, "agent.json"));
  expect(
    await saveOnContinue(true, connectChoice(undefined, state, hermes)),
  ).toMatchObject({ saved: { runner: "claude" } });
  expect(await saved()).toMatchObject({ runner: "claude" });
  expect(setting.config.runner).toBe("claude");
});

it("Sign in saves whichever harness it opens, Codex and Hermes included", async () => {
  const hermes = prefilledHermes();
  for (const runner of ["codex", "hermes"] as const) {
    await saveAndSignIn(
      runner,
      connectChoice("claude", setting.state(), hermes),
      hooks(() => {}),
    );
    expect((await saved()).runner).toBe(runner);
  }
  expect(await saved()).toEqual({
    runner: "hermes",
    hermesModel: "deepseek/deepseek-v4.1-flash",
    hermesProvider: "nous",
  });
  expect(opened).toEqual(["codex", "hermes"]);
});

it("Continue saves the card chosen now, and nothing when no runner is known", async () => {
  const hermes = prefilledHermes();
  expect(
    await saveOnContinue(
      true,
      connectChoice(undefined, setting.state(), hermes),
    ),
  ).toBeUndefined();
  await expect(saved()).rejects.toThrow();
  await saveOnContinue(true, connectChoice("hermes", setting.state(), hermes));
  expect((await saved()).runner).toBe("hermes");
  // The hosted studio has no route: nothing is sent.
  expect(
    await saveOnContinue(false, connectChoice("claude", undefined, hermes)),
  ).toBeUndefined();
  expect((await saved()).runner).toBe("hermes");
});
