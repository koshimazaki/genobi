import { describe, expect, it } from "vitest";
import { readyEntry, entriesFor } from "../shared/registry";
import {
  HOSTED_RUN_LOCATION,
  type RunLocationState,
} from "../shared/comfy/run-location";
import { runModeLine, type RunModeInput } from "../src/run-mode";
import { hiddenNote, runsLocally } from "../src/local-menu";

// The tags under the composer's model say where the next run executes, from
// the entry's route and the server's run-location answer.
const state = (
  location: "local" | "cloud" | "deployment",
  patch: Partial<RunLocationState> = {},
) =>
  ({
    revision: 1,
    location,
    mode: location,
    label: "",
    source: "session",
    fixed: false,
    choices: ["local", "cloud", "both"],
    local: { reachable: true, version: "1" },
    note: "",
    ...patch,
  }) as RunLocationState;
const line = (id: string, input: Partial<RunModeInput> = {}) => {
  const answer = runModeLine({
    entry: readyEntry(id)!,
    keyKind: null,
    ...input,
  });
  return { ...answer, labels: answer.tags.map((t) => t.label) };
};

describe("the run-mode line", () => {
  it("names the local ComfyUI for an open graph while Local is ticked", () => {
    const music = line("minimax-music-3", { state: state("local") });
    expect(music.labels).toEqual(["Open weights", "Local ComfyUI"]);
    expect(music.title).toBe("Runs on the local ComfyUI");
    expect(music.labels).toEqual(
      line("minimax-music-3", { state: state("local", { mode: "both" }) })
        .labels,
    );
  });

  it("names Comfy Cloud for the same graph with Local unticked", () => {
    const music = line("minimax-music-3", { state: state("cloud") });
    expect(music.labels).toEqual(["Open weights", "Comfy Cloud"]);
    expect(music.title).toBe("Runs on Comfy Cloud on your Comfy key");
    expect(music.note).toBe("");
  });

  it("warns in the tag when the local ComfyUI does not answer", () => {
    const off = line("minimax-music-3", {
      state: state("local", { local: { reachable: false, version: null } }),
    });
    expect(off.tags[1]).toEqual({ label: "Local ComfyUI", warn: true });
    expect(off.note).toBe("not answering");
    expect(off.title).toContain("Start ComfyUI, or untick Local");
    // A fresher check outranks the run-location read.
    const checked = line("minimax-music-3", {
      state: state("local"),
      check: { reachable: false, templates: {} },
    });
    expect(checked.note).toBe("not answering");
  });

  it("names the model slots the local ComfyUI lacks, never the files", () => {
    const missing = line("minimax-music-3", {
      state: state("local"),
      template: "minimax-music-3",
      check: {
        reachable: true,
        templates: {
          "minimax-music-3": {
            missingNodes: [],
            missingModels: ["unet_name", "text_encoder", "vae"],
          },
        },
      },
    });
    expect(missing.tags[1].warn).toBe(true);
    expect(missing.note).toBe("lacks unet_name, text_encoder, vae");
    expect(missing.title).toBe(
      "Runs on the local ComfyUI, which lacks the model files for unet_name, text_encoder, vae",
    );
  });

  it("keeps API entries on their provider, and says Local does not apply", () => {
    const router = line("minimax-h3-router", { state: state("local") });
    expect(router.labels).toEqual(["Open weights", "Comfy Router"]);
    expect(router.note).toBe("Local applies to open workflows only");
    expect(line("minimax-h3-router", { state: state("cloud") }).note).toBe("");
    const klein = line("flux-3-klein-api", { state: state("cloud") });
    expect(klein.labels).toEqual(["Open weights", "BFL"]);
    expect(klein.title).toBe("Runs on BFL's API on your BFL key");
  });

  it("names the provider a FLUX Router entry takes from the key held", () => {
    expect(line("flux-3-video", { keyKind: "comfy" }).labels).toEqual([
      "API",
      "Comfy Router",
    ]);
    expect(line("flux-3-video", { keyKind: "bfl" }).labels).toEqual([
      "API",
      "BFL",
    ]);
    expect(line("flux-3-video").labels).toEqual(["API", "Comfy Router or BFL"]);
    // The upscalers: FLUX Video Upscale is API on its provider, SeedVR2 open
    // weights on the run location.
    expect(line("flux-video-upscale", { keyKind: "comfy" }).labels).toEqual([
      "API",
      "Comfy Router",
    ]);
    expect(line("flux-video-upscale", { keyKind: "bfl" }).labels).toEqual([
      "API",
      "BFL",
    ]);
    expect(line("seedvr2-upscale", { state: state("cloud") }).labels).toEqual([
      "Open weights",
      "Comfy Cloud",
    ]);
    expect(
      line("seedvr2-upscale", {
        state: state("local"),
        check: { reachable: true, templates: {} },
      }).labels,
    ).toEqual(["Open weights", "Local ComfyUI"]);
  });

  it("says the hosted studio always runs on Comfy Cloud", () => {
    const hosted = line("flux-3-klein", { state: HOSTED_RUN_LOCATION });
    expect(hosted.labels).toEqual(["Open weights", "Comfy Cloud"]);
    expect(hosted.note).toBe("the hosted studio always uses Comfy Cloud");
  });

  it("names a pinned graph's own host whatever the tick says", () => {
    const swap = line("openjutsu-swap", {
      state: state("local"),
      hosts: ["deployment"],
    });
    expect(swap.labels).toEqual(["Open weights", "Comfy deployment"]);
    expect(swap.note).toBe("its own host, not Local or Cloud");
    expect(
      line("ltx-2-5-akuspace", { state: state("deployment") }).labels,
    ).toEqual(["Open weights", "Comfy deployment"]);
  });

  it("says it is checking until the run location is read", () => {
    expect(line("minimax-music-3").labels).toEqual(["Checking…"]);
  });
});

