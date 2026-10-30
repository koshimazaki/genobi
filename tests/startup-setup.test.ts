import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  hasSeenSetup,
  rememberSetup,
  saveSetup,
  setupDraft,
  setupRoute,
} from "../src/setup/state";
import {
  readSelection,
  readUsage,
  saveSelection,
  saveUsage,
} from "../src/licensing/preferences";
import { resolvePreferences } from "../shared/licensing/project-preferences";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("skipping onboarding remembers the visit without changing preferences", () => {
  saveSelection({ weights: "open-weights", agent: "claude" });
  expect(hasSeenSetup()).toBe(false);
  const draft = setupDraft();
  draft.selection.agent = "hermes";
  rememberSetup();
  expect(hasSeenSetup()).toBe(true);
  expect(readSelection()?.agent).toBe("claude");
});
it("keeps open creative models, proprietary agent and commercial use independent", () => {
  const draft = {
    selection: { weights: "open-weights", agent: "claude", execution: "cloud" },
    usage: { purpose: "commercial-video", policy: "any-licensed" },
  } as const;
  saveSetup(draft);
  expect(setupDraft()).toEqual(draft);
  expect(setupRoute(readSelection()!)).toBe("cloud");
  expect(readUsage()?.purpose).toBe("commercial-video");
});
it("does not turn open generation into a forced local or Hermes route", () => {
  expect(setupRoute({ weights: "open-weights" })).toBe("mixed");
  expect(setupRoute({ weights: "any", execution: "local" })).toBe("local");
  expect(setupRoute({ agent: "hermes", execution: "cloud" })).toBe("cloud");
});
it("preserves existing family and licence choices through setup", () => {
  saveSelection({ family: "flux", agent: "codex" });
  saveUsage({ purpose: "resell-template", policy: "mit-only" });
  const draft = setupDraft();
  draft.selection.execution = "local";
  saveSetup(draft);
  expect(readSelection()).toEqual({
    family: "flux",
    agent: "codex",
    execution: "local",
  });
  expect(readUsage()).toEqual({
    purpose: "resell-template",
    policy: "mit-only",
  });
});
it("new defaults do not overwrite a project's own choices", () => {
  saveSetup({ selection: { agent: "hermes", execution: "local" } });
  expect(
    resolvePreferences(setupDraft(), { selection: { execution: "cloud" } })
      .selection,
  ).toEqual({ agent: "hermes", execution: "cloud" });
});
it("still allows setup to close when browser storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
    setItem: () => {
      throw new Error("Storage unavailable");
    },
  });
  expect(hasSeenSetup()).toBe(false);
  expect(() => saveSetup({ selection: {} })).not.toThrow();
});

it("does not repeat onboarding for visitors who dismissed the earlier guide", () => {
  localStorage.setItem("genobi.startup-guide.v1", "seen");
  expect(hasSeenSetup()).toBe(true);
});
