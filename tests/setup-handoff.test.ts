import { expect, it } from "vitest";
import {
  agentReadiness,
  SETUP_LOCAL_ONLY,
  setupMatches,
  setupStartPrompt,
} from "../src/setup/handoff";
import type { KeysStatus } from "../shared/keys";

it("starts only the chosen harness, never silently substituting another", () => {
  const draft = { selection: { agent: "hermes" } } as const;
  expect(
    agentReadiness(draft, { available: true, runner: "claude" }, []),
  ).toMatchObject({ ready: false, runner: "hermes" });
  expect(
    agentReadiness(
      draft,
      {
        available: false,
        runner: "hermes",
        message: "Hermes was not found on this machine.",
      },
      [],
    ),
  ).toEqual({
    ready: false,
    runner: "hermes",
    reason: "Hermes was not found on this machine.",
  });
  expect(
    agentReadiness(draft, { available: true, runner: "hermes" }, []),
  ).toEqual({
    ready: true,
    runner: "hermes",
  });
  expect(agentReadiness(draft, undefined, [])).toMatchObject({
    ready: false,
    checking: true,
  });
  // Sign-in rows still being read: not yet a start.
  expect(
    agentReadiness(draft, { available: true, runner: "hermes" }, undefined),
  ).toMatchObject({ ready: false, checking: true });
});

it("Decide later starts the server's own harness", () => {
  expect(
    agentReadiness(
      { selection: { agent: "any" } },
      { available: true, runner: "claude" },
      [],
    ),
  ).toEqual({ ready: true, runner: "claude" });
});

it("the hosted studio starts nothing, even with a paired runner online", () => {
  // The Worker relay answers available, but there is no sign-in route.
  expect(
    agentReadiness(
      { selection: { agent: "claude" } },
      { available: true, runner: "claude" },
      null,
    ),
  ).toEqual({ ready: false, runner: "claude", reason: SETUP_LOCAL_ONLY });
});

it("Codex and a signed-out harness give a reason instead of a start", () => {
  const codex = agentReadiness(
    { selection: { agent: "codex" } },
    { available: true, runner: "claude" },
    [],
  );
  expect(codex.ready).toBe(false);
  expect(codex.reason).toContain("cannot start Codex sessions yet");
  const signedOut = agentReadiness(
    { selection: { agent: "claude" } },
    { available: true, runner: "claude" },
    [
      {
        runner: "claude",
        name: "Claude Code",
        installed: true,
        signedIn: false,
      },
    ],
  );
  expect(signedOut).toEqual({
    ready: false,
    runner: "claude",
    reason: "Claude Code is not signed in. Sign in, then check again.",
  });
  // "unknown" is not a refusal: the harness may still be signed in.
  expect(
    agentReadiness(
      { selection: { agent: "claude" } },
      { available: true, runner: "claude" },
      [
        {
          runner: "claude",
          name: "Claude Code",
          installed: true,
          signedIn: "unknown",
        },
      ],
    ).ready,
  ).toBe(true);
});

it("flags commercial-only plus local-only with no implicit cloud substitution", () => {
  expect(
    setupMatches({ selection: { weights: "commercial", execution: "local" } }),
  ).toEqual([]);
  expect(
    setupMatches({ selection: { weights: "open-weights", execution: "cloud" } })
      .length,
  ).toBeGreaterThan(0);
});

it("the start prompt names keys by slot, states the stance and authorises nothing", () => {
  const keys: KeysStatus = {
    keychain: true,
    comfy: { connected: true, source: "keychain", revision: 1 },
    bfl: { connected: true, source: "environment", revision: 0 },
  };
  const prompt = setupStartPrompt(
    {
      selection: { agent: "claude", execution: "local" },
      usage: { purpose: "demo", policy: "any-licensed" },
    },
    "claude",
    keys,
    "off",
  );
  expect(prompt).toContain("Agent: Claude Code.");
  expect(prompt).toContain(
    "Generation runs locally, on this machine's ComfyUI.",
  );
  expect(prompt).toContain("Keys connected: Comfy, BFL.");
  expect(prompt).toContain("Licence: research only");
  expect(prompt).toContain("Voice: not requested.");
  expect(prompt).toContain("Do not install software");
});