describe("the Local tick's menu", () => {
  const keep = runsLocally({ "openjutsu-swap": ["deployment"] }, {});
  it("keeps only the open graphs that can run on the local ComfyUI", () => {
    const ids = entriesFor("h3", { keep }).map((e) => e.id);
    expect(ids).toContain("minimax-music-3");
    expect(ids).toContain("minimax-h3");
    expect(ids).not.toContain("minimax-h3-router");
    expect(ids).not.toContain("openjutsu-swap");
    expect(entriesFor("flux", { keep }).map((e) => e.id)).toEqual([
      "flux-3-klein",
    ]);
    expect(entriesFor("upscale", { keep }).map((e) => e.id)).toEqual([
      "seedvr2-upscale",
    ]);
  });

  it("says how many rows each untick would bring back", () => {
    // H3: Router and the swap are open, so Local alone hides them.
    expect(hiddenNote("h3", { openOnly: true, keep })).toBe(
      "2 more with Local off",
    );
    expect(hiddenNote("h3", { openOnly: true })).toBe("");
    // FLUX: Klein is the open row; closed rows need both ticks off.
    const all = entriesFor("flux").length;
    const open = entriesFor("flux", { openOnly: true }).length;
    expect(hiddenNote("flux", { openOnly: true, keep })).toBe(
      `${all - open} more with Local and Open only off`,
    );
    expect(hiddenNote("flux", { openOnly: false, keep })).toBe(
      `${all - open} more with Local off`,
    );
    expect(hiddenNote("flux", { openOnly: true })).toBe(
      `${all - open} more with Open only off`,
    );
    expect(hiddenNote("flux", {})).toBe("");
    // Upscale: FLUX Video Upscale is the closed row SeedVR2 stands beside.
    expect(hiddenNote("upscale", { openOnly: true, keep })).toBe(
      "1 more with Local and Open only off",
    );
    expect(hiddenNote("upscale", { openOnly: true })).toBe(
      "1 more with Open only off",
    );
  });
});
