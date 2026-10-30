// Box 1.7: setup in progress survives a reload of the tab. The step and
// every non-secret choice are kept under one versioned sessionStorage key,
// read back on open, and cleared when setup finishes or is dismissed. No key
// value is ever written, whatever else the draft object carries.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StartupConfigurator from "../src/setup/StartupConfigurator";
import { CONNECT_STEP, SUMMARY_STEP } from "../src/setup/SetupChoices";
import {
  clearSetupSession,
  keepSetupSession,
  restoreSetupSession,
  SETUP_SESSION_KEY,
} from "../src/setup/session-draft";
import type { SetupDraft } from "../src/setup/state";

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};
let tab: ReturnType<typeof memory>;
let local: ReturnType<typeof memory>;
beforeEach(() => {
  tab = memory();
  local = memory();
  vi.stubGlobal("sessionStorage", tab);
  vi.stubGlobal("localStorage", local);
});
afterEach(() => vi.unstubAllGlobals());

const KEYS = ["comfyui-SECRET-a1", "bfl-SECRET-b2", "rw-SECRET-c3"];
const DRAFT: SetupDraft = {
  selection: { weights: "open-weights", agent: "hermes", execution: "any" },
  usage: { purpose: "demo", policy: "open-source" },
  voice: true,
  voiceFolder: "/Volumes/Models/voice",
  voiceModel: null,
  hermes: { model: "deepseek/deepseek-v4.1-flash", provider: "nous" },
};

it("brings back the step and every non-secret choice", () => {
  keepSetupSession({ step: CONNECT_STEP, draft: DRAFT });
  expect(restoreSetupSession(SUMMARY_STEP)).toEqual({
    step: CONNECT_STEP,
    draft: DRAFT,
  });
  const stored = JSON.parse(tab.values.get(SETUP_SESSION_KEY)!);
  expect(stored.version).toBe(1);
});

it("never stores a key, even one carried on the draft object", () => {
  // Keys typed in the Connect step go straight to the server; a draft that
  // somehow carried them (or a key pasted as an unknown selection value)
  // still writes none of them.
  const carrying = {
    ...DRAFT,
    selection: { ...DRAFT.selection, family: KEYS[0] },
    comfy: KEYS[0],
    keys: { bfl: KEYS[1], other: KEYS[2] },
    apiKey: KEYS[1],
    hermes: { ...DRAFT.hermes!, apiKey: KEYS[2] },
  } as unknown as SetupDraft;
  keepSetupSession({ step: SUMMARY_STEP, draft: carrying });
  const json = tab.values.get(SETUP_SESSION_KEY)!;
  for (const key of KEYS) expect(json).not.toContain(key);
  expect(json).not.toMatch(/apiKey|"keys"|"comfy"/);
  expect(local.values.size).toBe(0);
  // An invalid selection value is dropped with the rest of the selection.
  expect(restoreSetupSession(SUMMARY_STEP)?.draft.selection).toEqual({});
});

it("ignores and removes a record from another version or step range", () => {
  for (const value of [
    JSON.stringify({ version: 2, step: 1, draft: { selection: {} } }),
    JSON.stringify({ version: 1, step: SUMMARY_STEP + 1, draft: {} }),
    JSON.stringify({ version: 1, step: 1.5, draft: {} }),
    "{not json",
  ]) {
    tab.values.set(SETUP_SESSION_KEY, value);
    expect(restoreSetupSession(SUMMARY_STEP)).toBeUndefined();
    expect(tab.values.has(SETUP_SESSION_KEY)).toBe(false);
  }
});

it("clears on finish or dismissal, and copes without storage", () => {
  keepSetupSession({ step: 2, draft: DRAFT });
  clearSetupSession();
  expect(restoreSetupSession(SUMMARY_STEP)).toBeUndefined();
  const refusing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  expect(() =>
    keepSetupSession({ step: 2, draft: DRAFT }, refusing),
  ).not.toThrow();
  expect(restoreSetupSession(SUMMARY_STEP, refusing)).toBeUndefined();
});

it("reopens the dialog at the kept step after a reload, seen or not", () => {
  const page = new EventTarget() as EventTarget & { parent?: unknown };
  page.parent = page;
  vi.stubGlobal("window", page);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rendering must not call the server");
    }),
  );
  // Setup was seen before and opened again from Settings, then reloaded.
  local.setItem("genobi-setup-seen-v1", "1");
  keepSetupSession({ step: CONNECT_STEP, draft: DRAFT });
  const html = renderToStaticMarkup(createElement(StartupConfigurator));
  expect(html).toContain("Connect your keys and agent.");
  expect(html).toContain(`aria-valuenow="${CONNECT_STEP}"`);
  // Without a kept draft a seen setup stays closed.
  clearSetupSession();
  expect(
    renderToStaticMarkup(createElement(StartupConfigurator)),
  ).not.toContain("setup-step");
});
