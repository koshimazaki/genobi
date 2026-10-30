import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type React from "react";
import SetupNext from "../src/setup/SetupNext";
import SetupChoices from "../src/setup/SetupChoices";
import { saveSetup, setupDraft, type SetupDraft } from "../src/setup/state";
import { saveUsage, readUsage } from "../src/licensing/preferences";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No setup side effect expected");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const cases: SetupDraft[] = [];
for (const weights of ["open-weights", "commercial", "any"] as const)
  for (const execution of ["local", "cloud", "any"] as const)
    for (const agent of ["hermes", "claude", "codex", "any"] as const)
      for (const voice of [false, true])
        cases.push({ selection: { weights, execution, agent }, voice });

it.each(cases)("keeps independent choices on save/reopen: %j", (draft) => {
  saveSetup(draft);
  expect(setupDraft()).toEqual(draft);
  const html = renderToStaticMarkup(
    <SetupNext draft={setupDraft()} onChange={() => {}} />,
  );
  expect(html).toContain(
    draft.voice
      ? 'id="setup-voice-title"'
      : "Continue with typed prompts or your local agent harness",
  );
  expect(html).toContain(
    draft.selection.execution === "local"
      ? "nothing falls back to the cloud"
      : draft.selection.execution === "cloud"
        ? "no local model download"
        : "whichever route fits the task",
  );
  // The run location ends in no link, and setup links no agent guide.
  for (const page of [
    "run-location.md",
    "hermes-open-route.md",
    "agent-sessions.md",
  ])
    expect(html).not.toContain(page);
  expect(html).not.toContain("Set up your agent");
  expect(fetch).not.toHaveBeenCalled();
});

it("a draft without a use clears an earlier purpose instead of silently restoring it", () => {
  saveUsage({ purpose: "commercial-video", policy: "any-licensed" });
  saveSetup({ selection: {}, usage: undefined, voice: false });
  expect(readUsage()).toBeUndefined();
  expect(setupDraft().voice).toBe(false);
});

it("the usage step is one question for the licensing layer", () => {
  const html = renderToStaticMarkup(
    <SetupChoices
      step={4}
      draft={{ selection: {} }}
      onChange={() => {}}
      next={() => {}}
    />,
  );
  expect(html).toContain(
    "Genobi’s licensing layer: your agent picks models whose licences fit this answer.",
  );
  expect(html.match(/<button/g)).toHaveLength(2);
  expect(html).toContain("Commercial use");
  expect(html).toContain("Research only");
  for (const gone of [
    "Sell templates",
    "Share the source",
    "Decide later",
    "<select",
  ])
    expect(html).not.toContain(gone);
});

it("research saves the research purpose; picking the held stance keeps a finer purpose", () => {
  const changes: SetupDraft[] = [];
  const pick = (draft: SetupDraft, label: string) => {
    const element = SetupChoices({
      step: 4,
      draft,
      onChange: (next) => changes.push(next),
      next: () => {},
    });
    const choices = (element.props.children as React.ReactElement[])[1];
    (choices.props as { onPick: (id: string) => void }).onPick(label);
    return changes.at(-1)!;
  };
  expect(pick({ selection: {} }, "research").usage).toEqual({
    purpose: "demo",
    policy: "any-licensed",
  });
  expect(pick({ selection: {} }, "commercial").usage?.purpose).toBe(
    "commercial-video",
  );
  const resale = { purpose: "resell-template", policy: "mit-only" } as const;
  expect(pick({ selection: {}, usage: resale }, "commercial").usage).toEqual(
    resale,
  );
  expect(pick({ selection: {}, usage: resale }, "research").usage).toEqual({
    purpose: "demo",
    policy: "mit-only",
  });
});
