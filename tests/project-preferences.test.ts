import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { applyCommand } from "../shared/director/commands";
import { diffCopies } from "../shared/director/feedback-diff";
import { resolvePreferences } from "../shared/licensing/project-preferences";
import { validateProject } from "../src/director/validate";
import { studioStore } from "../src/studio/store";
import { studioContext } from "../src/agent/studio-context";

const project = () =>
  validateProject(
    JSON.parse(
      readFileSync("docs/director-bundle/example/studio.json", "utf8"),
    ),
  );
const original = studioStore.getState();
afterEach(() => studioStore.setState(original, true));

it("remembers explicit project choices in the portable manifest and feedback", () => {
  const before = { project: project(), prompt: "Today: a product video" };
  const preferences = {
    selection: { family: "flux", execution: "local" },
    usage: { purpose: "commercial-video", policy: "any-licensed" },
  };
  const result = applyCommand(before, { op: "set-preferences", preferences });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const restored = validateProject(
    JSON.parse(JSON.stringify(result.copy.project)),
  );
  expect(restored.preferences).toEqual(preferences);
  expect(before.project.preferences).toBeUndefined();
  expect(result.copy.prompt).toBe(before.prompt);
  expect(diffCopies(before, result.copy).commands[0].command).toEqual({
    op: "set-preferences",
    preferences,
  });
  const clear = applyCommand(result.copy, {
    op: "set-preferences",
    preferences: null,
  });
  expect(clear.ok && clear.copy.project.preferences === undefined).toBe(true);
});

it("merges project fields over global defaults without changing the globals", () => {
  const defaults = {
    selection: { family: "ltx", weights: "open-weights", execution: "local" },
    usage: { purpose: "demo", policy: "open-source" },
  } as const;
  const a = resolvePreferences(defaults, {
    selection: { family: "flux", execution: "any" },
  });
  expect(a.selection).toEqual({
    family: "flux",
    weights: "open-weights",
    execution: "any",
  });
  expect(resolvePreferences(defaults).selection?.family).toBe("ltx");
  expect(defaults.selection.execution).toBe("local");
});

it("reloads the current project's choices when starting a different session", () => {
  const open = (family: "flux" | "ltx") =>
    studioStore.setState({
      director: {
        bundle: {
          project: { ...project(), preferences: { selection: { family } } },
          files: new Map(),
        },
        history: [],
        drafts: {},
      },
    });
  open("flux");
  expect(studioContext()?.selection?.family).toBe("flux");
  open("ltx");
  expect(studioContext()?.selection?.family).toBe("ltx");
});

it("refuses invalid project preferences in commands and imported manifests", () => {
  for (const preferences of [
    { selection: { family: "unknown" } },
    { usage: { policy: "anything" } },
    { prompt: "hidden" },
  ]) {
    expect(
      applyCommand(
        { project: project(), prompt: "" },
        { op: "set-preferences", preferences },
      ).ok,
    ).toBe(false);
    expect(() => validateProject({ ...project(), preferences })).toThrow();
  }
});
