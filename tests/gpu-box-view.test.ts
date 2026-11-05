import { describe, expect, it } from "vitest";
import { boxReadiness } from "../src/gpu-box-view";
import { runModeLine } from "../src/run-mode";
import { readyEntry, type ReadyEntry } from "../shared/registry";
import type { BoxStatus } from "../shared/comfy/gpu-box";
import type { RunLocationState } from "../shared/comfy/run-location";

// What the GPU box panel and the composer's run-mode line say about a box.

const URL = "http://127.0.0.1:18188";
const NOW = Date.parse("2026-11-05T12:00:00.000Z");
const status = (over: Partial<BoxStatus> = {}): BoxStatus => ({
  reachable: true,
  version: "0.3.99",
  gpu: "NVIDIA GeForce RTX 5090",
  vramBytes: 32 * 1024 ** 3,
  upSince: "2026-11-05T10:55:00.000Z",
  lastJobAt: null,
  idle: false,
  idleMinutes: 20,
  ...over,
});

describe("the GPU box panel", () => {
  it("says ready, with the GPU, its memory and uptime", () => {
    const view = boxReadiness(
      status(),
      {
        reachable: true,
        templates: { a: { missingNodes: [], missingModels: [] } },
      },
      URL,
      NOW,
    );
    expect(view).toMatchObject({
      state: "ready",
      device: "NVIDIA GeForce RTX 5090 · 32 GB VRAM",
      uptime: "Up 1 h 05 min",
      idle: "",
    });
  });

  it("separates missing nodes from missing models", () => {
    const view = boxReadiness(
      status(),
      {
        reachable: true,
        templates: {
          "seedvr2-upscale": {
            missingNodes: ["SeedVR2Preprocess"],
            missingModels: [],
          },
          "minimax-h3-depth": {
            missingNodes: [],
            missingModels: ["depth_model"],
          },
          "ltx-2-5-t2v": { missingNodes: [], missingModels: [] },
        },
      },
      URL,
      NOW,
    );
    expect(view.state).toBe("missing-nodes");
    expect(view.headline).toMatch(
      /^1 of 3 workflows ready\. 1 lacks nodes, 1 lacks models\./,
    );
    expect(view.gaps).toEqual([
      "seedvr2-upscale: lacks nodes SeedVR2Preprocess",
      "minimax-h3-depth: lacks depth_model",
    ]);
    expect(
      boxReadiness(
        status(),
        {
          reachable: true,
          templates: { h3: { missingNodes: [], missingModels: ["unet_name"] } },
        },
        URL,
        NOW,
      ).state,
    ).toBe("missing-models");
  });

  it("names the tunnel when nothing answers, and reminds when idle", () => {
    expect(
      boxReadiness(status({ reachable: false, upSince: null }), null, URL, NOW),
    ).toMatchObject({ state: "unreachable", uptime: "", idle: "" });
    expect(
      boxReadiness(status({ reachable: false }), null, URL, NOW).headline,
    ).toContain("Start the SSH tunnel");
    expect(boxReadiness(status({ idle: true }), null, URL, NOW).idle).toBe(
      "No job for 20 min. Vast bills by the hour; stop the box when done.",
    );
  });
});

describe("the run-mode line on a GPU box", () => {
  const entry = readyEntry("flux-3-klein") as ReadyEntry;
  const state = (box: BoxStatus): RunLocationState => ({
    revision: 1,
    location: "local",
    mode: "box",
    label: "GPU box vast",
    source: "session",
    fixed: false,
    choices: ["local", "cloud", "both", "deployment", "box"],
    local: { reachable: box.reachable, version: box.version },
    box: { name: "vast", port: 18188, url: URL, status: box },
    note: "",
  });

  it("tags the box and warns when it idles", () => {
    expect(
      runModeLine({ entry, state: state(status()), keyKind: null }).tags[1],
    ).toEqual({ label: "GPU box" });
    const idle = runModeLine({
      entry,
      state: state(status({ idle: true })),
      keyKind: null,
    });
    expect(idle.tags[1]).toEqual({ label: "GPU box", warn: true });
    expect(idle.title).toContain("Vast bills by the hour");
    const down = runModeLine({
      entry,
      state: state(status({ reachable: false })),
      keyKind: null,
    });
    expect(down.title).toContain("Start its SSH tunnel");
  });
});
