// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RunLocationState } from "../shared/comfy/run-location";
import { initialComposer, type ComposerState } from "../src/useComposer";
import { useSetupDefaults } from "../src/useSetupDefaults";
import { saveSetup, setupDraft } from "../src/setup/state";
import {
  readSetting,
  resetSettingsForTests,
  useSettingsStore,
} from "../src/settings-store";
import { SettingUnconfirmed } from "../src/run-settings";

// Open only and Local start from first-run setup's saved answers.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const cloud = {
  revision: 1,
  location: "cloud",
  mode: "cloud",
  label: "",
  source: "server",
  fixed: false,
  choices: ["local", "cloud", "both"],
  local: null,
  note: "",
} as RunLocationState;
let root: Root | null = null;
let posts: string[];
beforeEach(() => {
  localStorage.clear();
  resetSettingsForTests({
    "run-location": () => Promise.reject(new SettingUnconfirmed("none")),
  });
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const { location } = JSON.parse(String(init?.body ?? "{}"));
      if (location) posts.push(location);
      return Response.json({
        ...cloud,
        revision: 2,
        location: "local",
        mode: location,
      });
    }),
  );
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  useSettingsStore.setState({ runLocation: undefined, location: undefined });
});

function mount(state: Partial<ComposerState> = {}) {
  const patches: Partial<ComposerState>[] = [];
  function Probe() {
    useSetupDefaults({ ...initialComposer, ...state }, (p) => patches.push(p));
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(<Probe />));
  return patches;
}

describe("setup defaults", () => {
  it("preselects Open models only for a newcomer", () => {
    expect(setupDraft().selection).toEqual({ weights: "open-weights" });
  });

  it("turns Open only on when setup chose open models, and on save", () => {
    const before = mount({ generator: "video", model: "flux-3" });
    // No answer yet: the featured closed run keeps Open only off.
    expect(before).toEqual([]);
    act(() => saveSetup({ selection: { weights: "open-weights" } }));
    expect(before).toEqual([{ openOnly: true }]);
    act(() => root!.unmount());
    expect(mount()).toEqual([{ openOnly: true }]);
  });

  it("ticks Local when setup chose Local only and the session has not chosen", async () => {
    localStorage.setItem(
      "genobi-model-selection-v1",
      JSON.stringify({ execution: "local" }),
    );
    mount();
    await act(() => readSetting("run-location", async () => cloud));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(posts).toEqual(["both"]);
  });

  it("leaves a session's own choice alone", async () => {
    localStorage.setItem(
      "genobi-model-selection-v1",
      JSON.stringify({ execution: "local" }),
    );
    mount();
    await act(() =>
      readSetting("run-location", async () => ({
        ...cloud,
        source: "session",
      })),
    );
    expect(posts).toEqual([]);
  });

  it("does not apply a saved Local preference to editable hosted settings", async () => {
    localStorage.setItem(
      "genobi-model-selection-v1",
      JSON.stringify({ execution: "local" }),
    );
    mount();
    await act(() =>
      readSetting("run-location", async () => ({
        ...cloud,
        choices: ["cloud", "deployment"],
      })),
    );
    act(() => saveSetup({ selection: { execution: "local" } }));
    expect(posts).toEqual([]);
    expect(useSettingsStore.getState().runLocation?.location).toBe("cloud");
  });

  it("uses Local when the adapter offers no Both mode", async () => {
    localStorage.setItem(
      "genobi-model-selection-v1",
      JSON.stringify({ execution: "local" }),
    );
    mount();
    await act(() =>
      readSetting("run-location", async () => ({
        ...cloud,
        choices: ["local", "cloud"],
      })),
    );
    expect(posts).toEqual(["local"]);
  });
});
