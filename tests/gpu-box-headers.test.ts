import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunLocationState } from "../shared/comfy/run-location";
import {
  expectedHeaders,
  readSetting,
  resetSettingsForTests,
  useSettingsStore,
} from "../src/settings-store";
import { SettingUnconfirmed } from "../src/run-settings";

// On an adapter that offers GPU boxes, every paid write also names the box the
// studio shows (or none), since a box and Local share `location: "local"`.
const unanswered = () => Promise.reject(new SettingUnconfirmed("no server"));
beforeEach(() =>
  resetSettingsForTests({ "run-location": unanswered, workflow: unanswered }),
);
afterEach(() => {
  resetSettingsForTests();
  useSettingsStore.setState({
    location: undefined,
    runLocation: undefined,
    workflows: {},
    restoring: false,
    held: {},
    saving: {},
  });
});

const state = (over: Partial<RunLocationState>, revision = 1) =>
  ({
    revision,
    location: "local",
    choices: ["local", "cloud", "both", "deployment", "box"],
    fixed: false,
    ...over,
  }) as RunLocationState;

describe("the GPU box header", () => {
  it("names the shown box by port and name", async () => {
    await readSetting("run-location", async () =>
      state({
        mode: "box",
        box: {
          name: "lab box",
          port: 18188,
          url: "http://127.0.0.1:18188",
          status: null,
        },
      }),
    );
    expect(expectedHeaders()).toEqual({
      "Genobi-Run-Location": "local",
      "Genobi-Gpu-Box": "18188:lab%20box",
    });
  });

  it("says none on Local even when a box is registered, and is absent where boxes are not offered", async () => {
    await readSetting("run-location", async () =>
      state({
        mode: "local",
        box: {
          name: "vast",
          port: 18188,
          url: "http://127.0.0.1:18188",
          status: null,
        },
      }),
    );
    expect(expectedHeaders()["Genobi-Gpu-Box"]).toBe("none");
    await readSetting("run-location", async () =>
      state({ choices: ["local", "cloud"] }, 2),
    );
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "local" });
  });
});
